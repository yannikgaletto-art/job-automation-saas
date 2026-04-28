import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { complete } from '@/lib/ai/model-router';
import { cvOptimizationProposalSchema, CvOptimizationProposal, CvStructuredData, CvChange } from '@/types/cv';
import crypto from 'crypto';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';
import { logger } from '@/lib/logging';
import { getLanguageName, type SupportedLocale } from '@/lib/i18n/get-user-locale';
import { translateCvIfNeeded } from '@/lib/services/cv-translator';
import { pruneForOptimizer } from '@/lib/utils/cv-payload-pruner';
import { withCreditGate, handleBillingError } from '@/lib/middleware/credit-gate';
import { CREDIT_COSTS } from '@/lib/services/credit-types';



export const maxDuration = 120; // Vercel timeout protection — Claude Sonnet can take 40-75s on large payloads

// Prompt version for tracking and rollback
const PROMPT_VERSION = 'v2.4';

// Admin client for bypassing RLS (used after Auth Guard verification)
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Attempts to parse JSON, with two recovery passes:
 * Pass 1: truncate at last '}' — recovers partial objects
 * Pass 2: truncate at last ']' and close the outer object — recovers partial changes arrays
 * This handles the common case where Claude truncates mid-change due to token limits.
 */
function safeParseJson(raw: string): any {
    // Pass 0: direct parse
    try { return JSON.parse(raw); } catch { /* continue */ }

    // Pass 1: find all '}' positions, try from rightmost inward (O(n) linear scan + bounded retries)
    const closeBracePositions: number[] = [];
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '}') closeBracePositions.push(i);
    }
    for (let j = closeBracePositions.length - 1; j >= 0; j--) {
        try { return JSON.parse(raw.slice(0, closeBracePositions[j] + 1)); } catch { continue; }
    }

    // Pass 2: truncate at last complete array element ']', then close outer object
    // Handles: {"changes":[{...},{...}, <truncated>
    const lastBracket = raw.lastIndexOf(']');
    if (lastBracket !== -1) {
        const candidate = raw.slice(0, lastBracket + 1);
        // Balance braces to close the outer object
        const openBraces = (candidate.match(/\{/g) || []).length;
        const closeBraces = (candidate.match(/\}/g) || []).length;
        const missingClose = '}' .repeat(Math.max(0, openBraces - closeBraces));
        try { return JSON.parse(candidate + missingClose); } catch { /* continue */ }
    }

    // Pass 3: Find last COMPLETE change object (ends with '}') and build a valid array from it.
    // This handles the most common truncation: Claude cuts off mid-string-value like "B2-Niveau)
    // Strategy: walk backwards searching for a '}' that closes a complete change object
    const changesStart = raw.indexOf('"changes"');
    if (changesStart !== -1) {
        // Find each '}' and try to recover [prefix up to that }] as a valid changes array
        for (let i = raw.length - 1; i > changesStart; i--) {
            if (raw[i] === '}') {
                const candidate = raw.slice(0, i + 1) + '\n  ]\n}';
                try { return JSON.parse(candidate); } catch { continue; }
            }
        }
    }

    throw new Error('Could not parse AI JSON response: ' + raw.slice(-300));
}

/**
 * Applies a set of diffs (CvChanges) to the original CV to generate the fully optimized CV.
 * This saves us from having to ask the LLM to output the full ~15k char CV again, dodging token limits.
 */
