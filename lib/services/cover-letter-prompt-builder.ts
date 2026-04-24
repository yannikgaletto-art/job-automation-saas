/**
 * Cover Letter Prompt Builder — Pure Function
 *
 * Extracted from cover-letter-generator.ts for maintainability.
 * No DB dependencies, no Supabase imports — input in, prompt string out.
 */

import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';
import { buildLeanBlacklistSection } from './anti-fluff-blacklist';
import { buildGoldenSampleSection } from './golden-samples';
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

// ─── Deterministische Varianten-Rotation (LLM-First-Item-Bias-Workaround) ───
// Ohne Rotation wählt Claude zwangsläufig Variante A. Per jobId-Hash wird genau
// EINE Variante injiziert, die anderen werden explizit verboten.
function pickVariant<T>(jobId: string, bucket: T[], offset = 0): T {
    const hash = [...jobId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return bucket[(hash + offset) % bucket.length];
}

// ─── Main Builder ─────────────────────────────────────────────────────────────
export function buildSystemPrompt(
    profile: UserProfileData,
    job: JobData,
    company: CompanyResearchData,
    style: StyleAnalysis | null,
    ctx: CoverLetterSetupContext | undefined,
    feedback: string[],
    lastWordCount: number,
    jobId: string = ''
): string {
    // Cover-Letter-Output kennt nur zwei Sprachen: DE (Default) und EN.
    // ES als Target-Language wird auf EN gemappt — die UI kann weiterhin auf Spanisch
    // sein, aber der generierte Brief ist nie auf Spanisch.
    const isEnglish = ctx?.tone.targetLanguage === 'en' || ctx?.tone?.targetLanguage === 'es';
    const lang = isEnglish ? 'English' : 'Deutsch';
    const t = (de: string, en: string) => isEnglish ? en : de;
    const companyName = job?.company_name || ctx?.companyName || t('das Unternehmen', 'the company');
    const jobTitle = job?.job_title || t('die ausgeschriebene Stelle', 'the advertised position');
    // Phase 5 (2026-04-24): Pathly-DNA gating for custom-style users.
    // - Preset modes: DNA always active (useDNA = true).
    // - Custom-style + toggle off (default): pure user style (useDNA = false).
    // - Custom-style + toggle on: user style + Pathly signature layer (useDNA = true).
    const isCustomStyle = ctx?.tone?.toneSource === 'custom-style';
    const useDNA = !isCustomStyle || ctx?.tone?.usePathlyDNA === true;
    const rotationSeed = jobId || companyName || 'fallback';
    const openingVariant = useDNA ? pickVariant(rotationSeed, ['A', 'B', 'C', 'D'] as const) : null;
    const closingVariant = useDNA ? pickVariant(rotationSeed, ['A', 'B', 'C'] as const, 7) : null;

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
    // Defense-in-Depth: hasQuote is TRUE only if quote field is a non-empty, non-whitespace string.
    // Prevents phantom quotes from deserialized-but-empty objects or stale persist state.
    const hasQuote = !!ctx?.selectedQuote?.quote?.trim();

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
BEISPIEL INTRO (mit Zitat, Du-Form — BESCHEIDEN, nicht selbstlobend):
"beim Lesen des Telekom-Cases erinnerte ich mich an ein Zitat, das ich mit Euch teilen moechte:
[ZITAT]
– [Autor]
Die Sehnsucht nach dem eigenen Gestalten und damit Teams zu befaehigen sich selbst zu steuern begleiten mich durch viele Stationen in meiner Karriere. Gestalten braucht aber einen Ort, der das zulaesst und diesen Ort erkenne ich in Eurer Arbeit. Deshalb moechte ich mich kurz vorstellen."

BEISPIEL STATIONS-ABSATZ (narrativ, mit JD-Fragment — ICH-Perspektive, nie allwissend):
"Fuer mich bedeutet 'zwischen Technologie und Mensch vermittelt', die Faehigkeit zu besitzen, zwei Sprachen zu sprechen. Diese Uebersetzungsleistung habe ich als Projektleiter einer Quantum-Computing-Gruppe bei Fraunhofer FOKUS taeglich angewendet. Dort unterstuetzte ich Softwareentwickler dabei, ihre Ideen in marktfaehige Business-Modelle zu uebersetzen; mit Kickoffs, OKR-Roadmaps und Stakeholdermanagement. Die zentrale Frage war dabei immer: Loesen wir das, was der Nutzer wirklich braucht?"
--- ENDE FEW-SHOT ---`,

        'formal': `STIL: STRUKTURIERT & PRAEZISE (vereint klassisch-formelle Haltung mit datengetriebener Argumentation)
${hasQuote ? 'OEFFNUNG: Das Zitat und seine Formatierung werden durch Sektion 3 (Aufhaenger) gesteuert. Starte NACH dem Zitat-Block mit einer direkten, sachlichen Bezugnahme auf die Stelle.' : `OEFFNUNG (OHNE ZITAT — mit Stellen-/Firmenbezug):
Beginne mit einer direkten, hoeflichen Bezugnahme auf die Stelle und einem konkreten Firmenbezug aus der Unternehmensanalyse. Max. 2-3 Saetze.
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
    // Phase 5.1 (2026-04-24): Bei Custom-Style MUTED das preset-basierte Tone-Template.
    // Der Referenz-Brief bestimmt Ton + Struktur — nicht eine generische Preset-Dramaturgie.
    // Phase 5.2 (2026-04-24): Kalibrierungs-Checkliste — zwingt Claude zu einem vor-Schreib-Check.
    const activeTone = isCustomStyle
        ? `STIL: DEIN EIGENER SCHREIBSTIL (aus hochgeladenem Referenzbrief — HÖCHSTE PRIORITÄT)

§REFERENZBRIEF-KALIBRIERUNG (PFLICHT vor jedem Satz):
Dein einziger Stil-Maßstab ist der Referenzbrief (siehe CUSTOM-STYLE-Block mit tone/sentence_length/conjunctions/greeting). Die Preset-Auswahl "${ctx?.tone?.preset ?? 'storytelling'}" wirkt hier NICHT als Dramaturgie-Vorgabe — der Referenzbrief allein bestimmt Aufbau und Rhythmus.

KALIBRIERUNGS-CHECKLISTE (vor Beginn prüfen):
1. Nutzt der Referenzbrief Zitate? ${hasQuote ? 'Falls nein im Referenzbrief und User hat Zitat gewählt: Zitat einbinden wie vom User gewollt.' : 'Falls nein: KEINE Zitate erfinden.'}
2. Wie viele Absätze hat der Referenzbrief typischerweise? Halte GENAU diese Zahl ein.
3. Welche Grußformel nutzt der Referenzbrief? ("Mit freundlichen Grüßen" / "Viele Grüße" / "Liebe Grüße"). Übernimm sie EXAKT.
4. Satz-Rhythmus: Kurz-lang-kurz? Oder durchgängig mittellang? Wie im Referenzbrief.
5. Narratives Storytelling (Mini-Geschichten) ODER lineare Faktenlogik? Der Referenzbrief entscheidet.

VERBOTEN (überschreibt Preset-Suggestions):
- Generische Storytelling-Mini-Geschichten mit Situation/Handlung/Ergebnis-Schema, wenn der Referenzbrief linear-sachlich ist.
- Pathos, rhetorische Würzung als Pflicht, wenn der Referenzbrief nüchtern ist.
- "war/wurde mir sofort klar", "sofort erkannte ich" — vorgetäuschte Sofort-Einsichten.
- Anthropomorphe Firma-Zuschreibung wie "[Firma] hat mich gelehrt" oder "Fraunhofer zeigte mir, dass" — Firmen lehren nicht. Schreibe "Bei [Firma] habe ich gelernt".

SCHLUSS: Wird durch Sektion 5 gesteuert.`
        : toneInstructions[ctx?.tone.preset ?? 'formal'];

    // ─── Style Sample (Anti-Competition: Preset hat Vorrang über Style-Sample) ──
    // isCustomStyle already declared at top of function (Phase 5 DNA-gating prerequisite).
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
    // Opener-Regeln einmal gerendert (statt pro Station wiederholt).
    let stationsSection: string;
    if (ctx?.cvStations?.length) {
        const stationNames = ctx.cvStations.map(s => `${s.role} @ ${s.company}`).join(', ');
        const openerRules = `§STATIONS-OPENER — GILT FÜR JEDEN STATIONS-ABSATZ:
Leite JEDEN Stations-Absatz mit EINEM einleitenden Gedanken ein, der erklärt WARUM diese Erfahrung für die Stelle relevant ist. Orientiere dich am Ton der STIL-BEISPIELE (Sektion STIL).
ERLAUBT (Inspiration, keine Schablone): JD-Konzept aufgreifen · zentrale Erkenntnis voranstellen · kurzes JD-Fragment (2-5 Wörter, in Anführungszeichen) als Brücke.
HALLUZINATIONS-SCHUTZ: JD-Fragmente max. 5 Wörter, NUR Arbeitsthemen. Unsicher? Paraphrasiere OHNE Anführungszeichen.
VERBOTEN: Template-Sätze ("Genau daran habe ich...", "Zudem habe ich mich in X wiedergefunden", "von der Expertise des Teams zu lernen") · Meta-Formulierungen ("Weil ${isDuForm ? 'ihr jemanden sucht' : 'Sie jemanden suchen'}") · "Bei [Firma] habe ich..." ohne WARUM · denselben Einleitungstyp in zwei aufeinanderfolgenden Absätzen.
PFLICHT-FRAGMENT: In GENAU EINEM Stations-Opener ein wörtliches Fragment (2-5 Wörter) aus KERNAUFGABEN in Anführungszeichen. Steht es dort EXAKT so? Sonst paraphrasieren OHNE Anführungszeichen.
FALLBACK (kein userContext / matchedRequirement): Starte mit dem konkreten Station-Ergebnis und erkläre Relevanz für ${companyName}.
INHALTLICHE KOHÄRENZ: Opener MUSS zur tatsächlichen Stationsarbeit passen.`;

        stationsSection = `[REGEL: HAUPTTEIL - CV-STATIONEN]
PFLICHT: Verwende AUSSCHLIESSLICH diese ${ctx.cvStations.length} Stationen: ${stationNames}
VERBOT: Erwähne KEINE anderen Stationen aus dem CV — nur die oben genannten sind erlaubt!

- Kein Fließtext-Lebenslauf! Jede Station → eigener kurzer Absatz (max. 3 Sätze).
- 70% Fokus auf erlernten WERT (Was gelernt? Warum für neuen AG relevant?), 30% Kontext.
- REDUZIERE BUZZWORDS DRASTISCH. Max. 2 zentrale Fachbegriffe pro Absatz. Nenne NUR die Technologie, die essenziell zur Stelle passt.
- ROTER FADEN (optional): Prägnantes JD-Schlüsselwort (z.B. "Generalist", "Teamaufbau") darf im Intro UND im ersten Stations-Absatz organisch aufgegriffen werden — nicht wörtlich kopieren.

${openerRules}

` + ctx.cvStations.map(s => {
            const hasUserContext = s.userContext && s.userContext.trim().length > 5;
            return `Station ${s.stationIndex}: ${s.role} @ ${s.company} (${s.period})${hasUserContext ? `
  → 🎯 BEWERBER-KONTEXT (PRIMÄRER ERZÄHLANKER — baue den Absatz hierum; Bullets nur als Stütze):
    "${s.userContext!.trim()}"` : ''}
  → Beweis für Job-Anforderung: "${s.matchedRequirement}"
  → Schlüssel-Achievement: "${s.keyBullet}"
  → Stärken (inhaltliche Basis):
${(s.bullets || []).slice(0, 4).map(b => `     • ${b}`).join('\n')}
  → Zeige im Text: ${s.intent}`;
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
    const quoteIntroBlock = hasQuote ? `[REGEL: EINLEITUNG — JD → ZITAT → BRÜCKE]
Zitat (WORTWÖRTLICH übernehmen, NICHT übersetzen):
"${ctx!.selectedQuote!.quote}"
(Autor: ${ctx!.selectedQuote!.author})

AUFBAU (max. 80 Wörter ohne Zitat):
${openingVariant ? `1. EINLEITUNGSSATZ — PFLICHT-VARIANTE: ${openingVariant} (andere Varianten sind für diesen Brief VERBOTEN):
${openingVariant === 'A' ? `   (A) KLASSISCH — Ausschreibungs-Bezug: "Beim Lesen eurer Ausschreibung fiel mir ein Gedanke ein, den ich teilen möchte:" — 1 Satz, dann direkt Zitat.` : ''}${openingVariant === 'B' ? `   (B) JD-FRAGMENT — Öffne MIT einem wörtlichen Fragment aus der Stellenanzeige (2-5 Wörter, in Anführungszeichen), dann 1 Satz Brücke zum Zitat:
       Beispiel: "'Unternehmerische Verantwortung'; dieses Spannungsverhältnis hat mich angesprochen, und erinnerte mich an:" (Struktur, nicht Wortlaut kopieren).` : ''}${openingVariant === 'C' ? `   (C) STATISTIK — Öffne mit einem konkreten Datenpunkt aus JD/Firmenkontext (Zahl + Kontext), dann 1 Satz zum Zitat:
       §HALLUZINATIONS-SCHUTZ (HART): Die Zahl + Quelle MÜSSEN EXPLIZIT in der Stellenanzeige oder der Unternehmensanalyse (KERNAUFGABEN / company_research) stehen. KEINE erfundenen Studien ("laut einer Studie des BSI", "laut einer Gartner-Studie", "laut Forbes"). Wenn KEINE verifizierbare Zahl verfügbar: Diese Variante ist NICHT geeignet — öffne stattdessen mit einem namentlichen Fakt aus der Unternehmensanalyse ("Auf eurer Website habe ich gelesen, dass [Fakt]").
       Beispiel-Struktur (nur wenn Zahl aus JD/Analyse verfügbar): "Laut [Quelle aus JD] [Zahl]. Diese Zahl führte mich zu einem Zitat von [Autor]:"` : ''}${openingVariant === 'D' ? `   (D) META-HOOK — Öffne mit einer ehrlichen, NEUTRALEN Meta-Beobachtung zum Bewerbungsprozess, dann 1 Satz zum Zitat:
       §VERBOTEN in D: Komparative Selbstaufwertung ("besser als [anderer]", "trägt meine Perspektive besser als jede Selbstbeschreibung", "anders als viele andere"). Niemals andere Bewerber herabsetzen oder sich über sie stellen.
       Beispiel-Struktur: "Ich vermute, ihr erhaltet viele Bewerbungen, die sich ähneln. Deshalb möchte ich mit einem Zitat beginnen, das meine Perspektive auf [Berufsthema] skizziert:" (Struktur, nicht Wortlaut kopieren). Nur bei ${isDuForm ? 'Du-Form + kreativer Firma' : 'moderner, offener Firma'} einsetzen.` : ''}
   PFLICHT: ICH-Perspektive, bescheiden, nicht bewertend. ❌ "wie treffend/präzise/passend" (Selbstlob). ❌ Komparativ-Wertungen über eigene Perspektive.`
: `1. EINLEITUNGSSATZ (1-2 Sätze): Schreibe eine natürliche Hinführung zum Zitat, die zum Stil deines Referenz-Anschreibens passt. ICH-Perspektive, bescheiden, nicht bewertend. ❌ Selbstlob ("wie treffend/präzise"). ❌ Komparativ-Wertungen über die eigene Perspektive. ❌ Erfundene Statistiken.`}

2. ZITAT: Eigene Zeile in Anführungszeichen. Signatur-Zeile PFLICHT:
   "– ${ctx!.selectedQuote!.author}"
   Autor NICHT zusätzlich im Fließtext nennen.

3. BRÜCKE (1-2 Sätze): Verbinde den KONKRETEN GEDANKEN des Zitats mit der Stelle — IMMER ICH-Perspektive.
   ✅ "Für mich bedeutet [Zitat-Kerngedanke], dass [persönliche Reflexion]. Genau diese Verbindung sehe ich in ${isDuForm ? 'eurer' : 'Ihrer'} Arbeit bei ${companyName}. Daher möchte ich mich kurz vorstellen."
   ❌ VERBOTEN: "Genau diese Verbindung suche ich bei ${companyName}" — fordernd, ICH-zentriert. Besser: "sehe ich in eurer Arbeit" (Firma-zentriert).
   ❌ "Genau das ist [Thema]" / "Das ist die Definition von" — allwissend.
   TEST: Passt der Brückensatz nur zu DIESEM Zitat? Wenn er zu jedem Zitat passt → neu schreiben.
${enablePingPong ? `
[PING-PONG — Antithese + Synthese nach Brücke (max. 2 Sätze, MAX 100 Wörter inkl. Zitat, kein eigener Absatz)]
ANTITHESE (1 Satz): Wie du den Gedanken FRÜHER anders gesehen hast (abstrakt, keine Firmennamen).
SYNTHESE (1 Satz): Verbinde mit konkretem ${companyName}-Bezug.` : ''}

[COMPANY-BEZUG] Nutze Firmen-Fakten in ICH-Perspektive ("Da ich auf eurer Website gelesen habe, dass...").` : '';

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

    // ─── Golden Sample Section (Primacy — goes FIRST in prompt) ──────────────
    // Phase 5: gated by useDNA instead of !isCustomStyle. When custom-style + DNA toggle ON,
    // Yannik's reference letter IS loaded as an additional signature layer.
    const goldenSampleSection = (useDNA && (preset === 'storytelling' || preset === 'formal'))
        ? buildGoldenSampleSection(preset as 'storytelling' | 'formal', isEnglish)
        : '';

    // ─── MASTER PROMPT ASSEMBLY ───────────────────────────────────────────────
    return `
${goldenSampleSection}

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
            : '280–380 Wörter, 4–5 inhaltliche Absätze. Anrede und Grußformel sind KEINE eigenen Absätze. Zitat + Brücke gehören zum Einleitungs-Absatz — KEIN separater Absatz für das Zitat allein.'
        }
- Absätze getrennt durch eine Leerzeile. MAXIMAL 5 Absätze (inkl. Schluss). Gruß im letzten Absatz integrieren.
- Beginne direkt mit der Anrede: ${contactPersonGreeting}${ctx?.tone.contactPerson ? ` — ZWINGEND: Nutze EXAKT diese Anrede. NIEMALS auf generische Alternativen wie "Dear Hiring Manager", "Sehr geehrte Damen und Herren" etc. ausweichen. Der Name des Ansprechpartners ist gesetzt.` : ''}
- Anrede-Form: ${isDuForm ? 'DU-FORM (du/dein/euch/dir). Wende diese Du-Form STRIKT auf das GESAMTE Anschreiben an. Kein "Sie" oder "Ihnen" — NIEMALS.' : 'SIE-FORM (Sie/Ihr/Ihnen). Wende diese Sie-Form STRIKT auf das GESAMTE Anschreiben an.'}
- ${t('ABSOLUTE SATZLÄNGE: Max. 25 Wörter pro Satz. Kein einziger Satz darf 25 Wörter überschreiten. Wenn ein Gedanke zu lang wird: Punkt setzen und neuen Satz beginnen.', 'ABSOLUTE SENTENCE LENGTH: Max. 25 words per sentence. Not a single sentence may exceed 25 words. If a thought gets too long: use a period and start a new sentence.')}
- ${t('Max. 2 Kommas pro Satz. Mehr Kommas = Satz aufteilen.', 'Max. 2 commas per sentence. More commas = split the sentence.')}
- ${t('KEIN Gedankenstrich (– oder —) im Fließtext. EINZIGE AUSNAHME: Die Zitat-Signatur-Zeile (z.B. "– Autor"). Überall sonst: Nutze Semikolon (;) oder Punkt statt Gedankenstrich.', 'NO em-dash (– or —) in body text. ONLY EXCEPTION: The quote attribution line ("– Author"). Everywhere else: Use semicolons (;) or periods instead.')}
- ${t('SEMIKOLON-REGEL (PFLICHT ≥2×, aber grammatikalisch korrekt): Semikolon verbindet NUR gleichrangige HAUPTSÄTZE. NIEMALS vor Konjunktionen wie "bevor", "weil", "dass", "obwohl", "damit", "wenn" — dort gehört ein Komma. Test: Beide Teile müssen als eigenständige Sätze funktionieren. ✅ "Ich steuerte die Roadmap iterativ; jede Entscheidung rechtfertigte sich an Ergebnissen." ❌ "Stakeholder früh einzubinden; bevor eine Lösung fertig war."', 'SEMICOLON RULE (MANDATORY ≥2×, but grammatically correct): Semicolons connect ONLY independent main clauses. NEVER before conjunctions like "before", "because", "that", "although". Test: Both parts must work as standalone sentences.')}
- ${t('TONALITÄT: Eloquenz + Bescheidenheit. Zuversichtlich, nicht abgehoben. Lernbereitschaft statt Allwissenheit. Details + verbotene Phrasen: siehe Sektion 2 + VERBOTENE PHRASEN.', 'TONE: Eloquence + Humility. Confident, not arrogant. Eager to learn, not omniscient. Details + forbidden phrases: see Section 2 + FORBIDDEN PHRASES.')}
- ${t('DOPPELPUNKTE: Kein Satz darf mit einem Doppelpunkt enden, gefolgt von Zeilenumbruch. EINZIGE AUSNAHME: Die Zitat-Signatur-Zeile.', 'COLONS: No sentence may end with a colon followed by a line break. ONLY EXCEPTION: The quote attribution line.')}

=== SEKTION 2: TONALITÄT & STIL (HÖCHSTE PRIORITÄT) ===

§ABSOLUT BINDENDE ANREDE-FORM (überschreibt JEDEN Schreibstil, JEDE Stilanalyse, JEDES Template):
${isDuForm
    ? 'DU-FORM (du/dein/euch/dir). Diese Entscheidung ist FINAL und UNVERÄNDERLICH. Auch wenn das Schreibstil-Muster Sie-Form verwendet — im Anschreiben ist AUSSCHLIESSLICH Du-Form erlaubt. Kein einziges "Sie" oder "Ihnen".'
    : 'SIE-FORM (Sie/Ihr/Ihnen). Diese Entscheidung ist FINAL und UNVERÄNDERLICH. Auch wenn das Schreibstil-Muster Du-Form verwendet — im Anschreiben ist AUSSCHLIESSLICH Sie-Form erlaubt. NIEMALS "du", "dein", "euch" oder "dir" verwenden.'}

§ABSOLUT VERBOTENE SATZSTRUKTUREN (gelten für JEDEN Satz, überschreiben alles — auch rhetorisch reizvolle Formulierungen):
- "nicht X, sondern Y" · "nicht nur X, sondern auch Y" · "kein X, sondern Y" · "keine X, sondern Y"
- "weniger X als Y" · "mehr X als Y" · "statt X lieber Y" · "X statt Y"
  → ALLE Kontrast-Strukturen sind verboten, auch wenn sie eleganter klingen.
- Richtige Auflösung: Teile in zwei Sätze. ❌ "X ist kein A, sondern B." → ✅ "X wirkt zunächst wie A. In Wahrheit ist es B."

§PRE-COMMIT-SCAN (PFLICHT nach jedem Absatz, BEVOR du den nächsten Absatz schreibst):
1. Scanne den eben geschriebenen Absatz auf: "nicht ", "kein ", "keine ", "weniger ", "mehr ... als ", "statt ".
2. Folgt dahinter "sondern" oder "als"? → Der Satz ist VERBOTEN. Umschreiben in 2 Sätze.
3. Diese Prüfung ist nicht optional — Claude, du tendierst systematisch zu diesen Strukturen. Halte an und fixe.

§UNTERNEHMENS-URTEILE — STRIKT VERBOTEN:
Du kennst ${companyName} NICHT persönlich. Du darfst das Unternehmen NIEMALS charakterisieren/bewerten in Definitions-Form.
❌ VERBOTEN: "${companyName}, einem Unternehmen, das X als Y begreift"
❌ VERBOTEN: "${companyName} ist für mich ein Vorreiter in Y"
❌ VERBOTEN: "ein Unternehmen, das [Werte/Mission] verkörpert"
❌ VERBOTEN: Jede Appositions-Konstruktion "[Firma], [charakterisierender Nebensatz]".
✅ ERLAUBT: Bezug auf NACHPRÜFBARE Fakten aus der Unternehmensanalyse. "Auf eurer Website habe ich gelesen, dass ihr [konkreter Fakt]." Fakten-Referenz, KEIN Urteil.
✅ ERLAUBT: Eigene Projekte/Arbeit der Firma nennen, ohne zu bewerten.

§SATZLÄNGE + KOMMA (HARTE REGEL, überschreibt Stilfluss):
- Über 25 Wörter? → Punkt setzen, neuen Satz.
- Über 2 Kommas? → Aufteilen, auch wenn der Fluss leidet.
- Vor dem Schreiben JEDES Satzes: Wörter zählen. Kommas zählen. Wenn Limit: sofort kürzen.

${hasQuote ? '' : `§KEIN ZITAT (HART — überschreibt JEDE Stilanalyse, JEDES Few-Shot-Beispiel):
- Der User hat EXPLIZIT KEIN Zitat gewählt. Erfinde, zitiere oder paraphrasiere NIEMALS ein Zitat oder eine Autor-Quelle.
- Keine Zeile mit Autor-Signatur ("– [Autor]"). Keine Anführungszeichen mit literarischen Aussagen.
- Auch wenn die Stilanalyse/das Referenz-Anschreiben Zitate enthält: Der DIESE generierte Brief läuft OHNE Zitat.
- Öffne stattdessen mit einem konkreten Firmenbezug (siehe Stil-Block "OEFFNUNG OHNE ZITAT").`}

§FIRMEN-ANSPRACHE (HART — bricht nur der Ansprechpartner-Name):
- ${isDuForm ? 'Sprich die Firma in DU-Form an: "eurer Website", "euer Team", "ihr baut", "bei euch".' : 'Sprich die Firma in SIE-Form an: "Ihrer Website", "Ihr Team", "Sie bauen", "bei Ihnen".'}
- VERBOTEN: 3rd-Person-Referenz der Firma wie "auf der Website von ${companyName}", "der Ansatz von ${companyName}", "${companyName}s Strategie". Nutze die direkte 2nd-Person-Ansprache.
- Der Firmenname darf erscheinen, aber niemals als Besitzer-Genitiv oder "von [Firma]"-Konstruktion für eigene Assets.

§AUTOR-ICH-PERSPEKTIVE (HART, wenn Zitat vorhanden):
- VERBOTEN: "${hasQuote && ctx?.selectedQuote?.author ? ctx.selectedQuote.author : '[Autor]'} meinte damit", "...wollte damit sagen", "...sagte damit aus", "...intendierte damit" — allwissend über fremde Intentionen.
- ERLAUBT: "Für mich bedeutet das...", "Ich verstehe das so, dass...", "Ich denke, ${hasQuote && ctx?.selectedQuote?.author ? ctx.selectedQuote.author : '[Autor]'} deutete darauf hin, dass...". Immer ICH-perspektivisch.

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

Stations-Uebergaenge: Aktiv formuliert. VERBOTEN: Passiv wie "ist meine Erfahrung bei X relevant fuer". VERBOTEN: "Moechte ich mein Projekt bei X beleuchten". VERBOTEN: "habe ich mich in [Aufgabe] wiedergefunden".
Closing: Warm + bescheiden + Verfuegbarkeit. Eigene Worte — keine Vorlage kopieren. Kein Verkaufs-CTA.`,
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
Closing: Warm and humble — no sales CTA.`
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
[STATION-BRIDGING — 2 WEGE]
CASE A (Inhalts-Match): Brücke über Inhalt/Rolle — zeige die direkte Verbindung.
CASE B (Inhalt dissimilar): Brücke über KONKRETEN, übertragbaren Skill (messbar, nicht generisch).
SELBST-CHECK: "Würde ein Personaler denken: 'Ja, das macht Sinn.'?"`;
    return isCustomStyle && customStyleBlock ? '' : bridgingRulesDE;
})()}

${isCustomStyle ? '' : styleSection}

${buildLeanBlacklistSection()}

${t(`[KONDENSIERTE QUALITAETSREGELN]
1. LERNKURVE: Max 1x im gesamten Text. Vollstaendiger Aussagesatz — nie mit Doppelpunkt enden.
2. GRAMMATIK: Nach erkennen/verstehen/zeigen/wissen → "dass", nie "wie" (wenn Aussage folgt).
3. ABSATZ-ENDEN: Konkretes Ergebnis oder Zuversicht. Nie abstrakte Erkenntnisse.
4. VERB-PHRASEN: Max 1x "zeigte mir" / "hat mir gezeigt" / "wurde mir klar" im gesamten Text.
5. SUBSTANTIV-WIEDERHOLUNG: Dasselbe Substantiv nie in 2 aufeinanderfolgenden Absaetzen.
6. SATZANFAENGE: Nie 2 aufeinanderfolgende Saetze mit demselben Subjekt/Verb.
7. ABSATZ-EROEFFNUNGEN: Jeder Stations-Absatz mit ANDEREM Einleitungstyp (Ergebnis, Kontext, Problem, JD-Fragment).
8. STILMITTEL: Optional, max. 2 (Trikolon, Asyndeton). Nur wenn natuerlich — nie erzwingen.
9. LEVEL-AWARENESS: Bei Junior/Trainee → Lernperspektive erlaubt und erwuenscht.`,
`[CONDENSED QUALITY RULES]
1. LEARNING CURVE: Max 1x total. Complete sentence — never end with a colon.
2. GRAMMAR: After recognize/understand/show → "that", not "how" (when a statement follows).
3. PARAGRAPH ENDINGS: Concrete result or confidence. Never abstract insights.
4. VERB PHRASES: Max 1x "showed me" / "made me realize" in the entire text.
5. NOUN REPETITION: Same noun never in 2 consecutive paragraphs.
6. SENTENCE STARTS: Never 2 consecutive sentences with same subject/verb.
7. PARAGRAPH OPENINGS: Each station paragraph with DIFFERENT opening type.
8. RHETORICAL DEVICES: Optional, max 2 (tricolon, asyndeton). Only when natural.
9. LEVEL AWARENESS: For Junior/Trainee → learning perspective allowed and encouraged.`)}

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
ALLOWED: Website references ("on your website", "in your blog post"). Forbidden: Tool names (Perplexity etc.).`
)}



