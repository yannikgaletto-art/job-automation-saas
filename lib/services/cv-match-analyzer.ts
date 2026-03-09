import { complete } from '@/lib/ai/model-router';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Admin client: works in both API routes AND Inngest background context (no cookie/session required)
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Attempts to parse JSON, with a fallback that truncates the string at the
 * last complete object/array boundary if the raw parse fails.
 */
function safeParseJson(raw: string): any {
    // First attempt: raw parse
    try {
        return JSON.parse(raw);
    } catch {
        // Second attempt: find last valid closing brace
        let truncated = raw;
        for (let i = raw.length - 1; i >= 0; i--) {
            if (raw[i] === '}') {
                truncated = raw.slice(0, i + 1);
                try {
                    return JSON.parse(truncated);
                } catch {
                    continue;
                }
            }
        }
        throw new Error('Could not parse AI JSON response: ' + raw.slice(-200));
    }
}

export interface CVMatchRequest {
    userId: string;
    jobId: string;
    cvText: string;
    jobTitle: string;
    company: string;
    jobDescription: string;
    requirements: string[];
    atsKeywords: string[];
    level: string;
}

// 3-column Notion table row — one per requirement
export interface RequirementRow {
    requirement: string;   // Spalte 1: Original-Anforderung aus Steckbrief
    status: 'met' | 'partial' | 'missing';
    currentState: string;  // Spalte 2: CV Ist-Zustand
    suggestion: string;    // Spalte 3: Ethisch korrekte Veränderungsempfehlung
    corrected?: boolean;
}

export interface CVMatchResult {
    overallScore: number; // 0–100
    realismScore?: number;
    scoreBreakdown: {
        technicalSkills: { score: number; reasons: string[] } | number;
        softSkills: { score: number; reasons: string[] } | number;
        experienceLevel: { score: number; reasons: string[] } | number;
        domainKnowledge: { score: number; reasons: string[] } | number;
        languageMatch: { score: number; reasons: string[] } | number;
    };
    requirementRows: RequirementRow[];  // → Renders as Notion 3-column table
    strengths: string[];
    gaps: string[];
    potentialHighlights: string[];
    overallRecommendation: string;
    keywordsFound: string[];
    keywordsMissing: string[];
}

