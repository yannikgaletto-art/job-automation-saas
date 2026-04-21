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
    /** Hints where a missing keyword has a related CV skill from the same product ecosystem */
    ecosystemHints?: EcosystemHint[];
}

export interface EcosystemHint {
    keyword: string;   // The missing keyword (e.g. "Microsoft Dynamics 365")
    cvSkill: string;   // The found CV skill (e.g. "Microsoft Office")
    family: string;    // The ecosystem name (e.g. "Microsoft")
}

/**
 * Ecosystem clusters: product families where having experience with one
 * tool indicates RELATED (not identical) competence with others.
 * 
 * KEY DESIGN RULE: This does NOT convert MISSING to FOUND.
 * It only provides context to the AI so it can make a nuanced assessment
 * instead of treating it as ZERO experience.
 */
const ECOSYSTEM_CLUSTERS: Record<string, string[]> = {
    'Microsoft': [
        'microsoft', 'office', 'outlook', 'powerpoint', 'excel', 'onenote', 'word',
        'microsoft 365', 'microsoft office', 'dynamics', 'dynamics 365', 'azure',
        'copilot', 'ai-copilot', 'sharepoint', 'teams', 'power bi', 'power automate',
        'power platform', 'power apps',
    ],
    'Google': [
        'google', 'google workspace', 'gmail', 'google docs', 'google sheets',
        'google slides', 'google analytics', 'google ads', 'google cloud', 'gcp',
        'bigquery', 'looker', 'firebase',
    ],
    'Adobe': [
        'adobe', 'photoshop', 'illustrator', 'indesign', 'premiere', 'after effects',
        'lightroom', 'xd', 'figma', 'adobe creative cloud', 'audition', 'acrobat',
    ],
    'Automation': [
        'make', 'make.com', 'zapier', 'n8n', 'power automate', 'integromat',
        'workato', 'tray.io', 'automate.io', 'ifttt',
    ],
    'CRM': [
        'crm', 'salesforce', 'hubspot', 'pipedrive', 'close.io', 'close',
        'zoho', 'dynamics 365', 'microsoft dynamics', 'freshsales', 'copper',
    ],
    'Data & Analytics': [
        'power bi', 'tableau', 'excel', 'data analysis', 'datenanalyse',
        'analytics', 'google analytics', 'looker', 'metabase', 'qlik',
        'data visualization', 'datenvisualisierung',
    ],
    'AI/KI': [
        'ki', 'ai', 'künstliche intelligenz', 'machine learning', 'ml',
        'genai', 'llm', 'llms', 'chatgpt', 'claude', 'copilot', 'ai-copilot',
        'ai-agenten', 'python', 'langchain', 'openai', 'anthropic',
    ],
    'Project Management': [
        'projektmanagement', 'project management', 'scrum', 'kanban', 'agile',
        'jira', 'confluence', 'asana', 'trello', 'monday', 'notion',
        'okr', 'safe', 'less',
    ],
};

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
            // Also include: description bullet texts (e.g. "KI (Fokus: GenAI, LLMs)")
            // Without this, keywords mentioned only in role descriptions are never found.
            if (Array.isArray(exp.description)) {
                for (const bullet of exp.description) {
                    if (bullet?.text && typeof bullet.text === 'string' && bullet.text.trim().length >= 5) {
                        cvSkillsFlat.push(bullet.text.trim().toLowerCase());
                    }
                }
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

    // Ecosystem hint detection: for each MISSING keyword, check if CV has a related skill
    // from the same product family. This does NOT change found/missing — it only adds context.
    const ecosystemHints: EcosystemHint[] = [];
    for (const missedKw of missing) {
        const kwLower = missedKw.trim().toLowerCase();
        
        // Find which ecosystem families this keyword belongs to
        for (const [family, terms] of Object.entries(ECOSYSTEM_CLUSTERS)) {
            const kwBelongsToFamily = terms.some(term => 
                kwLower.includes(term) || term.includes(kwLower)
            );
            if (!kwBelongsToFamily) continue;

            // Check if ANY CV skill belongs to the same family
            for (const skill of uniqueSkills) {
                const skillBelongs = terms.some(term =>
                    skill.includes(term) || term.includes(skill)
                );
                if (skillBelongs) {
                    ecosystemHints.push({
                        keyword: missedKw,
                        cvSkill: skill,
                        family,
                    });
                    break; // one hint per keyword per family is enough
                }
            }
        }
    }

    if (ecosystemHints.length > 0) {
        console.log(`[pre-match] 🔗 Ecosystem hints: ${ecosystemHints.length} missing keywords have related CV skills`);
        for (const h of ecosystemHints) {
            console.log(`  → "${h.keyword}" ↔ CV has "${h.cvSkill}" (${h.family} family)`);
        }
    }

    return { found, missing, ecosystemHints: ecosystemHints.length > 0 ? ecosystemHints : undefined };
}
