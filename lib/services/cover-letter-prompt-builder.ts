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
        // suggested_quotes removed — quotes now served on-demand via /api/cover-letter/quotes (DB-backed quote-service.ts)
    }>;
    [key: string]: unknown;
}

interface CompanyResearchData {
    company_values?: string[];
    tech_stack?: string[];
    current_challenges?: string[];
    roadmap_signals?: string[];
    recent_news?: Array<{ title?: string; date?: string; source?: string; [key: string]: unknown }>;
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
    const isEnglish = ctx?.tone.targetLanguage === 'en';
    const lang = isEnglish ? 'English' : 'Deutsch';
    // Locale helper: returns EN string when targetLanguage is 'en', DE otherwise.
    // Used for all text that Claude should output verbatim in the cover letter.
    const t = (de: string, en: string) => isEnglish ? en : de;
    const companyName = job?.company_name || ctx?.companyName || t('das Unternehmen', 'the company');
    const jobTitle = job?.job_title || t('die ausgeschriebene Stelle', 'the advertised position');

    // ─── B1.6: Ansprechperson-Binding (Cascading Fallback) ────────────────────
    const isDuForm = ctx?.tone.formality === 'du';
    let contactPersonGreeting: string;
    if (ctx?.tone.contactPerson) {
        // Strip greeting-only prefixes (e.g. "Hello Mr. Curry" → "Mr. Curry")
        const rawName = ctx.tone.contactPerson.trim();
        const name = rawName.replace(/^(dear|hello|hi|hallo|liebe[rs]?|sehr geehrte[rs]?|good\s+(?:morning|afternoon|evening))\s+/i, '').trim();

        // Detect formal title (Herr/Frau/Mr./Mrs./Ms.) to generate correct salutation
        const herrMatch = name.match(/^Herr\s+/i);
        const frauMatch = name.match(/^Frau\s+/i);
        const mrMatch = name.match(/^Mr\.?\s+/i);
        const mrsMatch = name.match(/^(?:Mrs|Ms)\.?\s+/i);

        if (lang === 'English') {
            contactPersonGreeting = `"Dear ${name},"`;
        } else if (isDuForm) {
            // Du-Form: strip title, use first name only
            const casualName = name.replace(/^(Herr|Frau|Mr\.?|Mrs\.?|Ms\.?)\s+/i, '').trim();
            contactPersonGreeting = `"Hallo ${casualName},"`;
        } else if (herrMatch) {
            contactPersonGreeting = `"Sehr geehrter ${name},"`;
        } else if (frauMatch) {
            contactPersonGreeting = `"Sehr geehrte ${name},"`;
        } else if (mrMatch) {
            contactPersonGreeting = `"Dear ${name},"`;
        } else if (mrsMatch) {
            contactPersonGreeting = `"Dear ${name},"`;
        } else {
            // No title detected → Claude infers gender from context
            contactPersonGreeting = `"Sehr geehrte/r ${name}," (nutze die wahrscheinlich korrekte Anrede basierend auf dem Namen, z.B. "Sehr geehrter Herr ${name}," oder "Sehr geehrte Frau ${name},")`;
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
${hasQuote ? 'ÖFFNUNG: Das Zitat und seine Formatierung werden durch Sektion 3 (Aufhänger) gesteuert. Starte NACH dem Zitat-Block mit einem konkreten, quantifizierbaren Fakt oder messbaren Ergebnis — ohne nochmal auf das Zitat zurückzugreifen.' : 'ÖFFNUNG: Starte mit einem konkreten, quantifizierbaren Fakt über das Unternehmen ODER einem eigenen messbaren Ergebnis. Kein allgemeines Statement.'}
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
${hasQuote ? 'ÖFFNUNG: Das Zitat und seine Formatierung werden durch Sektion 3 (Aufhänger) gesteuert. Starte NACH dem Zitat-Block — beginne direkt mit der Brücke zwischen dem Zitat und deiner persönlichen Erfahrung, ohne nochmals ein Zitat zu eröffnen.' : 'ÖFFNUNG: Beginne mit einer kurzen persönlichen Situation oder einem Schlüsselmoment deiner Karriere (max. 2 Sätze). Kein "Es war einmal", sondern ein konkreter Moment: "Als ich bei [Firma] zum ersten Mal [Situation erlebte], wusste ich..."'}
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
${hasQuote ? 'ÖFFNUNG: Das Zitat und seine Formatierung werden durch Sektion 3 (Aufhänger) gesteuert. Starte NACH dem Zitat-Block mit einer direkten, sachlichen Bezügnahme auf die Stelle.' : 'ÖFFNUNG: Direkte, höfliche Bezügnahme auf die Stelle. Keine Überraschungen, kein Storytelling. Sachlich und präzise. (z.B. "Die ausgeschriebene Position als [Titel] bei [Firma] verbindet [Kompetenzfeld A] mit [Kompetenzfeld B] — eine Schnittstelle, die meine bisherige Laufbahn durchzieht.")'}
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
    const isCustomStyle = ctx?.tone?.toneSource === 'custom-style';
    const hasPreset = !!ctx?.tone?.preset;

    // Custom Style: analyzed cover letter is the FULL tone source (not rhythm-only)
    // Detect if style is a genuine analysis vs. default fallback
    const isGenuineAnalysis = isCustomStyle && style && (
        (style.rhetorical_devices?.length ?? 0) > 0 ||
        (style.forbidden_constructs?.length ?? 0) > 0 ||
        style.tone !== 'professional' || // Default fallback always returns 'professional'
        typeof style.max_commas_per_sentence === 'number' // Any numeric extraction = genuine analysis
    );

    const customStyleBlock = isCustomStyle && style ? (
        isGenuineAnalysis
            // Full custom style from genuine analysis
            ? `STIL: DEIN EIGENER SCHREIBSTIL (aus deinem hochgeladenen Anschreiben)
Ton: ${style.tone}
Satzlänge: ${style.sentence_length}
Bevorzugte Konjunktionen: ${(style.conjunctions || []).join(', ') || 'Daher, Deshalb, Zudem'}
Begrüßung: ${style.greeting}
${(style.rhetorical_devices || []).length > 0 ? `Rhetorische Mittel: ${style.rhetorical_devices.join(', ')}` : ''}
${(style.forbidden_constructs || []).length > 0 ? `VERBOTEN (User nutzt diese NIE): ${style.forbidden_constructs.join(', ')}` : ''}

Du MUSST den Ton, die Satzstruktur und die Konjunktionen aus DIESEM Schreibstil übernehmen.
Der Output soll klingen, als hätte der Bewerber selbst geschrieben.
Nutze die extrahierten Konjunktionen statt generischer Übergänge.
Kalibriere deinen Output auf dieses Muster — übernimm den Stil, nicht den Inhalt.

${!style.rhetorical_contrast_pattern ? t('VERBOTEN: Die Struktur "nicht [nur] X, sondern [auch] Y" — der User nutzt sie nie.', 'FORBIDDEN: The structure "not [only] X, but [also] Y" — the user never uses it.') : ''}
${!style.uses_em_dash ? t('VERBOTEN: Gedankenstriche (– oder —) als Satzzeichen.', 'FORBIDDEN: Em-dashes (– or —) as punctuation.') : ''}
${t(`SATZBAU: Max. ${style.max_commas_per_sentence ?? 1} Komma(s) pro Satz — exakt wie im Stil des Users.`, `SENTENCE STRUCTURE: Max. ${style.max_commas_per_sentence ?? 1} comma(s) per sentence — exactly like the user's style.`)}`
            // Partial style: use what we have (rhythm data) but note limited calibration
            : `SCHREIBRHYTHMUS (aus Stilanalyse — nur teilweise verfügbar):
Satzlänge: ${style.sentence_length || 'medium'}
Bevorzugte Konjunktionen: ${(style.conjunctions || []).join(', ') || 'Daher, Deshalb, Zudem'}

Nutze diese Rhythmus-Daten für den Satzbau. Volle Stil-Kalibrierung ist nicht möglich (unvollständige Analyse).`
    ) : null;

    const styleSection = style && !isCustomStyle
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
- ROTER FADEN (optional): Wenn die Stellenanzeige ein prägnantes Schlüsselwort enthält (z.B. "Generalist", "Teamaufbau"), darfst du es im Intro UND im ersten Stations-Absatz organisch aufgreifen — nicht wörtlich kopieren, sondern als verbindendes Motiv nutzen.

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

⚠️ ANTI-GHOST-TRANSLATION (ABSOLUTES VERBOT): Das Zitat oben DARF NICHT übersetzt werden.
Es muss BUCHSTÄBLICH und WORTWÖRTLICH in der Sprache übernommen werden, in der es angegeben ist.
Egal ob das Anschreiben auf Deutsch oder einer anderen Sprache verfasst wird — das Zitat bleibt unverändert.

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
- ANTI-DOPPLUNG: Der Begründungssatz und der ERSTE Satz des nächsten Absatzes dürfen sich INHALTLICH NICHT überschneiden. Wenn beide denselben Gedanken enthalten (z.B. beide über "nachhaltige Wachstumsorientierung") → formuliere den nächsten Absatz-Start komplett anders.
${enablePingPong ? `
[PING-PONG EINLEITUNG — DU BIST NOCH IN DER EINLEITUNG, NICHT in Absatz 2]
Nach dem Zitat und dem Brückensatz fügst du ZWEI weitere Sätze hinzu (Antithese + Synthese):

ANTITHESE (1 Satz): Beschreibe, wie du diesen Gedanken früher ANDERS gesehen hast.
→ Formuliere es als Lernkurve oder Erkenntnisgewinn: "${t('Bei [CV-Station] dachte ich zunächst, dass...', 'At [CV-Station] I initially thought that...')}"
→ NIEMALS negativ über frühere Arbeitgeber klingen. Das ist VERBOTEN.
→ KEIN echter Fehler, kein Versagen — eine Perspektiventwicklung.
→ KEIN Pseudo-Kontrast wie "${t('Ich sah das ähnlich, aber jetzt noch mehr so.', 'I saw it similarly, but now even more so.')}" — Das ist VERBOTEN.

SYNTHESE (1 Satz): Verbinde die Erkenntnis DIREKT mit ${companyName} — baue eine konkrete Brücke.
→ PFLICHT: Der Satz muss einen konkreten ${companyName}-Bezug enthalten (Website, Werte, Projekt).
→ Beispiel: "${t(`Da ich gelesen habe, dass ${companyName} [konkreter Firmenbezug], möchte ich mich kurz vorstellen.`, `Having read that ${companyName} [specific company reference], I would like to briefly introduce myself.`)}"
→ KEINE abstrakte Reflexion ohne Firmenbezug. Der Leser muss verstehen WARUM genau DIESES Unternehmen.

LIMITS:
- EINLEITUNG darf aus MAX. 4 kurzen Abschnitten bestehen: Einleitungssatz + Zitat + Antithese + Synthese
- MAXIMAL 100 Wörter für den gesamten Einleitungsblock (Zitat mitgezählt)
- Dieser Block zählt NICHT als eigener der 4-5 Absätze des Anschreibens` : ''}` : '';

    const quoteBodyBlock = hasQuote ? `[REGEL: ZITAT IM HAUPTTEIL — STATION-1-EINLEITUNG]:
Das folgende Zitat MUSS WORTWORTLICH im Text stehen. Lass es NICHT weg!
Zitat: "${ctx!.selectedQuote!.quote}" (${ctx!.selectedQuote!.author})

⚠️ ANTI-GHOST-TRANSLATION (ABSOLUTES VERBOT): Das Zitat oben DARF NICHT übersetzt werden.
Es muss BUCHSTÄBLICH in der Sprache übernommen werden, in der es oben angegeben ist.
Egal ob das Anschreiben auf Deutsch oder einer anderen Sprache geschrieben wird — das Zitat bleibt unverändert.

PFLICHT-FORMAT:
"${ctx!.selectedQuote!.quote}"
– ${ctx!.selectedQuote!.author}

${t('Diesen Gedanken habe ich bei meiner Arbeit als [Rolle] bei [Firma] täglich gelebt, als ich [konkretes Beispiel]...', 'I lived this philosophy daily during my work as [Role] at [Company], when I [specific example]...')}

${t('Das Zitat dient als Brücke zwischen dem Vordenker und der konkreten Berufserfahrung. Maximal 2 Sätze für Zitat + Brücke, dann direkt in die Station.', 'The quote serves as a bridge between the thought leader and the specific professional experience. Maximum 2 sentences for quote + bridge, then directly into the station.')}` : '';

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
Formuliere es als Brücke: "${t(`Gerade weil ${companyName} kürzlich [News-Bezug], sehe ich meine Erfahrung in [nächste Station] als besonders relevant...`, `Precisely because ${companyName} recently [news reference], I see my experience in [next station] as particularly relevant...`)}"
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
"${t('In den ersten 90 Tagen würde ich drei Dinge priorisieren: Erstens [Problem der Firma → CV-Station]. Zweitens [zweites Problem → CV-Beweis]. Drittens [strategischer Ausblick].', 'During the first 90 days, I would prioritize three things: First [company problem → CV station]. Second [second problem → CV proof]. Third [strategic outlook].')}"
VERBOTEN: "${t('In den ersten 30 Tagen werde ich zuhören und verstehen', 'During the first 30 days I will listen and understand')}" — das ist FLUFF.
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
"${t('In den ersten 90 Tagen würde ich drei Dinge priorisieren: Erstens [Anforderung → CV-Beweis]. Zweitens [zweite Anforderung → Beweis]. Drittens [strategischer Ausblick].', 'During the first 90 days, I would prioritize three things: First [requirement → CV proof]. Second [second requirement → proof]. Third [strategic outlook].')}"
VERBOTEN: "${t('In den ersten 30 Tagen werde ich zuhören und verstehen', 'During the first 30 days I will listen and understand')}" — das ist FLUFF.
VERBOTEN: Mehr als 60 Wörter für diesen Block.`;
        }
    }

