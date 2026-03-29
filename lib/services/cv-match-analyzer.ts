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
    /** Stufe 2: Deterministic pre-match from cv_structured_data.skills vs job.buzzwords */
    preMatchedKeywords?: {
        found: string[];
        missing: string[];
    };
}

// V2 Steckbrief card — one per consolidated requirement dimension
export type OrbitCategory = 'technical' | 'soft' | 'experience' | 'domain' | 'language';

export interface RequirementRow {
    title: string;                // Card header, e.g. "Technical Skills & CRM"
    orbitCategory: OrbitCategory;  // Maps to MatchOrbit satellite filter key
    level: ScoreLevel;            // 'strong' | 'solid' | 'gap'
    relevantChips: string[];      // Skills found in CV, e.g. ["Python (Basic)", "Make (No-code)"]
    context: string;              // Explanatory text — honest assessment
    gaps: string[];               // Missing skills/requirements, e.g. ["Missing CRM expertise (Salesforce)"]
    additionalChips: string[];    // Extra tools/keywords, e.g. ["Miro", "Collaboration Tools"]
    // V1 backward compat fields (populated by frontend normalizer for old cached data)
    requirement?: string;
    status?: 'met' | 'partial' | 'missing';
    currentState?: string;
    suggestion?: string;
    category?: string;
}

export type ScoreLevel = 'strong' | 'solid' | 'gap';

export interface ScoreCategory {
    level: ScoreLevel;
    reasons: string[];
}

