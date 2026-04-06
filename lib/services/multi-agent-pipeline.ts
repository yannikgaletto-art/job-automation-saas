/**
 * Multi-Agent Pipeline — Pathly V2.0
 * Claude Haiku (Language Judge)
 *
 * Reference: QUALITY_CV_COVER_LETTER.md B2.1
 *
 * Design:
 * - Sequential: Claude already ran in generator loop
 * - Claude Haiku checks language quality, blacklist violations, sentence length
 * - Graceful Degradation: Missing API keys → warning, CL delivered anyway
 * - No second Judge call after pipeline (Yannik Correction #1)
 *
 * COST OPTIMIZATION (2026-03-30):
 * - Language Judge downgraded from Sonnet → Haiku (pattern matching, not creative)
 * - Perplexity Fact Check removed entirely (2026-03-30 Phase 2):
 *   perplexityVerified was never consumed by any UI component.
 *   Zero-Fake-Data enforcement relies on prompt engineering in Sonnet.
 */

import { BLACKLIST_PATTERNS } from './anti-fluff-blacklist';
import { complete } from '@/lib/ai/model-router';

// ─── Types ────────────────────────────────────────────────────────────────────
interface JudgeResult {
    improvedText: string;
    changes: string[];
    hadIssues: boolean;
}

interface PipelineResult {
    finalText: string;
    pipelineImproved: boolean;
    pipelineWarnings: string[];
    judgeChanges?: string[];
}

interface CompanyResearchData {
    company_values?: string[];
    tech_stack?: string[];
    [key: string]: unknown;
}

interface JobData {
    job_title?: string;
    company_name?: string;
    requirements?: string[];
    [key: string]: unknown;
}

// ─── Claude Haiku Language Judge (Agent 2) ─────────────────────────────────
async function runLanguageJudge(coverLetter: string, isEnglish: boolean): Promise<JudgeResult> {
    const blacklistSection = BLACKLIST_PATTERNS.map(p => `- "${p.pattern}"`).join('\n');

    const systemPrompt = isEnglish
        ? `You are a Language Judge. Your task:
1. Find all sentences that sound like AI (apply blacklist)
2. Check sentence length and rhythm: no sentence over 30 words without a comma
3. Check: Does this sound like a real person or like ChatGPT?
4. Replace all flagged passages with more authentic formulations
5. Keep the structure and all facts

BLACKLIST (these phrases MUST be removed/replaced):
${blacklistSection}

Output as JSON:
{
  "improved_text": "The improved text",
  "changes": ["Description of each change"],
  "had_issues": true/false
}`
        : `Du bist ein Language Judge. Deine Aufgabe:
1. Finde alle Sätze die nach KI klingen (Blacklist anwenden)
2. Prüfe Satz-Länge und -Rhythmus: kein Satz über 30 Wörter ohne Komma
3. Prüfe: Klingt das wie ein echter Mensch oder wie ChatGPT?
4. Ersetze alle markierten Passagen durch authentischere Formulierungen
5. Behalte die Struktur und alle Fakten bei

BLACKLIST (diese Phrasen MÜSSEN entfernt/ersetzt werden):
${blacklistSection}

Output als JSON:
{
  "improved_text": "Der verbesserte Text",
  "changes": ["Beschreibung jeder Änderung"],
  "had_issues": true/false
}`;

    try {
        const userPrompt = `${isEnglish ? 'Review and improve this cover letter' : 'Prüfe und verbessere dieses Anschreiben'}:\n\n${coverLetter}`;

        const response = await complete({
            taskType: 'language_judge',
            systemPrompt,
            prompt: userPrompt,
            temperature: 0.3,
            maxTokens: 2500,
        });

        // Robust JSON parsing — Claude may wrap in markdown
        let parsed: any;
        try {
            parsed = JSON.parse(response.text);
        } catch {
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in Language Judge response');
            }
        }

        return {
            improvedText: parsed.improved_text || coverLetter,
            changes: parsed.changes || [],
            hadIssues: parsed.had_issues ?? false,
        };
    } catch (error) {
        console.error('❌ [Pipeline:Haiku] Language Judge failed:', error);
        throw error;
    }
}

// ─── Main Pipeline Entry Point ────────────────────────────────────────────────
export async function runMultiAgentPipeline(
    coverLetter: string,
    jobData?: JobData,
    companyResearch?: CompanyResearchData,
    targetLanguage?: 'de' | 'en' | 'es',
): Promise<PipelineResult> {
    const warnings: string[] = [];
    let finalText = coverLetter;
    let improved = false;
    let judgeChanges: string[] = [];
    const isEnglish = targetLanguage === 'en';

    // ── Step 1: Claude Haiku Language Judge ───────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
        warnings.push('Language Judge übersprungen (ANTHROPIC_API_KEY fehlt). Single-Agent-Mode.');
        console.warn('⚠️ [Pipeline] ANTHROPIC_API_KEY missing — skipping Language Judge');
    } else {
        try {
            console.log('🔍 [Pipeline:Haiku] Running Language Judge...');
            const judgeResult = await runLanguageJudge(finalText, isEnglish);

            if (judgeResult.hadIssues && judgeResult.changes.length > 0) {
                finalText = judgeResult.improvedText;
                judgeChanges = judgeResult.changes;
                improved = true;
                console.log(`✅ [Pipeline:Haiku] ${judgeResult.changes.length} improvement(s) applied`);
            } else {
                console.log('✅ [Pipeline:Haiku] No issues found — text is clean');
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            warnings.push(`Language Judge fehlgeschlagen: ${errMsg}. Original-Text wird beibehalten.`);
            console.warn(`⚠️ [Pipeline:Haiku] Graceful degradation — continuing without Language Judge`);
        }
    }

    // Perplexity Fact Check removed (2026-03-30 Phase 2).
    // The perplexityVerified flag was never consumed by any UI component.
    // Zero-Fake-Data enforcement relies on prompt engineering in Sonnet generator.

    return {
        finalText,
        pipelineImproved: improved,
        pipelineWarnings: warnings,
        judgeChanges: judgeChanges.length > 0 ? judgeChanges : undefined,
    };
}
