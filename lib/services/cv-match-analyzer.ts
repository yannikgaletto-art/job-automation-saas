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

**STEP 0 — GAP CENSUS (MANDATORY — do this BEFORE any scoring):**
Count ONLY requirements explicitly stated in the job description above.

majorGaps: Count core requirements (marked as essential/required/must-have, or stated unconditionally without qualifier words) with ZERO evidence in ${cvRef} — not even partial.
minorGaps: Count secondary/qualified/nice-to-have requirements missing from ${cvRef}.

⚠️ QUALIFIER GATE (MANDATORY — read BEFORE counting):
A requirement introduced or modified by ANY of these words can NEVER be a majorGap — it is ALWAYS a minorGap at most:
DE: "idealerweise", "vorzugsweise", "bevorzugt", "wünschenswert", "von Vorteil", "gerne", "gerne gesehen", "optional", "plus", "keine Fremdwörter"
EN: "ideally", "preferably", "nice to have", "a plus", "desired", "bonus", "preferred"
This applies even if the qualified requirement appears first in the list or is repeated elsewhere in the description.

⚠️ EMPLOYER TRAINING SIGNAL: If the job's Benefits/Wir-bieten section OFFERS training or certification in a skill that is also listed as a requirement, that requirement is NEVER a majorGap. The employer expects to train candidates on this skill.

CALIBRATION (apply MECHANICALLY based on your count — NO exceptions):
  0 major, 0 minor  → overallScore: 85–100
  0 major, 1-2 minor → overallScore: 70–84
  0 major, 3+ minor  → overallScore: 65–74
  1 major, 0 minor   → overallScore: 55–69
  1 major, 1+ minor  → overallScore: 40–54
  2+ major           → overallScore: 25–39
  Fundamental mismatch (wrong field/level/domain entirely) → overallScore: 0–24

Output _gapCensus in the final JSON: { "majorGaps": X, "minorGaps": Y }
This field is for audit only — frontend does not display it.

***

**STEP 0.5 — JOB CATEGORY CLASSIFICATION (output as _jobCategory):**
Based exclusively on the job title and description above, classify into EXACTLY ONE of:

- TECH: Software Engineering, Data Science, IT, DevOps, Hardware, Semiconductors, AI Engineering
- SALES: Account Executive, Business Development, Go-to-Market, Revenue roles
- LEADERSHIP: Director, VP, Head of, C-Level, General Management, Team Lead (>5 reports)
- OPERATIONS: HR, Finance, Legal, Controlling, Compliance, Process Management, Change Management
- CREATIVE: Design, Marketing, Content, Media, Communications, Brand
- HEALTHCARE: Physicians, Nurses, Clinical roles, Medical devices, Pharmacists, Therapists
- EDUCATION: Teachers, Lecturers, Trainers, Educators, Didactics, Academic roles
- UNKNOWN: If the role spans multiple categories equally or is unclear

Output: _jobCategory in JSON. Use UNKNOWN if uncertain — never guess.

***

**STEP 0.6 — CATEGORY-AWARE SCORING (apply based on _jobCategory):**

Apply these emphasis weights when assessing level = "strong" vs "solid" vs "gap":

IF TECH:
  Primary (60%): Technical skills — programming, tools, system architecture.
                 Tier A evidence preferred: GitHub links, specific versions, quantified systems.
  Secondary (30%): Methodology — Agile, CI/CD, Cloud, Project Mgmt.
  Tertiary (10%): Formal education — heavily outweighed by practical proof.
  Red Flag: Outdated tech stack (>5 years) without re-skilling evidence.

IF SALES:
  Primary (50%): Track record — quota %, ARR, deal sizes, revenue numbers.
                 MISSING numerical metrics = high-signal gap.
  Secondary (30%): Methodology — MEDDPICC, Value Engineering, C-Level communication.
  Tertiary (20%): Domain knowledge — industry/product understanding.
  Red Flag: No quantified success metrics anywhere in CV.

IF LEADERSHIP:
  Primary (50%): Strategic impact — org scaling, P&L/budget responsibility (in €/$ amounts).
  Secondary (35%): Leadership metrics — team size (exact number), change mgmt, org-building.
  Tertiary (15%): Technical/operational expertise.
  Red Flag: Job-hopping <18 months without growth narrative; no budget figures.

