/**
 * CV Translator — Pass 1 of the 2-Pass Translation Pipeline.
 *
 * Translates all user-facing text fields in a CvStructuredData JSON
 * into the target language using Claude Haiku (fast + cheap).
 *
 * WHY: The cv-parser stores CV content verbatim (e.g. German bullets from
 * a German CV). The CV Optimizer has a 12-change limit for ATS improvements,
 * so it can't also translate 30+ bullets. This pre-pass ensures the optimizer
 * always receives a fully-translated CV, eliminating mixed-language output.
 *
 * WHAT IS TRANSLATED:
 *   - experience[].role, summary, description[].text
 *   - education[].degree, description
 *   - skills[].category
 *   - languages[].language, proficiency
 *   - personalInfo.summary, targetRole
 *   - certifications[].name
 *
 * WHAT IS PRESERVED (never translated):
 *   - Company names, institution names, dates, URLs, emails, phone numbers
 *   - Skill items (Python, Jira, etc. are language-neutral)
 *   - Certification issuers, credential URLs
 *   - All IDs, version, structural fields
 */

import { complete } from '@/lib/ai/model-router';
import { CvStructuredData } from '@/types/cv';

// ═══ Language-marker regexes (Welle Re-1, 2026-04-27) ═══
// Exported so the Optimizer-output validator can reuse them without duplicating.
// Markers are tuned to action verbs that LLMs emit in CV bullets — these are
// far more reliable than function words for detecting CV-bullet language.
export const EN_BULLET_MARKERS = /\b(the|and|for|with|from|through|including|achieving|enabling|built|developed|designed|managed|implemented|delivered|led|leading|developing|designing|managing|implementing|delivering|building|driving|owning|coordinating|establishing|conducting|collaborating|operating|optimising|optimizing|launching|scaling|orchestrated|orchestrating|reduced|reducing|increased|increasing|spearheaded|championed|streamlined|negotiated|presented|facilitated|mentored|onboarded|co-responsible|responsible)\b/gi;
export const DE_BULLET_MARKERS = /\b(und|der|die|das|für|mit|von|zur|des|eine|einer|sowie|durch|über|bei|auf|nach|als|werden|wurde|erstellung|durchführung|aufbau|entwicklung|beratung|geleitet|entwickelt|aufgebaut|durchgeführt|begleitet|konzipiert|verantwortet|erstellt|optimiert|koordiniert|umgesetzt|eingeführt|betreut|verhandelt|präsentiert)\b/gi;
export const ES_BULLET_MARKERS = /\b(los|las|del|para|con|por|una|sus|como|sobre|entre|desde|esta|estos|dirigí|desarrollé|implementé|gestioné|construí|liderado|implementado|gestionado|desarrollado|presenté|negocié|coordiné)\b/gi;

/**
 * Counts how many language-specific markers a piece of text contains.
 * Lower-cased internally — caller does not need to normalize.
 */
export function countLanguageMarkers(text: string, lang: 'en' | 'de' | 'es'): number {
    const lower = (text || '').toLowerCase();
    const re = lang === 'en' ? EN_BULLET_MARKERS : lang === 'de' ? DE_BULLET_MARKERS : ES_BULLET_MARKERS;
    return (lower.match(re) ?? []).length;
}

/**
 * Detects whether a single string is in the wrong language for the target.
 * Used by Optimizer-output validator to drop language-inconsistent changes.
 *
 * Returns:
 *   "matches-target" — text contains markers of the target language (or no markers at all)
 *   "wrong-language" — text contains ≥1 marker of a non-target language and ZERO target markers
 *   "unknown"        — text too short or no markers in any language
 */
export function detectStringLanguage(
    text: string,
    targetLang: 'en' | 'de' | 'es',
): 'matches-target' | 'wrong-language' | 'unknown' {
    if (!text || text.trim().length < 10) return 'unknown';
    const targetCount = countLanguageMarkers(text, targetLang);
    const otherLangs: Array<'en' | 'de' | 'es'> = (['en', 'de', 'es'] as const).filter(l => l !== targetLang);
    const otherCounts = otherLangs.map(l => countLanguageMarkers(text, l));
    const maxOther = Math.max(...otherCounts);

    if (targetCount === 0 && maxOther === 0) return 'unknown';
    if (targetCount > 0) return 'matches-target';
    if (maxOther >= 1) return 'wrong-language';
    return 'unknown';
}