${t('[INTRO-DICHTE]: Die Einleitung darf MAX 1 eigene CV-Station/Organisation namentlich nennen. Zweite Referenz gehört in den ERSTEN Hauptteil-Absatz.\nALTERNATIVEN (NUR wenn im CV vorhanden UND thematisch passend): Ehrenamtliche Tätigkeiten, Zertifikate, Side Projects oder eine CV-Station die NICHT im Hauptteil vorkommt (keine Dopplung). Wenn nichts passt: Nur ein kurzer Bezug zur Hauptstation.',
'[INTRO DENSITY]: The introduction may name a MAXIMUM of 1 CV station/organization. Second reference belongs in the FIRST main body paragraph.\nALTERNATIVES (ONLY if present in CV AND thematically fitting): Volunteer work, certifications, side projects, or a CV station NOT in the main body.')}

${introGuidance && hasQuote && focus === 'quote' ? companyName + ' muss direkt am Anfang des Anschreibens mindestens einmal fallen.' : companyName + ' muss im ersten Absatz mindestens einmal fallen.'}
${introGuidance && hasQuote && focus === 'quote'
            // WHY: quoteIntroBlock braucht: Einleitungssatz + Zitat (eigene Zeile) + Begründungssatz + Übergangssatz.
            // "Der erster Absatz" ist VERBOTEN als Begriff, weil Claude dann alle Quote-Zeilenumbrüche als
            // eigene Absätze zählt, die gegen die "4-5 Absätze gesamt"-Regel verstoßen. Claude reagiert
            // mit Kompression: Alles in einen einzigen Fließtext-Absatz ohne Leerzeilen.
            ? 'Die EINLEITUNG darf aus bis zu 3 kurzen Abschnitten bestehen (Einleitungssatz, Zitat auf EIGENER Zeile, Begründungssatz + Übergangssatz). Diese Abschnitte zählen zusammen als EIN Einheitenblock — sie gehören zur Einleitung und zählen NICHT als separate der 4-5 Absätze.'
            : 'Der gesamte erste Absatz (Aufhänger + Motivation) darf MAXIMAL 2 SÄTZE lang sein! Keine generischen Abhandlungen über Innovation. Kurz, knackig, direkt zum Punkt.'
        }

