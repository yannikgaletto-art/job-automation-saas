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

/**
 * Detects if the CV content is already in the target language.
 * Samples the first 5 experience bullet texts and checks for common
 * German/Spanish indicators. Returns true if translation is needed.
 */
function needsTranslation(cv: CvStructuredData, targetLang: string): boolean {
    // Collect sample text across multiple CV sections for reliable detection.
    // Sampling only experience bullets misses sparse CVs (e.g. fresh graduates).
    const samples: string[] = [];

    for (const exp of cv.experience || []) {
        for (const bullet of exp.description || []) {
            if (bullet.text) samples.push(bullet.text);
            if (samples.length >= 8) break;
        }
        if (samples.length >= 8) break;
    }
    // Also sample education descriptions and skill categories
    for (const edu of cv.education || []) {
        if (typeof edu.description === 'string' && edu.description) samples.push(edu.description);
    }
    for (const skill of cv.skills || []) {
        if (skill.category) samples.push(skill.category);
    }

    // No translatable text found → nothing to do
    if (samples.length === 0) return false;

    const sampleText = samples.join(' ').toLowerCase();

    // If target is English, check if content has German/Spanish markers
    if (targetLang === 'English') {
        const germanMarkers = /\b(und|der|die|das|für|mit|von|zur|des|eine|einer|sowie|durch|über|bei|auf|nach|als|werden|wurde|erstellung|durchführung|aufbau|entwicklung|beratung)\b/;
        const spanishMarkers = /\b(los|las|del|para|con|por|una|sus|como|sobre|entre|desde|esta|estos)\b/;
        return germanMarkers.test(sampleText) || spanishMarkers.test(sampleText);
    }

    // If target is German, check if content is in English
    if (targetLang === 'German') {
        const englishMarkers = /\b(the|and|for|with|from|through|including|achieving|enabling|built|developed|designed|managed|implemented|delivered|led)\b/;
        return englishMarkers.test(sampleText);
    }

    // If target is Spanish, check for English/German
    if (targetLang === 'Spanish') {
        const otherMarkers = /\b(the|and|for|und|der|die|das|für|mit)\b/;
        return otherMarkers.test(sampleText);
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

    const prompt = `You are a precise CV content translator. Translate the following CV JSON into ${targetLanguage}.

RULES:
1. Translate ONLY these fields: role, summary, description (bullet texts), degree, category (skills), language names, proficiency text, targetRole, certification names.
2. DO NOT translate: company names, institution names, dates, dateRangeText, URLs, emails, phone numbers, skill items (e.g. "Python", "Jira"), certification issuers, credential URLs, grades.
3. DO NOT change any IDs, version numbers, or structural fields.
4. DO NOT rephrase or improve content — translate faithfully and precisely.
5. Keep the EXACT same JSON structure. Return the full JSON object.
6. Professional vocabulary only. Use industry-standard terminology.

Return ONLY valid JSON. No markdown. No explanation. No code blocks.

INPUT CV JSON:
${JSON.stringify(cv, null, 2)}`;

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

        console.log(`[cv-translator] ✅ Translation complete (${response.tokensUsed} tokens, ${response.latencyMs}ms)`);
        return { cv: translated, wasTranslated: true };
    } catch (error: any) {
        console.error('[cv-translator] ❌ Translation failed, using original CV:', error.message);
        return { cv, wasTranslated: false };
    }
}