/**
 * Detects if the CV content is already in the target language.
 * Welle Re-1 (2026-04-27): broader sampling (all bullets across first 5 roles
 * instead of 3) plus richer marker sets (action verbs that dominate CV bullets).
 * Fixes the Yannik-EN-CV mishmasch where mixed German company names hid a
 * fully English bullet body and the old marker set missed it.
 */
export function needsTranslation(cv: CvStructuredData, targetLang: string): boolean {
    const MAX_EXP_ENTRIES_SAMPLED = 5;
    const MAX_BULLETS_PER_ENTRY = 4;
    const MAX_SKILL_CATEGORIES_SAMPLED = 3;

    const samples: string[] = [];

    const experienceEntries = (cv.experience || []).slice(0, MAX_EXP_ENTRIES_SAMPLED);
    for (const exp of experienceEntries) {
        const bullets = (exp.description || []).slice(0, MAX_BULLETS_PER_ENTRY);
        for (const b of bullets) {
            if (b?.text) samples.push(b.text);
        }
        if (exp.role) samples.push(exp.role);
    }

    if (cv.personalInfo?.summary) samples.push(cv.personalInfo.summary);
    if (cv.personalInfo?.targetRole) samples.push(cv.personalInfo.targetRole);

    for (const edu of cv.education || []) {
        if (typeof edu.description === 'string' && edu.description) samples.push(edu.description);
        if (edu.degree) samples.push(edu.degree);
    }

    for (const skill of (cv.skills || []).slice(0, MAX_SKILL_CATEGORIES_SAMPLED)) {
        if (skill.category) samples.push(skill.category);
        for (const item of (skill.items || []).slice(0, 3)) {
            if (item) samples.push(item);
        }
    }

    if (samples.length === 0) return false;

    const sampleText = samples.join(' ').toLowerCase();

    if (targetLang === 'English') {
        const deCount = (sampleText.match(DE_BULLET_MARKERS) ?? []).length;
        const esCount = (sampleText.match(ES_BULLET_MARKERS) ?? []).length;
        return deCount >= 1 || esCount >= 1;
    }

    if (targetLang === 'German') {
        // Require ≥2 to avoid false-positive on single English company names.
        const enCount = (sampleText.match(EN_BULLET_MARKERS) ?? []).length;
        return enCount >= 2;
    }

    if (targetLang === 'Spanish') {
        const enCount = (sampleText.match(EN_BULLET_MARKERS) ?? []).length;
        const deCount = (sampleText.match(DE_BULLET_MARKERS) ?? []).length;
        return enCount >= 1 || deCount >= 1;
    }

    return false;
}

/**
 * Translates all user-facing text in a CV JSON to the target language.
 * Uses Claude Haiku for speed (~2-5s) and cost efficiency (~$0.001/call).
 *
 * Returns the translated CV. If translation fails, returns the original
 * CV unchanged (graceful degradation — optimizer still works, just mixed-language).
 */
