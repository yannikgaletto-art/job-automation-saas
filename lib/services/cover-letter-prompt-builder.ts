/**
 * Cover Letter Prompt Builder — Pure Function
 *
 * Extracted from cover-letter-generator.ts for maintainability.
 * No DB dependencies, no Supabase imports — input in, prompt string out.
 */

import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';
import { buildLeanBlacklistSection } from './anti-fluff-blacklist';
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
    responsibilities?: string[] | null; // §Fix C: extracted tasks from job description
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
    const isSpanish = ctx?.tone?.targetLanguage === 'es';
    const lang = isEnglish ? 'English' : isSpanish ? 'Español' : 'Deutsch';
    // Locale helper: returns localized string. ES falls back to EN if no Spanish variant provided.
    const t = (de: string, en: string, es?: string) => isEnglish ? en : isSpanish ? (es || en) : de;
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
            // Du-Form: use first name if available; keep title+lastname if only formal name given
            const titleMatch = name.match(/^(Herr|Frau|Mr\.?|Mrs\.?|Ms\.?)\s+/i);
            if (titleMatch) {
                const afterTitle = name.replace(titleMatch[0], '').trim();
                const nameParts = afterTitle.split(/\s+/);
                if (nameParts.length >= 2) {
                    // "Frau Anna Brecht" → "Hallo Anna,"
                    contactPersonGreeting = `"Hallo ${nameParts[0]},"`;
                } else {
                    // "Frau Brecht" (no first name) → "Hallo Frau Brecht,"
                    contactPersonGreeting = `"Hallo ${name},"`;
                }
            } else {
                // No title: "Anna Brecht" → "Hallo Anna,"
                const nameParts = name.split(/\s+/);
                contactPersonGreeting = `"Hallo ${nameParts[0]},"`;
            }
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
    // §Fix A: style.greeting ONLY as fallback when contactPerson is explicitly provided
    // (prevents template names like "Liebe Anna-Nicole" from bleeding into the greeting
    //  when user chose "Sie ohne Namen")
    } else if (style?.greeting
        && style.greeting !== 'Sehr geehrte Damen und Herren'
        && ctx?.tone.contactPerson // Guard: only use style greeting if user set a contactPerson
    ) {
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

    // DSGVO §14: Strip PII from CV before prompt embedding.
    // Claude needs career content (roles, companies, skills) but NOT name/address/phone.
    // The greeting logic has its own contactPerson binding (line 72-131) and is independent.
    const cvDataForPrompt = { ...(profile?.cv_structured_data || {}) };
    delete cvDataForPrompt.personalInfo;  // camelCase variant
    delete cvDataForPrompt.personal_info; // snake_case variant

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
${JSON.stringify(cvDataForPrompt, null, 2)}`
            : `KANDIDATEN-LEBENSLAUF:
${JSON.stringify(cvDataForPrompt, null, 2)}`;

    // ─── Early declarations needed by toneInstructions template literals ────────
    const hasQuote = !!ctx?.selectedQuote;

    // ─── Tone Instructions (B1.5: Jeder Stil verändert GESAMTE Prompt-Struktur) ─
    const toneInstructions: Record<string, string> = {
        'storytelling': `STIL: NARRATIV & PERSOENLICH
${hasQuote ? 'OEFFNUNG: Das Zitat und seine Formatierung werden durch Sektion 3 (Aufhaenger) gesteuert. Starte NACH dem Zitat-Block — beginne direkt mit der Bruecke zwischen dem Zitat und deiner persoenlichen Erfahrung, ohne nochmals ein Zitat zu eroeffnen.' : `OEFFNUNG (OHNE ZITAT — mit Firmenbezug):
Beginne mit einem KONKRETEN Bezug zum Unternehmen oder zur Stellenanzeige. Max. 2-3 Saetze.
MOEGLICHE OPENER (waehle EINE Variante):
- "Als ich auf eurer Website las, dass [konkreter Fakt]..." / "Als ich euer Projekt [X] sah..."
- "Da ihr Unterstuetzung in [Bereich aus Stellenanzeige] sucht, sind mir einige Parallelen zu meinen Stationen aufgefallen..."
- "Euer Ansatz bei [Thema aus Analyse] hat mich angesprochen, weil ich bei [eigene Firma] aehnliches erlebt habe."

Danach: Erklaere kurz WARUM dich das anspricht und leite zur Vorstellung ueber ("Daher moechte ich mich kurz vorstellen.").
VERBOTEN: Allwissende Branchen-Statements, "echten Mehrwert", "moechte ich mich" doppelt, mehr als 3 Saetze.`}
ABSATZ-STRUKTUR: Jede CV-Station wird als Mini-Geschichte erzaehlt:
- Situation (1 Satz): Was war der Kontext/die Herausforderung?
- Handlung (1 Satz): Was hast du konkret getan?
- Ergebnis (1 Satz): Was kam dabei heraus; und was hat es dir beigebracht?
DRAMATURGIE:
- Verbinde die Stationen zu einem kohaerenten Karriere-Narrativ: Jede Station baut auf der vorherigen auf
- Das "Warum" ist wichtiger als das "Was" — zeige Motivation und Entwicklung
- Erlaube 1-2 persoenliche Aussagen zur Motivation (aber kein Pathos)
- Die rote Linie: Alle Absaetze fuehren logisch zur Bewerbung bei DIESER Firma
RHETORISCHE WUERZUNG (PFLICHT in diesem Stil): Verwende MINDESTENS 1 rhetorisches Stilmittel (Trikolon, Asyndeton oder Anadiplose). Max. 2 gesamt.
SCHLUSS-REGEL: Wird von Sektion 5 gesteuert — hier KEINE Schluss-Anweisungen.
VERBOTEN: Aufzaehlungen, Bullet-Points-Stil, trockene Fakten ohne Kontext, "Mein Werdegang zeigt..."

--- FEW-SHOT REFERENZ-BEISPIELE (Storytelling) ---
BEISPIEL INTRO (mit Zitat, Du-Form):
"beim Lesen des Telekom-Cases liess mich der Loop Approach hellhoerig werden; denn er erinnerte mich an das Zitat von Saint-Exupery: [ZITAT]. Die Sehnsucht nach dem eigenen Gestalten und damit Teams zu befaehigen sich selbst zu steuern begleiten mich durch viele Stationen in meiner Karriere. Gestalten braucht aber einen Ort, der das zulaesst und diesen Ort erkenne ich in Eurer Arbeit. Deshalb moechte ich mich kurz vorstellen."

BEISPIEL STATIONS-ABSATZ (narrativ):
"Fuer mich bedeutet 'zwischen Technologie und Mensch vermittelt', die Faehigkeit zu besitzen, zwei Sprachen zu sprechen. Diese Uebersetzungsleistung habe ich als Projektleiter einer Quantum-Computing-Gruppe bei Fraunhofer FOKUS taeglich angewendet. Dort unterstuetzte ich Softwareentwickler dabei, ihre Ideen in marktfaehige Business-Modelle zu uebersetzen; mit Kickoffs, OKR-Roadmaps und Stakeholdermanagement. Die zentrale Frage war dabei immer: Loesen wir das, was der Nutzer wirklich braucht?"
--- ENDE FEW-SHOT ---`,

        'formal': `STIL: STRUKTURIERT & PRAEZISE (vereint klassisch-formelle Haltung mit datengetriebener Argumentation)
${hasQuote ? 'OEFFNUNG: Das Zitat und seine Formatierung werden durch Sektion 3 (Aufhaenger) gesteuert. Starte NACH dem Zitat-Block mit einer direkten, sachlichen Bezugnahme auf die Stelle.' : `OEFFNUNG (OHNE ZITAT — mit Stellen-/Firmenbezug):
Beginne mit einer direkten, hoeflichen Bezugnahme auf die Stelle und einem konkreten Firmenbezug aus der Unternehmensanalyse. Max. 2-3 Saetze.
Beispiel: "Die ausgeschriebene Position als [Titel] bei [Firma] verbindet [Kompetenzfeld A] mit [Kompetenzfeld B] — eine Verbindung, die meine bisherige Laufbahn praegt."
VERBOTEN: Allwissende Branchen-Statements, "echten Mehrwert", "moechte ich mich" doppelt.`}
ABSATZ-STRUKTUR: Jeder Hauptabsatz folgt dem Schema: Claim -> Beweis (Zahl/KPI/konkretes Ergebnis) -> Implikation fuer den neuen Arbeitgeber.
Konservative 4-Absatz-Struktur:
1. Einstieg + Motivation (2-3 Saetze)
2. Fachliche Qualifikation mit Belegen (3-4 Saetze)
3. Unternehmens-Passung + kulturelle Verbindung (2-3 Saetze)
4. Souveraener Abschluss (1-2 Saetze)
BEWEISFUEHRUNG:
- Nutze konkrete Zahlen, Prozentsaetze und messbare Resultate wenn im CV vorhanden
- Struktur pro Achievement: "Ich habe [X] durch [Y] erreicht, was [Z] bewirkte"
- Aktive Verben: implementiert, gesteigert, reduziert, aufgebaut, verantwortet, optimiert
TONALITAET:
- Vollstaendige Formulierungen, keine Kontraktionen
- Passiv vermeiden, aber formelle Anrede konsequent beibehalten (Sie/Ihnen/Ihr bei Sie-Form)
- Keine Ausrufezeichen, keine rhetorischen Fragen (ausser mit Zitat-Bridging)
- Serioese Uebergaenge: "Darueber hinaus", "In gleicher Weise", "Vor diesem Hintergrund"
SCHLUSS-REGEL: Wird von Sektion 5 gesteuert — hier KEINE Schluss-Anweisungen.
VERBOTEN: Umgangssprache, Emojis, "Ich brenne fuer", persoenliche Anekdoten ohne Stellenbezug, Adjektive ohne Beleg.

--- FEW-SHOT REFERENZ-BEISPIELE (Formal) ---
BEISPIEL INTRO (ohne Zitat, Sie-Form):
"Ihre Ausschreibung beschreibt eine Rolle, die ich aus verschiedenen Blickwinkeln kenne: als Berater bei Fraunhofer FOKUS, als Co-Founder bei Xorder Menues und zuletzt im B2B-Vertrieb bei Ingrano Solutions. Dabei stand haeufig dieselbe Frage im Mittelpunkt: Wie uebersetzt man eine gute Idee in etwas, das Menschen wirklich nutzen? Ich glaube, das ist genau das, was Sie mit der 'Bruecke zwischen Strategie und Umsetzung' meinen — und deshalb bewerbe ich mich als [Jobtitel] bei Ihnen."

BEISPIEL STATIONS-ABSATZ (strukturiert):
"B2B-Kunden mit regulatorischem Handlungsbedarf zu identifizieren, Audit-Mandate strategisch zu platzieren und Stakeholder-Analysen fuer die Fuehrungsebene aufzubereiten, beschreibt meinen Alltag bei Ingrano Solutions. Zwei Dinge nehme ich aus dieser Zeit mit: Vertrieb funktioniert dann, wenn man das Problem des Kunden frueher versteht als er selbst. Und wirksame Angebote entstehen fast immer aus der Qualitaet der Fragen, die davor gestellt wurden."

BEISPIEL INTRO (mit Zitat, Sie-Form):
"Ihre Ausschreibung nennt 'strategische Empfehlungen entwickeln und dabei unterschiedliche Perspektiven integrieren'. Nach meiner Erfahrung gelingt das nur, wenn man versteht, warum jede Perspektive so denkt wie sie denkt. Simon Sinek hat das auf einen Satz gebracht: [ZITAT]. Mit anderen Worten: Wer nur fragt was eine Organisation tut, versteht ihre Entscheidungen nicht. In jedem Projekt, das ich begleitet habe — von der KI-Strategieberatung bei Fraunhofer FOKUS bis zur B2B-Transformation bei Ingrano Solutions — war der Einstieg immer derselbe: erst das Warum verstehen, dann die Loesung entwickeln."
--- ENDE FEW-SHOT ---`,
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
- Nenne den Kontext kurz, aber fokussiere dich zu 70% auf den erlernten WERT (Was hat der Kandidat gelernt? Warum ist das für den neuen Arbeitgeber relevant?).
- REDUZIERE BUZZWORDS DRASTISCH. Pro Absatz maximal 2 zentrale Fachbegriffe. Wenn eine CV-Station viele Technologien enthält, erwähne NUR diejenige, die absolut essenziell für die ausgeschriebene Stelle ist. Lass alles andere weg.
- ROTER FADEN (optional): Wenn die Stellenanzeige ein prägnantes Schlüsselwort enthält (z.B. "Generalist", "Teamaufbau"), darfst du es im Intro UND im ersten Stations-Absatz organisch aufgreifen — nicht wörtlich kopieren, sondern als verbindendes Motiv nutzen.

` + ctx.cvStations.map(s => {
            const hasUserContext = s.userContext && s.userContext.trim().length > 5;
            return `Station ${s.stationIndex}: ${s.role} @ ${s.company} (${s.period})${hasUserContext ? `
  → 🎯 BEWERBER-KONTEXT (HÖCHSTE PRIORITÄT — nutze als primären Erzählanker):
    "${s.userContext!.trim()}"
    REGEL: Baue den Absatz um DIESEN Kontext herum. Der Bewerber hat dir gesagt, was an dieser Station relevant ist. Nutze die Bullets unten nur als Stütze, nicht als Hauptinhalt.` : ''}
  → Beweis für Job-Anforderung: "${s.matchedRequirement}"
  → Schlüssel-Achievement: "${s.keyBullet}"
  → Alle Stärken dieser Station (nutze als inhaltliche Basis):
${(s.bullets || []).slice(0, 4).map(b => `     • ${b}`).join('\n')}
  → Zeige im Text: ${s.intent}

  → ROTER FADEN (PFLICHT für JEDEN Stations-Absatz):
    Beginne JEDEN Stations-Absatz mit einer Verknüpfung, die dem Recruiter erklärt WARUM diese Erfahrung relevant ist.

    §STATIONS-OPENER (waehle fuer JEDEN Absatz EINE andere Variante — nie dieselbe zweimal):

    Wenn Kernaufgaben extrahiert wurden, zitiere ein KURZES FRAGMENT (2-5 Woerter) in Anfuehrungszeichen als Bruecke.
    HALLUZINATIONS-SCHUTZ: Max. 5 Woerter, NUR Arbeitsthemen (nicht Teamstrukturen/Organisationsformen). Unsicher? Paraphrasiere OHNE Anfuehrungszeichen.

    VARIANTEN-POOL (waehle passend zum Inhalt, nie nach Position):
    A) \"„[2-5 Woerter Kernaufgabe]", genau an diesem Thema habe ich bei [Firma] gearbeitet.\"
    B) \"Zudem habe ich mich in der „[2-5 Woerter]" wiedergefunden, da es zu meiner Arbeit bei [Firma] gehoerte.\"
    C) \"Auch in meiner Rolle bei [Firma] habe ich „[2-5 Woerter]" direkt umgesetzt.\"
    D) \"Ebenso zeigte mir meine Zeit bei [Firma], dass [konkreter Inhalt zur Job-Anforderung].\"
    E) \"Was ich noch einbringen kann, ist meine Erfahrung bei [Firma] im Bereich [konkretes Thema].\"
    F) \"Da ${isDuForm ? 'eure' : 'Ihre'} Ausschreibung [Thema] betont, kann ich mit meiner Zeit bei [Firma] anknuepfen, wo ich [konkretes Achievement].\"

    VERBOTEN: \"Zudem kann ich mit meiner Zeit bei [Firma] anknuepfen.\" alleine — IMMER \"da/weil/was\" mit konkretem Inhalt.
    VERBOTEN: \"Weil ${isDuForm ? 'ihr jemanden sucht' : 'Sie jemanden suchen'}\" / \"Da ${isDuForm ? 'ihr' : 'Sie'} jemanden ${isDuForm ? 'sucht' : 'suchen'}, der...\" — Meta-Formulierung.
    VERBOTEN: \"Moechte ich...\"/\"Kann ich hier anmerken...\"/\"Darf ich erwaehnen...\" als Satzanfang.
    VERBOTEN: \"Als ich die Stellenbeschreibung las, fielen mir Parallelen zu...\" — generisch.
    VERBOTEN: Stations-Absatz mit \"Bei [Firma] habe ich...\" starten OHNE Bezug zum WARUM.

    INHALTLICHE KOHAERENZ: Opener MUSS zur tatsaechlichen Stationsarbeit passen. Wenn Station die Anforderung NICHT belegt: andere Anforderung waehlen oder ohne falschen Bezug einsteigen.`;
        }).join('\n');
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
    // hasQuote already declared above toneInstructions (needed for quote-based presets)
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
- ABSOLUT VERBOTEN: Das Zitat als ALLERERSTEN Satz des Anschreibens platzieren. Der Einleitungssatz (Firmenbezug) kommt IMMER VOR dem Zitat. Reihenfolge: Anrede → Einleitungssatz → Zitat → Bruecke. NIEMALS: Anrede → Zitat (wirkt wie ein Epigraph).
- Leite das Zitat mit einer KONKRETEN SITUATION ein (1 Satz — kuerzer ist besser).

  PFLICHT — FIRMA ZUERST (NICHT VERHANDELBAR):
  Der Einleitungssatz VOR dem Zitat MUSS einen konkreten Bezug zu ${companyName} oder zur Stellenanzeige enthalten.
  Ein reines CV-Erlebnis OHNE Bezug zur Ziel-Firma ist als Einleitungssatz VERBOTEN.
  Reihenfolge: Firmenbezug → Zitat → CV-Bruecke. NICHT: CV → Zitat → Firma.

  Waehle EINE der folgenden Strategien — nicht immer dieselbe:

  STRATEGIE A — Firmenbeobachtung fuehrt zum Zitat (BEVORZUGT):
  Beschreibe in 1 Satz, was du in der Unternehmensanalyse oder auf der Website entdeckt hast, und leite daraus zum Zitat ueber.
  Der Uebergang zum Zitat soll NATUERLICH klingen — als wuerdest du einem Freund erzaehlen, woran dich das erinnert hat.
  MOEGLICHE Uebergaenge (als INSPIRATION, NIEMALS 1:1 kopieren — formuliere jedes Mal NEU):
  - Ein Gedanke, der aufkam / aufgefallen ist
  - Eine Erinnerung an ein Zitat
  - Ein Zusammenhang, den du siehst
  - Eine Parallele, die dir bewusst wurde
  PFLICHT: Der Firmenbezug MUSS aus einer der folgenden Quellen stammen (Prioritaet absteigend):
  1. Unternehmensanalyse (Werte, Projekte, News, Challenges) — BEVORZUGT
  2. Stellenanzeige (Kernaufgaben, Anforderungen, Teamkontext)
  3. FALLBACK (nur wenn 1 und 2 leer): Subjektiver Bezug auf die Stelle selbst — ICH-Perspektive, ehrlich, ohne erfundene Fakten.
  NIEMALS: Firmenfakten erfinden, die oben im Prompt nicht stehen.

  STRATEGIE B — Stellenanzeigen-Fragment als Bruecke (BEVORZUGT wenn JD detailliert):
  Nimm 2-5 Woerter EXAKT aus der Stellenanzeige (in Anfuehrungszeichen) und baue daraus die Bruecke zum Zitat.
  PFLICHT: Das Fragment MUSS EXAKT aus den KERNAUFGABEN oder dem Stellen-Kontext stammen.

  STRATEGIE C — CV-Erlebnis mit expliziter Firmen-Verknuepfung (Fallback wenn Analyse-Daten duenn):
  Starte mit einer konkreten Erfahrung aus deinem CV und verknuepfe sie explizit mit ${companyName}.
  PFLICHT: Die Verknuepfung MUSS explizit sein. Allein stehend = VERBOTEN.

  VARIANZ-PFLICHT (KRITISCH): Jeder Einleitungssatz MUSS einzigartig formuliert sein.
  VERBOTEN: Dieselbe Satzstruktur oder Formulierung in verschiedenen Anschreiben wiederverwenden.
  Pruefe dich selbst: "Klingt dieser Satz, als haette ihn ein Template generiert, oder als haette ihn ein Mensch spontan formuliert?"

  ❌ VERBOTEN: "hat mich ein Gedanke begleitet" — wurde zu oft generiert, ist jetzt eine KI-Schablone.
  ❌ VERBOTEN: "wurde mir klar" / "wurde mir bewusst" / "ist mir klargeworden" — allwissend.
  ❌ VERBOTEN: "musste ich an [Autor] denken" — Name-Dropping verboten wenn Signatur-Zeile den Autor nennt.
  ❌ VERBOTEN: "fiel mir auf:" mit Doppelpunkt — KI-Marker.
  ❌ VERBOTEN: "Als ich ueber [Thema] nachdachte..." — zu abstrakt.
  ❌ VERBOTEN: Mehr als 2 Saetze vor dem Zitat — Komm schnell auf den Punkt.
- Das Zitat MUSS auf einer EIGENEN Zeile stehen, in Anfuehrungszeichen.

AUTOR-NENNUNG (PFLICHT — NICHT VERHANDELBAR):
Das Zitat MUSS IMMER eine Signatur-Zeile unter dem Zitat haben:
"– ${ctx!.selectedQuote!.author}"
Diese Signatur-Zeile ist PFLICHT und darf NIEMALS weggelassen werden.
Der Autorenname darf ZUSAETZLICH im Einleitungssatz vorkommen (z.B. "...erinnerte mich an ein Zitat von ${ctx!.selectedQuote!.author}:"), ist dort aber OPTIONAL.
NIEMALS das Zitat OHNE Autor-Zuordnung lassen — das ist ein KRITISCHER FEHLER.

  [Zitat-Bruecke — DIREKT NACH dem Zitat]

- DIREKT NACH dem Zitat: Eine ZITAT-BRUECKE (max. 2 Saetze):
  ANTI-REDUNDANZ: Keine CV-Station namentlich nennen, die im Hauptteil einen eigenen Absatz bekommt.

  Satz 1 — Verbindung zwischen ZITAT-INHALT und STELLE/FIRMA:
  PFLICHT: Der Brueckensatz muss den KONKRETEN GEDANKEN des Zitats aufgreifen und mit der Stelle oder ${companyName} verbinden.
  VERBOTEN: Generische Floskeln die zu JEDEM Zitat passen wuerden ("Dieses Prinzip praegt meinen Arbeitsstil grundlegend").
  STATTDESSEN: Was bedeutet genau DIESES Zitat fuer genau DIESE Stelle? Was ist die inhaltliche Verbindung?
  TEST: Wenn man das Zitat austauscht und der Brueckensatz trotzdem passt → er ist zu generisch. Neu schreiben.

  Satz 2 — Ueberleitung zur Bewerbung:
  Leite von der Zitat-Reflexion zur konkreten Bewerbung ueber: Warum bewirbst du dich als [Jobtitel]?
  Optional: Anadiplose (Ende von Satz 1 = Anfang von Satz 2) — nur wenn es natuerlich klingt.
  ❌ VERBOTEN: Saetze die mit einem Doppelpunkt enden ("Ich erkannte:") — KI-Schablone.

  VARIANZ-PFLICHT AUCH HIER: Jede Zitat-Bruecke muss einzigartig sein. Keine Standardsaetze.
- Die Bruecke darf KEINE negative Kritik an frueheren Arbeitgebern enthalten.
- KEINE leeren Floskeln wie 'Genau diese Haltung treibt mich an'.
- ANTI-DOPPLUNG: Die Zitat-Bruecke und der ERSTE Satz von Absatz 2 duerfen sich INHALTLICH NICHT ueberschneiden.
- ANTI-DOPPEL-FIRMA: Die Zitat-Bruecke darf KEINE CV-Station namentlich nennen, die im Hauptteil einen eigenen Absatz bekommt. Wenn du in der Bruecke "Bei Fraunhofer" schreibst und Fraunhofer auch einen eigenen Absatz hat, klingt es redundant.
- STRUKTUR: Die Zitat-Bruecke + der Bewerbungssatz gehoeren zum EINLEITUNGSBLOCK. Sie sind KEIN eigener Absatz. Nach dem Bewerbungssatz kommt eine Leerzeile, dann der ERSTE Stations-Absatz.

[COMPANY-BEZUG — SOURCED REFERENZ mit Unternehmensanalyse]
Nutze IMMER eine sourced Referenz für den Firmenbezug. Die Daten für diesen Satz kommen aus der Unternehmensanalyse (Perplexity-Research), die oben im Prompt als Kontext bereitgestellt wurde.
✅ "Da ich auf eurer Website gelesen habe, dass [konkreter Fakt aus der Analyse]..."
✅ "Da ich gelesen habe, dass ${companyName} [Firmenbezug aus Vision/Werten/Projekten]..."
✅ "Als ich euer Projekt [aus Analyse] sah..."
❌ VERBOTEN: "Eure Spezialisierung zeigt mir..." — omniszient, woher weiß der Bewerber das?
❌ VERBOTEN: "Ihr seid bekannt für..." — woher soll er das wissen ohne Quelle?
❌ VERBOTEN: Firmenbezug erfinden oder generalisieren — nutze NUR Fakten aus der bereitgestellten Unternehmensanalyse.
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
    const hookIntroBlock = hasHook ? `[REGEL: EINLEITUNG — UNTERNEHMENS-AUFHÄNGER]:
Unternehmens-Fakt: "${hookContent}"
(Typ: ${ctx!.selectedHook!.type})
-> Integriere diesen Fakt NATÜRLICH in die Einleitung (1-2 Sätze).
-> Eigene Website-Referenzen sind erwünscht: "Als ich eure Website las..." / "Da ich gelesen habe, dass ihr..." — das klingt authentisch.
-> VERBOTEN: Den Tool-Namen oder die Datenquelle nennen (z.B. kein "Laut Perplexity", kein "laut Analyse").
-> VERBOTEN: Den Fakt wörtlich zitieren — formuliere ihn in eigenen Worten.
-> Verknüpfe ihn mit deiner Motivation für die Stelle.` : '';

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
    // PRINZIP: introFocus steuert Quote-Placement IMMER — unabhängig von Hook oder News.
    // focus === 'quote'  → Quote in die Einleitung (quoteIntroBlock)
    // focus === 'hook'   → Quote in den Hauptteil (quoteBodyBlock), das beste andere Element übernimmt die Einleitung
    // Das vereinfacht alle Kombinationen auf 1 klar lesbares Kontrollzentrum.

    if (hasQuote) {
        if (focus === 'quote') {
            // Quote in Intro — Hook wandert falls vorhanden in den Hauptteil, News in Body-Übergang
            introGuidance = quoteIntroBlock;
            if (hasHook) bodyIntegrationGuidance = hookBodyBlock;
        } else {
            // Quote in Körper — bestes verfügbares Element übernimmt die Einleitung
            bodyIntegrationGuidance = quoteBodyBlock;
            if (hasHook) {
                introGuidance = hookIntroBlock;
            }
            // Falls kein Hook aber News vorhanden: introGuidance bleibt leer → newsSection setzt die Einleitung
        }
    } else if (hasHook) {
        introGuidance = hookIntroBlock;
    }
    // Falls weder Quote noch Hook: Einleitung durch Preset-Öffnungsregel gesteuert (toneInstructions)

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
INSTRUKTION: Formuliere eine eigene, authentische Lernkurve in deinem natürlichen Schreibstil. KEIN festes Satzmuster kopieren — jede Vulnerability muss einzigartig klingen.
VERKNÜPFUNG: Die Lernkurve MUSS an einen KONKRETEN Firmenwert gebunden werden (z.B. aus ${JSON.stringify(company?.company_values?.slice(0, 2) || [])}). Generische Platzhalter wie "eure Philosophie" sind VERBOTEN.
REGELN:
- Darf NIE wie eine Entschuldigung klingen — immer als Wachstum framen
- MAXIMAL 2 Stellen im gesamten Anschreiben
- Jede Vulnerability MUSS in [VUL]...[/VUL] Tags eingeschlossen werden (wird nach Generierung automatisch geprüft und entfernt)`;
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
${(() => {
    const summary = (job as any)?.summary as string | undefined;
    if (summary && summary.length > 20) {
        return t(
            `\nSTELLE-KONTEXT (Kurzprofil der ausgeschriebenen Stelle):\n"${summary}"\nNutze diesen Kontext als Referenz für alle Absatz-Inhalte.`,
            `\nROLE CONTEXT (brief profile of the advertised position):\n"${summary}"\nUse this as reference for all paragraph content.`
        );
    }
    return '';
})()}

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
- Beginne direkt mit der Anrede: ${contactPersonGreeting}${ctx?.tone.contactPerson ? ` — ZWINGEND: Nutze EXAKT diese Anrede. NIEMALS auf generische Alternativen wie "Dear Hiring Manager", "Sehr geehrte Damen und Herren" etc. ausweichen. Der Name des Ansprechpartners ist gesetzt.` : ''}
- Anrede-Form: ${isDuForm ? 'DU-FORM (du/dein/euch/dir). Wende diese Du-Form STRIKT auf das GESAMTE Anschreiben an. Kein "Sie" oder "Ihnen" — NIEMALS.' : 'SIE-FORM (Sie/Ihr/Ihnen). Wende diese Sie-Form STRIKT auf das GESAMTE Anschreiben an.'}
- ${t('Maximale Satzlänge: 25 Wörter. Bei komplexen Gedanken: Zwei kurze Sätze statt einem langen.', 'Maximum sentence length: 25 words. For complex thoughts: Two short sentences instead of one long one.', 'Longitud máxima por oración: 25 palabras. Para ideas complejas: Dos oraciones cortas.')}
- ${t('Max. 2 Kommas pro Satz. Mehr Kommas = Satz aufteilen.', 'Max. 2 commas per sentence. More commas = split the sentence.')}
- ${t('KEIN Gedankenstrich (– oder —) im Fließtext. EINZIGE AUSNAHME: Die Zitat-Signatur-Zeile (z.B. "– Autor"). Überall sonst: Nutze Semikolon (;) oder Punkt statt Gedankenstrich.', 'NO em-dash (– or —) in body text. ONLY EXCEPTION: The quote attribution line ("– Author"). Everywhere else: Use semicolons (;) or periods instead.', 'PROHIBIDO el guión largo (– o —) en el texto. ÚNICA EXCEPCIÓN: La línea de atribución de cita. Usa punto y coma (;) o punto.')}
- ${t('TONALITÄT: Eloquenz + Bescheidenheit. Sei zuversichtlich aber nicht abgehoben. Zeige Lernbereitschaft statt Allwissenheit. GUT: "Ich gehe zuversichtlich ran", "Ich freue mich, von Ihrer Expertise zu lernen". VERBOTEN: "Ich bringe eine solide Grundlage", "Meine Erfahrung befähigt mich".', 'TONE: Eloquence + Humility. Be confident yet grounded. Show eagerness to learn, not omniscience. GOOD: "I approach this with confidence", "I look forward to learning from your expertise". FORBIDDEN: "I bring a solid foundation", "My experience qualifies me".', 'TONO: Elocuencia + Humildad. Sé seguro pero sin arrogancia. Muestra disposición a aprender.')}

=== SEKTION 2: TONALITÄT & STIL (HÖCHSTE PRIORITÄT) ===

§ABSOLUT BINDENDE ANREDE-FORM (überschreibt JEDEN Schreibstil, JEDE Stilanalyse, JEDES Template):
${isDuForm
    ? 'DU-FORM (du/dein/euch/dir). Diese Entscheidung ist FINAL und UNVERÄNDERLICH. Auch wenn das Schreibstil-Muster Sie-Form verwendet — im Anschreiben ist AUSSCHLIESSLICH Du-Form erlaubt. Kein einziges "Sie" oder "Ihnen".'
    : 'SIE-FORM (Sie/Ihr/Ihnen). Diese Entscheidung ist FINAL und UNVERÄNDERLICH. Auch wenn das Schreibstil-Muster Du-Form verwendet — im Anschreiben ist AUSSCHLIESSLICH Sie-Form erlaubt. NIEMALS "du", "dein", "euch" oder "dir" verwenden.'}

${isCustomStyle && customStyleBlock
            ? `MODUS: EIGENER SCHREIBSTIL (Custom Style)
${customStyleBlock}

${t(
    `ABSATZ-STRUKTUR (Standard — unabhaengig vom Schreibstil, immer gueltig):
Einleitung: Oeffne mit einer subjektiven eigenen Beobachtung/Recherche zu ${companyName} als Anker. ICH-Perspektive — nie Firmenbeschreibung als objektive Tatsache.

Jeder Stations-Absatz — ZWINGEND VOR DEM SCHREIBEN:
[STATION-BRIDGING DECISION — 2-Wege-Logik]
Evaluiere VOR jedem Stations-Brueckensatz:

FRAGE: "Gibt es einen thematischen INHALTS-Ueberschnitt zwischen dem, was diese Station inhaltlich behandelt hat, und dem, womit ${companyName} sich beschaeftigt?"

CASE A — JA (Inhalts-Match oder Rollen-Match, z.B. Beratung zu Beratung, Tech zu Tech):
  Bruecke UEBER INHALT/ROLLE:
  - "Meine Projekte zu [Stationsthema] bei [Station] decken sich direkt mit eurer Arbeit an [Firmenthema]."
  - "Da ich bei [Station] aehnliche Fragestellungen bearbeitet habe, kenne ich die Herausforderungen bei [Firmenkontext]."

CASE B — NEIN (Inhalts-Dissimilar, z.B. Quantum Computing zu AgriFood-Foerderung):
  VERBOTEN: "[Firmenthema] erinnert mich an meine Arbeit mit [inhaltlich unverwandtem Stationsthema]"
  PFLICHT: Bruecke UEBER UEBERTRAGBAREN SKILL:
  Der Skill MUSS konkret und messbar sein (keine generischen Nomen wie "Kommunikation"):
  - "Die Workshop-Moderation komplexer Themen fuer 30+ Teilnehmer, die ich bei [Station] entwickelt habe, ist direkt auf euren Ansatz zur Foerderberatung uebertragbar."
  - "Das Methodenset aus Design Thinking und Miro, das ich bei [Station] aufgebaut habe, unterstuetzt die Arbeit an interaktiven Foerderformaten."
  VERBOTEN: "Kommunikationskompetenz" / "analytisches Denken" ohne konkreten Beweis

SELBST-CHECK (nach dem Schreiben des Brueckensatzes):
"Wuerde ein Personaler denken: 'Ja, das macht Sinn.' oder 'Was hat das damit zu tun?'"
Wenn letzteres: Case B anwenden und mit uebertragbarem Skill neu formulieren.

Stations-Uebergaenge: Aktiv formuliert — z.B. "kann ich mit meiner Zeit bei X anknuepfen", "habe ich mich in [Aufgabe] wiedergefunden, da es zu meiner taeglichen Arbeit gehoerte", "freue ich mich, meine Erfahrung aus X einzubringen". VERBOTEN: Passiv wie "ist meine Erfahrung bei X relevant fuer". VERBOTEN: "Moechte ich mein Projekt bei X beleuchten" — invertierter Modalsatz als Aussage.
Closing: Warm und bescheiden — kein Verkaufs-CTA. Bevorzugt: "Ich hoffe, ihr konntet einen kleinen Eindruck von mir gewinnen. Ich bin die naechsten Wochen flexibel und freue mich darauf, euch kennenzulernen."`,
    `PARAGRAPH STRUCTURE (standard — always applies regardless of writing style):
Intro: Open with a subjective personal observation/research about ${companyName} as anchor. I-perspective — never company description as objective fact.

Each station paragraph — MANDATORY BEFORE WRITING:
[STATION-BRIDGING DECISION — 2-Way Logic]
Evaluate BEFORE each station bridge sentence:

QUESTION: "Is there a thematic CONTENT overlap between what this station dealt with, and what ${companyName} does?"

CASE A — YES (Content-Match or Role-Match, e.g. consulting to consulting, tech to tech):
  Bridge via CONTENT/ROLE:
  - "My projects on [station topic] at [station] align directly with your work on [company topic]."

CASE B — NO (Content-Dissimilar, e.g. Quantum Computing to AgriFood promotion):
  FORBIDDEN: "[Company topic] reminds me of my work with [unrelated station topic]"
  REQUIRED: Bridge via TRANSFERABLE SKILL (must be concrete and measurable, not generic):
  - "The workshop facilitation skills for 30+ participants I built at [station] are directly applicable to your interactive advisory formats."
  FORBIDDEN: "communication skills" / "analytical thinking" without concrete proof

SELF-CHECK: "Would a recruiter think 'Yes, that makes sense.' or 'What does that have to do with anything?'"
If the latter: apply Case B and reformulate with transferable skill.

Station transitions: Active — e.g. "I can build on my time at X". FORBIDDEN: Passive phrasing or inverted modal constructions.
Closing: Warm and humble — no sales CTA.`,
    `ESTRUCTURA DE PARRAFOS (estandar — aplica siempre):
Intro: Observacion subjetiva personal sobre ${companyName}. Primera persona.
Decision de puente (Case A: contenido similar — puente por contenido; Case B: disimilar — puente por habilidad transferible concreta).
Autocomprobacion: el reclutador pensaria que tiene sentido?
Transiciones: activas. Cierre: calido, sin pitch.`
)}`
            : isCustomStyle && !customStyleBlock
                // Race-Condition Fallback: User selected custom-style but style analysis is not yet ready.
                // Fallback to preset so the AI always has a tone instruction — never falls into a void.
                ? `MODUS: FALLBACK AUF PRESET (Stil-Analyse noch nicht verfügbar)
PRESET: ${ctx?.tone.preset || 'formal'}
${activeTone}

HINWEIS: Schreibe professionell und präzise. Stil-Kalibrierung nicht möglich (Analyse ausstehend).`
                : `PRESET: ${ctx?.tone.preset || 'formal'}
${activeTone}`}

${(() => {
    // Shared bridging logic — injected into ALL tone paths (custom-style AND preset)
    // Extracted to avoid duplication and ensure preset users get the same Case A/B bridging rules.
    const bridgingRulesDE = `[STATION-BRIDGING DECISION — 2-Wege-Logik (GILT FUER ALLE STILE)]
Evaluiere VOR jedem Stations-Brueckensatz:
FRAGE: "Gibt es einen thematischen INHALTS-Ueberschnitt zwischen dem, was diese Station inhaltlich behandelt hat, und dem, womit ${companyName} sich beschaeftigt?"

CASE A — JA (Inhalts-Match oder Rollen-Match, z.B. Beratung zu Beratung, Tech zu Tech):
  Bruecke UEBER INHALT/ROLLE — zeige die direkte Verbindung.

CASE B — NEIN (Inhalts-Dissimilar, z.B. Quantum Computing zu AgriFood-Foerderung):
  VERBOTEN: "[Firmenthema] erinnert mich an meine Arbeit mit [inhaltlich unverwandtem Stationsthema]"
  PFLICHT: Bruecke UEBER UEBERTRAGBAREN SKILL (konkret und messbar, nicht generisch).
  VERBOTEN: "Kommunikationskompetenz" / "analytisches Denken" ohne konkreten Beweis.

SELBST-CHECK: "Wuerde ein Personaler denken: 'Ja, das macht Sinn.' oder 'Was hat das damit zu tun?'"
Wenn letzteres: Case B anwenden und mit uebertragbarem Skill neu formulieren.

[ANTI-ALLWISSEND — FIRMENBEZUEGE ALS PRAEDIKATE (VERBOTEN)]
VERBOTEN: Saetze in denen der Bewerber allwissend ueber das VERHALTEN der Firma spricht:
- "[Thema] praegt eure Arbeit" / "praegt Ihre Arbeit"
- "[Thema] zeichnet euch aus" / "zeichnet Sie aus"
- "[Thema] macht euch besonders" / "macht Sie besonders"
- "[Thema] steht bei euch im Mittelpunkt"
STATTDESSEN: ICH-Perspektive mit Quelle: "Auf eurer Website habe ich gelesen, dass..." / "In der Stellenanzeige ist mir aufgefallen, dass..."`;
    return isCustomStyle && customStyleBlock ? '' : bridgingRulesDE;
})()}

${isCustomStyle ? '' : styleSection}

${buildLeanBlacklistSection()}

${t(`[AUTHENTIZITÄTS-REGELN]
VERBOTEN — Generische Kompetenz-Phrasen:
❌ "Die Kombination aus X und Y ermöglicht es mir..."
❌ "eine Denkweise, die ich direkt auf ${companyName} übertragen kann"
❌ "eine Erkenntnis, die perfekt zu ${companyName} passt"
❌ "bildet eine solide Grundlage"
❌ "und vor allem die Bereitschaft"
❌ "Diese Erfahrung hat mir gezeigt, wie wichtig es ist"
STATTDESSEN — Persönliche Reflexion:
✅ "Aus diesen Erfahrungen habe ich gelernt, sowohl X als auch Y einzunehmen."
✅ "Der nächste Schritt ist für mich, diese Kompetenzen zu vertiefen und zugleich von Ihrer Branchenerfahrung zu lernen."
✅ "Daher gehe ich zuversichtlich ran."
✅ "Zudem freue ich mich, über [Programm/Academy] tiefer in [Thema] einzutauchen."

[LERNKURVEN-VARIANZ — PFLICHT]
NIE dieselbe Lernkurven-Formulierung zweimal im selben Anschreiben. Wähle EINEN aus diesem Pool und SCHLIESSE ihn zu einem vollständigen Satz ab — KEIN Doppelpunkt am Ende:
✅ "Erst durch [konkretes Event] verstand ich, dass [Einsicht]."
✅ "Diese Erfahrung zeigte mir, dass [konkreter Schluss]."
✅ "Anfangs unterschaetzte ich [X]; die Zusammenarbeit mit [Y] zeigte, dass [Z]."
✅ "Ich lernte auf die harte Tour, dass [konkreter Schluss]."
✅ "Gerade dieser Prozess machte deutlich, dass [konkreter Schluss]."
REGEL: Der Lernkurven-Satz ist immer ein vollständiger Aussagesatz. Der Einblick folgt DIREKT im selben Satz — nie als eigener Satz mit Doppelpunkt.
VERBOTEN: "Doch ich lernte schnell" — klingt nach Coaching-Template.
VERBOTEN: Sätze die mit einem Doppelpunkt enden ("Ich erkannte:", "Rückblickend:") — das ist eine KI-Formatierungs-Schablone.
VERBOTEN: "Rückblickend wird mir klar" / "wurde mir klar" / "wurde mir bewusst" — allwissend-Marker, global auf der Blacklist.
BLACKLIST-OVERRIDE: Alle globalen Blacklist-Regeln gelten auch wenn der Lernkurven-Toggle aktiv ist. Der Toggle gewährt KEINE Ausnahmen von verbotenen Phrasen.`,
`[AUTHENTICITY RULES]
FORBIDDEN — Generic competence phrases:
❌ "The combination of X and Y enables me to..."
❌ "a mindset I can directly apply to ${companyName}"
❌ "an insight that perfectly aligns with ${companyName}"
❌ "provides a solid foundation"
❌ "This experience showed me how important it is"
INSTEAD — Personal reflection:
✅ "From these experiences I learned to consider both the commercial and technical perspective."
✅ "My next step is to deepen these skills while learning from your industry expertise."
✅ "That is why I approach this role with confidence."

[LEARNING-CURVE VARIETY — MANDATORY]
NEVER use the same learning-curve phrase twice. Choose ONE from this pool and complete it into a FULL SENTENCE — NO colon at the end:
✅ "Looking back, I realize that [concrete conclusion]."
✅ "It was only through [concrete event] that I understood that [insight]."
✅ "This experience showed me that [concrete conclusion]."
✅ "At first I underestimated [X]; it was only through [Y] that it became clear that [Z]."
RULE: The learning-curve sentence is always a complete statement. The insight follows DIRECTLY in the same sentence — never as a separate sentence after a colon.
FORBIDDEN: "But I quickly learned" — sounds like a coaching template.
FORBIDDEN: Sentences ending with a colon ("I recognized:", "Looking back:") — this is an AI formatting pattern.`,
`[REGLAS DE AUTENTICIDAD]
PROHIBIDO — Frases genéricas de competencias:
❌ "La combinación de X e Y me permite..."
❌ "una mentalidad que puedo aplicar directamente"
❌ "constituye una base sólida"
EN CAMBIO — Reflexión personal:
✅ "De estas experiencias aprendí a considerar tanto la perspectiva comercial como la técnica."
✅ "Mi siguiente paso es profundizar estas competencias mientras aprendo de su experiencia."

[VARIEDAD EN CURVAS DE APRENDIZAJE — OBLIGATORIO]
[VARIEDAD EN CURVAS DE APRENDIZAJE — OBLIGATORIO]
NUNCA usar la misma formulación dos veces. Elige UNA y conviértela en una oración COMPLETA — SIN dos puntos al final:
✅ "Retrospectivamente comprendo que [conclusión concreta]."
✅ "Solo a través de [evento concreto] entendí que [aprendizaje]."
✅ "Esta experiencia me mostró que [conclusión concreta]."
✅ "Al principio subestimé [X]; solo tras [Y] quedó claro que [Z]."
REGLA: La frase de aprendizaje siempre es una oración afirmativa completa. PROHIBIDO terminar con dos puntos.
PROHIBIDO: "Pero aprendí rápidamente."`)}

[GRAMMATIK-PFLICHT — AUSSAGE-KONSTRUKTE]
VERBOTEN: "schärfte meinen Blick dafür, wie X nur dann Y, wenn..." → "wie" leitet Art und Weise ein, NICHT Aussagen.
RICHTIG: "schärfte meinen Blick dafür, dass X nur dann Y, wenn..."
VERBOTEN: "erkenne ich, wie wichtig..." → RICHTIG: "erkenne ich, dass..."
REGEL: Nach "erkennen/verstehen/zeigen/wissen/schärfen" + Nebensatz → immer "dass", nie "wie" (wenn eine Aussage folgt, keine Art-und-Weise-Beschreibung).

[ABSATZ-ENDEN — ANTI-GENERIK (PFLICHT)]
Beende Stations-Absätze NICHT mit generischen Erkenntnissätzen.
❌ VERBOTEN: "Diese Erfahrung schärfte meinen Blick dafür, dass..."
❌ VERBOTEN: "Das öffnete mir die Augen für..."
❌ VERBOTEN: "Diese Erfahrung hat mein Verständnis dafür geprägt, dass..."
❌ VERBOTEN: "Das hat mich gelehrt, dass..."
❌ VERBOTEN: "können nur dann wirken, wenn..." / "funktioniert nur, wenn..." — allwissende Wenn-dann-Regeln sind hochnäsig.
STATTDESSEN — Konkreter Schluss oder Zuversicht:
✅ "Daher gehe ich zuversichtlich an diese Aufgabe."
✅ "Deshalb freue ich mich darauf, diese Erfahrung bei ${companyName} einzubringen."
✅ "Gerade dieser Perspektivwechsel kann für [Jobtitel] sehr hilfreich sein." (zeigt Demut + konkrete Anwendung)
✅ [Konkretes Ergebnis oder Zahl nennen statt abstrakte Reflexion]
LOGIK: Der letzte Satz eines Absatzes soll dem Recruiter zeigen, was du MITBRINGST — nicht was du ERKANNT hast.

[LEVEL-AWARENESS — JUNIOR/SENIOR TONALITÄT]
Wenn der Jobtitel "Junior", "Trainee", "Werkstudent" oder "Einstiegsposition" enthält:
→ VERBOTEN: Allwissende Erkenntnissätze die Regeln aufstellen ("Workshops wirken nur, wenn...")
→ ERLAUBT: Lernperspektive ("Gerade dieser Perspektivwechsel kann für einen Junior Consultant hilfreich sein")
→ ERLAUBT: Demütige Zuversicht ("Ich freue mich darauf, von eurer Expertise zu lernen")
→ VERBOTEN: Sich als Experte positionieren, der der Firma sagt, was funktioniert und was nicht.

[RHETORISCHE STILMITTEL — OPTIONAL, Max. 2 pro Anschreiben]
Nutze Stilmittel NUR wenn sie den Lesefluss verbessern — NIEMALS erzwingen. Storytelling-Preset: mindestens 1 bevorzugt.
TRIKOLON: Drei parallele Glieder (z.B. "analysiert, verankert und übersetzt"). Max. 1x.
ASYNDETON: Aufzählung ohne "und" (z.B. "Facilitation, Produktentwicklung, Teamaufbau; das bringe ich mit"). Max. 1x.

[WORT-WIEDERHOLUNGS-SCHUTZ (PFLICHT)]
Dasselbe Substantiv darf in zwei aufeinanderfolgenden Absätzen NICHT wiederholt werden.
Häufige Fallen:
- "Fokus" → Synonyme: "Ausrichtung", "Schwerpunkt", "Ansatz"
- "Erfahrung" → Synonyme: "Praxis", "Arbeit", "Zeit bei [Firma]"
- "Team" → Synonyme: "Gruppe", "Kollegium", "Mannschaft"
Prüfe VOR dem Schreiben: Wurde das Wort bereits im vorherigen Absatz verwendet? Wenn ja → Synonym wählen.

=== SEKTION 3: AUFHÄNGER (KURZ & PRÄGNANT) ===
${introGuidance || t(
    `INTRO-PFLICHT (kein Aufhaenger gewaehlt — ICH-Perspektive erzwingen):
Oeffne mit einer konkreten eigenen Beobachtung zu ${companyName} oder der Stelle — IMMER aus ICH-Perspektive.
Waehle EINEN dieser Einstiege (alle gleichwertig — Abwechslung erwuenscht):
✅ "Da ich auf eurer Website gelesen habe, dass ihr [konkreter Fakt aus Job-Daten]..." (Website-Referenzen AUSDRUECKLICH ERLAUBT)
✅ "Als ich eure Stellenausschreibung / euren Artikel / euren LinkedIn-Beitrag zu [Thema] las..."
✅ "Euer Ansatz bei [Thema aus Firmendaten] hat mich angesprochen, weil..."
✅ "Dass ihr so stark auf [Kernthema] setzt, zeigt fuer mich, dass..."
✅ "Da ich selbst an [verwandtem Thema] sitze und Parallelen sehe, moechte ich mich kurz vorstellen."
VERBOTEN: Allwissende Firmenbeschreibungen ohne ICH-Rahmung / Branchen-Thesen / objektive Wahrheiten ueber ${companyName}.
ERLAUBT: Website-Referenzen ("auf eurer Website", "in eurem Blog-Artikel"). Verboten: Tool-Namen (Perplexity etc.).`,
    `INTRO-REQUIREMENT (no hook selected — enforce I-perspective):
Open with a concrete personal observation about ${companyName} or the role — ALWAYS from I-perspective.
Choose ONE opener (all equally valid — variety encouraged):
✅ "Since I read on your website that you [concrete fact from job data]..." (website references EXPLICITLY ALLOWED)
✅ "When I read your job posting / article / LinkedIn post about [topic]..."
✅ "Your approach to [topic from company data] appealed to me because..."
✅ "The fact that you focus so strongly on [core theme] shows me that..."
✅ "Since I myself work on [related topic] and see parallels, I would like to briefly introduce myself."
FORBIDDEN: Omniscient company descriptions without I-framing / industry theses.
ALLOWED: Website references ("on your website", "in your blog post"). Forbidden: Tool names (Perplexity etc.).`,
    `REQUISITO DE INTRO (sin gancho — forzar perspectiva en primera persona):
Abre con una observacion personal concreta sobre ${companyName}. Elige UNO:
✅ "Dado que lei en vuestro sitio web que [hecho concreto]..."
✅ "Cuando lei vuestra oferta de trabajo / articulo sobre [tema]..."
✅ "Vuestro enfoque en [tema] me llamo la atencion porque..."
PROHIBIDO: Descripciones omniscientes de la empresa sin marco en primera persona.`
)}



${t('[INTRO-DICHTE]: Die Einleitung darf MAX 1 eigene CV-Station/Organisation namentlich nennen. Zweite Referenz gehört in den ERSTEN Hauptteil-Absatz.\nALTERNATIVEN (NUR wenn im CV vorhanden UND thematisch passend): Ehrenamtliche Tätigkeiten, Zertifikate, Side Projects oder eine CV-Station die NICHT im Hauptteil vorkommt (keine Dopplung). Wenn nichts passt: Nur ein kurzer Bezug zur Hauptstation.',
'[INTRO DENSITY]: The introduction may name a MAXIMUM of 1 CV station/organization. Second reference belongs in the FIRST main body paragraph.\nALTERNATIVES (ONLY if present in CV AND thematically fitting): Volunteer work, certifications, side projects, or a CV station NOT in the main body.',
'[DENSIDAD INTRO]: La introducción puede nombrar MÁXIMO 1 estación/organización del CV. La segunda referencia va al PRIMER párrafo del cuerpo principal.')}

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

[MANDATORY — TRANSITION SENTENCE]: ${introGuidance && hasQuote && focus === 'quote' ? (isEnglish ? 'The INTRODUCTION (after the quote and the bridging sentence)' : 'Die EINLEITUNG (nach dem Zitat und dem Begründungssatz)') : (isEnglish ? 'The FIRST paragraph' : 'Der ERSTE Absatz')} MUST end with a sentence that bridges to the main body AND mentions the job title.
${isEnglish ? `Choose one: "That is why I would like to briefly introduce myself as ${jobTitle}." or "...and that is why I am applying as ${jobTitle}."` : isSpanish ? `Elige una: "Por eso me gustaría presentarme brevemente como ${jobTitle}." o "...y por eso me postulo como ${jobTitle}."` : isDuForm ? `Wähle eine: "Daher möchte ich mich als ${jobTitle} bei euch kurz vorstellen." oder "...und genau deshalb bewerbe ich mich als ${jobTitle}."` : `Wähle eine: "Daher möchte ich mich als ${jobTitle} bei Ihnen kurz vorstellen." oder "...und genau deshalb bewerbe ich mich als ${jobTitle}."`}
This sentence is NOT optional. It bridges to the main body AND anchors the reader on the specific position.

${newsSection}

=== STELLEN-ANFORDERUNGEN (PFLICHT-SPIEGEL) ===
${(() => {
    // §Fix C+: Runtime guard — Array.isArray prevents crash if DB returns unexpected type
    const resp = Array.isArray(job?.responsibilities) ? job.responsibilities as string[] : null;
    if (resp && resp.length > 0) {
        return `Aus der Stellenbeschreibung wurden folgende KERNAUFGABEN extrahiert:
${resp.map((r, i) => `${i + 1}. ${r}`).join('\n')}

PFLICHT: Mindestens 2 dieser Kernaufgaben MUESSEN sich im Anschreiben EXPLIZIT widerspiegeln.
METHODE: Zeige, dass du diese Aufgabe bereits aus deiner Karriere kennst.
BEISPIEL-MUSTER (Wiederfinden-Pattern mit KURZEN 2-5 Woerter Fragmenten):
Beispiel: "Zudem habe ich mich in der „strategischen Roadmap“ sehr wiedergefunden, da es zu meiner taeglichen Arbeit bei [Firma] gehoerte."
Beispiel: "„Umsetzungsorientierte Loesungen“, genau daran habe ich bei [Firma] gearbeitet: [konkreter Beweis]."
❌ VERBOTEN: "Da Sie jemanden suchen, der..." / "Weil Sie jemanden suchen" — Meta-Formulierung.
❌ VERBOTEN: Ganze Saetze als Zitat-Fragment. Maximal 2-5 Woerter in Anfuehrungszeichen.
❌ VERBOTEN: Saetze paraphrasieren und als woertliches Zitat ausgeben — das ist Halluzination.

${t('[STELLENANZEIGE-ZITIERUNG (PFLICHT)]\\nWenn du ein Fragment aus der Stellenanzeige verwendest, setze ein KURZES FRAGMENT (2-5 Woerter) in Anfuehrungszeichen. NIEMALS ganze Saetze zitieren.\\nDas Fragment MUSS ein ARBEITSTHEMA beschreiben (woran gearbeitet wird), NICHT eine Teamstruktur oder Organisationsform.\\nDas Fragment MUSS EXAKT so in den KERNAUFGABEN oben stehen. Wenn unsicher: Paraphrasiere OHNE Anfuehrungszeichen.\\nRICHTIG: Zudem habe ich mich in der Erstellung von Strategien wiedergefunden...\\nFALSCH: Ein ganzer Satz als Zitat ist VERBOTEN.\\nFALSCH: Organisationsformen wie in fachuebergreifenden Teams sind kein Arbeitsthema.', '[JOB AD QUOTING (MANDATORY)]\\nWhen quoting from the job ad, use a SHORT FRAGMENT (2-5 words). NEVER quote full sentences.\\nThe fragment MUST describe a WORK TOPIC, NOT a team structure.\\nThe fragment MUST appear EXACTLY in the CORE TASKS above. If unsure: paraphrase WITHOUT quotation marks.\\nCORRECT: I identified with developing strategies...\\nWRONG: Full sentences or organizational forms as quotes.', '[CITAS DE LA OFERTA (OBLIGATORIO)]\\nUsa un FRAGMENTO CORTO (2-5 palabras) entre comillas. NUNCA cites oraciones completas.\\nEl fragmento DEBE describir un TEMA DE TRABAJO, NO una estructura organizativa.')}`;
    }
    // Fallback: wenn responsibilities leer — job.summary nutzen falls vorhanden
    const summaryHint = (job as any)?.summary
        ? `Orientiere dich an dieser Zusammenfassung der Stelle: "${(job as any).summary}"`
        : 'Stelle sicher, dass der Brief klar auf die Kern-Aufgaben der Stelle eingeht.';
    return `KERNAUFGABEN: Die strukturierten Aufgaben wurden noch nicht extrahiert. ${summaryHint}`;
})()}

=== SEKTION 4: KARRIERE-BEWEISE (FOLGENDE ABSÄTZE) ===
Integriere diese Stationen als fließende Prosa — WICHTIG: Erstelle für jede gewählte Station einen eigenen Absatz.

${t(`[VERBOTENE WÖRTER UND MUSTER (immer, in JEDEM Kontext)]
❌ "Schnittstelle" — KOMPLETT VERBOTEN. Nutze: "Verbindung", "Brücke", "Berührungspunkt".
❌ "dass ihr ... dass ihr" / "dass Sie ... dass Sie" im selben Satz/Absatz — Doppel umformulieren.
❌ "nicht nur X, sondern Y" — rhetorisch aufgeblasen. Stattdessen: Direkt beschreiben was du schätzt.`,
`[FORBIDDEN WORDS AND PATTERNS (always, in EVERY context)]
❌ Do not use "intersection" as company descriptor. Use: "connection", "bridge".
❌ "not only X, but also Y" — rhetorically inflated. Instead: Directly describe what you value.`)}



${t(`[ANTI-WIEDERHOLUNGS-SCHUTZ (KRITISCH — 2 EBENEN)]

EBENE 1 — ABSATZ-EROEFFNUNG: Jeder Stations-Absatz MUSS mit einem ANDEREN Einleitungstyp beginnen.
VERBOTEN: Dieselbe Satzstruktur fuer aufeinanderfolgende Absaetze (z.B. \"Die Verbindung von X und Y bei Firma A\" gefolgt von \"Die Verbindung von X und Y bei Firma B\").
Variiere: Ergebnis, Kontext-Setting, Problemstellung, JD-Fragment-Zitat.

EBENE 2 — SATZANFAENGE INNERHALB EINES ABSATZES: Keine zwei aufeinanderfolgenden Saetze mit demselben Subjekt/Verb.
VERBOTEN: \"Habe ich...\" + \"Zudem habe ich...\" + \"Daher habe ich gelernt...\"
RICHTIG: \"Bei X uebernahm ich die Steuerung von Y. Der Fokus lag auf Z. Deshalb freue ich mich, diese Erfahrung einzubringen.\"`,
`[ANTI-REPETITION GUARD (CRITICAL — 2 LEVELS)]

LEVEL 1 — PARAGRAPH OPENING: Each station paragraph MUST start with a DIFFERENT opening type.
FORBIDDEN: Same sentence structure for consecutive paragraphs.
Vary: result, context-setting, problem statement, JD fragment quote.

LEVEL 2 — SENTENCE STARTS WITHIN A PARAGRAPH: No two consecutive sentences with the same subject/verb.
FORBIDDEN: \"I was able to...\" followed by \"I was also able to...\"
RIGHT: \"At X I took charge of Y. The focus was on Z. That is why I look forward to bringing this experience.\"`)}

