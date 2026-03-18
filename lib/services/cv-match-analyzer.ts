import { complete } from '@/lib/ai/model-router';
import { getLanguageName, type SupportedLocale } from '@/lib/i18n/get-user-locale';
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
    locale?: SupportedLocale;
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

const CV_MATCH_PROMPT = (req: CVMatchRequest) => {
    const lang = getLanguageName(req.locale || 'de');
    const addressForm = req.locale === 'es' ? 'usted' : req.locale === 'en' ? 'you' : 'Du';
    return `
You are an experienced HR consultant and ATS expert with a high standard for realism.
You are known for being honest — neither too harsh nor too lenient.
CRITICAL RULE: Always address the user with "${addressForm}" (second person, never third person).
CRITICAL RULE: ALL output text fields (currentState, suggestion, strengths, gaps, etc.) MUST be written in ${lang}. This is non-negotiable.

**CANDIDATE CV:**
${req.cvText}

**JOB POSTING:**
Company: ${req.company}
Position: ${req.jobTitle}
Level: ${req.level || 'not specified'}

Description:
${req.jobDescription}

Requirements (Original):
${req.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

ATS Keywords:
${req.atsKeywords.join(', ')}

***

**STEP 1 — CONSOLIDATION (MANDATORY):**
Consolidate the requirements list to 5–8 core competencies.
Merge semantically identical requirements into one row.
Each row = one distinct competency dimension.

***

**STEP 2 — ANALYSIS (for each consolidated requirement):**

For each requirement, create a 3-column row:

COLUMN 1 — Requirement:
The consolidated requirement formulation.

COLUMN 2 — Current CV State (REALISTIC, not flattering):
- Name CONCRETELY what is present (e.g., "${addressForm} worked as Co-Founder and Product Owner at...").
- Address the candidate with "${addressForm}"!
- Name HONESTLY what is missing or only peripherally present.
- No marketing. No sugarcoating.

COLUMN 3 — Improvement Suggestion (ethically sound):
- Based only on real CV facts.
- Address the candidate with "${addressForm}" (e.g., "Highlight these experiences and provide 1-2 examples...").
- Concrete reformulation suggestions for experiences that are present but weakly described.
- For gaps: honest note + what can be done.
- NO inventions.

STATUS ASSIGNMENT (strict):
- "met": Direct experience, verifiable, >6 months or clear demonstrated success
- "partial": Related, brief, or only tangentially relevant
- "missing": No evidence in CV

***

**STEP 3 — SCORE:**
Calculate a realistic overall score (0–100).
Be honest: a "partial" on a MANDATORY requirement significantly lowers the score.
For each of the 5 sub-categories (technicalSkills, softSkills, experienceLevel, domainKnowledge, languageMatch), generate the score AND 2-3 concrete, brief bullet points explaining why that score was given (directed at the user with "${addressForm}", e.g., "${addressForm === 'Du' ? 'Du bringst' : addressForm === 'you' ? 'You bring' : 'Usted aporta'} 3 years of experience in...").

***

**STEP 4 — ATS KEYWORDS:**
Reduce recognized and missing ATS keywords to the most important 5-6 terms total.

***

**RULES:**
- OUTPUT LANGUAGE: ${lang} — Write ALL output text in ${lang}. This is the highest priority rule.
- Address form: always "${addressForm}"
- No vague formulations
- Be specific: what exactly, where, how long
- Positive bias is forbidden. Honesty is respect.
- Output: Strictly JSON, no surrounding markdown
- **IMPORTANT: requirementRows MAXIMUM 6 entries** — merge similar requirements!
- **IMPORTANT: reasons arrays MAXIMUM 2 entries** — short and precise!
- **IMPORTANT: Output ONLY complete, valid JSON. Shorten texts if needed but always close the JSON correctly.**

**OUTPUT FORMAT:**
{
  "overallScore": <0-100>,
  "scoreBreakdown": {
    "technicalSkills": { "score": <0-100>, "reasons": ["<reason 1>", "<reason 2>"] },
    "softSkills": { "score": <0-100>, "reasons": ["<reason 1>", "<reason 2>"] },
    "experienceLevel": { "score": <0-100>, "reasons": ["<reason 1>", "<reason 2>"] },
    "domainKnowledge": { "score": <0-100>, "reasons": ["<reason 1>", "<reason 2>"] },
    "languageMatch": { "score": <0-100>, "reasons": ["<reason 1>", "<reason 2>"] }
  },
  "requirementRows": [
    {
      "requirement": "<consolidated requirement>",
      "status": "met|partial|missing",
      "currentState": "<concrete current state — honest, ${addressForm}-form, with evidence>",
      "suggestion": "<ethically sound improvement suggestion, ${addressForm}-form>"
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "potentialHighlights": ["<potential 1>"],
  "overallRecommendation": "<1–2 honest sentences>",
  "keywordsFound": ["keyword1", "keyword2"],
  "keywordsMissing": ["keyword3"]
}
`;
};




