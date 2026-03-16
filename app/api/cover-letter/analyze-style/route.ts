import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeWritingStyle } from '@/lib/services/writing-style-analyzer';

// QA Round 2: Explicit timeout for Claude Haiku call
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { documentId } = await req.json();
    if (!documentId) return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });

    // Load document metadata (full JSONB — need extracted_text + existing style_analysis)
    // QA Round 2: Filter out AI-generated docs (origin = 'generated')
    const { data: doc, error } = await supabase
        .from('documents')
        .select('metadata')
        .eq('id', documentId)
        .eq('user_id', user.id) // Defense-in-depth auth
        .neq('origin', 'generated')
        .single();

    if (error || !doc) {
        return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 });
    }

    const metadata = (doc.metadata || {}) as Record<string, any>;

    // QA ②: Idempotency — if already analyzed, return cached result
    if (metadata.style_analysis) {
        console.log(`✅ [AnalyzeStyle] Cached result for doc ${documentId}`);
        return NextResponse.json({
            styleAnalysis: metadata.style_analysis,
            cached: true,
        });
    }

    // QA ④: Guard — no extracted text available
    const extractedText = metadata.extracted_text;
    if (!extractedText || typeof extractedText !== 'string' || extractedText.length < 50) {
        return NextResponse.json(
            { error: 'Text nicht verfügbar — bitte ein neueres Anschreiben hochladen.' },
            { status: 400 }
        );
    }

    try {
        const result = await analyzeWritingStyle(extractedText);

        // QA ③: Read-Merge-Write — preserve all existing metadata fields
        const updated = { ...metadata, style_analysis: result };
        const { error: updateError } = await supabase
            .from('documents')
            .update({ metadata: updated })
            .eq('id', documentId)
            .eq('user_id', user.id); // Defense-in-depth on write too

        if (updateError) {
            console.error('❌ [AnalyzeStyle] DB write failed:', updateError);
            return NextResponse.json({ error: 'Analyse konnte nicht gespeichert werden' }, { status: 500 });
        }

        console.log(`✅ [AnalyzeStyle] Analyzed and saved for doc ${documentId}`);
        return NextResponse.json({
            styleAnalysis: result,
            cached: false,
        });

    } catch (err) {
        console.error('❌ [AnalyzeStyle] Analysis failed:', err);
        return NextResponse.json(
            { error: 'Stilanalyse fehlgeschlagen — Preset wird als Fallback verwendet.' },
            { status: 500 }
        );
    }
}
