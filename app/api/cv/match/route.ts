import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { runCVMatchAnalysis } from '@/lib/services/cv-match-analyzer';

export async function POST(req: NextRequest) {
    try {
        const { jobId } = await req.json();
        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }

        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: job } = await supabase
            .from('job_queue')
            .select('id, job_title, company_name, description, requirements, buzzwords, seniority, location')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const cvData = await getCVText(user.id);
        if (!cvData) {
            return NextResponse.json({
                error: 'CV not found or empty. Please upload your CV in settings.'
            }, { status: 400 });
        }

        const matchResult = await runCVMatchAnalysis({
            userId: user.id,
            jobId: job.id,
            cvText: cvData.text,
            jobTitle: job.job_title || 'Unknown Title',
            company: job.company_name || 'Unknown Company',
            jobDescription: job.description || '',
            requirements: job.requirements || [],
            atsKeywords: job.buzzwords || [], // Map buzzwords to atsKeywords
            level: job.seniority || '',
        });

        // Cache result in job_queue.metadata
        const { data: currentJob } = await supabase
            .from('job_queue')
            .select('metadata')
            .eq('id', jobId)
            .single();

        const currentMetadata = currentJob?.metadata || {};

        await supabase
            .from('job_queue')
            .update({
                metadata: {
                    ...currentMetadata,
                    cv_match: {
                        analyzed_at: new Date().toISOString(),
                        cv_document_id: cvData.documentId,
                        ...matchResult,
                    }
                },
                status: 'CV_CHECKED', // Update status to reflect CV has been checked
                workflow_step: 2 // Move to next step if applicable (Step 2 is CV Opt/Match usually, but we need to check how it maps)
            })
            .eq('id', jobId);

        return NextResponse.json({ success: true, data: matchResult });

    } catch (error: any) {
        console.error('❌ CV Match failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
