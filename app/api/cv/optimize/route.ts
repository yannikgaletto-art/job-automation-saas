import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { complete } from '@/lib/ai/model-router';
import { cvOptimizationProposalSchema, CvOptimizationProposal, CvStructuredData, CvChange } from '@/types/cv';
import crypto from 'crypto';
import { createRateLimiter, checkRateLimit } from '@/lib/api/rate-limit';
import { logger } from '@/lib/logging';

// Rate limit: 3 CV optimize requests per minute per user
const cvOptimizeLimiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });

export const maxDuration = 60; // Vercel timeout protection — Claude Sonnet can take 20-40s

// Prompt version for tracking and rollback
const PROMPT_VERSION = 'v2.1';

// Admin client for bypassing RLS (used after Auth Guard verification)
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
    try {
        return JSON.parse(raw);
    } catch {
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

/**
 * Applies a set of diffs (CvChanges) to the original CV to generate the fully optimized CV.
 * This saves us from having to ask the LLM to output the full ~15k char CV again, dodging token limits.
 */
function applyCvChanges(cv: CvStructuredData, changes: CvChange[]): CvStructuredData {
    const optimized: CvStructuredData = JSON.parse(JSON.stringify(cv)); // deep clone

    for (const change of changes || []) {
        if (!change || (change.type !== 'modify' && change.type !== 'add')) continue;

        const target = change.target || {};
        const { section, entityId, field, bulletId } = target;
        if (!section) continue;

        // Ignore changes with no actionable 'after' text unless it's a remove operation (which we don't fully support yet but skip anyway)
        if (!change.after) continue;

        if (section === 'personalInfo') {
            if (field) (optimized.personalInfo as any)[field] = change.after;
            continue;
        }

        const sectionArray = (optimized as any)[section];
        if (!Array.isArray(sectionArray)) continue;

        const entity = sectionArray.find((e: any) => e.id === entityId);
        if (!entity) continue;

        // Bullets in Experience/Education
        if (field === 'description' && Array.isArray(entity.description)) {
            if (change.type === 'modify' && bulletId) {
                const bullet = entity.description.find((b: any) => b.id === bulletId);
                if (bullet) bullet.text = change.after;
            } else if (change.type === 'add') {
                entity.description.push({ id: crypto.randomUUID(), text: change.after });
            }
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

        // Rate limit check (3 req/min per user)
        const rateLimited = checkRateLimit(cvOptimizeLimiter, user.id, 'cv/optimize');
        if (rateLimited) return rateLimited;

        const log = logger.forRequest(undefined, user.id, '/api/cv/optimize');

        const body = await req.json();
        const { cv_structured_data, cv_match_result, template_id, job_id, station_metrics, cv_opt_settings } = body;

        if (!cv_structured_data || !cv_match_result || !job_id) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Guard: requirementRows must exist on the cv_match_result object
        const requirementRows = cv_match_result?.requirementRows ?? cv_match_result?.rows ?? cv_match_result;
        if (!requirementRows) {
            log.warn('cv/optimize called without requirementRows', { job_id, cv_match_result_keys: Object.keys(cv_match_result || {}) });
            return NextResponse.json({ error: 'CV Match result is missing requirementRows. Bitte führe zuerst den CV Match Schritt durch.' }, { status: 400 });
        }

        log.info('CV Optimize requested', { job_id });

        // §3: User-scoped — always use session user.id, never trust body
        const user_id = user.id;

        const summaryInstruction = cv_opt_settings?.summaryMode === 'compact'
            ? `\nSUMMARY-INSTRUKTION: Schreibe die Zusammenfassung in MAXIMAL 2 Sätzen.
Kein Fließtext. Format strikt: "[Rolle] mit [konkreter Erfahrung], fokussiert auf [Wert für Arbeitgeber]."
Keine Adjektive ohne Beleg. Kein "motiviert", "leidenschaftlich", "engagiert".\n`
            : '';

        // Build structured metrics context from station_metrics
        const metricsContext = station_metrics
            ?.filter((s: { metrics: string }) => s.metrics?.trim()?.length > 0)
            ?.map((s: { company: string; role: string; metrics: string }) =>
                `- Bei "${s.company}"${s.role ? ` (${s.role})` : ''}: ${s.metrics}`)
            ?.join('\n');

        const metricsBlock = metricsContext
            ? `\n4. NUTZER-METRIKEN (vom Nutzer bereitgestellt — nur einbauen, wenn sachlich passend zur jeweiligen Station):\n${metricsContext}\n`
            : '';

        const prompt = `
Du bist ein erstklassiger Karriere-Berater und CV-Optimierer.
Deine Aufgabe ist es, einen Lebenslauf-JSON (CV SSoT) und eine Analyse (CV Match Result) zu erhalten, und eine genaue Optimierungsliste sowie einen angepassten Voll-Lebenslauf zu generieren.

**REGELN ZUR OPTIMIERUNG:**
1. NO HALLUCINATIONS! Erfinde niemals Fakten oder Erfahrungen, die der Nutzer nicht hat. Wenn etwas wegen fehlender Fakten nicht passt, schlage als Änderung "TODO Frage an User: Hast du hier Erfahrung?" vor, statt etwas zu erfinden.
2. Formuliere Bullet Points so um, dass sie die Anforderungen aus dem CV Match Result gezielter ansprechen (falls belegbar!).
3. Du darfst die Reihenfolge der Arrays z.B. bei 'skills' ändern (wichtigste zuerst).
4. Verändere nicht grundlos bestehende IDs. Behalte bei vorhandenen Einträgen die \`id\` bei. Nutze \`id\` zum stabilen Referenzieren in deinem \`changes\` Array.
5. Du musst als Output eine exakte Diff-Liste (changes) mitliefern:
   - "target.section": wo (z.B. experience)
   - "target.entityId": id des eintrags
   - "target.field": z.B. 'description'
   - "target.bulletId": Wenn ein spezielles BulletPoint geändert/hinzugefügt/entfernt wird
   - "type": "add" | "modify" | "remove"
   - "before" / "after": MUSS EIN EINFACHER STRING SEIN. GIB NIEMALS EIN ARRAY ZURÜCK! (Bei Bulletpoints nur den reinen Text)
   - "reason": WARUM
   - "requirementRef.requirement": Aus welchem "requirement" des CV Match abgeleitet.
${summaryInstruction}

[LAYOUT CONSTRAINTS — MANDATORY — DO NOT EXCEED — PROMPT ${PROMPT_VERSION}]
- Max 3 bullet points per experience entry (quality over quantity — user can add more)
- Max 12 words per bullet point. Must fit on ONE printed line. Be surgical and precise.
- Summary: max 3 sentences
- If >5 experience entries: oldest entries get max 2 bullets
- If >3 education entries: only 2 most relevant get full description
- Target: full CV fits in 1.5–2 pages:
  → Page 1: Experience + Education
  → Page 2: Skills, Languages, Certifications
- LESS IS MORE. The user can always add more later.
[END LAYOUT CONSTRAINTS]

SUMMARY FORMATTING:
- In the summary text field, wrap the 3-5 most impactful phrases in **double asterisks** for bold rendering.
- Bold: quantified achievements ("**3+ Jahre**"), key competencies ("**Stakeholder-Management**"), and the target role/industry.
- Example: "**Innovation Manager** mit **3+ Jahren** Erfahrung in **strategischem Stakeholder-Management**."
- Do NOT bold entire sentences. Only 3-5 key phrases.

**EINGABEDATEN:**

1. CV SSoT (AKTUELLER LEBENSLAUF):
${JSON.stringify(cv_structured_data, null, 2)}

2. CV MATCH RESULTAT (ANALYSE & LÜCKEN):
${JSON.stringify(requirementRows, null, 2)}

3. GEWÄHLTES TEMPLATE ID:
${template_id}
${metricsBlock}

**CRITICAL OUTPUT RULES:**
- "before" and "after" fields MUST be plain strings, never arrays.
- If a change affects multiple bullet points, create ONE CvChange per bullet.
- Return ONLY valid JSON. No markdown. No code blocks. No comments.
- Every string field must be a string, not null, not an array.

**OUTPUT FORMAT (STRIKT JSON):**
Return ONLY JSON. No markdown framing (\`\`\`json), no comments.
Muss folgendem Zod Schema entsprechen:
{
  "changes": [
    {
      "id": "change-1",
      "target": { "section": "experience", "entityId": "exp-1", "field": "description", "bulletId": "bullet-1-1" },
      "type": "modify",
      "before": "Hat Software programmiert",
      "after": "Entwickelte Backend-Services (Python) für Zahlungsabwicklungen",
      "reason": "Die Anforderung verlangt Erfahrung in Python-Backends.",
      "requirementRef": { "requirement": "Python Backend-Services" }
    }
  ]
}
`;

        let response;
        try {
            response = await complete({
                taskType: 'optimize_cv',
                prompt,
                temperature: 0,
                maxTokens: 16384,
            });
        } catch (aiErr: any) {
            const aiMsg = aiErr?.message || String(aiErr);
            console.error('\u274c [CV Optimize] AI call failed:', aiMsg);
            return NextResponse.json({ error: 'AI-Fehler beim Optimieren. Bitte erneut versuchen.', details: aiMsg }, { status: 500 });
        }

        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('\u274c [CV Optimize] No JSON in AI response. Raw text length:', response.text.length);
            throw new Error('Claude returned no valid JSON block');
        }

        let rawJson: any;
        try {
            rawJson = safeParseJson(jsonMatch[0]);
        } catch (parseErr: any) {
            console.error('\u274c [CV Optimize] JSON parse failed:', parseErr?.message);
            throw parseErr;
        }

        // Validate just the changes array
        if (!Array.isArray(rawJson.changes)) {
            throw new Error('AI response missing changes array');
        }

        // Apply changes programmatically to create the optimized CV
        const optimizedCv = applyCvChanges(cv_structured_data, rawJson.changes);

        // Construct the final proposal object
        const proposalPayload = {
            optimized: optimizedCv,
            changes: rawJson.changes
        };

        // Schema validation — use safeParse to get a clean error instead of a thrown ZodError
        const parseResult = cvOptimizationProposalSchema.safeParse(proposalPayload);
        if (!parseResult.success) {
            const zodMsg = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
            console.error('[CV Optimize] Zod validation failed:', zodMsg);
            throw new Error(`AI output validation failed: ${zodMsg}`);
        }
        const validated = parseResult.data;

        // Store the proposal in DB (§3: user-scoped write)
        const { error: dbError } = await supabaseAdmin
            .from('job_queue')
            .update({
                cv_optimization_proposal: validated,
                cv_optimization_user_decisions: null // reset if any
            })
            .eq('id', job_id)
            .eq('user_id', user_id);

        if (dbError) {
            console.error('Failed to save optimized CV to DB', dbError);
            throw dbError;
        }

        // §2: Read-Back — verify the write was successful (Double-Assurance)
        const { data: readBack } = await supabaseAdmin
            .from('job_queue')
            .select('cv_optimization_proposal')
            .eq('id', job_id)
            .eq('user_id', user_id)
            .single();

        if (!readBack?.cv_optimization_proposal) {
            console.error('❌ [CV Optimize] Read-back verification FAILED — proposal not saved');
            return NextResponse.json({ error: 'Verification failed', success: false }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            proposal: validated as CvOptimizationProposal
        });

    } catch (error: any) {
        const errDetail = error?.errors ? JSON.stringify(error.errors) : (error?.message || String(error));
        console.error('❌ [CV Optimize] Error:', errDetail);
        return NextResponse.json(
            { error: 'Internal server error', details: errDetail },
            { status: 500 }
        );
    }
}