IF OPERATIONS:
  Primary (50%): Domain knowledge + compliance — ISO, DSGVO, GAAP/IFRS, regulations named.
  Secondary (30%): Process optimization — measurable efficiency improvements, audit success.
  Tertiary (20%): Systems knowledge — ERP (SAP, Workday), Power Platform, automation tools.
  Red Flag: Vague regulatory language; no quantified efficiency gains.

IF CREATIVE:
  Primary (35%): Portfolio + work samples — portfolio links, published work, campaigns.
  Secondary (25%): Experience depth — relevant role history, brand/agency names.
  Tertiary (25%): Culture fit signals — values alignment, company stage match.
  Quaternary (15%): Education.
  Red Flag: No portfolio reference or published work anywhere in CV.

IF HEALTHCARE:
  Primary (50%): Formal licenses + credentials — Approbation, Facharzttitel, RN license.
                 If required license is MISSING from CV: flag as MAJOR GAP in _gapCensus.
                 (Note: This is a coaching flag, not a hard rejection — Pathly helps, not rejects.)
  Secondary (30%): Clinical track record — procedure types, specializations, patient contexts.
  Tertiary (20%): Quality of care evidence — CME training, EBM experience, measurable outcomes.
  Red Flag: No license named; expired credentials mentioned; no clinical specifics.

IF EDUCATION:
  Primary (45%): Subject matter competence — formal credentials (Staatsexamen, Master Lehramt),
                 depth in specific subjects taught.
  Secondary (35%): Pedagogical/didactic evidence — classroom management, inclusion experience,
                   differentiation methods, student outcomes (Abschlussquoten, Testergebnisse).
  Tertiary (20%): Engagement + EdTech — digital tools, mentoring, extracurricular contributions.
  Red Flag: Missing formal teaching qualification; no evidence of diverse student groups.

IF UNKNOWN: Apply balanced weights (25% each across skills/experience/soft/domain).

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
   ⚠️ FORMATTING: Wrap the 2-3 most important terms or phrases in **double asterisks** for emphasis.
   Example: "${addressForm === 'Du' ? 'Dein CV zeigt **direkte Erfahrung** in **Prozessoptimierung** bei KPMG.' : addressForm === 'you' ? 'Your CV shows **direct experience** in **process optimization** at KPMG.' : 'Tu CV muestra **experiencia directa** en **optimización de procesos** en KPMG.'}"
   This is MANDATORY — EVERY context string must have at least 2 bold-wrapped terms.

6. **gaps**: Array of 0–3 specific gap bullet points. Each describes what's MISSING from the CV vs. the job description.
   EVERY gap MUST start with a document reference: "${addressForm === 'Du' ? 'In deinem Lebenslauf wird nicht erwähnt' : addressForm === 'you' ? 'Your CV does not mention' : 'Tu CV no menciona'}..." or similar.
   ⚠️ FORMATTING: Wrap the key missing skill/term in **double asterisks**.
   Example: "${addressForm === 'Du' ? 'In deinem Lebenslauf wird keine Erfahrung mit **OKR-Methodik** erwähnt' : addressForm === 'you' ? 'Your CV does not mention experience with **OKR methodology**' : 'Tu CV no menciona experiencia con **metodología OKR**'}"
   ONLY list gaps for requirements that are EXPLICITLY in the job description. Never invent requirements.
   Empty array if no gaps for this dimension.

7. **additionalChips**: Array of 0–3 SHORT, actionable recommendations to improve the CV for this specific job.
   Format: ["${addressForm === 'Du' ? 'CRM-Erfahrung bei [Firma] ergänzen' : addressForm === 'you' ? 'Add CRM experience from [company]' : 'Agregar experiencia CRM de [empresa]'}", "${addressForm === 'Du' ? 'Leadership aus Co-Founder-Rolle betonen' : addressForm === 'you' ? 'Highlight leadership from co-founder role' : 'Destacar liderazgo de rol cofundador'}"]
   These are concrete suggestions for what the candidate should ADD or EMPHASIZE in their CV. Empty array if CV already covers this dimension well.

***

**STEP 3 — SCORE (Calibrated — follow Gap Census table from STEP 0 exactly):**