function applyCvChanges(cv: CvStructuredData, changes: CvChange[]): CvStructuredData {
    const optimized: CvStructuredData = JSON.parse(JSON.stringify(cv)); // deep clone

    for (const change of changes || []) {
        if (!change) continue;

        const target = change.target || {};
        const { section, entityId, field, bulletId } = target;
        if (!section) continue;

        // ── REMOVE ──────────────────────────────────────────────────────
        if (change.type === 'remove') {
            if (section === 'personalInfo') continue; // never remove personalInfo fields

            const sectionArray = (optimized as any)[section];
            if (!Array.isArray(sectionArray)) continue;

            if (bulletId && entityId) {
                // Remove a specific bullet from an entity's description
                const entity = sectionArray.find((e: any) => e.id === entityId);
                if (entity && Array.isArray(entity.description)) {
                    entity.description = entity.description.filter((b: any) => b.id !== bulletId);
                }
            } else if (entityId && !bulletId) {
                // Remove an entire entity (e.g., remove an old internship)
                (optimized as any)[section] = sectionArray.filter((e: any) => e.id !== entityId);
            }
            continue;
        }

        // ── MODIFY / ADD (require 'after' text) ────────────────────────
        if (change.type !== 'modify' && change.type !== 'add') continue;
        if (!change.after) continue;

        if (section === 'personalInfo') {
            if (field) (optimized.personalInfo as any)[field] = change.after;
            continue;
        }

        const sectionArray = (optimized as any)[section];
        if (!Array.isArray(sectionArray)) continue;

        const entity = sectionArray.find((e: any) => e.id === entityId);
        if (!entity) continue;

        // Bullets in Experience (description is Array<{id, text}>)
        if (field === 'description' && Array.isArray(entity.description)) {
            if (change.type === 'modify' && bulletId) {
                const bullet = entity.description.find((b: any) => b.id === bulletId);
                if (bullet) bullet.text = change.after;
            } else if (change.type === 'add') {
                entity.description.push({ id: crypto.randomUUID(), text: change.after });
            }
        }
        // Education description is a plain string, not an array
        else if (field === 'description' && typeof entity.description === 'string') {
            entity.description = change.after;
        }
        // Skills array replacement (LLM can reorder/change items using comma-separated string)
        else if (section === 'skills' && field === 'items') {
            entity.items = change.after.split(',').map((s: string) => s.trim());
        }
        // General text fields (e.g., summary, role)
        else if (field) {
            (entity as any)[field] = change.after;
        }
    }

    return optimized;
}


