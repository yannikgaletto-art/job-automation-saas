import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { generateOptimizedCVContent, createCVDocument } from '@/lib/services/cv-template-generator';

export async function POST(req: NextRequest) {
    try {
        const { jobId, format } = await req.json();
        if (!jobId || format !== 'docx') {
            return NextResponse.json({ error: 'Valid Job ID and format=docx required. PDF not supported yet.' }, { status: 400 });
        }

        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: job } = await supabase
            .from('job_queue')
            .select('id, metadata')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (!job || !job.metadata?.cv_match) {
            return NextResponse.json({ error: 'Job not found or CV Match not run yet' }, { status: 404 });
        }

        const cvData = await getCVText(user.id);
        if (!cvData) {
            return NextResponse.json({
                error: 'Original CV text not found. Cannot generate optimized CV.'
            }, { status: 400 });
        }

        // Generate JSON profile using Claude
        const profile = await generateOptimizedCVContent(cvData.text, job.metadata.cv_match);

        // Generate DOCX buffer
        const buffer = await createCVDocument(profile);

        const response = new NextResponse(buffer as any);
        response.headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        response.headers.set('Content-Disposition', 'attachment; filename="Optimized_CV_Pathly.docx"');

        // Update workflow step if this is the first optimization
        await supabase
            .from('job_queue')
            .update({
                status: 'CV_OPTIMIZED',
                workflow_step: 2 // Usually optimizing is part of step 2, or moving to step 3
            })
            .eq('id', jobId);

        return response;

    } catch (error: any) {
        console.error('❌ CV Download failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
