/**
 * Multi-Agent Pipeline — Pathly V2.0
 * Claude Sonnet (Writer) → Claude Sonnet (Language Judge + Claim Extractor) → Perplexity Sonar (Fact Checker)
 *
 * Reference: QUALITY_CV_COVER_LETTER.md B2.1
 *
 * Design:
 * - Sequential: Claude already ran in generator loop
 * - Claude Sonnet extracts externalClaims[] alongside language fixes
 * - Perplexity receives ONLY externalClaims — never the full CL text
 * - If externalClaims is empty: Perplexity-Call skipped entirely (cost-save)
 * - Graceful Degradation: Missing API keys → warning, CL delivered anyway
 * - No second Judge call after pipeline (Yannik Correction #1)
 *
 * MIGRATION NOTE (2026-03-28):
 * - Replaced GPT-4o Language Judge with Claude 4.5 Sonnet via model-router
 * - Perplexity Fact Checker remains unchanged
 */

import { BLACKLIST_PATTERNS } from './anti-fluff-blacklist';
import { complete } from '@/lib/ai/model-router';

// ─── Types ────────────────────────────────────────────────────────────────────
interface JudgeResult {
    improvedText: string;
    externalClaims: string[];  // Externe, verifizierbare Claims (für Perplexity)
    changes: string[];
    hadIssues: boolean;
}