Your overallScore MUST be consistent with the _gapCensus you computed in STEP 0.
If you counted 2+ majorGaps, your score MUST be ≤ 39. No exceptions.

EVIDENCE QUALITY TIERS (apply for ALL level assessments in scoreBreakdown):

Tier A → "strong": CV contains ACTION VERB + QUANTIFIED RESULT for this skill.
  Good: "Orchestrated cloud migration, reducing server costs by 15%"
  Good: "Led team of 12 engineers across 2 years at KPMG"

Tier B → "solid": CV mentions skill in role context, but without quantified impact
  or only as a listed responsibility without concrete outcome.
  Example: "Verantwortlich für Cloud-Infrastruktur" (no measurable outcome)

Tier C → "gap": Skill not found in CV, or only mentioned in education/certifications
  without practical application evidence within the past 7 years.

RECENCY (hint only — never penalize harshly):
- Last 3 years: full weight.
- 3–7 years ago: relevant, may have evolved. Mention gently as growth opportunity.
- >7 years ago: lower weight — only cite if it's the SOLE evidence for a core requirement.
- No dates in CV for a skill: apply neutral weight — NEVER penalize for missing dates.

FRAMING RULE for older experience (MANDATORY):
- NEVER use: "veraltet", "outdated", "zu alt", "nicht mehr relevant"
- ALWAYS USE encouraging framing: "[Skill] aus [Rolle] bietet eine solide Basis. Aktuelle Praxisbeispiele würden diese Dimension noch stärker belegen."

For each of the 5 sub-categories (technicalSkills, softSkills, experienceLevel, domainKnowledge, languageMatch), assign a LEVEL and provide 1-2 brief bullet points.

