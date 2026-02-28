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
    let contactPersonGreeting: string;
    if (ctx?.tone.contactPerson) {
        const name = ctx.tone.contactPerson.trim();
        if (lang === 'English') {
            contactPersonGreeting = `"Dear ${name},"`;
        } else {
            contactPersonGreeting = `"Liebe/r ${name}," (nutze die wahrscheinlich korrekte Anrede, z.B. "Lieber Max," oder "Liebe Anna,")`;
        }
    } else if (style?.greeting && style.greeting !== 'Sehr geehrte Damen und Herren') {
        contactPersonGreeting = `"${style.greeting}"`;
    } else {
        contactPersonGreeting = lang === 'English'
            ? `"Dear Hiring Team,"`
            : `"Sehr geehrte Damen und Herren,"`;
    }

    // ─── CV Input (CV-Optimizer-Priorität) ────────────────────────────────────
    const cvInput = job?.cv_optimization_user_decisions?.appliedChanges
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
SCHLUSS: Konkreter Mehrwert in einem Satz mit Zahl (z.B. "Ich bringe 5 Jahre Erfahrung in X mit, die Ihre Y-Strategie um Z beschleunigen können.").
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
SCHLUSS: Schließe den Bogen zum Opening-Moment. Zeige, wie der Karriereweg logisch zu dieser Stelle führt.
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
SCHLUSS: Souverän auf Augenhöhe, kein Betteln. "Ich freue mich auf ein Gespräch, in dem wir [konkretes Thema] vertiefen können."
VERBOTEN: Umgangssprache, Emojis, Interjektionen, "Ich brenne für", persönliche Anekdoten.`,

        'philosophisch': `STIL: INTELLEKTUELL & KONZEPTIONELL
