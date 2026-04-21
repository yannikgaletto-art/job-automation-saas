/**
 * Golden Samples — Cover Letter Quality Anchors
 *
 * These annotated reference letters serve as stylistic calibration for Claude.
 * Claude IMITATES the structure, tone, and rhetoric — but replaces ALL content
 * with the user's real data (CV stations, company, quote, job title).
 *
 * Architecture:
 *   - Golden Sample goes at the TOP of the system prompt (Primacy Effect)
 *   - Claude reads the style first, then the context data, then the rules
 *   - This produces more consistent output than 63 individual rules
 *
 * Presets:
 *   - Storytelling + Sie: Narrative, Klammer-Technik, rhetorische Fragen
 *   - Formal + Sie: Claim→Beweis→Implikation, sachlich, strukturiert
 *
 * Du-Form: Same structure, Claude adapts pronouns via the Anrede-Form rule.
 * English: Claude adapts from the German structure — EN-specific sample added when needed.
 */

// ─── Storytelling Golden Sample ────────────────────────────────────────────────
const STORYTELLING_SAMPLE = `Sehr geehrter Herr Guenther,

beim Lesen der Stellenausschreibung bei Siemens blieb ich an einem Gedanken haengen, den Kaoru Ishikawa so formuliert hat:

\u201eQualitaetskontrolle beginnt und endet mit Schulung.\u201c
\u2013 Kaoru Ishikawa

Ishikawa spricht davon, dass nachhaltige Transformation kein Rollout, sondern ein Lernprozess sei. In diesem Lernprozess gehe es darum, die Haltungen der Menschen zu veraendern. Oder anders gefragt: Was nuetzt das praeziseste KI-Modell, wenn niemand versteht, welche Frage es eigentlich beantwortet? Diese Ueberzeugung zieht sich wie ein roter Faden durch meine Stationen. Da ich es auch in den Projekten im Industrial Metaverse erkenne, moechte ich mich kurz vorstellen.

Was mich am Industrial Metaverse festhaelt ist die Idee, dass physische Prozesse und digitale Entscheidungen in Echtzeit synthetisieren. Genau diese Verbindung habe ich bei Ingrano Solutions von der anderen Seite kennengelernt: einem B2B-Beratungsunternehmen mit regulatorischem Handlungsbedarf durch NIS-2, in dem ich automatisierte Workflows fuer die Lead-Generierung konzipierte und Vertriebsprozesse in Close.io messbar machte. Die zentrale Frage war dabei immer dieselbe: Loesen wir das, was der Kunde wirklich braucht?

Fraunhofer FOKUS hat diese Frage fuer mich vertieft; da in diesem Umfeld Forschung und Markt selten dieselbe Sprache sprechen. Gleichzeitig braucht es die Faehigkeit \u201eGeschaeftsanforderungen fuer digitale Loesungen\u201c zu erheben. Als Projektleiter einer Quantum-Computing-Gruppe begleitete ich SpinOffs dabei, ihre Ideen in tragfaehige Business-Modelle zu uebersetzen; mit Kickoffs, OKR-Roadmaps und Stakeholdermanagement. Die eigentliche Herausforderung war dabei selten technischer Natur: Sie lag darin, Fachabteilungen frueh genug ins Boot zu holen, bevor eine Loesung fertig war. Der Antrieb dahinter blieb derselbe wie bei Ingrano: die Frage, ob das, was wir bauen, wirklich das loest, was gebraucht wird.

Ishikawa hatte recht; aber der Lernprozess endet nicht bei Schulung. Er endet dort, wo jemand die Verbindung zwischen einer Entscheidung und ihrer Wirkung wirklich versteht. Genau das moechte ich als Junior Digitalization Consultant bei Siemens mitgestalten. Ich stehe in den naechsten Wochen flexibel fuer ein Gespraech zur Verfuegung.

Mit freundlichen Gruessen`;

const STORYTELLING_ANNOTATIONS = `STIL-ANALYSE DIESES MUSTERS (was du uebernehmen sollst):
- KLAMMER-TECHNIK: Zitat eroeffnet → Zitat-Rueckbezug im Schlusssatz ("Ishikawa hatte recht; aber...")
- ROTER FADEN: Eine wiederkehrende Frage ("Loesen wir das, was der Kunde wirklich braucht?") verbindet die Stationen
- RHETORISCHE FRAGE: "Was nuetzt das praeziseste KI-Modell, wenn niemand versteht...?" — max. 1x im Text
- ICH-PERSPEKTIVE: Durchgehend. Keine allwissenden Firmen-Statements.
- UEBERGAENGE: Stationen durch gemeinsame Frage oder Skill verbunden, nicht durch Aufzaehlung (Anzahl der Stationen variiert je nach User)
- LERNKURVE: Eingebettete Beobachtung innerhalb der Station — nie als separater Erkenntnissatz am Absatzende. Formuliere immer eigene Worte fuer diese Technik.
- SCHLUSS: Warm, bescheiden, keine Karriere-Zusammenfassung. Zitat-Rueckbezug + konkreter Jobtitel + Verfuegbarkeit.
- KEINE Template-Saetze: Jede Formulierung ist einzigartig fuer diesen Kontext`;

