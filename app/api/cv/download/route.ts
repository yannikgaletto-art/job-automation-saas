import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { renderToStream } from '@react-pdf/renderer';
import { ModernTemplate } from '@/components/cv-templates/ModernTemplate';
import { CvStructuredData } from '@/types/cv';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { registerPdfFonts } from '@/lib/utils/pdf-fonts';


// Simple Cover Letter Template
const clStyles = StyleSheet.create({
    page: { padding: '50px 60px', fontFamily: 'Inter', fontSize: 11, color: '#333' },
    paragraph: { lineHeight: 1.6, marginBottom: 12 }
});


const CoverLetterPDF = ({ text }: { text: string }) => {
    registerPdfFonts();
    return React.createElement(Document, null,
        React.createElement(Page, { style: clStyles.page },
            text.split('\n\n').map((paragraph, i) =>
                React.createElement(View, { key: i },
                    React.createElement(Text, { style: clStyles.paragraph }, paragraph)
                )
            )
        )
    );
};


export async function GET(req: NextRequest) {
    try {
        const jobId = req.nextUrl.searchParams.get('jobId');
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
        }


        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();


        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }


        // Check if user requested a specific document type or defaults to optimized CV
        const type = req.nextUrl.searchParams.get('type') || 'cv';


        let stream: NodeJS.ReadableStream;
        let filename = 'Download.pdf';


        // 1. Hole den Job für den Namen
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('cv_optimization_proposal, metadata, company_name')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();


        if (jobError || !job) {
            return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
        }


        if (type === 'cv') {
            const cvData = job.cv_optimization_proposal?.optimized || job.metadata?.optimized_cv;
            if (!cvData) {
                return NextResponse.json({ error: 'Optimiertes CV nicht gefunden' }, { status: 404 });
            }


            stream = await renderToStream(
                React.createElement(ModernTemplate, { data: cvData as CvStructuredData }) as any
            );
            filename = `CV_${job.company_name?.replace(/[^a-z0-9]/gi, '_') || 'Pathly'}.pdf`;


        } else if (type === 'cover_letter') {
            const { data: docData, error: docError } = await supabase
                .from('documents')
                .select('metadata')
                .eq('user_id', user.id)
                .eq('document_type', 'cover_letter')
                .eq('metadata->>job_id', jobId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();


            if (docError || !docData?.metadata?.generated_content) {
                return NextResponse.json({ error: 'Anschreiben nicht gefunden' }, { status: 404 });
            }


            stream = await renderToStream(
                React.createElement(CoverLetterPDF, { text: docData.metadata.generated_content }) as any
            );
            filename = `Anschreiben_${job.company_name?.replace(/[^a-z0-9]/gi, '_') || 'Pathly'}.pdf`;


        } else {
            return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
        }


        // Web ReadableStream for Next.js Edge / App Router
        const readableStream = new ReadableStream({
            start(controller) {
                stream.on('data', (chunk) => controller.enqueue(chunk));
                stream.on('end', () => controller.close());
                stream.on('error', (err) => controller.error(err));
            }
        });


        return new NextResponse(readableStream, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        });


    } catch (error: Error | unknown) {
        console.error('PDF Generation Error:', error);
        return NextResponse.json(
            { error: 'Internal server error while generating PDF' },
            { status: 500 }
        );
    }
}
