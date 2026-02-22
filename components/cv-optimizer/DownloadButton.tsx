'use client';

import React, { useMemo } from 'react';
import { usePDF } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';
import { ModernTemplate } from '../cv-templates/ModernTemplate';
import { ClassicTemplate } from '../cv-templates/ClassicTemplate';
import { TechTemplate } from '../cv-templates/TechTemplate';
import { Download, Loader2 } from 'lucide-react';

interface DownloadButtonProps {
    data: CvStructuredData;
    templateId: string;
}

function resolveTemplate(data: CvStructuredData, templateId: string) {
    switch (templateId) {
        case 'classic':
            return <ClassicTemplate data={data} />;
        case 'tech':
            return <TechTemplate data={data} />;
        case 'modern':
        default:
            return <ModernTemplate data={data} />;
    }
}

export default function DownloadButton({ data, templateId }: DownloadButtonProps) {
    const document = useMemo(() => resolveTemplate(data, templateId), [data, templateId]);
    const [instance] = usePDF({ document });

    const handleDownload = () => {
        if (instance.url) {
            const a = window.document.createElement('a');
            a.href = instance.url;
            a.download = `CV_${data.personalInfo?.name?.replace(/\s+/g, '_') || 'Pathly'}.pdf`;
            a.click();
        }
    };

    return (
        <button
            onClick={handleDownload}
            disabled={instance.loading || !!instance.error}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 min-w-[200px]"
        >
            {instance.loading ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    PDF wird generiert...
                </>
            ) : (
                <>
                    <Download className="w-4 h-4" />
                    PDF Herunterladen
                </>
            )}
        </button>
    );
}