ÖFFNUNG: Starte mit einem relevanten Zitat, einer Beobachtung oder einem Konzept, das die Brücke zwischen deiner Weltsicht und dem Unternehmen schlägt. (z.B. "Peter Drucker sagte einmal: ‚Die beste Art, die Zukunft vorauszusagen, ist sie zu gestalten.' — Ein Gedanke, der meine Arbeit bei [Firma] geprägt hat und den ich bei [Ziel-Firma] vertiefen möchte.")
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
SCHLUSS: Schließe mit einer Vision oder einem Ausblick, der zeigt, wie du die Unternehmens-Mission mitgestalten willst. Kein Betteln, sondern intellektuelle Neugier.
VERBOTEN: Oberflächliche Name-Dropping von Philosophen ohne Bezug, Arroganz, akademischer Jargon, mehr als 1 Zitat.`,
    };
    const activeTone = toneInstructions[ctx?.tone.preset ?? 'formal'];

    // ─── Style Sample (B1.1: Alle 6 Marker aus StyleAnalysis) ─────────────────
    const styleSection = style
        ? `SCHREIBSTIL-VORBILD (aus bisherigen Anschreiben des Users):
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
    const hasQuote = !!ctx?.selectedQuote;
    const hasHook = !!ctx?.selectedHook?.content;
    const hasNews = !!ctx?.selectedNews;
    const enablePingPong = ctx?.optInModules?.pingPong ?? ctx?.enablePingPong ?? false;

    // ─── Zitat-Block (wiederverwendbar für Intro oder Body) ────────────────────
    const quoteIntroBlock = hasQuote ? `[REGEL: EINLEITUNG — ZITAT-BRIDGING]:
Gewähltes Zitat: "${ctx!.selectedQuote!.quote}"
(Autor: ${ctx!.selectedQuote!.author})

FORMATIERUNG DES ZITATS (UNBEDINGT EINHALTEN):
- Leite das Zitat mit einer menschlichen Beobachtung ein (z.B. "Beim Lesen Ihrer Website dachte ich an ${ctx!.selectedQuote!.author}...").
- Das Zitat MUSS auf einer EIGENEN Zeile stehen, in Anführungszeichen, gefolgt vom Autor:

  [Einleitender Satz]

  "${ctx!.selectedQuote!.quote}"
  - ${ctx!.selectedQuote!.author}

  [Begründungssatz]

- DIREKT NACH dem Zitat: Ein EIGENER Begründungssatz (1 Satz), der erklärt WARUM dieses Zitat zum Unternehmen UND zum Kandidaten passt.
- Der Begründungssatz MUSS eine konkrete Brücke zu einer Erfahrung aus dem CV bauen.
- KEINE leeren Floskeln wie 'Genau diese Haltung treibt mich an'.
${enablePingPong ? '- PING-PONG (aktiv): Nach der Zitat-Brücke, füge einen kurzen Satz hinzu der eine kritische Gegenposition aufwirft.' : ''}` : '';

    const quoteBodyBlock = hasQuote ? `[REGEL: ZITAT IM HAUPTTEIL — STATION-1-EINLEITUNG]:
Das folgende Zitat MUSS als EINLEITUNGSSATZ des ERSTEN Stations-Absatzes verwendet werden:
"${ctx!.selectedQuote!.quote}" (${ctx!.selectedQuote!.author})
Formuliere es so: "Diesen Gedanken von ${ctx!.selectedQuote!.author} habe ich bei meiner Arbeit als [Rolle] bei [Firma] täglich gelebt, als ich [konkretes Beispiel]..."
Das Zitat dient als Brücke zwischen dem Vordenker und der konkreten Berufserfahrung. Maximal 2 Sätze für Zitat + Brücke, dann direkt in die Station.` : '';

    // ─── Hook-Block (wiederverwendbar für Intro oder Body) ─────────────────────
    const hookContent = ctx?.selectedHook?.content || '';
    const hookIntroBlock = hasHook ? `[REGEL: EINLEITUNG]:
Unternehmens-Fakt: "${hookContent}"
(Typ: ${ctx!.selectedHook!.type}, Quelle: ${ctx!.selectedHook!.sourceName})
-> Integriere diesen Aufhänger NATÜRLICH in den ersten Satz
-> NIEMALS die Quelle direkt nennen (z.B. "Wie auf Ihrer Website gelesen..." ist VERBOTEN)
-> MAXIMAL 2 SÄTZE für den Aufhänger. Verknüpfe ihn mit deiner Motivation für die Stelle` : '';

    const hookBodyBlock = hasHook ? `[REGEL: UNTERNEHMENS-FAKT IM HAUPTTEIL — STATION-1-EINLEITUNG]:
Der folgende Fakt MUSS als EINLEITUNGSSATZ des ERSTEN Stations-Absatzes verwendet werden:
"${hookContent}"
Formuliere es so: "Als ich gesehen habe, dass ${companyName} ${hookContent.toLowerCase().startsWith('sie') ? hookContent : hookContent.slice(0, 80) + '...'}${hookContent.length > 80 ? '' : ''}, hat mich das an meine Erfahrung bei [Firma] erinnert..."
Der Fakt dient als Brücke zu einer konkreten Berufserfahrung. Maximal 2 Sätze, dann direkt in die Station.` : '';

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
    const modules = ctx?.optInModules ?? DEFAULT_OPT_IN_MODULES;

    let first90DaysSection = '';
    if (modules.first90DaysHypothesis) {
        first90DaysSection = `[REGEL: FIRST 90 DAYS HYPOTHESIS — 1x VERWENDEN]
Basierend auf den Stellenanforderungen und dem Firmenprofil:
Formuliere in EINEM Absatz (nicht als Liste!) einen konkreten 90-Tage-Ausblick:
"In den ersten 90 Tagen würde ich mich auf drei Dinge fokussieren:
1. [Konkretes Problem der Firma + User-Lösungsansatz aus CV]
2. [Zweites Thema mit Bezug zur Stelle]
3. [Drittes Thema mit strategischem Blick]"
Nur 3 Punkte, knapp formuliert. Kein Roman. Zeige dass du die Firma verstanden hast.`;
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
- Länge: 280–380 Wörter, 4–5 Absätze
- Absätze getrennt durch eine Leerzeile
- Beginne direkt mit der Anrede: ${contactPersonGreeting}

=== SEKTION 2: AUFHÄNGER (KURZ & PRÄGNANT) ===
${introGuidance || `Beginne mit einem relevanten Aufhänger zu ${companyName}.`}

${companyName} muss im ersten Absatz mindestens einmal fallen.
Der gesamte erste Absatz (Aufhänger + Motivation) darf MAXIMAL 2 SÄTZE lang sein! Keine generischen Abhandlungen über Innovation. Kurz, knackig, direkt zum Punkt.

${newsSection}

=== SEKTION 3: KARRIERE-BEWEISE (FOLGENDE ABSÄTZE) ===
Integriere diese Stationen als fließende Prosa — WICHTIG: Erstelle für jede gewählte Station einen eigenen Absatz.

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

=== SEKTION 4: TONALITÄT & STIL ===
PRESET: ${ctx?.tone.preset || 'formal'}
${activeTone}

${styleSection}

${buildBlacklistPromptSection()}

=== SEKTION 5: ABSCHLUSS & CALL TO ACTION ===
[REGEL: SCHLUSSTEIL]
- Der Schlusssatz muss bodenständig und direkt sein. Fasse in einem Satz zusammen, welchen konkreten Mehrwert der Kandidat bringt. Gehe kurz auf die Kultur/DNA des Unternehmens ein.
- VERBOTEN: Das Zitat oder den Aufhänger aus dem ersten Absatz hier noch einmal erwähnen. Schreibe keine poetischen Sprachbilder am Ende.
- Ein souveräner Schlusssatz auf Augenhöhe (kein Betteln um ein Interview, z.B. "Lassen Sie uns in einem kurzen Gespräch ausloten...").

=== SEKTION 6: VERBESSERUNGS-FEEDBACK ===
${feedbackSection || 'Erste Version — kein vorheriges Feedback.'}

Schreibe jetzt das Anschreiben. Beginne direkt mit der Anrede:
`.trim();
}