export async function translateCvIfNeeded(
    cv: CvStructuredData,
    targetLanguage: string, // e.g. "English", "German", "Spanish"
): Promise<{ cv: CvStructuredData; wasTranslated: boolean }> {
    // Skip if content appears to already be in the target language
    if (!needsTranslation(cv, targetLanguage)) {
        console.log(`[cv-translator] Content already in ${targetLanguage}, skipping translation`);
        return { cv, wasTranslated: false };
    }

    console.log(`[cv-translator] Translating CV content to ${targetLanguage}...`);

    // ═══ DSGVO Phase 2: Strip PII before AI call ═══
    // Create a deep clone and remove personal contact data.
    // The restore logic (below, lines ~180-190) will re-inject all PII
    // from the original `cv` object after translation — fully idempotent.
    const cvForAI: CvStructuredData = JSON.parse(JSON.stringify(cv));
    if (cvForAI.personalInfo) {
        cvForAI.personalInfo.name = '[REDACTED]';
        cvForAI.personalInfo.email = undefined;
        cvForAI.personalInfo.phone = undefined;
        cvForAI.personalInfo.location = undefined;
        cvForAI.personalInfo.linkedin = undefined;
        cvForAI.personalInfo.website = undefined;
    }
    console.log(`🛡️ [cv-translator] PII stripped from CV before AI call`);

    const prompt = `You are a precise CV content translator. Translate the following CV JSON into ${targetLanguage}.

RULES:

1. TRANSLATE THESE FIELDS (exact JSON paths — translate every occurrence):
   - personalInfo.summary                       (string)
   - personalInfo.targetRole                    (string)
   - experience[].role                          (string — e.g. "Innovation Manager" → "Innovation Manager"; English ≈ German for tech roles)
   - experience[].summary                       (string)
   - experience[].description[].text            (array of objects — translate each .text)
   - education[].degree                         (string — e.g. "Bachelor of Arts" ↔ "Bachelor of Arts" if untranslatable, but "Business Innovation & Entrepreneurship (M.Sc.)" stays as proper-noun degree title)
   - education[].description                    (PLAIN STRING, NOT an array — translate the WHOLE string from start to end, including every sentence and every line break)
   - skills[].category                          (string — e.g. "Skills" → "Kenntnisse")
   - languages[].language                       (string — e.g. "English" → "Englisch")
   - languages[].proficiency                    (string — e.g. "Native" → "Muttersprache")
   - certifications[].name                      (string — proper-noun cert names usually stay in original)
   - certifications[].description               (string)

2. DO NOT TRANSLATE (keep VERBATIM, copy from input to output unchanged):
   - personalInfo.name, .email, .phone, .location, .linkedin, .website
   - experience[].company, .dateRangeText, .location
   - education[].institution, .dateRangeText, .grade
   - skills[].items                             (e.g. "Python", "Jira" — language-neutral tools/products)
   - languages[].level                          (numeric)
   - certifications[].issuer, .dateText, .credentialUrl
   - All .id fields, version

3. STRUCTURAL: Keep the EXACT JSON structure (same keys, same array lengths, same nesting). Do not add or drop fields.

4. FAITHFULNESS: Translate, do not rewrite. No improvements, no shortening, no expansion.

5. PROPER NOUNS: Course titles, school programs, and degree names that are themselves proper nouns
   (e.g. "Business Innovation & Entrepreneurship (M.Sc.)") MAY stay in their original language if a
   forced translation would distort the proper-noun meaning. But generic phrases ("Bachelor of Arts in
   Media Studies") MUST be translated.

6. Professional vocabulary only. Use industry-standard terminology in the target language.

Return ONLY valid JSON. No markdown. No explanation. No code blocks.

INPUT CV JSON:
${JSON.stringify(cvForAI, null, 2)}`;

    try {
        const response = await complete({
            taskType: 'translate_cv',
            prompt,
            temperature: 0,
            maxTokens: 16384,
        });

        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('[cv-translator] No valid JSON in response, using original CV');
            return { cv, wasTranslated: false };
        }

        const translated = JSON.parse(jsonMatch[0]) as CvStructuredData;

        // Sanity check: ensure critical structure is preserved
        if (
            !translated.personalInfo ||
            !Array.isArray(translated.experience) ||
            !Array.isArray(translated.education)
        ) {
            console.warn('[cv-translator] Translated JSON missing critical structure, using original CV');
            return { cv, wasTranslated: false };
        }

        // Preserve IDs from original (safety net — AI should keep them, but verify)
        translated.version = cv.version;
        for (let i = 0; i < (translated.experience || []).length; i++) {
            const orig = cv.experience?.[i];
            const trans = translated.experience[i];
            if (orig && trans) {
                trans.id = orig.id;
                // Preserve bullet IDs
                for (let j = 0; j < (trans.description || []).length; j++) {
                    if (orig.description?.[j]) {
                        trans.description[j].id = orig.description[j].id;
                    }
                }
            }
        }
        for (let i = 0; i < (translated.education || []).length; i++) {
            if (cv.education?.[i]) translated.education[i].id = cv.education[i].id;
        }
        for (let i = 0; i < (translated.skills || []).length; i++) {
            if (cv.skills?.[i]) translated.skills[i].id = cv.skills[i].id;
        }
        for (let i = 0; i < (translated.languages || []).length; i++) {
            if (cv.languages?.[i]) translated.languages[i].id = cv.languages[i].id;
        }
        if (translated.certifications) {
            for (let i = 0; i < translated.certifications.length; i++) {
                if (cv.certifications?.[i]) translated.certifications[i].id = cv.certifications[i].id;
            }
        }

        // ── PII & Structure Restore ──────────────────────────────────
        // The prompt says "DO NOT translate: emails, phones, dates, URLs,
        // company names, institution names" — but LLMs may interpret this
        // as "don't include them". Restore all untranslatable fields from
        // the original CV to guarantee data integrity. This is idempotent:
        // if the AI kept them, the restore is a no-op.
        restoreImmutableFields(cv, translated);

        console.log(`[cv-translator] ✅ Translation complete (${response.tokensUsed} tokens, ${response.latencyMs}ms)`);
        return { cv: translated, wasTranslated: true };
    } catch (error: any) {
        console.error('[cv-translator] ❌ Translation failed, using original CV:', error.message);
        return { cv, wasTranslated: false };
    }
}

