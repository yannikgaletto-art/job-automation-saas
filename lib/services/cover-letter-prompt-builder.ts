/**
 * Cover Letter Prompt Builder — Pure Function
 *
 * Extracted from cover-letter-generator.ts for maintainability.
 * No DB dependencies, no Supabase imports — input in, prompt string out.
 */

import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';
import { buildBlacklistPromptSection } from './anti-fluff-blacklist';
import { DEFAULT_OPT_IN_MODULES } from '@/types/cover-letter-setup';
import type { HiringPersona } from './hiring-manager-resolver';

// ─── Supporting Types (duplicated from generator for decoupling) ──────────────
interface UserProfileData {
    cv_structured_data?: Record<string, unknown>;
    [key: string]: unknown;
}

interface JobData {
    job_title?: string;
    company_name?: string;
    company_slug?: string;
    requirements?: string[];
    metadata?: Record<string, unknown>;
    cv_optimization_user_decisions?: {
        appliedChanges?: Array<{
            target: { section: string };
            before: string;
            after: string;
        }>;
    };
    company_research?: Array<{
        intel_data?: CompanyResearchData;
        suggested_quotes?: Array<{ text?: string; author?: string; match_score?: number }>;
    }>;
    [key: string]: unknown;
}

interface CompanyResearchData {
    company_values?: string[];
    tech_stack?: string[];
    [key: string]: unknown;
}

// ─── Exported Types (re-export for generator) ─────────────────────────────────
export type { UserProfileData, JobData, CompanyResearchData };