export async function POST(req: NextRequest) {
    try {
        // §8: Auth Guard — verify session before any processing
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit check (3 req/min per user — Upstash Redis)
        const rateLimited = await checkUpstashLimit(rateLimiters.cvOptimize, user.id);
        if (rateLimited) return rateLimited;

        const log = logger.forRequest(undefined, user.id, '/api/cv/optimize');

        const body = await req.json();
        const { cv_structured_data, cv_match_result, template_id, job_id, station_metrics, cv_opt_settings, locale: rawLocale } = body;
        const locale: SupportedLocale = (['de', 'en', 'es'].includes(rawLocale) ? rawLocale : 'de') as SupportedLocale;
        const lang = getLanguageName(locale);

        if (!cv_structured_data || !cv_match_result || !job_id) {
            return NextResponse.json({ error: 'error_missing_params' }, { status: 400 });
        }

        // Guard: requirementRows must exist on the cv_match_result object
        const requirementRows = cv_match_result?.requirementRows ?? cv_match_result?.rows ?? cv_match_result;
        if (!requirementRows) {
            log.warn('cv/optimize called without requirementRows', { job_id, cv_match_result_keys: Object.keys(cv_match_result || {}) });
            return NextResponse.json({ error: 'error_no_match' }, { status: 400 });
        }

        log.info('CV Optimize requested', { job_id });

        // §3: User-scoped — always use session user.id, never trust body
        const user_id = user.id;

        // ── Pass 1: Translate CV to target language if needed ───────────
        // cv-parser stores content verbatim (e.g. German bullets from a German CV).
        // Translation is ONLY needed for non-German locales — the cv-parser prompt
        // is in German and preserves original text, so locale='de' CVs are always
        // already in the correct language. Skipping for 'de' prevents false-positive
        // triggers from company names (e.g. 'The Boston Consulting Group').
        const { cv: translatedCv, wasTranslated } = locale !== 'de'
            ? await translateCvIfNeeded(cv_structured_data, lang)
            : { cv: cv_structured_data, wasTranslated: false };
        if (wasTranslated) {
            log.info('CV pre-translated to target language', { locale, lang });
        }



        // Build summary instruction based on user settings
        const showSummary = cv_opt_settings?.showSummary ?? true;
        let summaryInstruction = '';
        if (!showSummary) {
            summaryInstruction = `\nSUMMARY INSTRUCTION: The user has DISABLED the summary. Do NOT generate any summary changes. Leave the summary field UNTOUCHED.\n`;
        } else if (cv_opt_settings?.summaryMode === 'compact') {
            summaryInstruction = `\nSUMMARY INSTRUCTION: Write the summary in MAX 2 sentences.
No filler text. Strict format: "[Role] with [concrete experience], focused on [value for employer]."
No adjectives without evidence. No "motivated", "passionate", "dedicated".\n`;
        }

        // Build structured metrics context from station_metrics
        const metricsContext = station_metrics
            ?.filter((s: { metrics: string }) => s.metrics?.trim()?.length > 0)
            ?.map((s: { company: string; role: string; metrics: string }) =>
                `- At "${s.company}"${s.role ? ` (${s.role})` : ''}: ${s.metrics}`)
            ?.join('\n');

        const metricsBlock = metricsContext
            ? `\n4. USER METRICS (provided by user — only integrate if factually relevant to the respective position):\n${metricsContext}\n`
            : '';

        // Extract missing ATS keywords from the match result for Keyword Weaving
        const missingKeywords: string[] = Array.isArray(cv_match_result?.keywordsMissing)
            ? cv_match_result.keywordsMissing.slice(0, 7)
            : [];
        const keywordBlock = missingKeywords.length > 0
            ? `\n5. MISSING ATS KEYWORDS (from CV Match — integrate authentically where possible):\n${missingKeywords.map(k => `- ${k}`).join('\n')}\n`
            : '';

        const prompt = `
You are a world-class career consultant and CV optimizer.
Your task: receive a CV JSON (CV SSoT) and an analysis (CV Match Result), then produce a precise optimization diff-list and an adjusted full CV.

**OPTIMIZATION RULES:**
1. NO HALLUCINATIONS — STRICT GROUNDED-TRUTH POLICY:
   - NEVER invent facts, numbers, or experiences not explicitly stated in the CV SSoT.
   - FORBIDDEN: Inventing years of experience (e.g. "5+ years", "10 years"). Derive ONLY from the actual dateRangeText fields in the input JSON.
   - FORBIDDEN: Generic superlatives with no evidence: "Proven track record", "Extensive experience", "Deep expertise", "Passionate about", "Visionary leader".
   - FORBIDDEN: Claiming skills, tools, or methodologies not listed in the CV SSoT skills or experience sections.
   - If a gap cannot be filled with real data from the CV SSoT, suggest "TODO: Ask user — do you have experience here?" instead of inventing.
2. Reformulate bullet points so they address the requirements from the CV Match Result more precisely (only if verifiable!).
3. You may reorder arrays, e.g. in 'skills' (most important first).
4. Do not change existing IDs without reason. Keep the \`id\` of existing entries. Use \`id\` for stable referencing in your \`changes\` array.
5. If an experience entry has 0 bullet points, ADD 1–2 relevant bullets based on the role title and company context.
6. Your output MUST be an exact diff-list (changes):
   - "target.section": where (e.g. experience, skills, summary)
   - "target.entityId": id of the entry
   - "target.field": e.g. 'description'
   - "target.bulletId": if a specific bullet is changed/added/removed
   - "type": "add" | "modify" | "remove"
   - "before" / "after": MUST BE A PLAIN STRING. NEVER return an array! (For bullets: only the raw text)
   - "reason": WHY — written in ${lang}
   - "requirementRef.requirement": which requirement from the CV Match this derives from.
${summaryInstruction}

[LAYOUT CONSTRAINTS — MANDATORY — DO NOT EXCEED — PROMPT ${PROMPT_VERSION}]
HARD RULE: The final CV MUST fit on exactly 2 printed A4 pages. NEVER generate content for 3+ pages.
- Max 3 bullet points per experience entry (quality over quantity — user can add more)
- Max 20 words per bullet point. Aim for high information density — every word must be earned.
- Summary: max 3 sentences
- If ≥5 experience entries: oldest entries get max 1 bullet
- If ≥6 experience entries: oldest 2 entries get max 1 bullet each
- If >3 education entries: only 2 most relevant get full description
- Skills: max 3 categories, max 8 items per category
- Certificates: keep only the 6 most relevant (drop the rest)
- Page budget:
  → Page 1: Header + Summary + Experience + Education
  → Page 2: Skills, Languages, Certificates (right column)

QUALITY GATE (MANDATORY):
- Every change MUST have at least ONE of these justifications:
  (a) Integrates a missing ATS keyword authentically
  (b) Makes the bullet MORE SPECIFIC (adds tools, metrics, outcomes)
  (c) Merges multiple generic bullets into one concrete bullet
- Pure shortening without adding substance is NOT a valid change. If the only improvement is fewer words, do NOT propose that change.
- Removing concrete details (project names, technologies, metrics) to save words is FORBIDDEN.

BULLET STYLE CONSISTENCY (MANDATORY for ALL experience description bullets):
- EVERY experience bullet MUST follow the format: "<Label>: <Description sentence>"
- Label = 2–4 words, Title-Case, naming the competency / theme of the bullet (e.g. "Workshop-Facilitation", "Stakeholder-Alignment", "Operations & Leadership", "End-to-End Verantwortung")
- Colon after label, then a single concise sentence with the actual achievement.
- The colon MUST appear within the first 40 characters — the renderer auto-bolds the label up to the colon, so a longer prefix breaks the bold.
- If an existing bullet has no label → propose a "modify" change that prepends a fitting label.
- If you "add" a new bullet → it MUST already follow this format.
- Education and certification descriptions are FREE-FORM (no label rule); this rule applies to experience bullets only.
- Counter-example (FORBIDDEN): "Digitale Geschäftsmodelle im B2B-Umfeld entwickelt; Kundenanforderungen in IT-Lösungen übersetzt."
- Correct example: "Geschäftsmodell-Entwicklung: Digitale B2B-Modelle entworfen und Kundenanforderungen in IT-Lösungen übersetzt."

AUTHENTIC KEYWORD WEAVING:
- For each MISSING ATS KEYWORD listed in input section 5:
  1. Search the CV for REAL experience that relates to this keyword
  2. If found: reformulate the relevant bullet so the keyword appears naturally
  3. If NOT found: do NOT integrate it. Honesty > ATS score.
- Example: keyword "Risk Management" + CV has "NIS-2 Compliance" → reformulate as "Led NIS-2 risk management and compliance processes"
- Counter-example: keyword "Emergency Planning" + CV has nothing → do NOT insert.

SECTION DISTRIBUTION (MANDATORY):
- Your changes MUST cover at least 2 different sections. Do NOT spend all 12 changes on experience alone.
- Reserve at least 2 changes for Skills (reorder, add missing keywords) or Summary.
- Prioritize: 7–8 experience changes, 2–3 skills changes, 1–2 summary changes.

SELF-JUDGE VALIDATION (run this before returning):
Before returning your output, mentally verify:
1. Count total changes. If >12, keep only the 12 most impactful.
2. Verify at least 2 sections are covered (experience + skills/summary). If not, add 1–2 skills/summary changes.
3. Count total bullet points across all experience entries. If >15, cut the weakest.
4. Count total skill items. If >24, remove least relevant.
5. Count certificates. If >6, keep only the 6 most relevant.
6. If total content is likely to overflow 2 pages, aggressively cut the oldest/weakest entries.
7. For each change: does it pass the QUALITY GATE? If not, drop it.
If any check fails, revise your output before returning.
[END LAYOUT CONSTRAINTS]

SUMMARY QUALITY JUDGE (run before writing any summary change):
Before writing the summary "after" value, verify each claim against the CV SSoT:
1. YEARS OF EXPERIENCE: Only state years if the dateRangeText fields sum to that duration. If unsure → omit the number entirely.
2. TRACK RECORD / ACHIEVEMENTS: Only claim "proven" or "successful" for outcomes explicitly listed in description bullets. If no outcome data → describe the role scope instead.
3. TOOLS & SKILLS: Only reference tools that appear in the skills[] or experience[].description[] arrays of the CV SSoT.
4. If the summary cannot be written factually within these constraints, write a shorter, honest 2-sentence summary instead of a hallucinated 3-sentence one.

SUMMARY FORMATTING:
- In the summary text field, wrap the 3-5 most impactful phrases in **double asterisks** for bold rendering.
- Bold: concrete role titles, tools, or specific outcomes — NOT generic adjectives.
- Do NOT bold entire sentences. Only 3-5 key phrases.

**INPUT DATA:**

1. CV SSoT (CURRENT CV):
${JSON.stringify(pruneForOptimizer(translatedCv, cv_match_result?.buzzwords), null, 2)}

2. CV MATCH RESULT (ANALYSIS & GAPS):
${JSON.stringify(requirementRows, null, 2)}

3. SELECTED TEMPLATE ID:
${template_id}
${metricsBlock}
${keywordBlock}

**CRITICAL OUTPUT RULES:**
- "before" and "after" fields MUST be plain strings, never arrays.
- If a change affects multiple bullet points, create ONE CvChange per bullet.
- Return ONLY valid JSON. No markdown. No code blocks. No comments.
- Every string field must be a string, not null, not an array.
- The CV input may be in a different language than the output language. ALWAYS write "after" and "reason" fields in ${lang}, regardless of the CV input language.

**OUTPUT LANGUAGE: ${lang}. Write ALL "after" and "reason" text fields in ${lang}.**

**OUTPUT FORMAT (STRICT JSON):**
Return ONLY JSON. No markdown framing (\`\`\`json), no comments.
Must conform to the following Zod schema:
{
  "changes": [
    {
      "id": "change-1",
      "target": { "section": "experience", "entityId": "exp-1", "field": "description", "bulletId": "bullet-1-1" },
      "type": "modify",
      "before": "Wrote software",
      "after": "Developed backend services (Python) for payment processing",
      "reason": "The requirement demands experience with Python backends.",
      "requirementRef": { "requirement": "Python Backend Services" }
    }
  ]
}
`;

        // §BILLING: Credit Gate — debit 0.5 credits, auto-refund on AI failure
        let response;
        try {
            response = await withCreditGate(
                user.id,
                CREDIT_COSTS.cv_optimize,
                'cv_optimize',
                () => complete({
                    taskType: 'optimize_cv',
                    prompt,
                    temperature: 0,
                    maxTokens: 8000, // Increased: 5000 caused truncation on large CVs with 12 changes
                }),
                job_id
            );
        } catch (aiErr: any) {
            const billingResponse = handleBillingError(aiErr);
            if (billingResponse) return billingResponse;

            const aiMsg = aiErr?.message || String(aiErr);
            log.error('AI call failed', { error: aiMsg });
            return NextResponse.json(
                { success: false, error: 'error_ai_failed', details: aiMsg },
                { status: 502 }
            );
        }

        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.error('No JSON in AI response', { textLength: response.text.length });
            return NextResponse.json(
                { success: false, error: 'error_parse_failed' },
                { status: 502 }
            );
        }

        let rawJson: any;
        try {
            rawJson = safeParseJson(jsonMatch[0]);
        } catch (parseErr: any) {
            log.error('JSON parse failed', { error: parseErr?.message });
            return NextResponse.json(
                { success: false, error: 'error_parse_failed', details: parseErr?.message },
                { status: 502 }
            );
        }

        // Validate just the changes array
        if (!Array.isArray(rawJson.changes)) {
            log.error('AI response missing changes array', { keys: Object.keys(rawJson) });
            return NextResponse.json(
                { success: false, error: 'error_parse_failed' },
                { status: 502 }
            );
        }

        // Sanitize changes before Zod — handle common AI output quirks
        rawJson.changes = rawJson.changes
            .filter((c: any) => {
                // Drop changes with no section — prevents silent misrouting
                if (!c.target?.section) {
                    log.warn('Dropping change with no target.section', { changeId: c.id });
                    return false;
                }
                return true;
            })
            .map((c: any, idx: number) => ({
                id: c.id || `change-${idx + 1}`,
                target: {
                    section: c.target.section,
                    entityId: c.target?.entityId ?? null,
                    field: c.target?.field ?? null,
                    bulletId: c.target?.bulletId ?? null,
                },
                type: c.type || 'modify',
                before: Array.isArray(c.before) ? c.before.join(', ') : (c.before ?? undefined),
                after: Array.isArray(c.after) ? c.after.join(', ') : (c.after ?? undefined),
                reason: c.reason || 'KI-Optimierung',
                requirementRef: c.requirementRef ?? null,
            }));

        // ── Before-Text Sanitizer ──────────────────────────────────────
        // Replace AI-generated 'before' values with ground-truth from the CV.
        // Runs unconditionally — LLMs hallucinate 'before' regardless of language.
        // Changes where path lookup fails are DROPPED to prevent misleading diffs.
        interface LookupFailure { changeId: string; reason: string; path: string; }
        const lookupFailures: LookupFailure[] = [];
        const verifiedChanges: typeof rawJson.changes = [];

        for (const change of rawJson.changes) {
            // ADD changes have no 'before' — always pass through
            if (change.type === 'add') {
                verifiedChanges.push(change);
                continue;
            }

            const { section, entityId, field, bulletId } = change.target;

            // personalInfo — flat object, no arrays
            if (section === 'personalInfo' && field) {
                const realBefore = (translatedCv.personalInfo as any)?.[field];
                if (realBefore != null) {
                    change.before = String(realBefore);
                    verifiedChanges.push(change);
                } else {
                    lookupFailures.push({ changeId: change.id, reason: 'personalInfo field not found', path: `personalInfo.${field}` });
                }
                continue;
            }

            // Array sections — experience, education, skills, languages, certifications
            const sectionArray = (translatedCv as any)?.[section];
            if (!Array.isArray(sectionArray) || !entityId) {
                lookupFailures.push({ changeId: change.id, reason: 'section not array or entityId missing', path: `${section}.${entityId}` });
                continue;
            }

            const entity = sectionArray.find((e: any) => e.id === entityId);
            if (!entity) {
                lookupFailures.push({ changeId: change.id, reason: 'entityId not found', path: `${section}.${entityId}` });
                continue;
            }

            // Bullet-level lookup (experience.description)
            if (bulletId && Array.isArray(entity.description)) {
                const bullet = entity.description.find((b: any) => b.id === bulletId);
                if (bullet) {
                    change.before = bullet.text;
                    verifiedChanges.push(change);
                } else {
                    lookupFailures.push({ changeId: change.id, reason: 'bulletId not found', path: `${section}.${entityId}.description.${bulletId}` });
                }
                continue;
            }

            // Field-level lookup
            if (field) {
                const realValue = entity[field];
                if (realValue != null) {
                    change.before = Array.isArray(realValue)
                        ? realValue.map((x: any) => typeof x === 'string' ? x : x.text).join(', ')
                        : String(realValue);
                    verifiedChanges.push(change);
                } else {
                    lookupFailures.push({ changeId: change.id, reason: 'field not found on entity', path: `${section}.${entityId}.${field}` });
                }
            } else {
                lookupFailures.push({ changeId: change.id, reason: 'no field or bulletId specified', path: `${section}.${entityId}` });
            }
        }

        // Replace with verified-only changes
        const droppedCount = rawJson.changes.length - verifiedChanges.length;
        rawJson.changes = verifiedChanges;

        if (lookupFailures.length > 0) {
            log.warn('Before-text sanitizer: changes dropped due to path mismatch', {
                job_id,
                total_before_sanitize: droppedCount + verifiedChanges.length,
                dropped: droppedCount,
                remaining: verifiedChanges.length,
                failures: lookupFailures,
            });
        }

        // Backend-cap: limit to 12 most relevant changes
        // Prompt already asks for max 12, but enforce as safety net
        const MAX_CHANGES = 12;
        if (rawJson.changes.length > MAX_CHANGES) {
            log.info(`Capping changes from ${rawJson.changes.length} to ${MAX_CHANGES}`);
            // Priority: modify > add > remove (keeps the most impactful)
            const priorityOrder: Record<string, number> = { modify: 0, add: 1, remove: 2 };
            rawJson.changes.sort((a: any, b: any) => (priorityOrder[a.type] ?? 9) - (priorityOrder[b.type] ?? 9));
            rawJson.changes = rawJson.changes.slice(0, MAX_CHANGES);
        }

        // Apply changes programmatically to create the optimized CV
        const optimizedCv = applyCvChanges(translatedCv, rawJson.changes);

        // ── INTEGRITY GUARD — Restore PII & structural fields on translated ──
        // Defence-in-depth: even if a future code change accidentally mutates
        // translatedCv (e.g. a pruner refactor forgetting the deep-clone), we
        // guarantee the stored `proposal.translated` always has the user's full
        // PII and complete structure.  The source of truth is `cv_structured_data`
        // from the original request body — immutable within this request scope.
        const safeTranslated: CvStructuredData = JSON.parse(JSON.stringify(translatedCv));
        const srcPi = cv_structured_data.personalInfo;
        if (srcPi && safeTranslated.personalInfo) {
            // Restore PII fields that must never be lost (DSGVO: these were pruned
            // only for the AI prompt, the stored base must keep them for PDF rendering)
            safeTranslated.personalInfo.name     = srcPi.name     ?? safeTranslated.personalInfo.name;
            safeTranslated.personalInfo.email    = srcPi.email    ?? safeTranslated.personalInfo.email;
            safeTranslated.personalInfo.phone    = srcPi.phone    ?? safeTranslated.personalInfo.phone;
            safeTranslated.personalInfo.location = srcPi.location ?? safeTranslated.personalInfo.location;
            safeTranslated.personalInfo.linkedin = srcPi.linkedin ?? safeTranslated.personalInfo.linkedin;
            safeTranslated.personalInfo.website  = srcPi.website  ?? safeTranslated.personalInfo.website;
        }
        // Restore arrays that must not shrink (languages, certifications are pruned
        // for the optimizer prompt but must remain on the stored base CV).
        if (cv_structured_data.languages?.length && (!safeTranslated.languages?.length)) {
            safeTranslated.languages = cv_structured_data.languages;
        }
        if (cv_structured_data.certifications?.length && (!safeTranslated.certifications?.length)) {
            safeTranslated.certifications = cv_structured_data.certifications;
        }
        // Guard: if experience/education shrank by >50%, something went wrong —
        // restore from source (Translation AI may merge entries incorrectly).
        if (cv_structured_data.experience?.length &&
            safeTranslated.experience.length < cv_structured_data.experience.length * 0.5) {
            log.warn('Integrity guard: experience count collapsed, restoring from source', {
                stored: safeTranslated.experience.length,
                source: cv_structured_data.experience.length,
            });
            safeTranslated.experience = cv_structured_data.experience;
        }
        if (cv_structured_data.education?.length &&
            safeTranslated.education.length < cv_structured_data.education.length * 0.5) {
            log.warn('Integrity guard: education count collapsed, restoring from source', {
                stored: safeTranslated.education.length,
                source: cv_structured_data.education.length,
            });
            safeTranslated.education = cv_structured_data.education;
        }

        // Construct the final proposal object.
        // `translated` is the base CV after Pass 1 (language translation) but before
        // Pass 2 (ATS optimization). The frontend needs it as a stable base for
        // re-applying selective user decisions after a page refresh — without it, the
        // restore path would fall back to the original (possibly untranslated) CV.
        const proposalPayload = {
            translated: safeTranslated,
            optimized: optimizedCv,
            changes: rawJson.changes
        };

        // Schema validation — use safeParse to get a clean error instead of a thrown ZodError
        const parseResult = cvOptimizationProposalSchema.safeParse(proposalPayload);
        if (!parseResult.success) {
            const zodMsg = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
            log.error('Zod validation failed', { error: zodMsg });
            return NextResponse.json(
                { success: false, error: 'error_validation_failed', details: zodMsg },
                { status: 502 }
            );
        }
        const validated = parseResult.data;

        // Store the proposal in DB (§3: user-scoped write)
        // Layout-fix: preserve existing user_decisions so reload stays on Step 2
        const { error: dbError } = await supabaseAdmin
            .from('job_queue')
            .update({
            cv_optimization_proposal: validated,
            cv_optimization_user_decisions: null,
            })
            .eq('id', job_id)
            .eq('user_id', user_id);

        if (dbError) {
            log.error('DB write failed', { error: dbError.message });
            return NextResponse.json(
                { success: false, error: 'error_db_failed', details: dbError.message },
                { status: 500 }
            );
        }

        // §2: Read-Back — verify the write was successful (Double-Assurance)
        const { data: readBack } = await supabaseAdmin
            .from('job_queue')
            .select('cv_optimization_proposal, metadata')
            .eq('id', job_id)
            .eq('user_id', user_id)
            .single();

        if (!readBack?.cv_optimization_proposal) {
            log.error('Read-back verification FAILED');
            return NextResponse.json(
                { success: false, error: 'error_db_failed' },
                { status: 500 }
            );
        }



        return NextResponse.json({
            success: true,
            proposal: validated as CvOptimizationProposal
        });

    } catch (error: any) {
        const errDetail = error?.errors ? JSON.stringify(error.errors) : (error?.message || String(error));
        console.error('❌ [CV Optimize] Unexpected error:', errDetail);
        return NextResponse.json(
            { success: false, error: 'error_unknown', details: errDetail },
            { status: 500 }
        );
    }
}