${t(`[RELEVANZ-PFLICHT — JEDER FAKT BRAUCHT EIN "WARUM"]
Jeder genannte Fakt (Tätigkeit, Tool, Ergebnis) MUSS einen direkten Bezug zur Stellenbeschreibung oder zum Unternehmenswert haben.
VERBOTEN: Isolierte Fakten wie "Zudem habe ich dort Vertriebsworkflows automatisiert und ein CRM aufgebaut." ohne Erklärung, WARUM das für den Recruiter relevant ist.
RICHTIG: "Gleichzeitig automatisierte ich Vertriebsworkflows und baute ein CRM auf, das die Kundenbindung um 30% steigerte; eine Kompetenz, die bei eurem Fokus auf Kundenerfolg direkt einsetzbar wäre."
REGEL: Wenn du einen Fakt nennst und keinen Bezug zur Stelle herstellen kannst, LASS IHN WEG.`,
`[RELEVANCE REQUIREMENT — EVERY FACT NEEDS A "WHY"]
Every stated fact (activity, tool, result) MUST have a direct connection to the job description or company values.
FORBIDDEN: Isolated facts without explaining WHY they matter to the recruiter.
RULE: If you mention a fact and cannot connect it to the job, LEAVE IT OUT.`)}


${t(`[ZERTIFIKATE UND QUALIFIKATIONEN ALS BRÜCKEN-ELEMENTE]
Wenn der Lebenslauf Zertifikate, Fortbildungen oder anerkannte Qualifikationen enthält (z.B. Design Thinking, Scrum Master, ITIL, Six Sigma), nutze diese als Brücken zum Unternehmen oder zur Stelle.
BEISPIEL: Wenn die Firma "Nutzerzentriertheit" als Wert hat und der Bewerber ein Design Thinking Zertifikat hat → "Mein Design Thinking Zertifikat hat mir gezeigt, dass technische Lösungen nur dann wirken, wenn sie aus der Perspektive des Nutzers gedacht werden."
NUTZE Zertifikate NUR wenn sie einen konkreten, nachvollziehbaren Bezug zur Stelle haben. Nicht als Aufzählung.`,
`[CERTIFICATES AND QUALIFICATIONS AS BRIDGE ELEMENTS]
If the CV contains certifications (e.g., Design Thinking, Scrum Master, ITIL), use them as bridges to company values or job requirements.
USE certifications ONLY when they have a concrete, traceable connection to the role. Not as mere listings.`)}