const CV_MATCH_PROMPT = (req: CVMatchRequest) => `
Du bist ein erfahrener HR-Consultant und ATS-Experte mit hohem Anspruch
an Realismus. Du bist bekannt dafür, ehrlich zu sein — weder zu hart noch
zu wohlwollend.
WICHTIGSTE REGEL: Sprich den Nutzer IMMER direkt mit "Du" an! (Niemals in der dritten Person reden).

**LEBENSLAUF DES KANDIDATEN:**
${req.cvText}

**STELLENAUSSCHREIBUNG:**
Unternehmen: ${req.company}
Position: ${req.jobTitle}
Level: ${req.level || 'nicht angegeben'}

Beschreibung:
${req.jobDescription}

Anforderungen (Original):
${req.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

ATS-Schlüsselwörter:
${req.atsKeywords.join(', ')}

***

**SCHRITT 1 — KONSOLIDIERUNG (PFLICHT):**
Fasse die Anforderungsliste auf 5–8 Kernkompetenzen zusammen.
Merge semantisch gleiche Anforderungen zu einer Zeile.
Jede Zeile = eine eigenständige Kompetenzdimension.

***

**SCHRITT 2 — ANALYSE (für jede konsolidierte Anforderung):**

Für jede Anforderung erstelle eine 3-Spalten-Zeile:

SPALTE 1 — Anforderung:
Die konsolidierte Anforderungsformulierung.

SPALTE 2 — CV Ist-Zustand (REALISTISCH, nicht wohlwollend):
- Benenne KONKRET was vorhanden ist (z.B. "Du hast als Co-Founder und Product Owner von...").
- Sprich den Kandidaten mit "Du" an!
- Benenne EHRLICH was fehlt oder nur peripher vorhanden ist.
- Kein Marketing. Kein Schönreden.

SPALTE 3 — Veränderungsvorschlag (ethisch korrekt):
- Nur auf Basis echter CV-Fakten.
- Sprich den Kandidaten mit "Du" an (z.B. "Gehe auf diese Erfahrungen ein und bringe 1-2 Beispiele...").
- Konkrete Formulierungsvorschläge für vorhandene, aber schwach beschriebene Erfahrungen.
- Bei Lücken: ehrlicher Hinweis + was man tun kann.
- KEINE Erfindungen.

STATUS-VERGABE (streng):
- "met": Direkte Erfahrung, nachweisbar, > 6 Monate oder klarer Erfolg
- "partial": Verwandt, kurz, oder nur tangential relevant
- "missing": Kein Beleg im CV

***

**SCHRITT 3 — SCORE:**
Berechne einen realistischen Gesamtscore (0–100).
Sei ehrlich: ein "partial" bei einer ZWINGEND erforderlichen Anforderung zieht den Score deutlich.
Für jede der 5 Unterkategorien (technicalSkills, softSkills, experienceLevel, domainKnowledge, languageMatch) generierst du den Score UND 2-3 konkrete, kurze Stichpunkte als Begründung, warum dieser Score vergeben wurde (direkt an den Nutzer gerichtet, z.B. "Du bringst 3 Jahre Erfahrung mit").

***

**SCHRITT 4 — ATS KEYWORDS:**
Reduziere die erkannten und fehlenden ATS-Keywords auf die absolut wichtigsten 5-6 Begriffe insgesamt.

***

**REGELN:**
- Sprache: DEUTSCH
- Immer im "Du" schreiben!
- Keine vagen Formulierungen wie "hat Erfahrung in..." -> "Du hast Erfahrung in..."
- Konkret: Was genau, wo, wie lange
- Positiver Bias ist verboten. Ehrlichkeit ist Respekt.
- Output: Strikt JSON, kein Markdown drumherum
- **WICHTIG: requirementRows MAXIMAL 6 Einträge** — fasse ähnliche Anforderungen zusammen!
- **WICHTIG: reasons-Arrays MAXIMAL 2 Einträge** — kurz und präzise!
- **WICHTIG: Gib NUR vollständiges, gültiges JSON aus. Kürze Texte wenn nötig, aber beende immer das JSON korrekt.**

**OUTPUT FORMAT:**
{
  "overallScore": <0-100>,
  "scoreBreakdown": {
    "technicalSkills": { "score": <0-100>, "reasons": ["<Grund 1>", "<Grund 2>"] },
    "softSkills": { "score": <0-100>, "reasons": ["<Grund 1>", "<Grund 2>"] },
    "experienceLevel": { "score": <0-100>, "reasons": ["<Grund 1>", "<Grund 2>"] },
    "domainKnowledge": { "score": <0-100>, "reasons": ["<Grund 1>", "<Grund 2>"] },
    "languageMatch": { "score": <0-100>, "reasons": ["<Grund 1>", "<Grund 2>"] }
  },
  "requirementRows": [
    {
      "requirement": "<konsolidierte Anforderung>",
      "status": "met|partial|missing",
      "currentState": "<konkreter Ist-Zustand — ehrlich, du-Form, mit Belegen>",
      "suggestion": "<ethisch korrekter Verbesserungsvorschlag, du-Form>"
    }
  ],
  "strengths": ["<Deine Stärke 1>", "<Deine Stärke 2>"],
  "gaps": ["<Deine Lücke 1>", "<Deine Lücke 2>"],
  "potentialHighlights": ["<Dein Potenzial 1>"],
  "overallRecommendation": "<1–2 ehrliche deutsche Sätze im Du>",
  "keywordsFound": ["keyword1", "keyword2"],
  "keywordsMissing": ["keyword3"]
}
`;

