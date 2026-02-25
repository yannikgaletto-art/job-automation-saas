import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { complete } from '@/lib/ai/model-router';
import { cvOptimizationProposalSchema, CvOptimizationProposal, CvStructuredData, CvChange } from '@/types/cv';
import crypto from 'crypto';

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
        const body = await req.json();
        const { cv_structured_data, cv_match_result, template_id, job_id, user_id } = body;

        if (!cv_structured_data || !cv_match_result || !job_id || !user_id) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

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

**EINGABEDATEN:**

1. CV SSoT (AKTUELLER LEBENSLAUF):
${JSON.stringify(cv_structured_data, null, 2)}

2. CV MATCH RESULTAT (ANALYSE & LÜCKEN):
${JSON.stringify(cv_match_result.requirementRows, null, 2)}

3. GEWÄHLTES TEMPLATE ID:
${template_id}

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

        const response = await complete({
            taskType: 'optimize_cv',
            prompt,
            temperature: 0,
            maxTokens: 16384,
        });

        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Claude returned no valid JSON block');
        }

        const rawJson = safeParseJson(jsonMatch[0]);

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

        // Schema validation to ensure everything is perfectly typed
        const validated = cvOptimizationProposalSchema.parse(proposalPayload);

        // Store the proposal in DB
        const supabase = await createClient();
        const { error: dbError } = await supabase
            .from('job_queue')
            .update({
                cv_optimization_proposal: validated,
                cv_optimization_user_decisions: null // reset if any
            })
            .eq('id', job_id)
            .eq('user_id', user_id);

        if (dbError) {
            console.error('Failed to save optimized CV to DB', dbError);
            throw dbError; // Bubble up
        }

        return NextResponse.json({
            success: true,
            proposal: validated as CvOptimizationProposal
        });

    } catch (error: any) {
        console.error('Error handling optimizer API:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}