/**
 * Restores fields the LLM must not change after translation. Mutates `translated` in place.
 *
 * Identity fields (name, role, degree, company, institution, dates, contact data) are
 * proper-noun-like in CV context: "Projektleitung" must not become "Project Lead",
 * "Innovation Manager" must not become "Innovationsmanager". The translator prompt
 * says "do not translate these" but LLMs sometimes interpret that as "drop these" or
 * "translate them anyway"; this function makes data integrity deterministic.
 *
 * Idempotent: if the AI kept the original value, the restore is a no-op.
 * Exported for unit testing.
 */
export function restoreImmutableFields(orig: CvStructuredData, translated: CvStructuredData): void {
    const srcPi = orig.personalInfo;
    if (srcPi && translated.personalInfo) {
        translated.personalInfo.name       = srcPi.name       ?? translated.personalInfo.name;
        translated.personalInfo.email      = srcPi.email      ?? translated.personalInfo.email;
        translated.personalInfo.phone      = srcPi.phone      ?? translated.personalInfo.phone;
        translated.personalInfo.location   = srcPi.location   ?? translated.personalInfo.location;
        translated.personalInfo.linkedin   = srcPi.linkedin   ?? translated.personalInfo.linkedin;
        translated.personalInfo.website    = srcPi.website    ?? translated.personalInfo.website;
        // targetRole is the user's job-title self-identification — a proper noun in CV context.
        translated.personalInfo.targetRole = srcPi.targetRole ?? translated.personalInfo.targetRole;
    }
    for (let i = 0; i < (translated.experience || []).length; i++) {
        const o = orig.experience?.[i];
        const t = translated.experience[i];
        if (o && t) {
            t.role          = o.role          ?? t.role;
            t.company       = o.company       ?? t.company;
            t.dateRangeText = o.dateRangeText ?? t.dateRangeText;
            t.location      = o.location      ?? t.location;
        }
    }
    for (let i = 0; i < (translated.education || []).length; i++) {
        const o = orig.education?.[i];
        const t = translated.education[i];
        if (o && t) {
            t.degree        = o.degree        ?? t.degree;
            t.institution   = o.institution   ?? t.institution;
            t.dateRangeText = o.dateRangeText ?? t.dateRangeText;
            t.grade         = o.grade         ?? t.grade;
        }
    }
    // Arrays the AI may have dropped entirely → restore from original.
    if (orig.languages?.length && !translated.languages?.length) {
        translated.languages = orig.languages;
    }
    if (orig.certifications?.length && !translated.certifications?.length) {
        translated.certifications = orig.certifications;
    }
}
