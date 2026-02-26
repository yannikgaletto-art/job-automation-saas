/**
 * Multi-Agent Pipeline — Pathly V2.0
 * Claude (Writer) → GPT-4o (Language Judge) → Perplexity Sonar (Fact Checker)
 *
 * Reference: QUALITY_CV_COVER_LETTER.md B2.1
 *
 * Design:
 * - Sequential execution: Claude already ran in generator loop
 * - GPT-4o first, Perplexity only if GPT-4o passed
 * - Graceful Degradation: Missing API keys → warning, CL delivered anyway
 * - No second Judge call after pipeline (Yannik Correction #1)
 */

import { BLACKLIST_PATTERNS, buildBlacklistPromptSection } from './anti-fluff-blacklist';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PipelineResult {
    finalText: string;
    pipelineImproved: boolean;
    pipelineWarnings: string[];
    gptChanges?: string[];
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

// ─── GPT-4o Language Judge (Agent 2) ──────────────────────────────────────────
async function runGPTLanguageJudge(coverLetter: string): Promise<{
    improvedText: string;
    changes: string[];
    hadIssues: boolean;
}> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return { improvedText: coverLetter, changes: [], hadIssues: false };
    }

    const blacklistSection = BLACKLIST_PATTERNS.map(p => `- "${p.pattern}"`).join('\n');

    const systemPrompt = `Du bist ein Language Judge. Deine Aufgabe:
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
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0.3,
                max_tokens: 2500,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Prüfe und verbessere dieses Anschreiben:\n\n${coverLetter}` },
                ],
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            throw new Error(`GPT-4o API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty GPT-4o response');

        const parsed = JSON.parse(content);
        return {
            improvedText: parsed.improved_text || coverLetter,
            changes: parsed.changes || [],
            hadIssues: parsed.had_issues ?? false,
        };
    } catch (error) {
        console.error('❌ [Pipeline:GPT-4o] Language Judge failed:', error);
        throw error; // Let caller handle graceful degradation
    }
}

// ─── Perplexity Sonar Fact Checker (Agent 3) ──────────────────────────────────
async function runPerplexityFactCheck(
    coverLetter: string,
    companyName: string,
): Promise<{
    verified: boolean;
    issues: string[];
    corrections: string[];
}> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        return { verified: true, issues: [], corrections: [] };
    }

    // Yannik Correction #5: Only check external, verifiable claims — NOT CV statements
    const prompt = `Prüfe alle EXTERNEN Firmenreferenzen im folgenden Cover Letter für "${companyName}".

WICHTIG: Prüfe NUR externe, öffentlich verifizierbare Claims:
- Sind genannte News/Ereignisse über die Firma real und aktuell?
- Stimmen Zitate und Zuschreibungen an externe Personen?
- Gibt es faktische Fehler in Firmen-Beschreibungen (Gründungsdatum, Standort, Produkte)?

NICHT PRÜFEN (diese sind aus dem CV des Kandidaten und können nicht extern verifiziert werden):
- Persönliche Erfahrungen und Achievements des Kandidaten
- Rollenbezeichnungen und Firmen aus dem Lebenslauf des Kandidaten
- Behauptungen über eigene Projekte oder Ergebnisse

Cover Letter:
---
${coverLetter}
---

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
        throw error; // Let caller handle graceful degradation
    }
}

// ─── Main Pipeline Entry Point ────────────────────────────────────────────────
export async function runMultiAgentPipeline(
    coverLetter: string,
    jobData?: JobData,
    companyResearch?: CompanyResearchData,
): Promise<PipelineResult> {
    const warnings: string[] = [];
    let finalText = coverLetter;
    let improved = false;
    let gptChanges: string[] = [];
    let perplexityVerified: boolean | undefined;
    let perplexityIssues: string[] = [];

    const companyName = jobData?.company_name || 'das Unternehmen';

    // ── Step 1: GPT-4o Language Judge ──────────────────────────────────────
    if (!process.env.OPENAI_API_KEY) {
        warnings.push('GPT-4o Language Judge übersprungen (OPENAI_API_KEY fehlt). Single-Agent-Mode.');
        console.warn('⚠️ [Pipeline] OPENAI_API_KEY missing — skipping GPT-4o judge');
    } else {
        try {
            console.log('🔍 [Pipeline:GPT-4o] Running Language Judge...');
            const gptResult = await runGPTLanguageJudge(finalText);

            if (gptResult.hadIssues && gptResult.changes.length > 0) {
                finalText = gptResult.improvedText;
                gptChanges = gptResult.changes;
                improved = true;
                console.log(`✅ [Pipeline:GPT-4o] ${gptResult.changes.length} improvement(s) applied`);
            } else {
                console.log('✅ [Pipeline:GPT-4o] No issues found — text is clean');
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            warnings.push(`GPT-4o Language Judge fehlgeschlagen: ${errMsg}. Original-Text wird beibehalten.`);
            console.warn(`⚠️ [Pipeline:GPT-4o] Graceful degradation — continuing without GPT-4o`);
        }
    }

    // ── Step 2: Perplexity Fact Check (only if GPT-4o passed/skipped) ──────
    if (!process.env.PERPLEXITY_API_KEY) {
        warnings.push('Perplexity Fact Checker übersprungen (PERPLEXITY_API_KEY fehlt).');
        console.warn('⚠️ [Pipeline] PERPLEXITY_API_KEY missing — skipping fact check');
    } else {
        try {
            console.log('🔍 [Pipeline:Perplexity] Running Fact Checker...');
            const factResult = await runPerplexityFactCheck(finalText, companyName);

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
        gptChanges: gptChanges.length > 0 ? gptChanges : undefined,
        perplexityVerified,
        perplexityIssues: perplexityIssues.length > 0 ? perplexityIssues : undefined,
    };
}