// ─── Main Builder ─────────────────────────────────────────────────────────────
export function buildSystemPrompt(
    profile: UserProfileData,
    job: JobData,
    company: CompanyResearchData,
    style: StyleAnalysis | null,
    ctx: CoverLetterSetupContext | undefined,
    feedback: string[],
    lastWordCount: number
): string {
    const lang = ctx?.tone.targetLanguage === 'en' ? 'English' : 'Deutsch';
    const companyName = job?.company_name || ctx?.companyName || 'das Unternehmen';
    const jobTitle = job?.job_title || 'die ausgeschriebene Stelle';

    // ─── B1.6: Ansprechperson-Binding (Cascading Fallback) ────────────────────
    const isDuForm = ctx?.tone.formality === 'du';
    let contactPersonGreeting: string;
    if (ctx?.tone.contactPerson) {
        const name = ctx.tone.contactPerson.trim();
        if (lang === 'English') {
            contactPersonGreeting = `"Dear ${name},"`;
        } else if (isDuForm) {
            contactPersonGreeting = `"Hallo ${name},"`;
        } else {
            contactPersonGreeting = `"Liebe/r ${name}," (nutze die wahrscheinlich korrekte Anrede, z.B. "Lieber Max," oder "Liebe Anna,")`;
        }
    } else if (style?.greeting && style.greeting !== 'Sehr geehrte Damen und Herren') {
        contactPersonGreeting = `"${style.greeting}"`;
    } else {
        contactPersonGreeting = lang === 'English'
            ? `"Dear Hiring Team,"`
            : isDuForm
                ? `"Hallo zusammen," oder "Hi [Team-Name],"`
                : `"Sehr geehrte Damen und Herren,"`;
    }

    // ─── CV Input (Zero-Leak Guard) ────────────────────────────────────────────
    // Wenn der User im Wizard Stationen gewählt hat, darf der rohe CV NICHT
    // in den Prompt — die KI soll NUR die gewählten Stationen sehen.
    const hasWizardStations = (ctx?.cvStations?.length ?? 0) > 0;

    const cvInput = hasWizardStations
        ? '' // Zero-Leak: CV wird komplett unterdrückt — stationsSection ist die einzige Quelle
        : job?.cv_optimization_user_decisions?.appliedChanges
            ? `OPTIMIERTE CV-ÄNDERUNGEN FÜR DIESEN JOB (MÜSSEN EINFLIESSEN):
${JSON.stringify(
                job.cv_optimization_user_decisions.appliedChanges.map(c => ({
                    section: c.target.section,
                    vorher: c.before,
                    nachher: c.after
                })), null, 2)}

ORIGINAL CV:
${JSON.stringify(profile?.cv_structured_data || {}, null, 2)}`
            : `KANDIDATEN-LEBENSLAUF:
${JSON.stringify(profile?.cv_structured_data || {}, null, 2)}`;

    // ─── Early declarations needed by toneInstructions template literals ────────
    const hasQuote = !!ctx?.selectedQuote;

    // ─── Tone Instructions (B1.5: Jeder Stil verändert GESAMTE Prompt-Struktur) ─
    const toneInstructions: Record<string, string> = {
        'data-driven': `STIL: DATENGETRIEBEN & PRÄZISE
ÖFFNUNG: Starte mit einem konkreten, quantifizierbaren Fakt über das Unternehmen ODER einem eigenen messbaren Ergebnis. Kein allgemeines Statement.
ABSATZ-STRUKTUR: Jeder Hauptabsatz folgt dem Schema: Claim → Beweis (Zahl/KPI/Ergebnis) → Implikation für den neuen Arbeitgeber.
BEWEISFÜHRUNG:
- Nutze konkrete Zahlen, Prozentsätze und messbare Resultate in JEDEM Absatz
- Struktur pro Achievement: "Ich habe [X] durch [Y] erreicht, was [Z] bewirkte"
- Aktive Verben: implementiert, gesteigert, reduziert, aufgebaut, verantwortet, optimiert
- Keine vagen Formulierungen wie "sehr erfolgreich" — immer quantifizieren
- Mindestens 3 konkrete Zahlen im gesamten Anschreiben
SCHLUSS-REGEL: Wird von Sektion 5 gesteuert — hier KEINE Schluss-Anweisungen.
VERBOTEN: Adjektive ohne Beleg, Superlative ohne Beweis, "leidenschaftlich", "motiviert", "engagiert" ohne konkretes Beispiel.`,

        'storytelling': `STIL: NARRATIV & PERSÖNLICH
ÖFFNUNG: Beginne mit einer kurzen persönlichen Situation oder einem Schlüsselmoment deiner Karriere (max. 2 Sätze). Kein "Es war einmal", sondern ein konkreter Moment: "Als ich bei [Firma] zum ersten Mal [Situation erlebte], wusste ich..."
ABSATZ-STRUKTUR: Jede CV-Station wird als Mini-Geschichte erzählt:
- Situation (1 Satz): Was war der Kontext/die Herausforderung?
- Handlung (1 Satz): Was hast du konkret getan?
- Ergebnis (1 Satz): Was kam dabei heraus — und was hat es dir beigebracht?
DRAMATURGIE:
- Verbinde die Stationen zu einem kohärenten Karriere-Narrativ: Jede Station baut auf der vorherigen auf
- Das "Warum" ist wichtiger als das "Was" — zeige Motivation und Entwicklung
- Erlaube 1-2 persönliche Aussagen zur Motivation (aber kein Pathos)
- Nutze Zeitwörter: "Zunächst", "Später erkannte ich", "Heute weiß ich"
- Die rote Linie: Alle Absätze führen logisch zur Bewerbung bei DIESER Firma
SCHLUSS-REGEL: Wird von Sektion 5 gesteuert — hier KEINE Schluss-Anweisungen.
VERBOTEN: Aufzählungen, Bullet-Points-Stil, trockene Fakten ohne Kontext, "Mein Werdegang zeigt..."`,

        'formal': `STIL: KLASSISCH-FORMELL
ÖFFNUNG: Direkte, höfliche Bezugnahme auf die Stelle. Keine Überraschungen, kein Storytelling. Sachlich und präzise. (z.B. "Die ausgeschriebene Position als [Titel] bei [Firma] verbindet [Kompetenzfeld A] mit [Kompetenzfeld B] — eine Schnittstelle, die meine bisherige Laufbahn durchzieht.")
ABSATZ-STRUKTUR: Konservative 4-Absatz-Struktur:
1. Einstieg + Motivation (2-3 Sätze)
2. Fachliche Qualifikation mit Belegen (3-4 Sätze)
3. Unternehmens-Passung + kulturelle Verbindung (2-3 Sätze)
4. Souveräner Abschluss (1-2 Sätze)
TONALITÄT:
- Vollständige Formulierungen, keine Kontraktionen
- Passiv vermeiden, aber formelle Anrede konsequent beibehalten (Sie, Ihnen, Ihr)
- Keine Ausrufezeichen, keine rhetorischen Fragen
- Konjunktiv I für höfliche Formulierungen erlaubt
- Seriöse Übergänge: "Darüber hinaus", "In gleicher Weise", "Vor diesem Hintergrund"
SCHLUSS-REGEL: Wird von Sektion 5 gesteuert — hier KEINE Schluss-Anweisungen.
VERBOTEN: Umgangssprache, Emojis, Interjektionen, "Ich brenne für", persönliche Anekdoten.`,

        // WHY: Philosophisch-Preset darf KEINE eigene Zitat-Formatierung vorgeben,
        // wenn der Wizard bereits ein quoteIntroBlock in Sektion 3 injiziert.
        // CONFLICTS RESOLVED: Red Flag #3 — zwei konkurrierende Zitat-Format-Anweisungen.
        'philosophisch': `STIL: INTELLEKTUELL & KONZEPTIONELL
${hasQuote ? 'ÖFFNUNG: Das Zitat und seine Formatierung werden durch Sektion 3 (Aufhänger) gesteuert. Deine Aufgabe hier: Schreibe nach dem Zitat einen konzeptionellen Begründungssatz, der die Brücke zwischen der Aussage des Zitats und deiner beruflichen Erfahrung schlägt.' : 'ÖFFNUNG: Starte mit einer relevanten Beobachtung oder einem Konzept, das die Brücke zwischen deiner Weltsicht und dem Unternehmen schlägt. (z.B. eine Beobachtung über einen Branchentrend, den das Unternehmen aktiv adressiert.)'}
ABSATZ-STRUKTUR: Konzept → Beweis → Reflexion
- Jeder Absatz beginnt mit einer These oder Beobachtung
- Dann folgt der konkrete Beweis aus der eigenen Karriere
- Abschluss: Kurze Reflexion, was das für die Zielposition bedeutet
INTELLEKTUELLER RAHMEN:
- Zeige Denktiefe: "Wie" und "Warum" statt nur "Was"
- Erlaube 1 Zitat (vom User gewählt oder aus dem Kontext passend)
- Verbinde branchenspezifische Trends mit persönlicher Erfahrung
- Nutze Analogien und Querverweise: "Wie in der [Disziplin/Branche], zeigt sich auch hier..."
- Die konzeptionelle Ebene zeigt Senioritität und strategisches Denken
SCHLUSS-REGEL: Wird von Sektion 5 gesteuert — hier KEINE Schluss-Anweisungen.
VERBOTEN: Oberflächliche Name-Dropping von Philosophen ohne Bezug, Arroganz, akademischer Jargon, mehr als 1 Zitat.`,
    };
    const activeTone = toneInstructions[ctx?.tone.preset ?? 'formal'];

    // ─── Style Sample (Anti-Competition: Preset hat Vorrang über Style-Sample) ──
    const hasPreset = !!ctx?.tone?.preset;
    const styleSection = style
        ? hasPreset
            // Anti-Competition: Preset hat Vorrang → Style-Sample nur für Rhythmus
            ? `SCHREIBRHYTHMUS (aus bisherigen Anschreiben des Users — NUR für Satzbau, NICHT für Tonalität):
Satzlänge: ${style.sentence_length || 'medium'}
Bevorzugte Konjunktionen: ${(style.conjunctions || []).join(', ') || 'Daher, Deshalb, Zudem'}
${(style.forbidden_constructs || []).length > 0 ? `VERBOTEN (User nutzt diese NIE): ${style.forbidden_constructs.join(', ')}` : ''}

WICHTIG: Der inhaltliche Ton wird AUSSCHLIESSLICH durch das gewählte PRESET bestimmt (siehe oben). Nutze aus diesem Rhythmus-Block nur Satzlänge und Konjunktionen.`
            // Kein Preset gewählt → volles Style-Sample (Legacy-Verhalten)
            : `SCHREIBSTIL-VORBILD (aus bisherigen Anschreiben des Users):
Ton: ${style.tone || 'nicht analysiert'}
Satzlänge: ${style.sentence_length || 'medium'}
Bevorzugte Konjunktionen: ${(style.conjunctions || []).join(', ') || 'Daher, Deshalb, Zudem'}
Bevorzugte Begrüßung: ${style.greeting || 'Sehr geehrte Damen und Herren'}
${(style.rhetorical_devices || []).length > 0 ? `Rhetorische Mittel: ${style.rhetorical_devices.join(', ')}` : ''}
${(style.forbidden_constructs || []).length > 0 ? `VERBOTEN (User nutzt diese NIE): ${style.forbidden_constructs.join(', ')}` : ''}

Kalibriere deinen Output auf dieses Muster — übernimm den Stil, nicht den Inhalt.
Nutze die extrahierten Konjunktionen statt generischer Übergänge.`
        : '';

    // ─── Stations Section (B2.3: Stations-Selektor mit PFLICHT/VERBOT) ──────────
    let stationsSection: string;
    if (ctx?.cvStations?.length) {
        const stationNames = ctx.cvStations.map(s => `${s.role} @ ${s.company}`).join(', ');
        stationsSection = `[REGEL: HAUPTTEIL - CV-STATIONEN]
PFLICHT: Verwende AUSSCHLIESSLICH diese ${ctx.cvStations.length} Stationen: ${stationNames}
VERBOT: Erwähne KEINE anderen Stationen aus dem CV — nur die oben genannten sind erlaubt!

- Schreibe keinen Fließtext-Lebenslauf! Widme jeder ausgewählten CV-Station einen EIGENEN, kurzen Absatz (max. 3 Sätze).
- Nenne den Kontext kurz, aber fokussiere dich zu 70% auf den erlernten WERT (Was hat der Kandidat gelernt? Warum ist das für den neuen Arbeitgeber relevant?). Verbinde Sätze logisch (z.B. 'Diese Erfahrung hat meinen Blick dafür geschärft, wie...').
- REDUZIERE BUZZWORDS DRASTISCH. Pro Absatz maximal 2 zentrale Fachbegriffe. Wenn eine CV-Station viele Technologien enthält, erwähne NUR diejenige, die absolut essenziell für die ausgeschriebene Stelle ist. Lass alles andere weg.

` + ctx.cvStations.map(s => `Station ${s.stationIndex}: ${s.role} @ ${s.company} (${s.period})
  → Beweis für Job-Anforderung: "${s.matchedRequirement}"
  → Schlüssel-Achievement: "${s.keyBullet}"
  → Alle Stärken dieser Station (nutze als inhaltliche Basis):
${(s.bullets || []).slice(0, 4).map(b => `     • ${b}`).join('\n')}
  → Zeige im Text: ${s.intent}`).join('\n');
    } else {
        stationsSection = 'Nutze die relevantesten Erfahrungen aus dem CV und beweise damit deinen Wert für das Unternehmen.';
    }

    // ─── Cross-Integration: Intro vs Body (Anti-Overload Architecture) ─────────
    // REGEL: Die Einleitung bekommt MAX 1 Anker. Das zweite Element wandert
    // deterministisch in den Hauptteil (als Einleitungssatz des Station-1-Absatzes).
    // selectedNews wird in dieselbe Logik gefaltet um Triple-Overload zu verhindern.
    let introGuidance = '';
    let bodyIntegrationGuidance = '';

    const focus = ctx?.introFocus || 'quote';
    // hasQuote already declared above toneInstructions (needed for philosophisch preset)
    const hasHook = !!ctx?.selectedHook?.content;
    const hasNews = !!ctx?.selectedNews;
    // WHY: enablePingPong is used inside the quoteIntroBlock template literal (evaluated at declaration).
    // It MUST respect ALL constraints here, not just the raw opt-in value, because the safety net
    // at line ~363 operates on `modules` which is too late for template literal evaluation.
    // CONFLICTS RESOLVED: Blind Spot #1 (introFocus) + #3 (formal preset)
    const rawPingPong = ctx?.optInModules?.pingPong ?? ctx?.enablePingPong ?? false;
    const enablePingPong = rawPingPong && focus === 'quote' && (ctx?.tone?.preset ?? 'formal') !== 'formal';

    // ─── Zitat-Block (wiederverwendbar für Intro oder Body) ────────────────────
    const quoteIntroBlock = hasQuote ? `[REGEL: EINLEITUNG — ZITAT-BRIDGING]:
Gewähltes Zitat: "${ctx!.selectedQuote!.quote}"
(Autor: ${ctx!.selectedQuote!.author})

FORMATIERUNG DES ZITATS (UNBEDINGT EINHALTEN):
- Leite das Zitat mit einer menschlichen Beobachtung ein.
- Das Zitat MUSS auf einer EIGENEN Zeile stehen, in Anführungszeichen.

AUTOR-NENNUNG (WICHTIG — NUR EINMAL!):
Der Autor (${ctx!.selectedQuote!.author}) darf NUR AN EINER STELLE genannt werden:
  Variante A: Im Einleitungssatz den Autor nennen → Zitat OHNE Signatur danach.
    Beispiel: "...erinnerte ich mich an einen Satz von ${ctx!.selectedQuote!.author}:"
    "${ctx!.selectedQuote!.quote}"
  Variante B: Neutrale Einleitung ohne Autorennamen → Zitat MIT Signatur.
    Beispiel: "Da kam mir ein Gedanke in den Sinn:"
    "${ctx!.selectedQuote!.quote}" – ${ctx!.selectedQuote!.author}
Wähle frei zwischen A und B, aber NIEMALS den Autor an BEIDEN Stellen nennen!

  [Begründungssatz]

- DIREKT NACH dem Zitat: Ein EIGENER Begründungssatz (1 Satz), der erklärt WARUM dieses Zitat zum Unternehmen UND zum Kandidaten passt.
- Der Begründungssatz MUSS eine konkrete Brücke zu einer Erfahrung aus dem CV bauen.
- KEINE leeren Floskeln wie 'Genau diese Haltung treibt mich an'.
${enablePingPong ? `
[PING-PONG EINLEITUNG — DU BIST NOCH IN DER EINLEITUNG, NICHT in Absatz 2]
Nach dem Zitat und dem Brückensatz fügst du ZWEI weitere Sätze hinzu (Antithese + Synthese):

ANTITHESE (1 Satz): Beschreibe, wie du diesen Gedanken früher ANDERS gesehen hast.
→ Formuliere es als Lernkurve oder Erkenntnisgewinn: "Bei [CV-Station] dachte ich zunächst, dass..."
→ NIEMALS negativ über frühere Arbeitgeber klingen. Das ist VERBOTEN.
→ KEIN echter Fehler, kein Versagen — eine Perspektiventwicklung.
→ KEIN Pseudo-Kontrast wie "Ich sah das ähnlich, aber jetzt noch mehr so." — Das ist VERBOTEN.

SYNTHESE (1 Satz): Verbinde die Erkenntnis DIREKT mit ${companyName} — baue eine konkrete Brücke.
→ PFLICHT: Der Satz muss einen konkreten ${companyName}-Bezug enthalten (Website, Werte, Projekt).
→ Beispiel: "Da ich gelesen habe, dass ${companyName} [konkreter Firmenbezug], möchte ich mich kurz vorstellen."
→ KEINE abstrakte Reflexion ohne Firmenbezug. Der Leser muss verstehen WARUM genau DIESES Unternehmen.

LIMITS:
- EINLEITUNG darf aus MAX. 4 kurzen Abschnitten bestehen: Einleitungssatz + Zitat + Antithese + Synthese
- MAXIMAL 100 Wörter für den gesamten Einleitungsblock (Zitat mitgezählt)
- Dieser Block zählt NICHT als eigener der 4-5 Absätze des Anschreibens` : ''}` : '';

    const quoteBodyBlock = hasQuote ? `[REGEL: ZITAT IM HAUPTTEIL — STATION-1-EINLEITUNG]:
Das folgende Zitat MUSS WORTWÖRTLICH im Text stehen. Lass es NICHT weg!
Zitat: "${ctx!.selectedQuote!.quote}" (${ctx!.selectedQuote!.author})

PFLICHT-FORMAT:
"${ctx!.selectedQuote!.quote}"
– ${ctx!.selectedQuote!.author}

Diesen Gedanken habe ich bei meiner Arbeit als [Rolle] bei [Firma] täglich gelebt, als ich [konkretes Beispiel]...

Das Zitat dient als Brücke zwischen dem Vordenker und der konkreten Berufserfahrung. Maximal 2 Sätze für Zitat + Brücke, dann direkt in die Station.` : '';

    // ─── Hook-Block (wiederverwendbar für Intro oder Body) ─────────────────────
    const hookContent = ctx?.selectedHook?.content || '';
    const hookIntroBlock = hasHook ? `[REGEL: EINLEITUNG]:
Unternehmens-Fakt: "${hookContent}"
(Typ: ${ctx!.selectedHook!.type}, Quelle: ${ctx!.selectedHook!.sourceName})
-> Integriere diesen Aufhänger NATÜRLICH in den ersten Satz
-> NIEMALS die Quelle direkt nennen (z.B. "Wie auf Ihrer Website gelesen..." ist VERBOTEN)
-> MAXIMAL 2 SÄTZE für den Aufhänger. Verknüpfe ihn mit deiner Motivation für die Stelle` : '';

    // WHY: Der alte starre Satz-Vorschlag ("Als ich gesehen habe...") klang wie
    // ein ZWEITER Einleitungssatz. Claude interpretierte ihn als Intro-Start und
    // verschmolz Absatz 1 + 2. Jetzt: weiche Instruktion + Positions-Kontext.
    // CONFLICTS RESOLVED: Red Flag #2 — einleitende Formulierung in Body-Block.
    const hookBodyBlock = hasHook ? `[REGEL: UNTERNEHMENS-FAKT IM HAUPTTEIL — ABSATZ 2]
DU BEFINDEST DICH JETZT IN ABSATZ 2 (HAUPTTEIL). Die Einleitung ist bereits abgeschlossen.
Verknüpfe den folgenden Unternehmens-Fakt organisch mit der Erfahrung aus der ERSTEN CV-Station:
"${hookContent}"
INSTRUKTION: Webe diesen Fakt als Motivation oder Anknüpfungspunkt in den Stations-Absatz ein.
BEISPIEL-STRUKTUR: "[Fakt-Bezug in eigenen Worten], das hat mich an meine Erfahrung bei [Firma] erinnert, wo ich [konkretes Achievement]."
KEIN neuer Einleitungssatz — du bist bereits im Hauptteil. Maximal 2 Sätze für die Fakt-Brücke, dann direkt in die Station.` : '';

    // ─── Kreuzungs-Logik ───────────────────────────────────────────────────────
    if (hasQuote && hasHook) {
        // BEIDE vorhanden → introFocus entscheidet
        if (focus === 'quote') {
            introGuidance = quoteIntroBlock;
            bodyIntegrationGuidance = hookBodyBlock;
        } else {
            introGuidance = hookIntroBlock;
            bodyIntegrationGuidance = quoteBodyBlock;
        }
    } else if (hasQuote) {
        introGuidance = quoteIntroBlock;
    } else if (hasHook) {
        introGuidance = hookIntroBlock;
    }

    // ─── selectedNews: Folding in die Anti-Overload-Logik ──────────────────────
    // Wenn selectedNews gesetzt ist UND bereits ein Intro-Anker existiert,
    // wird die News NICHT zusätzlich in die Einleitung gepresst, sondern
    // als Übergangssatz zwischen Station 1 und Station 2 platziert.
    let newsSection = '';
    if (hasNews) {
        if (introGuidance) {
            // Es gibt bereits einen Intro-Anker → News wandert in den Hauptteil
            newsSection = `[REGEL: NEWS-BINDING — HAUPTTEIL-ÜBERGANG]
Die folgende News MUSS organisch als ÜBERGANGSSATZ zwischen dem ersten und zweiten Stations-Absatz eingebaut werden:
"${ctx!.selectedNews!.title}" (${ctx!.selectedNews!.date}${ctx!.selectedNews!.source ? `, ${ctx!.selectedNews!.source}` : ''})
Formuliere es als Brücke: "Gerade weil ${companyName} kürzlich [News-Bezug], sehe ich meine Erfahrung in [nächste Station] als besonders relevant..."
NIEMALS die Quelle direkt nennen — der Kandidat soll wirken, als hätte er die News natürlich mitbekommen.`;
        } else {
            // Kein Intro-Anker → News bekommt die Einleitung
            introGuidance = `[REGEL: EINLEITUNG — NEWS-AUFHÄNGER]:
Aktuelle News: "${ctx!.selectedNews!.title}" (${ctx!.selectedNews!.date})
-> Integriere diese News NATÜRLICH in den ersten Satz
-> MAXIMAL 2 SÄTZE. Verknüpfe sie mit deiner Motivation für die Stelle
-> NIEMALS die Quelle direkt nennen`;
        }
    }

    // ─── Opt-In Module Sections (B2.2) ────────────────────────────────────────
    const modules = { ...(ctx?.optInModules ?? DEFAULT_OPT_IN_MODULES) };

    // ─── Prompt-Level Safety Net (Defense-in-Depth) ────────────────────────────
    // WHY: Even if UI guards are bypassed (auto-fill, direct API calls, persisted stale state),
    // structurally/tonally incompatible modules MUST NOT generate prompt sections.
    // CONFLICTS RESOLVED: Blind Spot #1 (Ping-Pong Ghost) + #3 (Formal Tension)
    const preset = ctx?.tone?.preset ?? 'formal';
    if (preset === 'formal') {
        modules.first90DaysHypothesis = false;  // 5th paragraph breaks 4-paragraph structure
        modules.vulnerabilityInjector = false;  // Breaks souveräner Ton mandate
        modules.pingPong = false;               // Storytelling element in formal = forbidden
    }
    if (focus !== 'quote') {
        modules.pingPong = false;  // Ping-Pong lives only in quoteIntroBlock
    }

    let first90DaysSection = '';
    if (modules.first90DaysHypothesis) {
        // ── Datenbasis: Echte Perplexity-Schmerzdaten ODER Job-Description-Fallback ──
        const intelData = (company as any)?.intel_data || {};
        const currentChallenges: string[] = intelData.current_challenges || [];
        const roadmapSignals: string[] = intelData.roadmap_signals || [];
        const hasRealData = currentChallenges.length > 0 || roadmapSignals.length > 0;

        if (hasRealData) {
            // Datengetriebener Pfad: Konkrete Firmenschmerzen aus Perplexity
            const challengesText = currentChallenges.length > 0
                ? `Aktuelle Herausforderungen der Firma: ${currentChallenges.map(c => `"${c}"`).join(', ')}`
                : '';
            const roadmapText = roadmapSignals.length > 0
                ? `Strategische Roadmap-Signale: ${roadmapSignals.map(r => `"${r}"`).join(', ')}`
                : '';

            first90DaysSection = `[POSITION: VORLETZTER ABSATZ — VOR DEM SCHLUSS, NACH DEN STATIONEN]
[REGEL: FIRST 90 DAYS HYPOTHESIS — 1x VERWENDEN, KEIN FLUFF]
${challengesText}
${roadmapText}
Job-Anforderungen als Signal: ${JSON.stringify(job?.requirements?.slice(0, 3) || [])}

INSTRUKTION: Formuliere einen knappen 90-Tage-Plan (max. 60 Wörter) mit EXAKT 3 Punkten.
Jeder Punkt adressiert eines der oben genannten Firma-Probleme DIREKT, verknüpft mit einer konkreten Erfahrung aus dem CV.
Format (als Fließtext mit Zeilenumbrüchen, KEINE Bullet-Point-Symbole):
"In den ersten 90 Tagen würde ich drei Dinge priorisieren: Erstens [Problem der Firma → CV-Station]. Zweitens [zweites Problem → CV-Beweis]. Drittens [strategischer Ausblick]."
VERBOTEN: "In den ersten 30 Tagen werde ich zuhören und verstehen" — das ist FLUFF.
VERBOTEN: Mehr als 60 Wörter für diesen Block.`;
        } else {
            // Fallback-Pfad: Keine Perplexity-Daten → Plan basierend auf Job-Requirements
            first90DaysSection = `[POSITION: VORLETZTER ABSATZ — VOR DEM SCHLUSS, NACH DEN STATIONEN]
[REGEL: FIRST 90 DAYS HYPOTHESIS — FALLBACK (keine Firmendaten verfügbar) — 1x VERWENDEN]
Nutze die Stellenanforderungen als Grundlage: ${JSON.stringify(job?.requirements?.slice(0, 3) || [])}

INSTRUKTION: Formuliere einen knappen 90-Tage-Plan (max. 60 Wörter) mit EXAKT 3 Punkten.
Leite aus den Job-Anforderungen die wahrscheinlichsten Aufgaben der ersten 90 Tage ab.
Verknüpfe jeden Punkt mit einer konkreten Erfahrung aus dem CV.
Format (Fließtext, KEINE Bullet-Point-Symbole):
"In den ersten 90 Tagen würde ich drei Dinge priorisieren: Erstens [Anforderung → CV-Beweis]. Zweitens [zweite Anforderung → Beweis]. Drittens [strategischer Ausblick]."
VERBOTEN: "In den ersten 30 Tagen werde ich zuhören und verstehen" — das ist FLUFF.
VERBOTEN: Mehr als 60 Wörter für diesen Block.`;
        }
    }

    let painPointSection = '';
    if (modules.painPointMatching !== false) { // Default: true
        painPointSection = `[REGEL: PAIN POINT MATCHING — IMPLIZITE FIRMENSCHMERZEN]
Analysiere die Stellenbeschreibung auf implizite Probleme:
- Explizit gesucht (z.B. Python, Teamführung) = Skill Match → direkt benennen
- Impliziter Schmerz (z.B. "Aufbau eines neuen Teams" = Wachstumsproblem) → Zeige mit einer konkreten CV-Station, wo genau du das schon gelöst hast
Nicht "Ich kann das", sondern "Hier habe ich das gelöst: [konkret]".`;
    }

    let vulnerabilitySection = '';
    if (modules.vulnerabilityInjector) {
        vulnerabilitySection = `[REGEL: VULNERABILITY INJECTOR — MAX. 2x VERWENDEN]
Baue 1-2 strategische, authentische Schwächen oder Lernkurven ein.
Format: "Ich habe bei [Station] schnell gemerkt, dass mein erster Ansatz zu komplex gedacht war. Das hat mich gezwungen, radikal zu vereinfachen — ein Prinzip, das ich auch in eurem [Firmen-Kontext] sehe."
REGELN:
- Darf NIE wie eine Entschuldigung klingen — immer als Wachstum framen
- MAXIMAL 2 Stellen im gesamten Anschreiben
- Jede Vulnerability MUSS in [VUL]...[/VUL] Tags eingeschlossen werden (wird nach Generierung automatisch geprüft und entfernt)
- Beispiel: [VUL]Ich habe bei Fraunhofer schnell gemerkt, dass...[/VUL]`;
    }

    // ─── B3.2: Persona-Kontext (Hiring Manager Panel) ──────────────────────
    let personaSection = '';
    const persona: HiringPersona | undefined = ctx?.selectedPersona;
    if (persona && persona.confidence > 0.4) {
        personaSection = `[REGEL: PERSONA-KONTEXT — HIRING MANAGER]
Du schreibst für: ${persona.name} (${persona.role})
Vermutliche Prioritäten: ${persona.traits.join(', ')}
Bevorzugter Stil: ${persona.preferredStyle}
→ Passe Ton und Argumentationsstruktur entsprechend an.
→ KEIN explizites Naming der Persona im Text. Der Kandidat soll nicht zeigen, dass er recherchiert hat WER liest — nur WOVON diese Person überzeugt wäre.`;
    }

    const wordCountFeedback = (() => {
        if (lastWordCount > 380) {
            return `WORTANZAHL: Vorherige Version hatte ${lastWordCount} Wörter — ZU LANG. Kürze um ${lastWordCount - 350} Wörter. Maximal 3 Sätze pro Absatz.`;
        }
        if (lastWordCount < 250 && lastWordCount > 0) {
            return `WORTANZAHL: Vorherige Version hatte ${lastWordCount} Wörter — ZU KURZ. Füge ${280 - lastWordCount} Wörter hinzu. Erweitere den Beweis-Absatz.`;
        }
        return '';
    })();

    // ─── Feedback Section (ab Iteration 2) ───────────────────────────────────
    const feedbackSection = feedback.length > 0
        ? `KRITISCHE VERBESSERUNGEN — ALLE ADRESSIEREN:
${feedback.map(f => `- ${f}`).join('\n')}
${wordCountFeedback ? `\n${wordCountFeedback}` : ''}`
        : '';

    // ─── MASTER PROMPT ASSEMBLY ───────────────────────────────────────────────
    return `
=== SEKTION 1: ROLLE & OUTPUT-FORMAT ===
Du bist ein Senior-Karriereberater und exzellenter Schreiber.
Deine Aufgabe: Schreibe ein Anschreiben für die Stelle "${jobTitle}" bei "${companyName}".

OUTPUT-REGELN (CRITICAL — NIEMALS BRECHEN):
- Nur der reine Briefkörper: Von der Anrede bis zur Grußformel
- KEIN Datum, KEINE Adresszeilen, KEIN Betreff
- KEIN Markdown: kein **bold**, kein *italic*, keine - Bullet-Points im Text
- Sprache: ${lang} — keine einzige Ausnahme
- Länge: ${modules.first90DaysHypothesis
            // WHY: Der 90-Tage-Block kostete ~60 Wörter extra. Ohne Budget-Reduktion
            // überschreitet das Anschreiben eine DIN-A4-Seite. Der Haupttext wird daher
            // auf max. 340 Wörter begrenzt, sodass der Gesamtbrief bei 350-400 Wörtern bleibt.
            ? '260–340 Wörter (exkl. 90-Tage-Block), 4–5 Absätze. Der 90-Tage-Plan ist ein eigener, kompakter Absatz (max. 60W) und zählt NICHT zum Haupttext.'
            : '280–380 Wörter, 4–5 Absätze'
        }
- Absätze getrennt durch eine Leerzeile
- Beginne direkt mit der Anrede: ${contactPersonGreeting}
- Anrede-Form: ${isDuForm ? 'DU-FORM (du/dein/euch/dir). Wende diese Du-Form STRIKT auf das GESAMTE Anschreiben an. Kein "Sie" oder "Ihnen" — NIEMALS.' : 'SIE-FORM (Sie/Ihr/Ihnen). Wende diese Sie-Form STRIKT auf das GESAMTE Anschreiben an.'}

=== SEKTION 2: TONALITÄT & STIL (HÖCHSTE PRIORITÄT) ===
PRESET: ${ctx?.tone.preset || 'formal'}
${activeTone}

${styleSection}

${buildBlacklistPromptSection()}

=== SEKTION 3: AUFHÄNGER (KURZ & PRÄGNANT) ===
${introGuidance || `Beginne mit einem relevanten Aufhänger zu ${companyName}.`}

${introGuidance && hasQuote && focus === 'quote' ? companyName + ' muss direkt am Anfang des Anschreibens mindestens einmal fallen.' : companyName + ' muss im ersten Absatz mindestens einmal fallen.'}
${introGuidance && hasQuote && focus === 'quote'
            // WHY: quoteIntroBlock braucht: Einleitungssatz + Zitat (eigene Zeile) + Begründungssatz + Übergangssatz.
            // "Der erster Absatz" ist VERBOTEN als Begriff, weil Claude dann alle Quote-Zeilenumbrüche als
            // eigene Absätze zählt, die gegen die "4-5 Absätze gesamt"-Regel verstoßen. Claude reagiert
            // mit Kompression: Alles in einen einzigen Fließtext-Absatz ohne Leerzeilen.
            // CONFLICTS RESOLVED: Red Flag #4 — Absatz-Zählung vs. Quote-Formatierung.
            ? 'Die EINLEITUNG darf aus bis zu 3 kurzen Abschnitten bestehen (Einleitungssatz, Zitat auf EIGENER Zeile, Begründungssatz + Übergangssatz). Diese Abschnitte zählen zusammen als EIN Einheitenblock — sie gehören zur Einleitung und zählen NICHT als separate der 4-5 Absätze.'
            : 'Der gesamte erste Absatz (Aufhänger + Motivation) darf MAXIMAL 2 SÄTZE lang sein! Keine generischen Abhandlungen über Innovation. Kurz, knackig, direkt zum Punkt.'
        }

[PFLICHT — ÜBERGANGSSATZ]: ${introGuidance && hasQuote && focus === 'quote' ? 'Die EINLEITUNG (nach dem Zitat und dem Begründungssatz)' : 'Der ERSTE Absatz'} MUSS zwingend mit diesem Satz enden:
${isDuForm ? '"Daher möchte ich mich bei euch kurz vorstellen."' : '"Daher möchte ich mich bei Ihnen kurz vorstellen."'}
Dieser Satz ist NICHT optional. Er bildet die Brücke zum Hauptteil.

${newsSection}

=== SEKTION 4: KARRIERE-BEWEISE (FOLGENDE ABSÄTZE) ===
Integriere diese Stationen als fließende Prosa — WICHTIG: Erstelle für jede gewählte Station einen eigenen Absatz.

ANTI-REPETITIONS-REGEL (KRITISCH):
Jeder Stations-Absatz MUSS mit einem ANDEREN Einleitungssatz beginnen.
VERBOTEN: Denselben Einleitungstyp oder dieselbe Satzstruktur für zwei aufeinanderfolgende Absätze zu verwenden.
Beispiel VERBOTEN: „Die Verbindung von X und Y bei Firma A..." gefolgt von „Die Verbindung von X und Y bei Firma B..."
Jeder Absatz muss einen eigenen Einstieg haben: Mal ein konkretes Ergebnis, mal ein Kontext-Setting, mal eine Problemstellung.

${bodyIntegrationGuidance}

${stationsSection}

Job-Anforderungen für die Relevanzkontrolle:
${JSON.stringify(job?.requirements?.slice(0, 3) || [], null, 2)}

Unternehmens-Kontext (nutze für spezifische Verbindungen):
Werte: ${JSON.stringify(company?.company_values?.slice(0, 3) || [])}
Tech: ${JSON.stringify(company?.tech_stack?.slice(0, 3) || [])}

${cvInput}

${first90DaysSection}

${painPointSection}

${vulnerabilitySection}

${personaSection}

=== SEKTION 5: ABSCHLUSS & CALL TO ACTION ===
[REGEL: SCHLUSSTEIL]
- VERBOTEN: Fasse am Ende NICHT noch einmal die Karrierestationen oder Erfahrungen zusammen ("Mit über X Jahren Erfahrung...", "Meine direkte Arbeitsweise..."). Das ist Fluff.
- VERBOTEN: Das Zitat oder den Aufhänger aus dem ersten Absatz hier noch einmal erwähnen. Schreibe keine poetischen Sprachbilder am Ende.
- Der Schlusssatz ist ein DIREKTER, KURZER Call-to-Action auf Augenhöhe (max 2 Sätze). Bette einen konkreten Gesprächsvorschlag ein.
- Beispiel: ${isDuForm ? '"Ich würde mich freuen, in einem kurzen Gespräch zu zeigen, wie ich [konkreter Punkt] bei euch vorantreiben kann."' : '"Lassen Sie uns in einem kurzen Gespräch ausloten, wie ich [konkreter Punkt] bei Ihnen vorantreiben kann."'}

=== SEKTION 6: VERBESSERUNGS-FEEDBACK ===
${feedbackSection || 'Erste Version — kein vorheriges Feedback.'}

Schreibe jetzt das Anschreiben. Beginne direkt mit der Anrede:
`.trim();
}