${bodyIntegrationGuidance}

${stationsSection}

Job-Anforderungen für die Relevanzkontrolle:
${JSON.stringify(job?.requirements?.slice(0, 3) || [], null, 2)}

Unternehmens-Kontext (nutze für spezifische Verbindungen):
Werte: ${JSON.stringify((company?.company_values || []).slice(0, 5))}
Tech: ${JSON.stringify((company?.tech_stack || []).slice(0, 5))}
${company?.current_challenges?.length ? `Aktuelle Herausforderungen: ${JSON.stringify(company.current_challenges)}` : ''}
${company?.roadmap_signals?.length ? `Roadmap-Signale: ${JSON.stringify(company.roadmap_signals)}` : ''}
${company?.recent_news?.length ? `Aktuelle News: ${JSON.stringify(company.recent_news.slice(0, 3))}` : ''}
HALLUZINATIONS-BREMSE: Verwende NUR Fakten (Ort, News, Werte, Challenges), die EXPLIZIT oben stehen. Wenn ein Datum fehlt → ERFINDE NICHTS, weiche auf allgemein belegbare Aussagen aus.
STELLENANZEIGE-ZITAT-AUDIT: Wenn du ein Fragment in Anfuehrungszeichen zitierst, pruefe VOR dem Schreiben: Steht dieses Fragment EXAKT SO in den KERNAUFGABEN oder STELLEN-ANFORDERUNGEN oben? Wenn NEIN: paraphrasiere OHNE Anfuehrungszeichen. Max. 5 Woerter pro Zitat-Fragment. Ganze Saetze als Zitat sind VERBOTEN.
INHALTLICHE ZITAT-REGEL: Das zitierte Fragment MUSS ein ARBEITSTHEMA beschreiben (WORAN gearbeitet wird). VERBOTEN als Zitat: Teamstrukturen, Interaktionsformen, Prozessbeschreibungen.