// ─── Formal Golden Sample ──────────────────────────────────────────────────────
const FORMAL_SAMPLE = `Sehr geehrte Frau Hoffmann,

Charlie Munger hat einmal gesagt:

\u201eAll I want to know is where I\u2019m going to die, so I\u2019ll never go there.\u201c
\u2013 Charlie Munger

Mit Blick auf Ihre Ausschreibung lassen sich Szenarioanalysen und M&A-Bewertungen erkennen. Mungers Prinzip ist dafuer keine Metapher sondern eine Methode: Systematisch ausschliessen, was nicht traegt, bevor man empfiehlt, was funktioniert. Und mit dieser Verbindung zwischen Modell und Urteil freue ich mich bei Ihnen als Finanzanalyst zu bewerben.

Diese Verbindung habe ich bei Fraunhofer FOKUS systematisch erprobt. Als Projektleiter einer Quantum-Computing-Gruppe begleitete ich SpinOffs dabei, Technologiepotenziale in belastbare Business Cases zu uebersetzen; mit Marktgroessenanalysen, Wettbewerbsvergleichen und strukturierten Go-to-Market-Empfehlungen. Die wiederkehrende Herausforderung war die Frage dahinter: Welche Annahme traegt und welche bricht zuerst?

\u201eDatenbasierte Entscheidungen in komplexen Marktumfeldern\u201c; diese Anforderung aus Ihrer Ausschreibung beschreibt meinen Alltag bei Ingrano Solutions praeziser, als ich es selbst formuliert haette. In einem B2B-Beratungsunternehmen mit regulatorischem Handlungsbedarf durch NIS-2 identifizierte ich Automatisierungspotenziale, strukturierte Vertriebsprozesse in Close.io und machte Lead-Generierung erstmals quantifizierbar.

Was Fraunhofer und Ingrano gemeinsam haben: In beiden Umfeldern war die entscheidende Kompetenz die Faehigkeit, die richtige Frage frueh genug zu stellen. Genau das erkenne ich in Bains Arbeit und deshalb bewerbe ich mich. Ich stehe flexibel fuer ein Gespraech zur Verfuegung.

Mit freundlichen Gruessen`;

const FORMAL_ANNOTATIONS = `STIL-ANALYSE DIESES MUSTERS (was du uebernehmen sollst):
- KLAMMER-TECHNIK: Zitat eroeffnet → letzter Absatz bindet die gemeinsame Kompetenz zusammen
- CLAIM-BEWEIS-STRUKTUR: Jeder Absatz beginnt mit einer Behauptung und belegt sie sofort
- SACHLICH + PRAEZISE: Keine rhetorischen Fragen, keine persoenlichen Anekdoten ohne Stellenbezug
- JD-FRAGMENT-INTEGRATION: "Datenbasierte Entscheidungen in komplexen Marktumfeldern" — kurzes Fragment in Anfuehrungszeichen
- AKTIVE VERBEN: "erprobt", "begleitete", "identifizierte", "strukturierte", "machte quantifizierbar"
- SCHLUSS: Kompakt, verbindlich, kein Pathos. Gemeinsame Kompetenz + Bewerbungssatz + Verfuegbarkeit.
- SEMIKOLON statt Gedankenstrich: "zu uebersetzen; mit Marktgroessenanalysen"
- KEINE allwissenden Wenn-dann-Wahrheiten, KEIN "nicht nur...sondern"`;

// ─── Public API ────────────────────────────────────────────────────────────────

export type PresetType = 'storytelling' | 'formal';

/**
 * Returns the annotated Golden Sample section for the system prompt.
 * This goes at the TOP of the prompt (Primacy Effect).
 *
 * @param preset - 'storytelling' or 'formal'
 * @param isEnglish - if true, adds EN adaptation instruction
 */
export function buildGoldenSampleSection(preset: PresetType, isEnglish: boolean = false): string {
    const sample = preset === 'storytelling' ? STORYTELLING_SAMPLE : FORMAL_SAMPLE;
    const annotations = preset === 'storytelling' ? STORYTELLING_ANNOTATIONS : FORMAL_ANNOTATIONS;

    const langNote = isEnglish
        ? '\nSPRACH-ADAPTATION: Das Muster ist auf Deutsch. Uebertrage Struktur, Ton und Rhetorik ins Englische. Uebersetze NICHT woertlich — adaptiere den Stil fuer englische Leser.'
        : '';

    return `=== DEIN STILMUSTER (LIES DAS ZUERST — HOECHSTE PRIORITAET) ===

Das folgende Anschreiben ist dein Stilmuster. Es definiert Struktur, Ton und Rhetorik.
IMITIERE den Stil. ERSETZE alle Inhalte (Firmen, Stationen, Zitate, Fakten) mit den echten Daten des Users (siehe Sektionen unten).
KOPIERE KEINE Saetze oder Phrasen aus diesem Muster — jedes Anschreiben ist einzigartig.
${langNote}

--- REFERENZ-ANSCHREIBEN ---
${sample}
--- ENDE REFERENZ ---

${annotations}`;
}
