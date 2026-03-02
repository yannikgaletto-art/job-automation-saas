'use client';

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';
import { ModernTemplate } from '../cv-templates/ModernTemplate';
import { ClassicTemplate } from '../cv-templates/ClassicTemplate';
import { TechTemplate } from '../cv-templates/TechTemplate';
import { ValleyTemplate } from '../cv-templates/ValleyTemplate';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DownloadButtonProps {
    data: CvStructuredData;
    templateId: string;
}

function resolveDocument(data: CvStructuredData, templateId: string) {
    switch (templateId) {
        case 'classic':
            return <ClassicTemplate data={data} />;
        case 'tech':
            return <TechTemplate data={data} />;
        case 'valley':
            return <ValleyTemplate data={data} />;
        case 'modern':
        default:
            return <ModernTemplate data={data} />;
    }
}

export default function DownloadButton({ data, templateId }: DownloadButtonProps) {
    const [isDownloading, setIsDownloading] = React.useState(false);

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const document = resolveDocument(data, templateId);
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
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            toast.error('Download fehlgeschlagen, bitte erneut probieren.');
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium
                       rounded-lg flex items-center justify-center gap-2 transition-colors
                       disabled:opacity-50 min-w-[200px]"
        >
            {isDownloading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> PDF wird generiert...</>
            ) : (
                <><Download className="w-4 h-4" /> Download & Cover Letter</>
            )}
        </button>
    );
}