export async function runRealismCheck(
    firstResult: CVMatchResult,
    cvText: string
): Promise<CVMatchResult & { realismTokens: number, realismCost: number, realismLatency: number }> {

    const realismPrompt = `
Du bist ein strenger, aber fairer HR-Prüfer.
Dir wurde eine CV-Match-Analyse vorgelegt. Deine Aufgabe:
Prüfe, ob die Bewertungen REALISTISCH sind — nicht zu positiv, nicht zu negativ.

**ORIGINAL CV:**
${cvText}

**VORLIEGENDE ANALYSE:**
${JSON.stringify(firstResult.requirementRows, null, 2)}

**OVERALL SCORE:** ${firstResult.overallScore}

**DEINE PRÜF-AUFGABEN:**

1. STATUS-CHECK: Ist jeder Status (met/partial/missing) korrekt?
   Wende folgende strenge Kriterien an:
   - "met" nur wenn: direkte Erfahrung, nachweisbar im CV, > 6 Monate oder
     klarer Projekterfolg belegt
   - "partial" wenn: verwandt aber nicht direkt, oder kurze Berührungspunkte
   - "missing" wenn: kein Beleg im CV

2. IST-ZUSTAND-CHECK: Ist Spalte 2 konkret und ehrlich?
   - Enthält sie Projektnamen, Arbeitgeber, Zeiträume?
   - Sagt sie klar, was vorhanden UND was NICHT vorhanden ist?
   - Keine vagen Formulierungen wie "hat Erfahrung in..."?

3. SCORE-CHECK: Ist der Gesamtscore realistisch?
   Prüfe insbesondere auf "positive bias" — wird zu wohlwollend bewertet?

4. KONSOLIDIERUNGS-CHECK: Sind ähnliche Anforderungen zusammengefasst?
   Max. 8 Zeilen. Wenn mehr: merge semantisch gleiche Anforderungen.

**OUTPUT:** Korrigierte Version der Analyse im exakt gleichen JSON-Format.
Ändere nur was wirklich korrigiert werden muss.
Füge pro geänderter Zeile ein "corrected: true" Flag hinzu.
Setze "realismScore" auf 0-100 (wie realistisch war die erste Analyse?).

**SPRACHE:** Deutsch.
  `;

    const checkResult = await complete({
        taskType: 'cv_match',
        prompt: realismPrompt,
        temperature: 0.0,
        maxTokens: 3000,
    });

    const jsonMatch = checkResult.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return {
            ...firstResult,
            realismTokens: checkResult.tokensUsed || 0,
            realismCost: checkResult.costCents || 0,
            realismLatency: checkResult.latencyMs || 0
        };
    }

    try {
        const corrected = JSON.parse(jsonMatch[0]);
        const correctedCount = corrected.requirementRows?.filter(
            (r: any) => r.corrected
        ).length || 0;

        console.log(
            `✅ Realism Check complete. Corrected ${correctedCount} rows.`,
            `Realism Score: ${corrected.realismScore || 0}/100`
        );

        const finalResult = { ...firstResult };
        finalResult.requirementRows = corrected.requirementRows || firstResult.requirementRows;
        finalResult.realismScore = corrected.realismScore || 100;
        if (corrected.overallScore) finalResult.overallScore = corrected.overallScore;

        return {
            ...finalResult,
            realismTokens: checkResult.tokensUsed || 0,
            realismCost: checkResult.costCents || 0,
            realismLatency: checkResult.latencyMs || 0
        };
    } catch (e) {
        return {
            ...firstResult,
            realismTokens: checkResult.tokensUsed || 0,
            realismCost: checkResult.costCents || 0,
            realismLatency: checkResult.latencyMs || 0
        };
    }
}

export async function runCVMatchAnalysis(req: CVMatchRequest): Promise<CVMatchResult> {
    const startTime = Date.now();

    try {
        const result = await complete({
            taskType: 'cv_match',
            prompt: CV_MATCH_PROMPT(req),
            temperature: 0.1,
            maxTokens: 4096,
        });

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Claude returned no valid JSON');

        const firstResult: CVMatchResult = safeParseJson(jsonMatch[0]);

        // Stage 2: Prüf-Agent (Realism Check)
        const finalResult = await runRealismCheck(firstResult, req.cvText);

        const totalTokens = (result.tokensUsed || 0) + finalResult.realismTokens;
        const totalCost = (result.costCents || 0) + finalResult.realismCost;

        // Ensure issues object exists to hold realism score without schema change
        const issuesPayload = finalResult.realismScore ? { realism_score: finalResult.realismScore } : null;

        await supabaseAdmin.from('generation_logs').insert({
            user_id: req.userId,
            job_id: req.jobId,
            generation_type: 'cv_match',
            model_used: result.model,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: totalTokens,
            cost_usd: totalCost / 100,
            latency_ms: result.latencyMs + finalResult.realismLatency,
            success: true,
            issues: issuesPayload
        });

        console.log('✅ CV Match complete (with Realism Check). Score:', finalResult.overallScore);

        // Strip stats
        const { realismTokens, realismCost, realismLatency, ...cleanResult } = finalResult;
        return cleanResult;

    } catch (error: any) {
        await supabaseAdmin.from('generation_logs').insert({
            user_id: req.userId,
            job_id: req.jobId,
            generation_type: 'cv_match',
            success: false,
            error_message: error.message,
            latency_ms: Date.now() - startTime,
        });
        throw error;
    }
}
