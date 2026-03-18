'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PDFViewer, usePDF } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';
import { TechTemplate } from './TechTemplate';
import { ValleyTemplate } from './ValleyTemplate';
import { Download, Loader2 } from 'lucide-react';
import { useLocale } from 'next-intl';
import { getCvTemplateLabels, CvTemplateLabels } from '@/lib/utils/cv-template-labels';

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

    const document = useMemo(() => resolveTemplate(data, templateId, qrBase64, labels), [data, templateId, qrBase64, labels]);

    if (!hasMounted) {
        return (
            <div className="animate-pulse h-[800px] w-full bg-gray-100 rounded-md flex items-center justify-center">
                <span className="text-gray-400 text-sm">Loading PDF...</span>
            </div>
        );
    }

    if (isMobile) {
        return <MobileDownload document={document} />;
    }

    return (
        <div className="w-full rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-50">
            <PDFViewer
                width="100%"
                height="800px"
                style={{ border: 'none' }}
                showToolbar={true}
            >
                {document}
            </PDFViewer>
        </div>
    );
}

/**
 * Mobile fallback: uses usePDF() hook to generate a blob URL,
 * then shows a styled download button instead of trying to render an iframe.
 */
function MobileDownload({ document }: { document: React.ReactElement }) {
    const [instance] = usePDF({ document: document as any });

    if (instance.loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <Loader2 className="w-8 h-8 text-[#012e7a] animate-spin" />
                <p className="text-gray-500 text-sm">Generating your PDF...</p>
            </div>
        );
    }

    if (instance.error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <p className="text-red-600 text-sm font-medium">Error generating PDF</p>
                <p className="text-gray-400 text-xs">{String(instance.error)}</p>
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
                onClick={() => instance.url && window.open(instance.url, '_blank')}
                className="px-8 py-3.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white font-medium rounded-xl shadow-sm transition-all w-full max-w-xs flex items-center justify-center gap-2"
            >
                <Download className="w-5 h-5" />
                PDF herunterladen
            </button>
        </div>
    );
}
