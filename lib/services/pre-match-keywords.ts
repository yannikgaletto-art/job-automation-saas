/**
 * pre-match-keywords.ts — Deterministic ATS Keyword Pre-Matcher
 * Feature-Silo: CV Match
 *
 * Matches buzzwords against the user's structured CV skill index BEFORE
 * the LLM call. The result is injected as GROUND TRUTH into the prompt,
 * forcing the LLM to honor the pre-match decision.
 *
 * Shared between:
 *   - lib/inngest/cv-match-pipeline.ts (PROD: Inngest Step 2.5)
 *   - app/api/cv/match/route.ts (DEV: synchronous pipeline)
 *
 * ⚠ SYNC CONTRACT: Logic changes here affect both pipelines identically.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export interface PreMatchResult {
    found: string[];
    missing: string[];
}

// Hobby/personal skill categories to EXCLUDE from ATS matching
const EXCLUDED_CATEGORIES = new Set([
    'hobbies', 'hobby', 'interests', 'interessen', 'personal', 'persönlich',
    'freizeit', 'leisure', 'sonstige', 'other', 'sonstiges',
]);

/**
 * Deterministically match buzzwords against the user's structured CV data.
 *
 * Returns `null` if no buzzwords or no structured skills to match against
 * (caller falls back to LLM-only classification).
 */
export async function preMatchKeywords(
    userId: string,
    buzzwords: string[]
): Promise<PreMatchResult | null> {
    if (!buzzwords || buzzwords.length === 0) {
        console.log('[pre-match] No buzzwords to match — skipping');
        return null;
    }

    // Load structured CV data
    let cvData: any = null;
    try {
        const { data: profile, error: profileErr } = await supabaseAdmin
            .from('user_profiles')
            .select('cv_structured_data')
            .eq('id', userId)
            .single();

        if (profileErr) {
            console.warn('[pre-match] Supabase query failed — LLM-only fallback:', profileErr.message);
            return null;
        }
        cvData = profile?.cv_structured_data;
    } catch (dbErr: any) {
        console.warn('[pre-match] Unexpected DB error — LLM-only fallback:', dbErr?.message);
        return null;
    }

    if (!cvData?.skills || !Array.isArray(cvData.skills)) {
        console.log('[pre-match] No cv_structured_data.skills found — LLM-only fallback');
        return null;
    }

    // Flatten all professional skills into a single lowercase array
    const cvSkillsFlat: string[] = [];

    for (const group of cvData.skills) {
        const cat = (group.category || '').toLowerCase().trim();
        if (EXCLUDED_CATEGORIES.has(cat)) continue; // Skip hobbies

        if (Array.isArray(group.items)) {
            for (const item of group.items) {
                if (typeof item === 'string' && item.trim().length >= 2) {
                    cvSkillsFlat.push(item.trim().toLowerCase());
                }
            }
        }
    }

    // Also include: job titles from experience (e.g. "Business Development Manager")
    if (Array.isArray(cvData.experience)) {
        for (const exp of cvData.experience) {
            if (exp.role && typeof exp.role === 'string') {
                cvSkillsFlat.push(exp.role.trim().toLowerCase());
            }
        }
    }

    // Also include: language names
    if (Array.isArray(cvData.languages)) {
        for (const lang of cvData.languages) {
            if (lang.language && typeof lang.language === 'string') {
                cvSkillsFlat.push(lang.language.trim().toLowerCase());
            }
        }
    }

    // Also include: certification names
    if (Array.isArray(cvData.certifications)) {
        for (const cert of cvData.certifications) {
            if (cert.name && typeof cert.name === 'string') {
                cvSkillsFlat.push(cert.name.trim().toLowerCase());
            }
        }
    }

    // Deduplicate
    const uniqueSkills = [...new Set(cvSkillsFlat)];

    // Match each buzzword against CV skills
    const found: string[] = [];
    const missing: string[] = [];

    for (const keyword of buzzwords) {
        const kw = keyword.trim().toLowerCase();
        if (kw.length < 2) continue;

        // Word-boundary-safe matching: prevent "AI" matching "Email"
        // For short keywords (<=3 chars), require exact match or start/end of skill
        const isShort = kw.length <= 3;

        const isFound = uniqueSkills.some(skill => {
            if (isShort) {
                // Exact match only for short terms
                return skill === kw
                    || skill.startsWith(kw + ' ')
                    || skill.startsWith(kw + '.')
                    || skill.endsWith(' ' + kw)
                    || skill.includes('(' + kw + ')')
                    || skill.includes(' ' + kw + ' ');
            }
            // Longer keywords: substring match (case-insensitive)
            if (skill.includes(kw)) return true;
            if (kw.includes(skill)) {
                // Word-boundary check: skill must be surrounded by spaces, start, or end
                const wordBoundaryRegex = new RegExp(`(^|[\\s\\-\\/])${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s\\-\\/])`);
                return wordBoundaryRegex.test(kw);
            }
            return false;
        });

        if (isFound) {
            found.push(keyword); // preserve original casing
        } else {
            missing.push(keyword);
        }
    }

    console.log(`[pre-match] Matched ${found.length}/${buzzwords.length} keywords deterministically. CV skills index: ${uniqueSkills.length} entries.`);
    if (found.length > 0) console.log(`[pre-match] Found: ${found.join(', ')}`);
    if (missing.length > 0) console.log(`[pre-match] Missing: ${missing.join(', ')}`);

    return { found, missing };
}
