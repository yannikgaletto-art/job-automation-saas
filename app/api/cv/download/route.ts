import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { TechTemplate } from '@/components/cv-templates/TechTemplate';
import { ValleyTemplate } from '@/components/cv-templates/ValleyTemplate';
import { CvStructuredData } from '@/types/cv';
import { Font, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import React from 'react';
import path from 'path';

// Register fonts server-side using absolute filesystem paths
// (Cannot use /fonts/... URLs on the server — browser-only)
let fontsRegistered = false;
function registerServerFonts() {
    if (fontsRegistered) return;
    fontsRegistered = true;
    const fontDir = path.join(process.cwd(), 'public', 'fonts');
    Font.register({
        family: 'Inter',
        fonts: [
            { src: path.join(fontDir, 'Inter-Regular.ttf'), fontWeight: 400 },
            { src: path.join(fontDir, 'Inter-SemiBold.ttf'), fontWeight: 600 },
            { src: path.join(fontDir, 'Inter-Bold.ttf'), fontWeight: 700 },
        ],
    });
    // Disable mid-word hyphenation
    Font.registerHyphenationCallback((word: string) => [word]);
}

// Simple Cover Letter PDF Template
const clStyles = StyleSheet.create({
    page: { padding: '50px 60px', fontFamily: 'Inter', fontSize: 11, color: '#333' },
    paragraph: { lineHeight: 1.6, marginBottom: 12 }
});

function CoverLetterDoc({ text }: { text: string }) {
    return React.createElement(Document, null,
        React.createElement(Page, { style: clStyles.page },
            ...text.split('\n\n').map((paragraph, i) =>
                React.createElement(View, { key: i },
                    React.createElement(Text, { style: clStyles.paragraph }, paragraph)
                )
            )
        )
    );
}

function resolveTemplate(templateId: string, data: CvStructuredData) {
    switch (templateId) {
        case 'tech': return React.createElement(TechTemplate, { data });
        case 'valley':
        case 'classic':  // deprecated → Valley
        case 'modern':   // deprecated → Valley
        default: return React.createElement(ValleyTemplate, { data });
    }
}

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


        const type = req.nextUrl.searchParams.get('type') || 'cv';
        const templateId = req.nextUrl.searchParams.get('template') || 'valley';

        // Fetch job (user-scoped — Contract 2)
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('cv_optimization_proposal, cv_optimization_user_decisions, metadata, company_name, company')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (jobError || !job) {
            return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
        }

        // Register fonts before rendering
        registerServerFonts();

        let buffer: Buffer;
        let filename = 'Download.pdf';

        if (type === 'cv') {
            // Try all known data locations for the optimized CV
            const cvData =
                job.cv_optimization_proposal?.finalCv ||
                job.cv_optimization_proposal?.optimized ||
                job.metadata?.optimized_cv ||
                job.metadata?.finalCv;

            if (!cvData) {
                return NextResponse.json(
                    { error: 'Optimiertes CV nicht gefunden — bitte zuerst CV-Optimizer abschliessen' },
                    { status: 404 }
                );
            }

            const element = resolveTemplate(templateId, cvData as CvStructuredData);
            buffer = await renderToBuffer(element as any);
            const rawCompany = (job.company_name || job.company || 'Pathly') as string;
            filename = `CV_${rawCompany.replace(/[^a-z0-9]/gi, '_')}.pdf`;

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

            buffer = await renderToBuffer(
                React.createElement(CoverLetterDoc, {
                    text: docData.metadata.generated_content
                }) as any
            );
            const rawCompany = (job.company_name || job.company || 'Pathly') as string;
            filename = `Anschreiben_${rawCompany.replace(/[^a-z0-9]/gi, '_')}.pdf`;

        } else {
            return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
        }

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(buffer.length),
            },
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.stack || error.message : String(error);
        console.error('[cv/download] PDF Generation Error:', errMsg);
        return NextResponse.json(
            { error: `PDF-Generierung fehlgeschlagen: ${errMsg}` },
            { status: 500 }
        );
    }
}