    let painPointSection = '';
    if (modules.painPointMatching !== false) { // Default: true
        painPointSection = `[REGEL: PAIN POINT MATCHING — IMPLIZITE FIRMENSCHMERZEN]
Analysiere die Stellenbeschreibung auf implizite Probleme:
- Explizit gesucht (z.B. Python, Teamführung) = Skill Match → direkt benennen
- Impliziter Schmerz (z.B. "Aufbau eines neuen Teams" = Wachstumsproblem) → Zeige mit einer konkreten CV-Station, wo genau du das schon gelöst hast
TON: Sachlich beobachten und Best-Practice-Transfer anbieten. Nicht "Ich bin der Ideale" oder "Ich werde das lösen" — sondern "Ich sehe [Problem]. Bei [Station] habe ich ähnliche Erfahrungen gesammelt."
VERBOTEN: Retter-Komplex, Heilsversprechen, Selbstbewertung als "idealer Kandidat".`;
    }

    let vulnerabilitySection = '';
    if (modules.vulnerabilityInjector) {
        vulnerabilitySection = `[REGEL: VULNERABILITY INJECTOR — MAX. 2x VERWENDEN]
Baue 1-2 strategische, authentische Schwächen oder Lernkurven ein.
Format: "${t('Bei [Station] lernte ich schnell, dass mein erster Ansatz [Problem] zu komplex war. Über Umwege stieß ich auf ein Prinzip, das ich auch in den Werten/auf der Website des Unternehmens wiederfinde.', 'At [Station] I quickly learned that my initial approach to [problem] was too complex. Through trial and error I discovered a principle that I also see reflected in the company\'s values/website.')}"
WICHTIG: Die Lernkurve MUSS an einen KONKRETEN Firmenwert gebunden werden (z.B. aus ${JSON.stringify(company?.company_values?.slice(0, 2) || [])}). Generische Platzhalter wie "eure Philosophie" sind VERBOTEN.
REGELN:
- Darf NIE wie eine Entschuldigung klingen — immer als Wachstum framen
- MAXIMAL 2 Stellen im gesamten Anschreiben
- Jede Vulnerability MUSS in [VUL]...[/VUL] Tags eingeschlossen werden (wird nach Generierung automatisch geprüft und entfernt)
- Beispiel: ${t('[VUL]Bei Fraunhofer lernte ich schnell, dass...[/VUL]', '[VUL]At Fraunhofer I quickly learned that...[/VUL]')}`;
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
→ KEIN explizites Naming der Persona im Text. Der Kandidat soll nicht zeigen, dass er recherchiert hat WER liest — nur WOVON diese Person überzeugt wäre.${ctx?.tone.contactPerson ? `\n→ ANREDE-SCHUTZ: Die Anrede ist AUSSCHLIESSLICH ${contactPersonGreeting}. NIEMALS den Persona-Namen "${persona.name}" für die Anrede nutzen. Die Persona beeinflusst nur Ton und Argumentation.` : ''}`;
    }

    const wordCountFeedback = (() => {
        if (lastWordCount > 380) {
            return t(
                `WORTANZAHL: Vorherige Version hatte ${lastWordCount} Wörter — ZU LANG. Kürze um ${lastWordCount - 350} Wörter. Maximal 3 Sätze pro Absatz.`,
                `WORD COUNT: Previous version had ${lastWordCount} words — TOO LONG. Shorten by ${lastWordCount - 350} words. Maximum 3 sentences per paragraph.`
            );
        }
        if (lastWordCount < 250 && lastWordCount > 0) {
            return t(
                `WORTANZAHL: Vorherige Version hatte ${lastWordCount} Wörter — ZU KURZ. Füge ${280 - lastWordCount} Wörter hinzu. Erweitere den Beweis-Absatz.`,
                `WORD COUNT: Previous version had ${lastWordCount} words — TOO SHORT. Add ${280 - lastWordCount} words. Expand the proof paragraph.`
            );
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
=== ${t('SEKTION 1: ROLLE & OUTPUT-FORMAT', 'SECTION 1: ROLE & OUTPUT FORMAT')} ===
${t('Du bist ein Senior-Karriereberater und exzellenter Schreiber.', 'You are a senior career advisor and excellent writer.')}
${t(`Deine Aufgabe: Schreibe ein Anschreiben für die Stelle "${jobTitle}" bei "${companyName}".`, `Your task: Write a cover letter for the position "${jobTitle}" at "${companyName}".`)}

OUTPUT-REGELN (CRITICAL — NIEMALS BRECHEN):
- ${t('Nur der reine Briefkörper: Von der Anrede bis zur Grußformel', 'Only the pure letter body: From the salutation to the closing formula')}
- ${t('KEIN Datum, KEINE Adresszeilen, KEIN Betreff', 'NO date, NO address lines, NO subject line')}
- KEIN Markdown: kein **bold**, kein *italic*, keine - Bullet-Points im Text
- Sprache: ${lang} — ${t('keine einzige Ausnahme', 'no single exception. The ENTIRE letter must be in English')}
- Länge: ${modules.first90DaysHypothesis
            // WHY: Der 90-Tage-Block kostete ~60 Wörter extra. Ohne Budget-Reduktion
            // überschreitet das Anschreiben eine DIN-A4-Seite. Der Haupttext wird daher
            // auf max. 340 Wörter begrenzt, sodass der Gesamtbrief bei 350-400 Wörtern bleibt.
            ? '260–340 Wörter (exkl. 90-Tage-Block), 4–5 Absätze. Der 90-Tage-Plan ist ein eigener, kompakter Absatz (max. 60W) und zählt NICHT zum Haupttext.'
            : '280–380 Wörter, 4–5 Absätze'
        }
- Absätze getrennt durch eine Leerzeile
- ${t('SATZBAU (ABSOLUTES LIMIT): Maximal 30 Wörter pro Satz. Ideal: 20–25 Wörter. Lange Schachtel­sätze mit Nebensätzen sind STRENG VERBOTEN. Wenn ein Gedanke länger wäre, TEILE IHN in zwei kurze Sätze auf.', 'SENTENCE LENGTH (ABSOLUTE LIMIT): Maximum 30 words per sentence. Ideal: 20–25 words. Long, nested sentences with sub-clauses are STRICTLY FORBIDDEN. If a thought would be longer, SPLIT IT into two short sentences.')}
- Beginne direkt mit der Anrede: ${contactPersonGreeting}${ctx?.tone.contactPerson ? ` — ZWINGEND: Nutze EXAKT diese Anrede. NIEMALS auf generische Alternativen wie "Dear Hiring Manager", "Sehr geehrte Damen und Herren" etc. ausweichen. Der Name des Ansprechpartners ist gesetzt.` : ''}
- Anrede-Form: ${isDuForm ? 'DU-FORM (du/dein/euch/dir). Wende diese Du-Form STRIKT auf das GESAMTE Anschreiben an. Kein "Sie" oder "Ihnen" — NIEMALS.' : 'SIE-FORM (Sie/Ihr/Ihnen). Wende diese Sie-Form STRIKT auf das GESAMTE Anschreiben an.'}

=== SEKTION 2: TONALITÄT & STIL (HÖCHSTE PRIORITÄT) ===
${isCustomStyle && customStyleBlock
            ? `MODUS: EIGENER SCHREIBSTIL (Custom Style)
${customStyleBlock}`
            : isCustomStyle && !customStyleBlock
                // Race-Condition Fallback: User selected custom-style but style analysis is not yet ready.
                // Fallback to preset so the AI always has a tone instruction — never falls into a void.
                ? `MODUS: FALLBACK AUF PRESET (Stil-Analyse noch nicht verfügbar)
PRESET: ${ctx?.tone.preset || 'formal'}
${activeTone}

HINWEIS: Schreibe professionell und präzise. Stil-Kalibrierung nicht möglich (Analyse ausstehend).`
                : `PRESET: ${ctx?.tone.preset || 'formal'}
${activeTone}`}

${isCustomStyle ? '' : styleSection}

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

[MANDATORY — TRANSITION SENTENCE]: ${introGuidance && hasQuote && focus === 'quote' ? (isEnglish ? 'The INTRODUCTION (after the quote and the bridging sentence)' : 'Die EINLEITUNG (nach dem Zitat und dem Begründungssatz)') : (isEnglish ? 'The FIRST paragraph' : 'Der ERSTE Absatz')} MUST end with this exact sentence:
${isEnglish ? '"That is why I would like to briefly introduce myself."' : isDuForm ? '"Daher möchte ich mich bei euch kurz vorstellen."' : '"Daher möchte ich mich bei Ihnen kurz vorstellen."'}
This sentence is NOT optional. It bridges to the main body.

${newsSection}

=== SEKTION 4: KARRIERE-BEWEISE (FOLGENDE ABSÄTZE) ===
Integriere diese Stationen als fließende Prosa — WICHTIG: Erstelle für jede gewählte Station einen eigenen Absatz.

ANTI-REPETITIONS-REGEL (KRITISCH):
Jeder Stations-Absatz MUSS mit einem ANDEREN Einleitungssatz beginnen.
VERBOTEN: Denselben Einleitungstyp oder dieselbe Satzstruktur für zwei aufeinanderfolgende Absätze zu verwenden.
Beispiel VERBOTEN: „Die Verbindung von X und Y bei Firma A..." gefolgt von „Die Verbindung von X und Y bei Firma B..."
Jeder Absatz muss einen eigenen Einstieg haben: Mal ein konkretes Ergebnis, mal ein Kontext-Setting, mal eine Problemstellung.

ABSATZ-DICHTE (PFLICHT): Jeder Stations-Absatz im Hauptteil MUSS mindestens 3 Sätze enthalten. Ein Absatz mit nur 1-2 Sätzen ist ZU DÜNN und wirkt oberflächlich.

SATZVARIANZ — "habe ich"-LIMIT: Die Formulierung "habe ich" darf im GESAMTEN Anschreiben maximal 2x vorkommen und NIEMALS in aufeinanderfolgenden Sätzen. Varianten: "konnte ich", "gelang es mir", aktive Konstruktionen ("Ich leitete", "Dort steuerte ich"), Nominalstil ("Meine Arbeit bei X umfasste...").

${bodyIntegrationGuidance}

${stationsSection}

Job-Anforderungen für die Relevanzkontrolle:
${JSON.stringify(job?.requirements?.slice(0, 3) || [], null, 2)}

Unternehmens-Kontext (ALLE verfügbaren Daten — nutze für spezifische Verbindungen):
Werte: ${JSON.stringify((company?.company_values || []).slice(0, 10))}
Tech: ${JSON.stringify((company?.tech_stack || []).slice(0, 10))}
${company?.current_challenges?.length ? `Aktuelle Herausforderungen: ${JSON.stringify(company.current_challenges)}` : ''}
${company?.roadmap_signals?.length ? `Roadmap-Signale: ${JSON.stringify(company.roadmap_signals)}` : ''}
${company?.recent_news?.length ? `Aktuelle News: ${JSON.stringify(company.recent_news.slice(0, 3))}` : ''}
HALLUZINATIONS-BREMSE: Verwende NUR Fakten (Ort, News, Werte, Challenges), die EXPLIZIT oben stehen. Wenn ein Datum fehlt → ERFINDE NICHTS, weiche auf allgemein belegbare Aussagen aus.

${cvInput}

${first90DaysSection}

${painPointSection}

${vulnerabilitySection}

${personaSection}

=== SECTION 5: CLOSING & CALL TO ACTION ===
[RULE: CLOSING]
- FORBIDDEN: Do NOT summarize career stations or experience again at the end. That is filler.
${hasQuote && (preset === 'storytelling' || preset === 'philosophisch')
    ? '- KLAMMER-OPTION: Du DARFST im letzten Satz auf den Gedanken aus der Einleitung zurückgreifen — als inhaltliche Klammer. Kein wörtliches Zitieren, sondern eine kurze Rück-Referenz. Nur wenn es sich natürlich anfühlt.'
    : '- FORBIDDEN: Do NOT repeat the quote or hook from the opening paragraph.'}
- The closing sentence is a DIRECT, SHORT call-to-action at eye level (max 2 sentences). Wähle den Ton passend zum Preset:
  Souverän-knapp: ${isEnglish ? '"If the timing works: I am available over the coming weeks."' : isDuForm ? '"Wenn der Termin passt: Ich bin die nächsten Wochen flexibel."' : '"Wenn es zeitlich passt: Ich bin in den kommenden Wochen verfügbar."'}
  Verbindlich: ${isEnglish
    ? '"I would welcome the opportunity to discuss in a brief call how I could contribute to [specific point] at ' + companyName + '."'
    : isDuForm
        ? '"Ich würde mich freuen, in einem kurzen Gespräch zu zeigen, wie ich [konkreter Punkt] bei euch vorantreiben kann."'
        : '"Lassen Sie uns in einem kurzen Gespräch ausloten, wie ich [konkreter Punkt] bei Ihnen vorantreiben kann."'}
- Sign-off: ${isEnglish ? 'End with "Kind regards," or "Best regards," — NEVER use German closing formulas like "Mit freundlichen Grüßen".' : 'Beende mit "Mit freundlichen Grüßen" oder (bei Du-Form) "Viele Grüße".'}

=== ${t('SEKTION 6: VERBESSERUNGS-FEEDBACK', 'SECTION 6: IMPROVEMENT FEEDBACK')} ===
${feedbackSection || t('Erste Version — kein vorheriges Feedback.', 'First version — no previous feedback.')}

${t('Schreibe jetzt das Anschreiben. Beginne direkt mit der Anrede:', 'Write the cover letter now. Start directly with the salutation:')}
`.trim();
}