${cvInput}

${first90DaysSection}

${painPointSection}

${vulnerabilitySection}

${personaSection}

=== SECTION 5: CLOSING & CALL TO ACTION ===
[RULE: CLOSING]
- FORBIDDEN: Do NOT summarize career stations or experience again at the end. That is filler.
${hasQuote && preset === 'storytelling'
    ? '- KLAMMER-OPTION: Du DARFST im letzten Satz auf den Gedanken aus der Einleitung zurückgreifen — als inhaltliche Klammer. Kein wörtliches Zitieren, sondern eine kurze Rück-Referenz. Nur wenn es sich natürlich anfühlt.'
    : '- FORBIDDEN: Do NOT repeat the quote or hook from the opening paragraph.'}

[ZUSAMMENFASSUNGS-ABSATZ — VOR dem CTA]
Fuege EINEN kurzen Absatz (2-3 Saetze) ein, der die Bewerbung in eigenen Worten zusammenfasst:
- Formuliere, was du MITBRINGST und worauf du dich FREUST.
- Nenne 1-2 konkrete Technologien/Aufgaben aus der Stellenanzeige, in die du dich einarbeiten willst.
- Zeige Zuversicht OHNE Arroganz: "zuversichtlich" oder "gespannt" statt "ueberzeugt" oder "Experte".
- VERBOTEN im Closing: "wissenschaftliche Exzellenz", "strategische Exzellenz", "unternehmerische Exzellenz", "Exzellenz" allgemein — zu pompoes und nicht authentisch.
- ABSOLUT VERBOTEN: "schnell den Sprung von [X] zur [Y] schaffe" oder jede Variante davon — sofort erkennbar als KI-Schablone. NIEMALS verwenden.
- ABSOLUT VERBOTEN: "Ich bin zuversichtlich, dass ich durch eure/Ihre Expertise ... schnell den Sprung" — das vollstaendige Konstrukt ist gesperrt.
${isEnglish ? '- Example: "To sum up: I bring [X] from my projects, especially [concrete skill]. I look forward to diving deeper into [specific tech/task from job ad]."'
  : isDuForm ? '- Beispiel: "Um diese Gedanken zusammenzufassen: Ich bringe [X] aus meinen Projekten mit, besonders [konkrete Kompetenz aus CV]. Zudem freue ich mich darauf, mich tiefer in [konkrete Tech/Aufgabe aus Stellenanzeige] einzuarbeiten."'
  : '- Beispiel: "Zusammenfassend bringe ich [X] aus meinen Projekten mit und freue ich mich darauf, mich in [konkrete Tech/Aufgabe] einzuarbeiten."'}