[UEBERGANG ZUM HAUPTTEIL]: ${introGuidance && hasQuote && focus === 'quote' ? (isEnglish ? 'The INTRODUCTION (after the quote bridge)' : 'Die EINLEITUNG (nach dem Zitat-Brueckensatz)') : (isEnglish ? 'The FIRST paragraph' : 'Der ERSTE Absatz')} ${t('MUSS organisch zum Hauptteil ueberleiten und den Jobtitel erwaehnen. Formuliere EIGENE Worte — kopiere KEINE Vorlage.', 'MUST organically transition to the main body and mention the job title. Use YOUR OWN words — do NOT copy any template.')}

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
METHODE: Bette ein kurzes JD-Fragment (2-5 Woerter) als Arbeitsthema in deinen Stations-Absatz ein. Eigene Prosa — KEINE kopierbaren Vorlagen.

${t('[STELLENANZEIGE-ZITIERUNG (PFLICHT)]\\nWenn du ein Fragment aus der Stellenanzeige verwendest, setze ein KURZES FRAGMENT (2-5 Woerter) in Anfuehrungszeichen. NIEMALS ganze Saetze zitieren.\\nDas Fragment MUSS ein ARBEITSTHEMA beschreiben (woran gearbeitet wird), NICHT eine Teamstruktur oder Organisationsform.\\nDas Fragment MUSS EXAKT so in den KERNAUFGABEN oben stehen. Wenn unsicher: Paraphrasiere OHNE Anfuehrungszeichen.\\nRICHTIG: Kurzes JD-Fragment als Arbeitsthema in eigener Prosa eingebettet.\\nFALSCH: Ein ganzer Satz als Zitat ist VERBOTEN.\\nFALSCH: Organisationsformen wie in fachuebergreifenden Teams sind kein Arbeitsthema.', '[JOB AD QUOTING (MANDATORY)]\\nWhen quoting from the job ad, use a SHORT FRAGMENT (2-5 words). NEVER quote full sentences.\\nThe fragment MUST describe a WORK TOPIC, NOT a team structure.\\nThe fragment MUST appear EXACTLY in the CORE TASKS above. If unsure: paraphrase WITHOUT quotation marks.\\nCORRECT: I identified with developing strategies...\\nWRONG: Full sentences or organizational forms as quotes.')}`;
    }
    // Fallback: wenn responsibilities leer — job.summary nutzen falls vorhanden
    const summaryHint = (job as any)?.summary
        ? `Orientiere dich an dieser Zusammenfassung der Stelle: "${(job as any).summary}"`
        : 'Stelle sicher, dass der Brief klar auf die Kern-Aufgaben der Stelle eingeht.';
    return `KERNAUFGABEN: Die strukturierten Aufgaben wurden noch nicht extrahiert. ${summaryHint}`;
})()}

=== SEKTION 4: KARRIERE-BEWEISE (FOLGENDE ABSÄTZE) ===
Integriere diese Stationen als fließende Prosa — WICHTIG: Erstelle für jede gewählte Station einen eigenen Absatz.






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
RICHTIG: Fakt + konkretes Ergebnis + Bezug zur Stelle — in eigenen Worten.
REGEL: Wenn du einen Fakt nennst und keinen Bezug zur Stelle herstellen kannst, LASS IHN WEG.`,
`[RELEVANCE REQUIREMENT — EVERY FACT NEEDS A "WHY"]
Every stated fact (activity, tool, result) MUST have a direct connection to the job description or company values.
FORBIDDEN: Isolated facts without explaining WHY they matter to the recruiter.
RULE: If you mention a fact and cannot connect it to the job, LEAVE IT OUT.`)}