interface PipelineResult {
    finalText: string;
    pipelineImproved: boolean;
    pipelineWarnings: string[];
    judgeChanges?: string[];
    perplexityVerified?: boolean;
    perplexityIssues?: string[];
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

// ─── Claude Sonnet Language Judge + Claim Extractor (Agent 2) ─────────────────
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

Additionally: Extract all external, publicly verifiable claims from the text.
External claims are: Company names with specific statements, named news/events,
quotes with author attribution, public statistics or metrics about companies.
NO CV statements of the candidate (personal experiences, roles, achievements).

Output as JSON:
{
  "improved_text": "The improved text",
  "changes": ["Description of each change"],
  "had_issues": true/false,
  "external_claims": ["Claim 1", "Claim 2"]
}
If no external claims present: "external_claims": []`
        : `Du bist ein Language Judge. Deine Aufgabe:
1. Finde alle Sätze die nach KI klingen (Blacklist anwenden)
2. Prüfe Satz-Länge und -Rhythmus: kein Satz über 30 Wörter ohne Komma
3. Prüfe: Klingt das wie ein echter Mensch oder wie ChatGPT?
4. Ersetze alle markierten Passagen durch authentischere Formulierungen
5. Behalte die Struktur und alle Fakten bei

BLACKLIST (diese Phrasen MÜSSEN entfernt/ersetzt werden):
${blacklistSection}

Zusätzlich: Extrahiere alle externen, öffentlich verifizierbaren Behauptungen aus dem Text.
Externe Claims sind: Firmennamen mit konkreten Aussagen, genannte News/Ereignisse,
Zitate mit Autor-Attribution, öffentliche Statistiken oder Kennzahlen über Unternehmen.
KEINE CV-Aussagen des Kandidaten (persönliche Erfahrungen, Rollen, Achievements).

Output als JSON:
{
  "improved_text": "Der verbesserte Text",
  "changes": ["Beschreibung jeder Änderung"],
  "had_issues": true/false,
  "external_claims": ["Claim 1", "Claim 2"]
}
Wenn keine externen Claims vorhanden: "external_claims": []`;

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
            externalClaims: parsed.external_claims || [],
            changes: parsed.changes || [],
            hadIssues: parsed.had_issues ?? false,
        };
    } catch (error) {
        console.error('❌ [Pipeline:Sonnet] Language Judge failed:', error);
        throw error;
    }
}

// ─── Perplexity Sonar Fact Checker (Agent 3) ──────────────────────────────────
// Receives ONLY extracted external claims — never the full CL text
async function runPerplexityFactCheck(
    externalClaims: string[],
    companyName: string,
    isEnglish: boolean,
): Promise<{
    verified: boolean;
    issues: string[];
    corrections: string[];
}> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        return { verified: true, issues: [], corrections: [] };
    }

    const prompt = isEnglish
        ? `Check ONLY these external claims for factual accuracy:
${externalClaims.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Company: ${companyName}

CV statements of the candidate are NOT in this list and should not be evaluated.
Check only: Are the stated facts correct? Do the named news/events exist?

Output as JSON:
{
  "verified": true/false,
  "issues": ["List of problematic claims"],
  "corrections": ["Suggested corrections"]
}`
        : `Prüfe NUR diese externen Claims auf Faktentreue:
${externalClaims.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Unternehmen: ${companyName}

CV-Aussagen des Kandidaten sind NICHT in dieser Liste und werden nicht bewertet.
Prüfe nur: Sind die genannten Fakten korrekt? Existieren die genannten News/Ereignisse?

Output als JSON:
{
  "verified": true/false,
  "issues": ["Liste der problematischen Claims"],
  "corrections": ["Vorgeschlagene Korrekturen"]
}`;

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    { role: 'user', content: prompt },
                ],
                max_tokens: 1000,
            }),
        });

        if (!response.ok) {
            throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty Perplexity response');

        // Perplexity may return markdown-wrapped JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('[Pipeline:Perplexity] Could not parse JSON from response, treating as verified');
            return { verified: true, issues: [], corrections: [] };
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            verified: parsed.verified ?? true,
            issues: parsed.issues || [],
            corrections: parsed.corrections || [],
        };
    } catch (error) {
        console.error('❌ [Pipeline:Perplexity] Fact Check failed:', error);
        throw error;
    }
}

// ─── Main Pipeline Entry Point ────────────────────────────────────────────────
export async function runMultiAgentPipeline(
    coverLetter: string,
    jobData?: JobData,
    companyResearch?: CompanyResearchData,
    targetLanguage?: 'de' | 'en',
): Promise<PipelineResult> {
    const warnings: string[] = [];
    let finalText = coverLetter;
    let improved = false;
    let judgeChanges: string[] = [];
    let extractedClaims: string[] = [];
    let perplexityVerified: boolean | undefined;
    let perplexityIssues: string[] = [];
    const isEnglish = targetLanguage === 'en';

    const companyName = jobData?.company_name || (isEnglish ? 'the company' : 'das Unternehmen');

    // ── Step 1: Claude Sonnet Language Judge + Claim Extraction ───────────
    if (!process.env.ANTHROPIC_API_KEY) {
        warnings.push('Language Judge übersprungen (ANTHROPIC_API_KEY fehlt). Single-Agent-Mode.');
        console.warn('⚠️ [Pipeline] ANTHROPIC_API_KEY missing — skipping Language Judge');
    } else {
        try {
            console.log('🔍 [Pipeline:Sonnet] Running Language Judge + Claim Extraction...');
            const judgeResult = await runLanguageJudge(finalText, isEnglish);

            extractedClaims = judgeResult.externalClaims;
            console.log(`📋 [Pipeline:Sonnet] Extracted ${extractedClaims.length} external claims`);

            if (judgeResult.hadIssues && judgeResult.changes.length > 0) {
                finalText = judgeResult.improvedText;
                judgeChanges = judgeResult.changes;
                improved = true;
                console.log(`✅ [Pipeline:Sonnet] ${judgeResult.changes.length} improvement(s) applied`);
            } else {
                console.log('✅ [Pipeline:Sonnet] No issues found — text is clean');
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            warnings.push(`Language Judge fehlgeschlagen: ${errMsg}. Original-Text wird beibehalten.`);
            console.warn(`⚠️ [Pipeline:Sonnet] Graceful degradation — continuing without Language Judge`);
        }
    }

    // ── Step 2: Perplexity Fact Check (ONLY on extracted external claims) ──
    if (!process.env.PERPLEXITY_API_KEY) {
        warnings.push('Perplexity Fact Checker übersprungen (PERPLEXITY_API_KEY fehlt).');
        console.warn('⚠️ [Pipeline] PERPLEXITY_API_KEY missing — skipping fact check');
    } else if (extractedClaims.length === 0) {
        warnings.push('Kein externer Fact-Check nötig (keine verifizierbaren Claims gefunden).');
        console.log('✅ [Pipeline:Perplexity] Skipped — no external claims to verify');
    } else {
        try {
            console.log(`🔍 [Pipeline:Perplexity] Fact-checking ${extractedClaims.length} external claims...`);
            const factResult = await runPerplexityFactCheck(extractedClaims, companyName, isEnglish);

            perplexityVerified = factResult.verified;
            perplexityIssues = factResult.issues;

            if (!factResult.verified && factResult.issues.length > 0) {
                warnings.push(
                    `Fact-Check: ${factResult.issues.length} potenziell problematische Claims gefunden: ${factResult.issues.join('; ')}`
                );
                console.warn(`⚠️ [Pipeline:Perplexity] ${factResult.issues.length} issue(s): ${factResult.issues.join(', ')}`);
            } else {
                console.log('✅ [Pipeline:Perplexity] All claims verified');
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            warnings.push(`Perplexity Fact Checker fehlgeschlagen: ${errMsg}. Keine Faktenprüfung durchgeführt.`);
            console.warn(`⚠️ [Pipeline:Perplexity] Graceful degradation — continuing without fact check`);
        }
    }

    return {
        finalText,
        pipelineImproved: improved,
        pipelineWarnings: warnings,
        judgeChanges: judgeChanges.length > 0 ? judgeChanges : undefined,
        perplexityVerified,
        perplexityIssues: perplexityIssues.length > 0 ? perplexityIssues : undefined,
    };
}
