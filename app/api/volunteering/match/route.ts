import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── Skill → Category Mapping (regelbasiert, kein AI-Call) ────────
const SKILL_CATEGORY_MAP: Record<string, string[]> = {
    social: [
        'kommunikation', 'beratung', 'coaching', 'sozialarbeit', 'pflege',
        'betreuung', 'empathie', 'teamarbeit', 'kundenservice', 'hr',
        'personalwesen', 'psychologie', 'mediation',
    ],
    education: [
        'lehre', 'training', 'mentoring', 'nachhilfe', 'didaktik',
        'pädagogik', 'workshop', 'präsentation', 'schulung', 'weiterbildung',
        'unterricht', 'forschung',
    ],
    environment: [
        'nachhaltigkeit', 'umwelt', 'klima', 'garten', 'landwirtschaft',
        'recycling', 'energie', 'naturschutz', 'biologie', 'ökologie',
    ],
    health: [
        'gesundheit', 'medizin', 'sport', 'fitness', 'ernährung',
        'therapie', 'wellness', 'rehabilitation', 'erste hilfe', 'pflege',
    ],
    culture: [
        'kunst', 'kultur', 'musik', 'theater', 'literatur', 'design',
        'fotografie', 'film', 'veranstaltung', 'event', 'marketing',
        'kommunikation', 'medien', 'journalismus', 'übersetzung',
    ],
};

function matchSkillsToCategories(cvText: string): string[] {
    const lower = cvText.toLowerCase();
    const scores: Record<string, number> = {};

    for (const [category, keywords] of Object.entries(SKILL_CATEGORY_MAP)) {
        scores[category] = keywords.filter(kw => lower.includes(kw)).length;
    }

    // Return categories sorted by match score, only if score > 0
    return Object.entries(scores)
        .filter(([, score]) => score > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([cat]) => cat);
}

// ─── GET /api/volunteering/match ──────────────────────────────────
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch user's latest CV text (if available)
        const { data: cvDoc } = await supabase
            .from('documents')
            .select('extracted_text')
            .eq('user_id', user.id)
            .eq('document_type', 'cv')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!cvDoc?.extracted_text) {
            // Graceful degradation: no CV → no suggestions, no error
            return NextResponse.json({
                success: true,
                data: [],
                message: 'Kein CV vorhanden — lade deinen Lebenslauf hoch für personalisierte Vorschläge.',
            });
        }

        // Match skills to categories
        const matchedCategories = matchSkillsToCategories(cvDoc.extracted_text);

        if (matchedCategories.length === 0) {
            return NextResponse.json({
                success: true,
                data: [],
                message: 'Keine passenden Engagements gefunden.',
            });
        }

        // Fetch top 3 opportunities per top-matched category (max 2 categories)
        const topCategories = matchedCategories.slice(0, 2);
        const { data: opportunities, error } = await supabase
            .from('volunteering_opportunities')
            .select('*')
            .eq('is_active', true)
            .in('category', topCategories)
            .order('scraped_at', { ascending: false })
            .limit(6);

        if (error) {
            console.error('❌ [volunteering/match] DB error:', error.message);
            return NextResponse.json({ error: 'Fehler beim Matching' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: opportunities ?? [],
            matched_categories: topCategories,
        });
    } catch (err) {
        console.error('❌ [volunteering/match] Fatal:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