export interface CVMatchResult {
    overallScore: number; // 0–100 (used for color signal only, not displayed as %)
    realismScore?: number;
    scoreBreakdown: {
        technicalSkills: ScoreCategory;
        softSkills: ScoreCategory;
        experienceLevel: ScoreCategory;
        domainKnowledge: ScoreCategory;
        languageMatch: ScoreCategory;
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
    const cvRef = req.locale === 'es' ? 'tu CV' : req.locale === 'en' ? 'your CV' : 'deinem Lebenslauf';
    return `
You are an experienced HR consultant and ATS expert with a high standard for realism.
You are known for being honest — neither too harsh nor too lenient.
CRITICAL RULE: Always address the user with "${addressForm}" (second person, never third person).
CRITICAL RULE: ALL output text fields MUST be written in ${lang}. This is non-negotiable.
CRITICAL RULE: Even though these instructions are in English, your ENTIRE output MUST be in ${lang}. Do NOT output any English text when ${lang} is not English.

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

⛔ **STRICT EVIDENCE RULE (MANDATORY — READ FIRST):**
You may ONLY analyze requirements that are EXPLICITLY stated in the job description or ATS keywords above.
NEVER invent, infer, or expand requirements beyond what is written.
Example violation: The JD says "Sales experience" → you write "Sales & CRM Tools Proficiency" and add CRM as a gap. This is FORBIDDEN because "CRM" is not in the JD.
If a skill is not mentioned in the JD, it does NOT exist as a requirement — period.

⛔ **DOCUMENT-CENTRIC FRAMING (MANDATORY):**
You are assessing a DOCUMENT (the CV), not a person. You do NOT know what the candidate can actually do — only what their CV says.
- ❌ FORBIDDEN: "${addressForm === 'Du' ? 'Du hast keine CRM-Erfahrung' : addressForm === 'you' ? 'You have no CRM experience' : 'No tiene experiencia en CRM'}"
- ✅ REQUIRED: "${addressForm === 'Du' ? 'In deinem Lebenslauf wird keine CRM-Erfahrung erwähnt' : addressForm === 'you' ? 'Your CV does not mention CRM experience' : 'Tu CV no menciona experiencia en CRM'}"
- ✅ REQUIRED: "${addressForm === 'Du' ? 'Dein CV zeigt Erfahrung mit...' : addressForm === 'you' ? 'Your CV shows experience with...' : 'Tu CV muestra experiencia con...'}"
- ✅ REQUIRED: "${addressForm === 'Du' ? 'Laut deinem Lebenslauf...' : addressForm === 'you' ? 'According to your CV...' : 'Según tu CV...'}"
Every gap statement MUST begin with a reference to the CV document, never with a judgment about the person.

***

**STEP 1 — CONSOLIDATION (MANDATORY):**
Consolidate the requirements list into 3–5 core competency dimensions.
Merge semantically identical requirements into one card.
Each card = one distinct competency dimension.
IMPORTANT: Each card title must ONLY use terms from the job description. Do NOT add terms that are not in the JD.

Each card MUST include an "orbitCategory" field — EXACTLY one of these 5 lowercase values:
- "technical" — for programming, tools, software, technical skills
- "soft" — for communication, teamwork, leadership, soft skills
- "experience" — for years of experience, seniority level, career stage
- "domain" — for industry/domain knowledge, business understanding
- "language" — for language skills, multilingual requirements

Distribute cards across categories. If some categories have no requirements, omit them.

***

**STEP 2 — CARD ANALYSIS (for each consolidated dimension):**

For each card, produce:

1. **title**: A short descriptive card header using ONLY terms from the job description.

2. **orbitCategory**: Exactly one of: "technical", "soft", "experience", "domain", "language"

3. **level**: Assessment based on CV evidence for this dimension:
   - "strong": Direct experience documented in CV, >6 months or clear project evidence
   - "solid": Related experience in CV, brief touchpoints, or only tangentially relevant  
   - "gap": No evidence found in the CV document

4. **relevantChips**: Array of 1–4 SHORT skill/experience labels found in ${cvRef}.
   Format: ["Python (Basic)", "Make (No-code)", "3 Jahre PM"]
   Only include items with actual CV evidence. Empty array if none found.

5. **context**: 1–2 sentences explaining the assessment. Address with "${addressForm}".
   MUST reference the CV document, not the person. Use "${addressForm === 'Du' ? 'In deinem Lebenslauf' : addressForm === 'you' ? 'In your CV' : 'En tu CV'}..." or "${addressForm === 'Du' ? 'Dein CV zeigt' : addressForm === 'you' ? 'Your CV shows' : 'Tu CV muestra'}...".

6. **gaps**: Array of 0–3 specific gap bullet points. Each describes what's MISSING from the CV vs. the job description.
   EVERY gap MUST start with a document reference: "${addressForm === 'Du' ? 'In deinem Lebenslauf wird nicht erwähnt' : addressForm === 'you' ? 'Your CV does not mention' : 'Tu CV no menciona'}..." or similar.
   ONLY list gaps for requirements that are EXPLICITLY in the job description. Never invent requirements.
   Empty array if no gaps for this dimension.

7. **additionalChips**: Array of 0–3 SHORT, actionable recommendations to improve the CV for this specific job.
   Format: ["${addressForm === 'Du' ? 'CRM-Erfahrung bei [Firma] ergänzen' : addressForm === 'you' ? 'Add CRM experience from [company]' : 'Agregar experiencia CRM de [empresa]'}", "${addressForm === 'Du' ? 'Leadership aus Co-Founder-Rolle betonen' : addressForm === 'you' ? 'Highlight leadership from co-founder role' : 'Destacar liderazgo de rol cofundador'}"]
   These are concrete suggestions for what the candidate should ADD or EMPHASIZE in their CV. Empty array if CV already covers this dimension well.

***

**STEP 3 — SCORE:**
Calculate a realistic overall score (0–100).
Be honest: a "gap" on a core requirement significantly lowers the score.
For each of the 5 sub-categories (technicalSkills, softSkills, experienceLevel, domainKnowledge, languageMatch), assign a LEVEL and provide 1-2 brief bullet points explaining why.
Address the user with "${addressForm}" in each reason. Always reference ${cvRef}.

***

**STEP 4 — ATS KEYWORDS:**
${req.preMatchedKeywords ? `
The following keywords have been PRE-MATCHED deterministically against the candidate's structured CV skill index.
Use these as GROUND TRUTH — do NOT override them:

CONFIRMED FOUND (verified in CV): ${req.preMatchedKeywords.found.length > 0 ? req.preMatchedKeywords.found.join(', ') : '(none)'}
CONFIRMED MISSING (not in CV): ${req.preMatchedKeywords.missing.length > 0 ? req.preMatchedKeywords.missing.join(', ') : '(none)'}

RULES:
- Every keyword in CONFIRMED FOUND MUST appear in keywordsFound.
- Every keyword in CONFIRMED MISSING MUST appear in keywordsMissing.
- Do NOT move keywords between the two lists.
- If additional ATS keywords exist that are NOT listed above, classify them based on your own analysis of the CV text.
` : `
Classify EVERY provided ATS keyword as either "found" or "missing".
Every keyword from the input list MUST appear in either keywordsFound or keywordsMissing.
- "found": The keyword, a direct synonym, or a clearly documented related activity appears in ${cvRef}.
- "missing": The keyword does NOT appear in ${cvRef} — not even implicitly.
STRICT: Do NOT infer. Using "make.com" does NOT mean "Sales Automation". "Project Management" does NOT mean "Enterprise Sales". Match literally or by direct synonym only.
`}
***

**RULES:**
- OUTPUT LANGUAGE: ${lang} — EVERY string value in your JSON output MUST be in ${lang}.
- Address form: always "${addressForm}"
- DOCUMENT-CENTRIC: Always reference the CV document, never judge the person directly.
- No vague formulations. Be specific: what exactly, where, how long.
- Positive bias is forbidden. Honesty is respect.
- Output: Strictly JSON, no surrounding markdown.
- **IMPORTANT: requirementRows MAXIMUM 5 entries** — merge aggressively!
- **IMPORTANT: reasons arrays MAXIMUM 2 entries** — short and precise!
- **IMPORTANT: relevantChips, gaps, additionalChips are ALWAYS arrays (use [] if empty).**
- **IMPORTANT: Output ONLY complete, valid JSON. Shorten texts if needed but always close the JSON correctly.**

***

**STEP 5 — SELF-CRITIQUE (mandatory before outputting):**
Before writing the final JSON, silently check:
1. Every "strong": backed by >6 months direct CV evidence? If not → downgrade to "solid".
2. Score vs. level distribution consistent? (2+ "gap" ⇒ score ≤ 60)
3. Every text field is in ${lang}?
4. Every orbitCategory is exactly one of: "technical", "soft", "experience", "domain", "language"?
5. relevantChips, gaps, additionalChips are all valid arrays (not null)?
6. HALLUCINATION CHECK: Does every card title and gap reference a requirement that is EXPLICITLY in the job description? If a term (e.g. "CRM", "Salesforce") is NOT in the JD → REMOVE it.
7. DOCUMENT CHECK: Does every gap/context sentence reference the CV document ("${addressForm === 'Du' ? 'In deinem Lebenslauf' : addressForm === 'you' ? 'In your CV' : 'En tu CV'}")? If it judges the person directly → REWRITE.
8. ATS STRICT CHECK: Is every "found" keyword actually present in the CV text (literally or by direct synonym)? If uncertain → mark as "missing".
Silently fix and output.

**OUTPUT FORMAT:**
{
  "_schemaVersion": 2,
  "overallScore": <0-100>,
  "scoreBreakdown": {
    "technicalSkills": { "level": "strong|solid|gap", "reasons": ["<reason 1>", "<reason 2>"] },
    "softSkills": { "level": "strong|solid|gap", "reasons": ["<reason 1>", "<reason 2>"] },
    "experienceLevel": { "level": "strong|solid|gap", "reasons": ["<reason 1>", "<reason 2>"] },
    "domainKnowledge": { "level": "strong|solid|gap", "reasons": ["<reason 1>", "<reason 2>"] },
    "languageMatch": { "level": "strong|solid|gap", "reasons": ["<reason 1>", "<reason 2>"] }
  },
  "requirementRows": [
    {
      "title": "<card header — terms from JD only>",
      "orbitCategory": "technical|soft|experience|domain|language",
      "level": "strong|solid|gap",
      "relevantChips": ["<skill from CV>", "<skill from CV>"],
      "context": "<1-2 sentences referencing the CV document, ${addressForm}-form>",
      "gaps": ["<gap referencing CV document>"],
      "additionalChips": ["<actionable CV improvement tip>"]
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "potentialHighlights": ["<potential 1>"],
  "overallRecommendation": "<1–2 honest sentences referencing ${cvRef}>",
  "keywordsFound": ["keyword1", "keyword2"],
  "keywordsMissing": ["keyword3"]
}
`;
};

export async function runCVMatchAnalysis(req: CVMatchRequest): Promise<CVMatchResult> {
    const startTime = Date.now();

    try {
        const result = await complete({
            taskType: 'cv_match',
            prompt: CV_MATCH_PROMPT(req),
            temperature: 0.1,
            maxTokens: 5000,
        });

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Claude returned no valid JSON');

        const firstResult: CVMatchResult = safeParseJson(jsonMatch[0]);

        // Single-pass: Self-Critique is integrated into the prompt (STEP 5).
        // No separate realism check call needed — significantly reduces latency.
        const finalResult = firstResult;



        const { error: logError } = await supabaseAdmin.from('generation_logs').insert({
            user_id: req.userId,
            job_id: req.jobId,
            model_name: result.model || 'claude-haiku',
            model_version: null,
            iteration: 1,
            prompt_tokens: result.tokensUsed || 0,
            completion_tokens: 0,
            realism_score: null, // single-pass: no separate realism score
            issues: null,
        });

        if (logError) {
            // Non-blocking — logging failure must never crash the analysis
            console.error('⚠️ [CV Match] generation_logs insert failed (non-blocking):', logError.message);
        }

        console.log('✅ CV Match complete (single-pass with Self-Critique). Score:', finalResult.overallScore);

        const { realismTokens, realismCost, realismLatency, ...cleanResult } = finalResult as any;
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
