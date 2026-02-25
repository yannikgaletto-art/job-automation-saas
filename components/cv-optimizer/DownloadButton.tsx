'use client';

import React from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';
import { ModernTemplate } from '../cv-templates/ModernTemplate';
import { ClassicTemplate } from '../cv-templates/ClassicTemplate';
import { TechTemplate } from '../cv-templates/TechTemplate';
import { Download, Loader2 } from 'lucide-react';

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
        case 'modern':
        default:
            return <ModernTemplate data={data} />;
    }
}

export default function DownloadButton({ data, templateId }: DownloadButtonProps) {
    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
        setIsMounted(true);
    }, []);

    const fileName = `CV_${data.personalInfo?.name?.replace(/\s+/g, '_') || 'Pathly'}.pdf`;
    const document = resolveDocument(data, templateId);

    if (!isMounted) {
        return (
            <button
                disabled
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium
                           rounded-lg flex items-center justify-center gap-2 transition-colors
                           disabled:opacity-50 min-w-[200px]"
            >
                <Loader2 className="w-4 h-4 animate-spin" /> PDF wird generiert...
            </button>
        );
    }

    return (
        <PDFDownloadLink document={document} fileName={fileName}>
            {({ loading, error }) => (
                <button
                    disabled={loading || !!error}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium
                               rounded-lg flex items-center justify-center gap-2 transition-colors
                               disabled:opacity-50 min-w-[200px]"
                >
                    {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> PDF wird generiert...</>
                    ) : error ? (
                        'Fehler -- erneut versuchen'
                    ) : (
                        <><Download className="w-4 h-4" /> Download & Cover Letter</>
                    )}
                </button>
            )}
        </PDFDownloadLink>
    );
}