- The closing sentence AFTER the summary is SHORT and WARM. Wähle den Ton:
  BEVORZUGT (warm, bescheiden): ${isEnglish ? '"I hope this gives you a small impression of who I am. I am available over the coming weeks and would love to get to know you."' : isDuForm ? '"Ich hoffe, ihr konntet einen kleinen Eindruck von mir gewinnen. Ich bin die nächsten Wochen flexibel und freue mich darauf, euch kennenzulernen."' : '"Ich hoffe, Sie konnten einen ersten Eindruck von mir gewinnen. Ich stehe die nächsten Wochen flexibel zur Verfügung und freue mich auf ein Gespräch."'}
  ALTERNATIV A (persoenlich, Wellenlaenge): ${isEnglish
    ? '"I hope this gives you a small impression of who I am. I would love to find out in a call whether we are also on the same wavelength personally."'
    : isDuForm
        ? '"Ich hoffe, ihr konntet einen kleinen Eindruck von mir gewinnen. Ich wuerde mich freuen, in einem Call herauszufinden, ob wir auch menschlich auf einer Wellenlaenge sind."'
        : '"Ich hoffe, Sie konnten einen Eindruck von mir gewinnen. Ich wuerde mich freuen, in einem Gespraech herauszufinden, ob wir auch persoenlich auf einer Wellenlaenge sind."'}
  ALTERNATIV B (verbindlich): ${isEnglish
    ? '"I would welcome the opportunity to discuss in a brief call how I could contribute to ' + companyName + '."'
    : isDuForm
        ? '"Ich würde mich freuen, in einem kurzen Gespräch zu zeigen, wie ich euch unterstützen kann."'
        : '"Lassen Sie uns in einem kurzen Gespräch ausloten, wie ich Sie unterstützen kann."'}
  ❌ VERBOTEN im CTA: Spezifisches "wie ich bei [Firma] Projekte zwischen X und Y vorantreiben kann" — klingt zu wie ein Verkaufsgespräch, nicht wie eine echte Bewerbung.
- Sign-off: ${isEnglish ? 'End with "Kind regards," or "Best regards," — NEVER use German closing formulas like "Mit freundlichen Grüßen".' : isSpanish ? 'Termina con "Cordialmente," o "Un cordial saludo," — NUNCA uses fórmulas de cierre alemanas.' : 'Beende mit "Mit freundlichen Grüßen" oder (bei Du-Form) "Viele Grüße".'}

=== ${t('SEKTION 6: VERBESSERUNGS-FEEDBACK', 'SECTION 6: IMPROVEMENT FEEDBACK')} ===
${feedbackSection || t('Erste Version — kein vorheriges Feedback.', 'First version — no previous feedback.')}

${t('Schreibe jetzt das Anschreiben. Beginne direkt mit der Anrede:', 'Write the cover letter now. Start directly with the salutation:')}
`.trim();
}
