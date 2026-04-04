'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { pdf, usePDF } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';
import { TechTemplate } from './TechTemplate';
import { ValleyTemplate } from './ValleyTemplate';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useLocale } from 'next-intl';
import { getCvTemplateLabels, CvTemplateLabels } from '@/lib/utils/cv-template-labels';
import { registerPdfFonts } from '@/lib/utils/pdf-fonts';

interface PdfViewerWrapperProps {
    data: CvStructuredData;
    templateId: string;
    qrBase64?: string;
}

function resolveTemplate(data: CvStructuredData, templateId: string, qrBase64: string | undefined, labels: CvTemplateLabels) {
    switch (templateId) {
        case 'tech':
            return <TechTemplate data={data} qrBase64={qrBase64} labels={labels} />;
        case 'valley':
        case 'classic':  // deprecated — fallback to Valley
        case 'modern':   // deprecated — fallback to Valley
        default:
            return <ValleyTemplate data={data} qrBase64={qrBase64} labels={labels} />;
    }
}

/**
 * Desktop PDF viewer using pdf().toBlob() + iframe.
 *
 * Uses the same proven rendering approach as DownloadButton.tsx:
 * pdf(document).toBlob() works reliably with Turbopack because it does
 * NOT depend on Web Workers or the internal <PDFViewer> iframe mechanism
 * that silently fails in dev mode.
 *
 * The blob URL is managed via useRef + useEffect cleanup to prevent
 * memory leaks (URL.revokeObjectURL on unmount or re-render).
 */
function DesktopPdfViewer({ data, templateId, qrBase64, labels }: {
    data: CvStructuredData;
    templateId: string;
    qrBase64?: string;
    labels: CvTemplateLabels;
}) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    // Track current render generation to ignore stale async calls
    const generationRef = useRef(0);

    useEffect(() => {
        const generation = ++generationRef.current;
        let cancelled = false;

        async function generate() {
            setLoading(true);
            setError(null);

            try {
                registerPdfFonts();
                const document = resolveTemplate(data, templateId, qrBase64, labels);
                const blob = await pdf(document).toBlob();

                if (cancelled || generation !== generationRef.current) return;

                // Revoke previous URL to prevent memory leak
                if (blobUrlRef.current) {
                    URL.revokeObjectURL(blobUrlRef.current);
                }

                const url = URL.createObjectURL(blob);
                blobUrlRef.current = url;
                setBlobUrl(url);
            } catch (err) {
                if (cancelled || generation !== generationRef.current) return;
                console.error('[PdfViewer] Blob generation failed:', err);
                setError(err instanceof Error ? err.message : 'PDF generation failed');
            } finally {
                if (!cancelled && generation === generationRef.current) {
                    setLoading(false);
                }
            }
        }

        generate();

        return () => {
            cancelled = true;
            // Revoke on cleanup (unmount or dependency change)
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [data, templateId, qrBase64, labels]);

    if (loading) {
        return (
            <div className="w-full rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-50 h-[800px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-[#012e7a] animate-spin" />
                    <p className="text-sm text-gray-400">Generating PDF…</p>
                </div>
            </div>
        );
    }

    if (error || !blobUrl) {
        return (
            <div className="w-full rounded-lg overflow-hidden border border-red-200 bg-red-50 h-[200px] flex flex-col items-center justify-center gap-3">
                <p className="text-sm text-red-600 font-medium">
                    PDF konnte nicht gerendert werden.
                </p>
                <button
                    onClick={() => {
                        // Force re-generate by toggling loading
                        setLoading(true);
                        setError(null);
                        generationRef.current++;
                        const gen = generationRef.current;
                        const document = resolveTemplate(data, templateId, qrBase64, labels);
                        pdf(document).toBlob().then(blob => {
                            if (gen !== generationRef.current) return;
                            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
                            const url = URL.createObjectURL(blob);
                            blobUrlRef.current = url;
                            setBlobUrl(url);
                            setLoading(false);
                        }).catch((e) => {
                            if (gen !== generationRef.current) return;
                            setError(e.message ?? 'Retry failed');
                            setLoading(false);
                        });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#012e7a] text-white text-sm font-medium rounded-lg hover:bg-[#012e7a]/90 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" /> Erneut versuchen
                </button>
            </div>
        );
    }

    return (
        <div className="w-full rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-50">
            <iframe
                src={`${blobUrl}#toolbar=0`}
                width="100%"
                height="800px"
                style={{ border: 'none', display: 'block' }}
                title="CV Preview"
            />
        </div>
    );
}

export default function PdfViewerWrapper({ data, templateId, qrBase64 }: PdfViewerWrapperProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const locale = useLocale();
    const labels = useMemo(() => getCvTemplateLabels(locale), [locale]);

    useEffect(() => {
        setHasMounted(true);
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    if (!hasMounted) {
        return (
            <div className="animate-pulse h-[800px] w-full bg-gray-100 rounded-md flex items-center justify-center">
                <span className="text-gray-400 text-sm">Loading PDF...</span>
            </div>
        );
    }

    if (isMobile) {
        return <MobileDownload data={data} templateId={templateId} qrBase64={qrBase64} labels={labels} />;
    }

    return <DesktopPdfViewer data={data} templateId={templateId} qrBase64={qrBase64} labels={labels} />;
}

/**
 * Mobile fallback: uses pdf().toBlob() to generate a download link.
 * Same proven approach as DownloadButton.
 */
function MobileDownload({ data, templateId, qrBase64, labels }: {
    data: CvStructuredData;
    templateId: string;
    qrBase64?: string;
    labels: CvTemplateLabels;
}) {
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function generate() {
            try {
                registerPdfFonts();
                const document = resolveTemplate(data, templateId, qrBase64, labels);
                const blob = await pdf(document).toBlob();
                if (cancelled) return;
                setDownloadUrl(URL.createObjectURL(blob));
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : 'PDF generation failed');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        generate();
        return () => { cancelled = true; };
    }, [data, templateId, qrBase64, labels]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <Loader2 className="w-8 h-8 text-[#012e7a] animate-spin" />
                <p className="text-gray-500 text-sm">Generating your PDF...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <p className="text-red-600 text-sm font-medium">Error generating PDF</p>
                <p className="text-gray-400 text-xs">{error}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                <Download className="w-8 h-8 text-green-600" />
            </div>
            <div>
                <p className="text-gray-900 font-semibold text-lg mb-1">Your CV is ready!</p>
                <p className="text-gray-500 text-sm">Tap below to download your PDF.</p>
            </div>
            <button
                onClick={() => downloadUrl && window.open(downloadUrl, '_blank')}
                className="px-8 py-3.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white font-medium rounded-xl shadow-sm transition-all w-full max-w-xs flex items-center justify-center gap-2"
            >
                <Download className="w-5 h-5" />
                PDF herunterladen
            </button>
        </div>
    );
}