export async function runRealismCheck(
    firstResult: CVMatchResult,
    cvText: string,
    locale: SupportedLocale = 'de'
): Promise<CVMatchResult & { realismTokens: number, realismCost: number, realismLatency: number }> {

    const lang = getLanguageName(locale);
    const realismPrompt = `
You are a strict but fair HR evaluator.
You have been presented with a CV Match Analysis. Your task:
Check whether the evaluations are REALISTIC — not too positive, not too negative.

**ORIGINAL CV:**
${cvText}

**CURRENT ANALYSIS:**
${JSON.stringify(firstResult.requirementRows, null, 2)}

**OVERALL SCORE:** ${firstResult.overallScore}

**YOUR REVIEW TASKS:**

1. STATUS CHECK: Is each status (met/partial/missing) correct?
   Apply these strict criteria:
   - "met" ONLY when: direct experience, verifiable in CV, >6 months or clear project success documented
   - "partial" when: related but not direct, or only brief touchpoints
   - "missing" when: no evidence in CV

2. CURRENT STATE CHECK: Is column 2 concrete and honest?
   - Does it contain project names, employers, time periods?
   - Does it clearly state what IS present AND what is NOT?
   - No vague formulations like "has experience in..."?

3. SCORE CHECK: Is the overall score realistic?
   Check especially for "positive bias" — is it rated too favorably?

4. CONSOLIDATION CHECK: Are similar requirements merged?
   Max. 8 rows. If more: merge semantically identical requirements.

**OUTPUT:** Corrected version of the analysis in exactly the same JSON format.
Only change what genuinely needs correction.
Add a "corrected: true" flag to each changed row.
Set "realismScore" to 0-100 (how realistic was the first analysis?).

**OUTPUT LANGUAGE:** ${lang}. Write ALL text fields in ${lang}.
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
        const finalResult = await runRealismCheck(firstResult, req.cvText, req.locale || 'de');

        const totalTokens = (result.tokensUsed || 0) + finalResult.realismTokens;
        const totalCost = (result.costCents || 0) + finalResult.realismCost;

        // §BUG-FIX #4: Align column names with actual generation_logs schema.
        // Previously used non-existent columns (model_used, total_tokens, cost_usd, etc.)
        // causing silent insert failures and zero audit-trail entries.
        const issuesPayload = finalResult.realismScore ? { realism_score: finalResult.realismScore } : null;

        const { error: logError } = await supabaseAdmin.from('generation_logs').insert({
            user_id: req.userId,
            job_id: req.jobId,
            model_name: result.model || 'claude-haiku',
            model_version: null,
            iteration: 1,                                          // CV match = single pass
            prompt_tokens: result.tokensUsed || 0,
            completion_tokens: 0,                                  // model-router returns total only
            realism_score: finalResult.realismScore ?? null,
            issues: issuesPayload,                                  // { realism_score } for audit
        });

        if (logError) {
            // Non-blocking — logging failure must never crash the analysis
            console.error('⚠️ [CV Match] generation_logs insert failed (non-blocking):', logError.message);
        }

        console.log('✅ CV Match complete (with Realism Check). Score:', finalResult.overallScore);

        // Strip stats
        const { realismTokens, realismCost, realismLatency, ...cleanResult } = finalResult;
        return cleanResult;

    } catch (error: any) {
        // §BUG-FIX #4: Use correct schema columns for error log too
        const { error: logErr } = await supabaseAdmin.from('generation_logs').insert({
            user_id: req.userId,
            job_id: req.jobId,
            model_name: 'claude-haiku',
            model_version: null,
            iteration: 1,
            prompt_tokens: 0,
            completion_tokens: 0,
            issues: { error: error.message, latency_ms: Date.now() - startTime },
        });
        if (logErr) {
            console.error('⚠️ [CV Match] generation_logs error-log insert failed (non-blocking):', logErr.message);
        }
        throw error;
    }
}