SOFT SKILLS CALIBRATION (mandatory, anti-averaging):
- Count softSkills as "majorGap" ONLY if JD EXPLICITLY requires "Führungserfahrung", "Stakeholder-Management", "C-Level-Kommunikation", or equivalent.
- "strong": Named situation with documented leadership/exec-communication >6 months. e.g., "led 8-person team at KPMG for 2 years" — REQUIRES named company + duration.
- "solid": Generic phrases ("kommunikationsstark"), implied but undocumented, OR leadership without duration specified. TEDx/conference mentions = "solid" at best.
- "gap": JD requires it explicitly, CV shows nothing.
- DEFAULT when JD has NO explicit soft-skill requirement: "solid" (never "strong" by default).
- Do NOT assign "strong" just because the candidate seems generally professional.

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
- ⛔ CLOSED SET: Only classify the keywords listed above. NEVER add keywords from the CV text or job description that are not in this list.
` : `
Classify EVERY provided ATS keyword as either "found" or "missing".
Every keyword from the input list MUST appear in either keywordsFound or keywordsMissing.
- "found": The keyword, a direct synonym, or a clearly documented related activity appears in ${cvRef}.
- "missing": The keyword does NOT appear in ${cvRef} — not even implicitly.
STRICT: Do NOT infer. Using "make.com" does NOT mean "Sales Automation". "Project Management" does NOT mean "Enterprise Sales". Match literally or by direct synonym only.
⛔ CLOSED SET (MANDATORY): keywordsFound and keywordsMissing MUST together contain EXACTLY the same keywords as the ATS Keywords input list above — no more, no less. Adding ANY keyword that was not in the input list is a critical error.
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
- **BOLD FORMATTING: In context, gaps, strengths, potentialHighlights, AND overallRecommendation strings, wrap 2-3 key terms in **double asterisks** (e.g. \"**Prozessoptimierung**\"). This is MANDATORY for ALL text fields.**
- **COVERAGE RULE: For EVERY scoreBreakdown category where level ≠ "gap" (i.e. "strong" or "solid"), there MUST be at least 1 requirementRow with that orbitCategory. If the JD has ANY requirement in domain/experience/soft/technical, produce a card for it. Empty filtered satellite views are a UX failure.**
- **PUNCTUATION: NEVER use em dashes (—) or en dashes (–) in output text fields. Use semicolons (;) instead.**
- **STRENGTHS FORMAT: Each strength item MUST be max 6 words. Use keyword phrases, NOT full sentences. Example: "**CRM-Erfahrung** (Close.io, HubSpot)" — NOT "Erfahrung mit CRM-Systemen wie Close.io und HubSpot, die die Anforderungen vollständig erfüllen".**
- **POTENTIAL FORMAT: Each potentialHighlights item MUST be max 12 words. Start with the skill/asset, NOT with "Deine Rolle bei...". Example: "**Automatisierungserfahrung** (Make, N8N); Differenzierungsmerkmal für Kanzlei" — NOT "Deine Erfahrung mit Automatisierung könnte für eine moderne Kanzlei relevant sein".**

***

**STEP 5 — SELF-CRITIQUE (mandatory before outputting):**
Before writing the final JSON, silently check:
1. Every "strong": backed by >6 months direct CV evidence? If not → downgrade to "solid".
2. Score vs. Gap Census table consistent? 2+ major gaps → score MUST be ≤ 39. 1 major → ≤ 69.
3. softSkills "strong": Is there a named, documented leadership or executive-communication situation >6 months? If only implied or brief → downgrade to "solid".
4. Every text field is in ${lang}?
5. Every orbitCategory is exactly one of: "technical", "soft", "experience", "domain", "language"?
6. relevantChips, gaps, additionalChips are all valid arrays (not null)?
7. HALLUCINATION CHECK: Does every card title and gap reference a requirement EXPLICITLY in the JD? If not → REMOVE it.
8. DOCUMENT CHECK: Does every gap/context sentence reference the CV document? If it judges the person directly → REWRITE.
9. ATS STRICT CHECK: Is every "found" keyword actually in the CV text? If uncertain → mark as "missing".
   CLOSED-SET CHECK: Do keywordsFound + keywordsMissing contain ONLY keywords from the input ATS list? Any invented keyword that was NOT in the input → REMOVE it immediately.
Silently fix and output.

**OUTPUT FORMAT:**
{
  "_schemaVersion": 2,
  "_gapCensus": { "majorGaps": <number>, "minorGaps": <number> },
  "_jobCategory": "TECH|SALES|LEADERSHIP|OPERATIONS|CREATIVE|HEALTHCARE|EDUCATION|UNKNOWN",
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
            temperature: 0, // Gap Census is deterministic — 0.1 allows inconsistent gap counting
            maxTokens: 5000,
        });

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Claude returned no valid JSON');

        const firstResult: CVMatchResult = safeParseJson(jsonMatch[0]);

        // SICHERHEITSARCHITEKTUR §Golden Rule: keine falschen Responses.
        // ⚡ DETERMINISTIC SCORE OVERRIDE — Full Gap Census Enforcement
        //
        // The LLM score is DISCARDED. The final score is computed from the
        // _gapCensus the LLM counted. This eliminates all score variance
        // for identical inputs — the only variable is the gap count, which
        // Haiku counts reliably at temperature=0 when inputs are stable.
        //
        // Score bands (fixed midpoints for maximum label stability):
        //   0 major, 0 minor  → 92 (Starker Fit)
        //   0 major, 1-2 minor → 77 (Starker Fit)
        //   0 major, 3+ minor  → 72 (Starker Fit — minimal)
        //   1 major, 0 minor   → 62 (Teilweise Fit)
        //   1 major, 1+ minor  → 55 (Teilweise Fit)
        //   2+ major           → 32 (Wenig passend)
        //   Fundamental mismatch → 15 (Wenig passend)
        const gapCensus = (firstResult as any)._gapCensus;
        if (gapCensus && typeof gapCensus.majorGaps === 'number') {
            const major = gapCensus.majorGaps;
            const minor = gapCensus.minorGaps ?? 0;
            const llmRawScore = firstResult.overallScore;

            let deterministicScore: number;
            if (major === 0 && minor === 0) {
                deterministicScore = 92;
            } else if (major === 0 && minor <= 2) {
                deterministicScore = 77;
            } else if (major === 0 && minor >= 3) {
                deterministicScore = 72;
            } else if (major === 1 && minor === 0) {
                deterministicScore = 62;
            } else if (major === 1 && minor >= 1) {
                deterministicScore = 55;
            } else if (llmRawScore <= 24) {
                deterministicScore = 15;
            } else {
                deterministicScore = 32;
            }

            if (deterministicScore !== llmRawScore) {
                console.log(`📊 [CV Match] DETERMINISTIC OVERRIDE: LLM score ${llmRawScore} → ${deterministicScore} (majorGaps=${major}, minorGaps=${minor})`);
            }
            firstResult.overallScore = deterministicScore;
        } else {
            // No gap census → Safety fallback. "Teilweise Fit" is the safest default:
            // not misleadingly positive, not unfairly negative.
            console.warn(`⚠️ [CV Match] No _gapCensus in LLM output — forcing safety fallback score=50`);
            firstResult.overallScore = 50;
        }

        // Log for audit trail
        const jobCategory = (firstResult as any)._jobCategory ?? 'N/A';
        console.log(`📊 [CV Match] Category: ${jobCategory}, Score: ${firstResult.overallScore}, MajorGaps: ${gapCensus?.majorGaps ?? 'n/a'}, MinorGaps: ${gapCensus?.minorGaps ?? 'n/a'}`);

        // SICHERHEITSARCHITEKTUR §Golden Rule — Defense-in-Depth: ATS Closed-Set Enforcement
        // The prompt instructs the LLM not to invent keywords. This code layer GUARANTEES it.
        // Any keyword in the output that was not in the input atsKeywords list is silently removed.
        if (req.atsKeywords.length > 0) {
            const inputKeywordsLower = new Set(req.atsKeywords.map(k => k.trim().toLowerCase()));

            const originalFoundCount = firstResult.keywordsFound?.length ?? 0;
            const originalMissingCount = firstResult.keywordsMissing?.length ?? 0;

            firstResult.keywordsFound = (firstResult.keywordsFound || []).filter(
                k => inputKeywordsLower.has(k.trim().toLowerCase())
            );
            firstResult.keywordsMissing = (firstResult.keywordsMissing || []).filter(
                k => inputKeywordsLower.has(k.trim().toLowerCase())
            );

            const removedFound = originalFoundCount - firstResult.keywordsFound.length;
            const removedMissing = originalMissingCount - firstResult.keywordsMissing.length;

            if (removedFound > 0 || removedMissing > 0) {
                console.warn(`🛡️ [CV Match] Closed-set filter removed ${removedFound} invented found-keywords and ${removedMissing} invented missing-keywords (LLM hallucination corrected)`);
            }

            // Ensure every input keyword appears in exactly one of the two lists
            // (handles edge case where LLM drops a keyword entirely)
            const classifiedLower = new Set([
                ...firstResult.keywordsFound.map(k => k.trim().toLowerCase()),
                ...firstResult.keywordsMissing.map(k => k.trim().toLowerCase()),
            ]);
            const droppedKeywords = req.atsKeywords.filter(k => !classifiedLower.has(k.trim().toLowerCase()));
            if (droppedKeywords.length > 0) {
                // Conservatively add dropped keywords to missing (fail-safe: better to show as missing than disappear)
                firstResult.keywordsMissing.push(...droppedKeywords);
                console.warn(`🛡️ [CV Match] Closed-set fill: added ${droppedKeywords.length} dropped keyword(s) to missing: ${droppedKeywords.join(', ')}`);
            }
        }


        const { error: logError } = await supabaseAdmin.from('generation_logs').insert({
            user_id: req.userId,
            job_id: req.jobId,
            model_name: result.model || 'claude-haiku',
            model_version: null,
            iteration: 1,
            prompt_tokens: result.tokensUsed || 0,
            completion_tokens: 0,
            realism_score: null,
            // Audit: capture Gap Census and Job Category for quality monitoring
            issues: gapCensus ? { jobCategory, majorGaps: gapCensus.majorGaps, minorGaps: gapCensus.minorGaps ?? 0 } : null,
        });

        if (logError) {
            // Non-blocking — logging failure must never crash the analysis
            console.error('⚠️ [CV Match] generation_logs insert failed (non-blocking):', logError.message);
        }

        console.log('✅ CV Match complete (single-pass with Self-Critique). Score:', firstResult.overallScore);

        // Strip legacy realism fields (dead code from old 2-pass approach — never set by Claude)
        // _gapCensus and _jobCategory are intentionally retained for DB storage / audit trail
        const { realismTokens, realismCost, realismLatency, ...cleanResult } = firstResult as any;
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
