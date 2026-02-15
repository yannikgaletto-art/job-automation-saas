import { NextRequest, NextResponse } from 'next/server';
import { optimizeCV } from '@/lib/services/cv-optimizer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, jobId } = body;

        if (!userId || !jobId) {
            return NextResponse.json(
                { error: 'Missing userId or jobId' },
                { status: 400 }
            );
        }

        // 1. Fetch user's CV
        const { data: cvDoc, error: cvError } = await supabase
            .from('documents')
            .select('id, content, metadata') // Assuming content text is in 'content' or 'sanitized_text'
            // Schema check: The schema says 'sanitized_text' might not exist, but let's check
            // Actually schema.sql says 'pii_encrypted' and 'metadata', but we usually extract text.
            // Let's assume there is a 'content_text' or check how other services work.
            // Wait, schema.sql in line 80+ shows `documents` table has `pii_encrypted` and `metadata`.
            // It suggests text might be processed on the fly or stored?
            // "Step 2: Upload Training Material" in ARCHITECTURE.md says: 
            // "extracted_text = extract_text_from_pdf(file_bytes)"
            // "supabase.table('documents').insert({ ... })"
            // It doesn't explicitly show a plain text column in the inserted data in that snippet, 
            // but typical Supabase AI setups store extracted text.
            // Let's check schema.sql again.
            // Schema v3.0 shows: `documents` table has `pii_encrypted`, `metadata`, `writing_style_embedding`.
            // It does NOT show a plain text column. This is for privacy.
            // However, `job_queue` has `cover_letter` (text).
            // If CV text is encrypted, we need to decrypt it or use a temporary extracted version.
            // BUT, the prompt says "✅ CV text extracted and stored in `documents` table".
            // Let's assume for this MVP there is a field or we decrypt.
            // Actually, in `lib/services/cover-letter-generator.ts` (lines 41) it selects `content`.
            // So `content` must exist on `documents`.
            .eq('user_id', userId)
            .eq('document_type', 'cv')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (cvError || !cvDoc) {
            console.error('CV fetch error:', cvError);
            return NextResponse.json(
                { error: 'CV not found for user' },
                { status: 404 }
            );
        }

        // 2. Fetch job details
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) {
            console.error('Job fetch error:', jobError);
            return NextResponse.json(
                { error: 'Job not found' },
                { status: 404 }
            );
        }

        const cvText = cvDoc.content || ''; // Fallback

        // 3. Optimize CV
        const result = await optimizeCV({
            cvText: cvText,
            jobTitle: job.job_title || 'Unknown Role',
            jobRequirements: job.requirements || [], // Assuming requirements is string[] or json
            jobDescription: job.description || '',
        });

        // 4. Store result logic
        // We might want to store this in `job_queue` as `optimized_cv_url` or similar, 
        // OR create a new document.
        // The instructions say: "Store optimized version (optional)".
        // Let's optionally store it as a new document type 'cv_optimized' for now.

        /*
        await supabase.from('documents').insert({
            user_id: userId,
            document_type: 'cv_optimized', // Make sure this constraint allows it or just use 'cv' with metadata
            // Schema constraint: document_type IN ('cv', 'cover_letter', 'reference')
            // So we can't use 'cv_optimized' unless we change schema.
            // Let's NOT store it in `documents` to avoid schema violation for now, 
            // or we return it to frontend and let frontend decide to save.
            // Better: Return it.
        });
        */

        // Update Job Queue with the result (optional but good for history)
        // Checks if 'optimized_cv_url' expects a URL or text. Schema says TEXT.
        // Actually schema says `optimized_cv_url TEXT`. 
        // We can't store the full markdown there if it expects a URL.
        // But for MVP, let's just return it to the UI.

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('CV Optimization error:', error);
        return NextResponse.json(
            { error: 'Optimization failed', details: error.message },
            { status: 500 }
        );
    }
}