${t(`[ZERTIFIKATE UND QUALIFIKATIONEN ALS BRÜCKEN-ELEMENTE]
Wenn der Lebenslauf Zertifikate, Fortbildungen oder anerkannte Qualifikationen enthält (z.B. Design Thinking, Scrum Master, ITIL, Six Sigma), nutze diese als Brücken zum Unternehmen oder zur Stelle.
METHODE: Verknuepfe Zertifikat mit konkretem Unternehmenswert oder Stellenanforderung — eigene Worte, keine Vorlage.
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
HALLUZINATIONS-BREMSE: Verwende NUR Fakten (Ort, News, Werte, Challenges), die EXPLIZIT oben stehen. Wenn ein Datum fehlt → ERFINDE NICHTS.

${cvInput}

${first90DaysSection}

${painPointSection}

${vulnerabilitySection}

${personaSection}

=== SECTION 5: CLOSING & CALL TO ACTION ===
${t('SCHLUSS-REGELN (komprimiert):', 'CLOSING RULES (condensed):')}
- ${t('VERBOTEN: Karriere-Zusammenfassung am Ende. Das ist Fuelltext.', 'FORBIDDEN: Career summary at the end. That is filler.')}
${hasQuote
    ? (closingVariant
        ? `- KLAMMER-PFLICHT — PFLICHT-VARIANTE: ${closingVariant} (andere Varianten sind für diesen Brief VERBOTEN):
${closingVariant === 'A' ? `   (A) AUTOR-RÜCKBEZUG: Starte Closing mit "${ctx!.selectedQuote!.author} hatte recht; aber [neue Wendung des Gedankens]." Entwickle den Zitat-Gedanken weiter, NICHT wörtlich wiederholen.` : ''}${closingVariant === 'B' ? `   (B) JD-REFRAME: Starte Closing mit "Vielleicht ist das die eigentliche Aufgabe eines ${jobTitle}: [Reframe einer JD-Kernaufgabe als indirekte Frage/These, bezugnehmend auf den Zitat-Gedanken]." NIEMALS den Autor erneut nennen.` : ''}${closingVariant === 'C' ? `   (C) PERSÖNLICHER ZOOM-OUT: Starte Closing mit einem eigenen Gedanken, der den Zitat-Kern auf DICH überträgt: "Für mich bedeutet das, dass... Genau das möchte ich bei ${companyName} als ${jobTitle} mitgestalten." NIEMALS Autor-Name, NIEMALS "hatte recht".` : ''}`
        : `- KLAMMER-TECHNIK: Greife im Closing den KERNGEDANKEN des Zitats (nicht die Worte!) auf und entwickle ihn weiter. Zitat NIEMALS wörtlich wiederholen. Passe den Stil an das hochgeladene Referenz-Anschreiben an.`)
    : useDNA
        ? `- KLAMMER-TECHNIK (DNA-Pflicht, auch ohne Zitat): Greife im Closing EIN zentrales Element aus dem Opener wieder auf — ein JD-Fragment in Anführungszeichen, den Firmen-Fakt aus dem Hook ODER den Leitgedanken der Einleitung. NICHT wörtlich wiederholen; entwickle ihn in einer neuen Richtung weiter.
   BEISPIEL-STRUKTUR (JD-Reframe, bevorzugt bei Formal): "Vielleicht ist das die eigentliche Aufgabe eines ${jobTitle}: [JD-Kernaufgabe in eigenen Worten neu gefasst]." ODER: "'[JD-Fragment]' beschreibt für mich keine Formel, sondern eine Haltung — auf diese möchte ich gemeinsam mit ${companyName} hinarbeiten."
   VERBOTEN: Generisches "Ich freue mich auf ein Gespräch, um meine Erfahrungen einzubringen" — das ist kein Klammer-Schluss, das ist Füllsel.`
        : `- ${t('VERBOTEN: Hook aus der Einleitung wörtlich wiederholen. Thematisches Aufgreifen ist erlaubt, aber nicht zwingend.', 'FORBIDDEN: Do not repeat the hook from the opening verbatim. Thematic pickup is allowed but not required.')}`}
- ${t('Formuliere Vorfreude auf EINE konkrete Aufgabe aus der Stellenanzeige. Nenne dabei Jobtitel UND Firmenname im Schlusssatz. Eigene Worte.', 'Express anticipation for ONE specific task from the job ad. Include job title AND company name in the closing. Own words.')}
- ${t('Schlusssatz: Warm + bescheiden + Verfuegbarkeit. Kein Verkaufs-CTA.', 'Closing sentence: Warm + humble + availability. No sales CTA.')}
- ${t('SIGNATUR-ZEILE (PFLICHT, zwei separate Zeilen):\nZeile 1: Grußformel (Regel unten)\nZeile 2: "[Dein Name]" als Platzhalter — der User ersetzt das selbst. NIEMALS einen erfundenen Namen einsetzen.',
     'SIGNATURE LINE (MANDATORY, two separate lines):\nLine 1: Sign-off phrase (rule below)\nLine 2: "[Your Name]" as placeholder — the user replaces it. NEVER invent a name.')}
- ${isEnglish
    ? 'Sign-off phrase: "Kind regards," or "Best regards,".'
    : isDuForm
        ? 'Grußformel: "Viele Grüße," (Default, warm) oder "Liebe Grüße," (sehr vertraut).'
        : 'Grußformel: "Viele Grüße," — DEFAULT für Sie-Form (warm, professionell). "Mit freundlichen Grüßen," NUR wenn Firma eindeutig Konzern/Behörde/öffentlicher Sektor (z.B. Siemens, Volkswagen, Ministerien). Im Zweifel: "Viele Grüße,".'}

=== ${t('SEKTION 6: VERBESSERUNGS-FEEDBACK', 'SECTION 6: IMPROVEMENT FEEDBACK')} ===
${feedbackSection || t('Erste Version — kein vorheriges Feedback.', 'First version — no previous feedback.')}

${t('Schreibe jetzt das Anschreiben. Beginne direkt mit der Anrede:', 'Write the cover letter now. Start directly with the salutation:')}
`.trim();
}
