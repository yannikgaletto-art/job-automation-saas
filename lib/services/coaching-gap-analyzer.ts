/**
 * Coaching Gap Analyzer
 * Feature-Silo: coaching
 * 
 * Analyzes the gap between a user's CV and job requirements.
 * Uses isolated Anthropic client — does NOT touch model-router.ts.
 * 
 * QA: Uses existing cv-text-retriever.ts for CV parsing.
 * Round-aware: generates different output schemas per interview round.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { getLanguageInstruction, type CoachingLocale } from '@/lib/prompts/coaching-prompt-i18n';
import type { CoachingDossier, KennenlernenDossier, DeepDiveDossier, CaseStudyDossier } from '@/types/coaching';
import type { InterviewRound } from '@/lib/prompts/coaching-system-prompt';

// Isolated Anthropic client — NOT from model-router (Forbidden File)
let coachingClient: Anthropic | null = null;

function getClient(): Anthropic {
    if (!coachingClient) {
        coachingClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY!,
        });
    }
    return coachingClient;
}

const COACHING_MODEL = 'claude-sonnet-4-6';

interface JobData {
    jobTitle: string;
    companyName: string;
    description: string;
    requirements: Record<string, unknown> | null;
}

// ─── Round-specific JSON schema instructions ────────────────────────────
function getSchemaInstruction(round: InterviewRound, companyName: string, jobTitle: string): string {
    switch (round) {
        case 'kennenlernen':
            return `Antworte als JSON mit exakt dieser Struktur:
{
  "strengths": ["Genau 3 relevante Stärken. Jede Stärke: 1 prägnanter Satz. Format: **Schlüsselwort:** Aussage."],
  "gaps": ["Genau 3 kritische Lücken. Jede Lücke: 1 prägnanter Satz. Format: **Schlüsselwort:** Aussage."],
  "interviewQuestions": ["5 Fragen — PFLICHT-FORMAT: 'Ich sehe, du warst bei [FIRMENNAME] als [ROLLE] – [konkrete Frage dazu].' JEDE Frage MUSS mit einer konkreten Station aus dem Lebenslauf anfangen!"],
  "companyContext": "1-2 Sätze über das Unternehmen und die Rolle"
}

KRITISCH — FRAGEN-FORMAT (NICHT optional!):
Jede der 5 Fragen MUSS:
1. Mit einem Bezug auf eine KONKRETE Station aus dem Lebenslauf starten (Firmenname, Projektname oder spezifische Aufgabe)
2. BEISPIEL-FORMAT: "Ich sehe, du warst Co-Founder bei [FIRMA] – was hat dich damals dazu bewogen, den Gründerweg zu gehen?"
3. VERSCHIEDENE Stationen verwenden — nicht immer dieselbe. Variiere frühere Rollen, Nebenprojekte, besondere Qualifikationen.
4. Immer die "du"-Form verwenden (NIEMALS "Sie").

ORIENTIERUNG FÜR FRAGEN (Phase 1: Erstes Kennenlernen):
Die Fragen sollen locker, menschlich und motivationsbezogen sein. KEIN technisches Tieftauchen!
Der Recruiter bezieht sich immer zuerst auf eine echte Station im Lebenslauf und leitet dann die Frage daraus ab.

Ton: Neugierig, wertschätzend, wie ein echtes Erstgespräch unter Menschen.
Themen: Werdegang, Motivation, Cultural Fit, Arbeitsweise, Teamdynamik, Erwartungen.

Beispiele als Orientierung (NICHT 1:1 kopieren, sondern Stil und Tiefe als Maßstab nehmen):
- "Nimm mich mal kurz mit durch deinen Lebenslauf: Welche Station hat dich fachlich und persönlich am meisten geprägt?"
- "Was reizt dich an genau dieser Rolle am meisten – und gibt es auch etwas, wo du sagst: Da muss ich mich erst noch richtig reinfuchsen?"
- "Wenn du an deine letzte Position denkst: Was hat dir richtig Energie gegeben, und was hat dir eher Energie geraubt?"
- "Was war der konkrete Auslöser dafür, dass du dich nach etwas Neuem umschaust?"
- "In was für einem Team-Setup brauchst du, um glücklich zu sein?"
- "Was erwartest du von deiner direkten Führungskraft, damit du einen richtig guten Job machen kannst?"
- "Wenn wir deine Kolleg:innen fragen würden, wofür sie dich am meisten schätzen – was würden sie sagen?"
- "Erzähl mir von einem Projekt, das so richtig gegen die Wand gefahren ist. Was hast du daraus gelernt?"
- "Wie gehst du vor, wenn du dich unter Zeitdruck in ein komplett neues Themengebiet einarbeiten musst?"

DIVERSITÄT DER FRAGEN:
- Wähle NICHT immer die aktuellste oder prominenteste CV-Station als Einstieg. Variiere gezielt:
  - Mal eine frühe Karriere-Station, mal ein Nebenprojekt, mal eine besondere Qualifikation.
  - Wenn der Kandidat z.B. ein eigenes Unternehmen gegründet hat, frag NICHT nur danach — auch andere Stationen sind spannend.
  - Stelle Fragen, die der Kandidat so noch NICHT erwartet hat.

WICHTIG:
- Passe die Fragen an den KONTEXT des Kandidaten an (z.B. Lehrer, Change Manager, Entwickler, Sales).
- BEZIEHE DICH immer auf konkrete CV-Stationen. Zeige echte Neugier an bisherigen Erfahrungen.
- Jede Frage soll sich anfühlen wie ein natürliches Gespräch, nicht wie ein Fragenkatalog.`;

        case 'deep_dive':
            return `Antworte als JSON mit exakt dieser Struktur:
{
  "strengths": ["Genau 3 relevante Stärken. Format: **Schlüsselwort:** Max 1 Satz."],
  "gaps": ["Genau 3 kritische fachliche/technische Lücken. Format: **Schlüsselwort:** Max 1 Satz."],
  "probingAreas": [
    {
      "mainQuestion": "Eine tiefgehende, fachspezifische Frage — siehe ORIENTIERUNG unten.",
      "followUps": [
        "Nachfrage 1: Bohrt tiefer in die Methodik oder Entscheidungslogik.",
        "Nachfrage 2: Fragt nach messbaren Ergebnissen oder alternativen Ansätzen."
      ]
    }
  ],
  "companyContext": "1-2 Sätze über das Unternehmen und die Rolle"
}
WICHTIG: Generiere genau 3 probingAreas, jede mit 1 mainQuestion und 2 followUps.

ORIENTIERUNG FÜR FRAGEN (Phase 2: Deep Dive / Zweitgespräch):
Das Deep Dive geht FACHLICH IN DIE TIEFE. Keine Motivationsfragen mehr! Hier wird der Kandidat methodisch geprüft.
Der Recruiter soll auf konkrete CV-Projekte und Erfahrungen referenzieren und daraus fachliche Szenarien ableiten.

Ton: Respektvoll-fordernd, wie ein erfahrener Fachkollege der wirklich verstehen will. 
Themen: Systematische Problemanalyse, Pragmatismus vs. Perfektionismus, Skalierbarkeit, Wissenstransfer, methodische Tiefe.

Beispiele als Orientierung (NICHT 1:1 kopieren):
- "Ein wichtiger Prozess rund um [Thema XY] gerät plötzlich massiv ins Stocken. Die offensichtlichen Erklärungen ergeben keinen Sinn. Wie gehst du systematisch zur wahren Fehlerquelle vor?"
- "Wann ist eine Quick-and-Dirty-Lösung für dich fachlich legitim — und wo ziehst du die rote Linie und sagst: Hier müssen wir von Grund auf neu aufsetzen?"
- "Du übernimmst ein historisch gewachsenes Konstrukt von einem Vorgänger. Kaum Übergabe, alles unübersichtlich. Wie bringst du Struktur rein, ohne im laufenden Betrieb Chaos auszulösen?"
- "Wenn du heute ein Konzept entwirfst, das für eine kleine Gruppe funktioniert, aber in einem Jahr für das Zehnfache greifen muss: Auf welche Flaschenhälse achtest du schon am ersten Tag?"
- "Wie filterst du pragmatisch heraus, was wirklich Mehrwert bringt und was reines Buzzword-Bingo ist?"
- "Gibt es eine methodische Lösung der letzten Jahre, auf die du aus Fach-Perspektive richtig stolz bist? Was macht sie unter der Haube so durchdacht?"

WICHTIG:
- Passe [Thema XY]-Platzhalter an den KONKRETEN fachlichen Kontext des Kandidaten an.
- BEZIEHE DICH auf konkrete Projekte und Erfahrungen aus dem Lebenslauf.
- Die Fragen müssen fachlich/methodisch tiefgehend sein — KEINE Cultural-Fit-Fragen hier.`;

        case 'case_study':
            return `Antworte als JSON mit exakt dieser Struktur:
{
  "strengths": ["Genau 3 relevante Stärken. Format: **Schlüsselwort:** Max 1 Satz."],
  "gaps": ["Genau 3 kritische Lücken. Format: **Schlüsselwort:** Max 1 Satz."],
  "caseScenario": "Ein detailliertes, realistisches Business-Szenario (6-8 Sätze) aus dem Arbeitsalltag bei ${companyName} für die Stelle ${jobTitle}. Siehe ORIENTIERUNG unten.",
  "hiddenData": [
    "Datenpunkt 1 den der Kandidat erst erfragen muss",
    "Datenpunkt 2 (z.B. ein internes Hindernis oder Marktinfo)",
    "Datenpunkt 3 (z.B. Budget, Timeline oder Teamgröße)"
  ],
  "expectedApproach": "3-4 Sätze wie ein idealer Kandidat das Szenario strukturiert angehen würde.",
  "companyContext": "1-2 Sätze über das Unternehmen und die Rolle"
}

ORIENTIERUNG FÜR DAS SZENARIO (Phase 3: Case Study):
Das Szenario muss ein konkretes, realistisches Problem aus dem Arbeitsalltag bei ${companyName} sein.
Es soll den Kandidaten unter Zeitdruck/Unsicherheit setzen und zu den identifizierten Gaps passen.

Ton: Dringend, realistisch, wie ein echtes Business-Problem das auf dem Tisch liegt.
Themen: Krisensituationen, Ressourcenkonflikte, strategische Entscheidungen, Stakeholder-Management.

Beispiele für Szenarien-TYPEN als Orientierung (NICHT 1:1 kopieren):
- Kundenabwanderung: Ein wichtiger Kunde droht wütend mit Kündigung wegen eines Problems. Die Lösung dauert mindestens eine Woche. Wie reagierst du heute?
- Budgetentscheidung: Du bekommst ein Sonderbudget um ein konkretes Problem zu lösen. Wie gehst du bei Evaluierung und Planung vor?
- Wettbewerbsdruck: Der Hauptwettbewerber hat überraschend exakt das Feature veröffentlicht, an dem ihr seit Monaten arbeitet.
- Projektübernahme: Du übernimmst ein Projekt, das über Budget und Zeitplan ist, das Team ist frustriert.
- Ressourcenausfall: Der wichtigste Experte für euer Prio-1-Projekt fällt für vier Wochen aus. Deadline ist in zwei Wochen.
- Stakeholder-Konflikt: Zwei wichtige Zuarbeiter weigern sich, miteinander zu kommunizieren. Das Projekt steht auf dem Spiel.
- Change-Widerstand: Du bemerkst, dass ein zentraler Prozess ineffizient ist. Das Team wehrt sich: "Das haben wir schon immer so gemacht."

WICHTIG:
- Das Szenario muss SPEZIFISCH für ${companyName} und die Rolle ${jobTitle} sein. Kein generisches Szenario!
- Passe es an den KONTEXT des Kandidaten an (z.B. ein Lehrer bekommt ein Schul-Szenario, ein PM ein Produktszenario).
- Es soll zu den GAPS des Kandidaten passen, sodass er gezielt gefordert wird.`;
    }
}

// ─── Round-specific fallback dossiers ────────────────────────────────────
function getFallbackDossier(round: InterviewRound, jobData: JobData): CoachingDossier {
    const base = {
        strengths: ['Berufserfahrung vorhanden'],
        gaps: ['Keine detaillierte Analyse möglich'],
        companyContext: `${jobData.companyName} sucht eine/n ${jobData.jobTitle}.`,
    };

    switch (round) {
        case 'kennenlernen':
            return {
                ...base,
                interviewQuestions: [
                    'Erzählen Sie uns von sich und Ihrem beruflichen Werdegang.',
                    'Was motiviert Sie, sich bei uns zu bewerben?',
                    'Welche relevante Erfahrung bringen Sie für diese Stelle mit?',
                    'Wie gehen Sie mit Herausforderungen im Arbeitsalltag um?',
                    'Wo sehen Sie sich in drei Jahren?',
                ],
            } as KennenlernenDossier;

        case 'deep_dive':
            return {
                ...base,
                probingAreas: [
                    {
                        mainQuestion: 'Beschreiben Sie ein Projekt, bei dem Sie eine komplexe Herausforderung lösen mussten.',
                        followUps: [
                            'Welchen Ansatz haben Sie gewählt und warum?',
                            'Was war das messbare Ergebnis?',
                        ],
                    },
                    {
                        mainQuestion: 'Wie haben Sie in Ihrer letzten Rolle fachliche Entscheidungen getroffen?',
                        followUps: [
                            'Welche Daten haben Sie herangezogen?',
                            'Was hätten Sie im Nachhinein anders gemacht?',
                        ],
                    },
                    {
                        mainQuestion: 'Erzählen Sie von einer Situation, in der Sie unter Zeitdruck liefern mussten.',
                        followUps: [
                            'Wie haben Sie priorisiert?',
                            'Was haben Sie aus dieser Erfahrung gelernt?',
                        ],
                    },
                ],
            } as DeepDiveDossier;

        case 'case_study':
            return {
                ...base,
                caseScenario: `Sie sind neu im Team bei ${jobData.companyName} als ${jobData.jobTitle}. In Ihrem ersten Monat stellen Sie fest, dass ein wichtiges Projekt hinter dem Zeitplan liegt und die Stakeholder unzufrieden sind. Ihr Vorgesetzter bittet Sie, die Situation zu analysieren und einen Vorschlag zur Lösung zu erarbeiten.`,
                hiddenData: [
                    'Das Projekt hat 3 Monate Verspätung',
                    'Zwei Schlüsselpersonen haben das Team verlassen',
                    'Das Budget wurde bereits zu 80% aufgebraucht',
                ],
                expectedApproach: 'Der Kandidat sollte zuerst die Ursachen analysieren (Ressourcen, Scope, Timeline), dann priorisieren und einen strukturierten Lösungsvorschlag präsentieren.',
            } as CaseStudyDossier;
    }
}

export async function analyzeGap(
    userId: string,
    jobData: JobData,
    interviewRound: InterviewRound = 'kennenlernen',
    locale: CoachingLocale = 'de'
): Promise<{ dossier: CoachingDossier; tokensUsed: number; costCents: number }> {
    // 1. Get CV text via existing service (QA: reuse, don't reinvent)
    const cvResult = await getCVText(userId, undefined, { forAI: true });
    if (!cvResult) {
        throw new Error('CV_NOT_FOUND: Kein Lebenslauf gefunden. Bitte lade deinen CV in den Settings hoch.');
    }

    const requirementsText = jobData.requirements
        ? JSON.stringify(jobData.requirements, null, 2)
        : 'Keine strukturierten Anforderungen verfügbar.';

    const schemaInstruction = getSchemaInstruction(interviewRound, jobData.companyName, jobData.jobTitle);

    // 2. Analyze gap via Claude Sonnet (isolated client)
    const client = getClient();
    const response = await client.messages.create({
        model: COACHING_MODEL,
        max_tokens: 1500,
        temperature: 0.3,
        system: `${getLanguageInstruction(locale)}

Du bist ein Recruiting-Analyst. Analysiere den Lebenslauf gegen die Stellenanforderungen.
BEZIEHE DICH IMMER auf konkrete Inhalte aus dem Lebenslauf des Kandidaten.
Fasse dich kurz: jede Stärke und jeder Gap ist maximal 1 prägnanter Satz.
Starte jeden Punkt mit einem **fettgedruckten Schlüsselwort** (Markdown **...**), gefolgt von einem Doppelpunkt.
Antworte ausschließlich als valides JSON (kein Markdown, keine Code-Blöcke).`,
        messages: [
            {
                role: 'user',
                content: `Analysiere den folgenden Lebenslauf gegen die Stellenanforderungen und erstelle ein Coaching-Dossier.

LEBENSLAUF:
${cvResult.text.substring(0, 4000)}

STELLE: ${jobData.jobTitle} bei ${jobData.companyName}

STELLENBESCHREIBUNG:
${jobData.description?.substring(0, 3000) || 'Nicht verfügbar'}

ANFORDERUNGEN:
${requirementsText.substring(0, 2000)}

${schemaInstruction}`,
            },
        ],
    });

    const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const costCents = Math.ceil((tokensUsed / 1_000_000) * 3.0 * 100); // Sonnet pricing

    // 3. Parse JSON response (robust extraction)
    let dossier: CoachingDossier;
    try {
        // Try multiple extraction strategies
        let jsonStr = text.trim();

        // Strategy 1: Strip markdown code blocks
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Strategy 2: If still not parseable, find the first { ... } block
        if (!jsonStr.startsWith('{')) {
            const match = jsonStr.match(/\{[\s\S]*\}/);
            if (match) {
                jsonStr = match[0];
            }
        }

        dossier = JSON.parse(jsonStr);
        console.log(`✅ [Coaching] JSON parsed successfully for round: ${interviewRound}`);
    } catch (parseError) {
        console.error('❌ [Coaching] Gap analysis JSON parse failed:', parseError);
        console.error('Raw response (first 500 chars):', text.substring(0, 500));
        // QA FIX: Round-aware fallback dossier
        dossier = getFallbackDossier(interviewRound, jobData);
    }

    // 4. Validate dossier structure (round-aware)
    if (!Array.isArray(dossier.strengths)) dossier.strengths = ['Erfahrung vorhanden'];
    if (!Array.isArray(dossier.gaps)) dossier.gaps = ['Keine Gaps identifiziert'];
    if (!dossier.companyContext) {
        dossier.companyContext = `${jobData.companyName} sucht eine/n ${jobData.jobTitle}.`;
    }

    // Limit strengths and gaps to 3 items for better UX
    dossier.strengths = dossier.strengths.slice(0, 3);
    dossier.gaps = dossier.gaps.slice(0, 3);

    // Round-specific validation
    if (interviewRound === 'kennenlernen') {
        const d = dossier as KennenlernenDossier;
        if (!Array.isArray(d.interviewQuestions) || d.interviewQuestions.length < 3) {
            dossier = getFallbackDossier('kennenlernen', jobData);
        }
    } else if (interviewRound === 'deep_dive') {
        const d = dossier as DeepDiveDossier;
        if (!Array.isArray(d.probingAreas) || d.probingAreas.length < 2) {
            dossier = getFallbackDossier('deep_dive', jobData);
        }
    } else if (interviewRound === 'case_study') {
        const d = dossier as CaseStudyDossier;
        if (!d.caseScenario || !Array.isArray(d.hiddenData)) {
            dossier = getFallbackDossier('case_study', jobData);
        }
    }

    console.log(`✅ [Coaching] Gap analysis complete (round: ${interviewRound}): ${dossier.strengths.length} strengths, ${dossier.gaps.length} gaps`);

    return { dossier, tokensUsed, costCents };
}
