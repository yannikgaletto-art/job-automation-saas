'use client';

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';
import { TechTemplate } from '../cv-templates/TechTemplate';
import { ValleyTemplate } from '../cv-templates/ValleyTemplate';
import { Download, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { getCvTemplateLabels, CvTemplateLabels } from '@/lib/utils/cv-template-labels';
import { registerPdfFonts } from '@/lib/utils/pdf-fonts';
import { LayoutMode } from '@/types/cv-opt-settings';

interface DownloadButtonProps {
    data: CvStructuredData;
    templateId: string;
    qrBase64?: string;
    layoutMode?: LayoutMode;
}

function resolveDocument(data: CvStructuredData, templateId: string, qrBase64: string | undefined, labels: CvTemplateLabels, layoutMode?: LayoutMode) {
    switch (templateId) {
        case 'tech':
            return <TechTemplate data={data} qrBase64={qrBase64} labels={labels} />;
        case 'valley':
        case 'classic':  // deprecated → Valley
        case 'modern':   // deprecated → Valley
        default:
            return <ValleyTemplate data={data} qrBase64={qrBase64} labels={labels} layoutMode={layoutMode} />;
    }
}

export default function DownloadButton({ data, templateId, qrBase64, layoutMode }: DownloadButtonProps) {
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [downloadError, setDownloadError] = React.useState<string | null>(null);
    const locale = useLocale();
    const t = useTranslations('cv_optimizer');
    const labels = React.useMemo(() => getCvTemplateLabels(locale), [locale]);

    const handleDownload = async () => {
        if (!data) return;
        setIsDownloading(true);
        setDownloadError(null);
        try {
            // Ensure fonts are registered before PDF generation.
            // Templates call registerPdfFonts() at module-level, but dynamic
            // imports can delay evaluation. The internal `registered` guard
            // prevents double-registration, making this call always safe.
            registerPdfFonts();

            const document = resolveDocument(data, templateId, qrBase64, labels, layoutMode);
            const blob = await pdf(document).toBlob();

            const url = URL.createObjectURL(blob);
            const a = window.document.createElement('a');
            a.href = url;
            const company = typeof data.personalInfo?.name === 'string'
                ? data.personalInfo.name.replace(/\s+/g, '_')
                : 'Pathly';
            a.download = `CV_${company}.pdf`;

            window.document.body.appendChild(a);
            a.click();
            window.document.body.removeChild(a);
            // Delay revoke so Chrome has time to initiate the download
            // before the blob URL is freed (synchronous revoke causes empty downloads)
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (err) {
            console.error('[DownloadButton] PDF generation failed:', err);
            setDownloadError(t('error_pdf_download'));
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-1.5">
            <button
                onClick={handleDownload}
                disabled={isDownloading || !data}
                className="px-6 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white font-medium
                           rounded-lg flex items-center justify-center gap-2 transition-colors
                           disabled:opacity-50 min-w-[200px]"
            >
                {isDownloading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('downloading_pdf')}</>
                ) : (
                    <><Download className="w-4 h-4" /> Download</>
                )}
            </button>
            {downloadError && (
                <p className="text-xs text-amber-600 text-center max-w-[250px]">{downloadError}</p>
            )}
        </div>
    );
}
