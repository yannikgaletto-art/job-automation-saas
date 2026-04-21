/**
 * Cover Letter Quality Scorer
 * 
 * Deterministic regex-based checks against the Feature Table.
 * Run: npx tsx scripts/test-cl-quality.ts
 * 
 * Checks that CAN be automated (regex):
 *   ✅ Klammer-Schluss, Jobtitel im Schluss, wiedergefunden, 
 *      Satzlänge, Template-Phrasen, "nicht nur...sondern",
 *      Station-Opener-Varianz, Verb-Phrase-Wiederholung
 * 
 * Checks that CANNOT be automated (semantic):
 *   ⚠️ Roter Faden, Zitat-Brücke Qualität, Ich-Perspektive
 */

// ─── Test Data ──────────────────────────────────────────────────────────────────

interface TestCase {
    name: string;
    preset: 'storytelling' | 'formal' | 'custom';
    stationCount: number;
    quoteAuthor: string;      // Last name of quote author
    jobTitle: string;         // Expected job title in closing
    companyName: string;      // Expected company name
    letter: string;
}

const TEST_CASES: TestCase[] = [
    {
        name: 'T1 — Storytelling + Du + 2 Stationen',
        preset: 'storytelling',
        stationCount: 2,
        quoteAuthor: 'Welch',
        jobTitle: 'Junior Consultant Digital Transformation',
        companyName: 'HSO',
        letter: `Hallo Andrea,

beim Lesen der HSO-Ausschreibung für die Stelle als Junior Consultant Digital Transformation musste ich an ein Zitat denken, das ich mit dir teilen möchte:

„Verändere dich, bevor du es musst."
– Jack Welch

Für mich beschreibt dieser Satz keine Managementweisheit, sondern eine Haltung. Ich erkenne sie in dem, was HSO tut: Kunden nicht reaktiv begleiten, sondern proaktiv mit Microsoft-Technologien neu ausrichten. Deshalb möchte ich mich kurz vorstellen.

„Workshops zur Aufnahme von Kundenprozessen" kenne ich nicht als Methode, sondern als Verantwortung. Bei Fraunhofer leitete ich Scoping-Workshops und Kickoffs für Transformationsprojekte zwischen Spin-offs und KI-Partnern aus Wirtschaft und Verwaltung. Die eigentliche Herausforderung war dabei selten technischer Natur; sie lag darin, GenAI-Potenziale so zu übersetzen, dass Fachabteilungen früh genug mitsteuern konnten. Dabei entstand für mich ein Gespür dafür, dass Kundenprozesse erst dann wirklich verstanden sind, wenn man aufgehört hat, sie zu erklären, und anfängt, sie gemeinsam zu durchdenken.

Dass Ideen nur dann skalieren, wenn Prozesse und Systeme zusammenwachsen, habe ich bei Xorder Menues von Grund auf erlebt. Als Co-Founder baute ich digitale Abläufe mit Low-Code-Lösungen auf und entwickelte gleichzeitig CRM-Strukturen für effiziente Geschäftsabläufe. Die strategische Roadmap priorisierte ich agil; und übersetzte Anforderungen direkt in operative Entwicklungszyklen. Diese Nähe zwischen betriebswirtschaftlichem Denken und technischer Umsetzung ist der Grund, warum mich HSOs Ansatz, Kundenanforderungen in IT-Lösungen zu überführen, direkt anspricht.

Welch hatte recht; aber Veränderung braucht jemanden, der sie gestaltet, bevor sie nötig wird. Ich freue mich darauf, genau das als Junior Consultant Digital Transformation bei HSO mitzutun. In den nächsten Wochen stehe ich flexibel für ein Gespräch zur Verfügung.

Viele Grüße`
    },
    {
        name: 'T2 — Storytelling + Du + 3 Stationen',
        preset: 'storytelling',
        stationCount: 3,
        quoteAuthor: 'Kotler',
        jobTitle: 'Marketing Automation Consultant',
        companyName: 'Reply',
        letter: `Hallo Claudia,

als ich die Ausschreibung von Reply als Marketing Automation Consultant las, fiel mir ein Gedanke ein, den ich gerne teilen möchte:

„Die beste Werbung wird von zufriedenen Kunden gemacht."
– Philip Kotler

Für mich bedeutet dieser Gedanke, dass jede Automatisierung, jede Kampagne und jede Segmentierung letztlich auf ein einziges Ziel einzahlt: echte Kundenerlebnisse zu gestalten, die bleiben. Deshalb freue ich mich, mich als Marketing Automation Consultant bei euch vorzustellen.

Replys Anspruch, digitale Transformation nicht nur zu begleiten, sondern aktiv zu gestalten, kenne ich aus meiner Zeit bei Ingrano Solutions. Dort übernahm ich die Konzeption und Implementierung automatisierter Workflows; von der Lead-Generierung bis zur CRM-Pflege in Close.io. „Automatisierter Marketingprozesse" war dabei kein Selbstzweck, sondern das Mittel, um Kundenkommunikation messbar und skalierbar zu machen. Der entscheidende Schritt war jeweils derselbe: Anforderungen analysieren, Prozesse strukturieren und dann konsequent umsetzen.

Workshops und Trainings als Beratungsformat zu nutzen, habe ich bei Fraunhofer gelernt. Als Innovation Management Consultant leitete ich Scoping-Workshops und Kickoffs für B2B-Partner aus Wirtschaft und Verwaltung; mit Fokus auf KI-Transformationsprojekte rund um GenAI und LLMs. Dabei zeigte sich, dass Kunden am meisten profitieren, wenn Beratung nicht bei der Strategie aufhört, sondern bis in die operative Umsetzung reicht.

Den Aufbau digitaler Prozesse von Grund auf kenne ich aus meiner Zeit als Co-Founder bei Xorder Menues. Dort nutzte ich Low-Code-Lösungen wie Bubble und Make, um Marketingprozesse und CRM-Strukturen ressourcenschonend aufzubauen. Agile Priorisierung und schnelle Übersetzung von Ideen in Entwicklungszyklen waren dabei mein tägliches Handwerkszeug.

Ich freue mich besonders darauf, gemeinsam mit euren Kunden innovative Kampagnen zu entwickeln und dabei von den Erfahrungen des Reply-Teams zu lernen. Für ein Gespräch stehe ich gerne flexibel zur Verfügung.

Viele Grüße`
    },
    {
        name: 'T3 — Custom Preset + Sie + 1 Station',
        preset: 'custom',
        stationCount: 1,
        quoteAuthor: 'Ginsburg',
        jobTitle: 'Consultant',
        companyName: 'Nortal',
        letter: `Sehr geehrte Frau Danzig,

beim Lesen Ihrer Ausschreibung für die Stelle als (Senior) Consultant für digitale Identitäten fiel mir ein Gedanke ein, den ich gerne mit Ihnen teilen möchte:

„Kämpfe für die Dinge, die dir wichtig sind, aber tue es auf eine Art und Weise, die andere dazu bringt, sich dir anzuschließen."
– Ruth Bader Ginsburg

Für mich beschreibt dieser Gedanke genau die Haltung, die es braucht, um in einem so komplexen Feld wie dem EUDI-Wallet-Ökosystem wirklich etwas zu bewegen. Daher möchte ich mich Ihnen als Kandidat für diese Position kurz vorstellen.

Nortal begleitet Unternehmen und Verwaltungen seit über 25 Jahren durch tiefgreifende digitale Transformation; das hat mich von Anfang an angesprochen. Insbesondere die Verbindung von gesellschaftlichem Impact und technologischer Exzellenz erinnert mich an meine Zeit als Innovation Management Consultant beim Fraunhofer-Institut, wo ich Transformationsprojekte an der Schnittstelle von KI-Technologie und Organisationsrealität gesteuert habe. Dabei arbeitete ich eng mit Partnern aus Wirtschaft und öffentlicher Verwaltung zusammen, um GenAI- und LLM-Anwendungen von der Idee in umsetzbare Konzepte zu überführen. Den Fokus legte ich stets darauf, Anforderungen zu verstehen und daraus konkrete Zielvisionen zu entwickeln; eine Arbeitsweise, die ich direkt in die Beratung rund um digitale Identitäten einbringen möchte.

Gleichzeitig habe ich mich in der Aufgabe „Workshops mit Stakeholdern" sehr wiedergefunden, da das Moderieren von Scoping-Workshops und Kickoffs zu meiner regelmäßigen Arbeit bei Fraunhofer gehörte. Und da die Teilnehmer oft aus völlig unterschiedlichen Fachkulturen stammten, lernte ich früh, wie man komplexe technische Sachverhalte so aufbereitet, dass interdisziplinäre Teams gemeinsam zu tragfähigen Entscheidungen kommen. Zudem leitete ich eine Projektgruppe zu Quantum Computing, in der ich Wissen aktiv weitergab und Kollegen methodisch begleitete; genau die Haltung, die ich auch bei Nortal einbringen möchte.

Ich hoffe, Sie konnten einen kleinen Eindruck von mir gewinnen. Besonders freue ich mich darauf, an konkreten Use Cases für Wallet-Ökosysteme mitzuwirken und dabei von der Expertise Ihres Teams zu lernen. Ich bin in den nächsten Wochen flexibel und freue mich sehr auf ein erstes Gespräch mit Ihnen.

Mit freundlichen Grüßen`
    },
    {
        name: 'T4 — Formal + Sie + 3 Stationen + alle Toggles',
        preset: 'formal',
        stationCount: 3,
        quoteAuthor: 'Sagan',
        jobTitle: 'Digital & AI Transformation Consultant',
        companyName: 'Mitsui',
        letter: `Sehr geehrte Damen und Herren,

als ich die Ausschreibung der Mitsui Chemicals Group für diese Rolle las, fiel mir ein Gedanke ein, den ich gerne teilen möchte:

„Wissenschaft ist viel mehr eine Art zu denken als eine Ansammlung von Wissen."
– Carl Sagan

Für mich bedeutet das: Wer Transformation gestaltet, braucht zuerst eine Haltung; erst dann die richtigen Werkzeuge. Mit dieser Überzeugung möchte ich mich als Digital & AI Transformation Consultant bei Ihnen vorstellen.

Der Anspruch, neuen Wert zu schaffen, ist bei Mitsui Chemicals kein Marketingversprechen, sondern eine operative Frage. Ich kenne diese Frage aus meiner Zeit bei Ingrano Solutions, wo ich Vertriebsprozesse durch automatisierte Workflows neu strukturierte. Die „Analyse und Redesign von Geschäftsprozessen" war dort kein einmaliges Projekt, sondern ein fortlaufender Arbeitsmodus; mit Close.io als zentralem CRM und Lead-Generierung, die ich erstmals messbar und skalierbar machte.

Transformationsprojekte zwischen Forschung und Praxis zu steuern, war der Kern meiner Arbeit bei Fraunhofer. Ich begleitete SpinOffs bei der Einführung von GenAI- und LLM-basierten Lösungen für B2B-Kunden und öffentliche Auftraggeber. Dabei führte ich Scoping-Workshops durch, übernahm Rollen-Trainings und leitete eine Quantum-Computing-Projektgruppe; stets mit dem Ziel, Wissenstransfer so zu gestalten, dass er nach Projektende trägt.

Dass Ideen nur dann wirken, wenn sie operativ umsetzbar sind, habe ich als Co-Founder bei Xorder Menues selbst erfahren. Ich baute digitale Prozesse mit Low-Code-Lösungen wie Bubble und Make auf; ressourcenschonend, iterativ und nah an den tatsächlichen Nutzeranforderungen. Die strategische Roadmap zu priorisieren und Ideen schnell in Entwicklungszyklen zu übersetzen, war dort meine tägliche Verantwortung.

Ich freue mich darauf, bei Mitsui Chemicals konkret daran mitzuwirken, wie KI-gestützte Automatisierung in produktive Systeme überführt wird. Für ein Gespräch stehe ich Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen`
    }
];

// ─── Quality Checks ─────────────────────────────────────────────────────────────

type Result = '✅' | '⚠️' | '❌';

interface CheckResult {
    name: string;
    result: Result;
    detail: string;
    automatable: boolean;
}

function getLastParagraph(letter: string): string {
    const paragraphs = letter.split(/\n\n+/).filter(p => p.trim().length > 0);
    return paragraphs[paragraphs.length - 1] || '';
}

function getStationParagraphs(letter: string): string[] {
    const paragraphs = letter.split(/\n\n+/).filter(p => p.trim().length > 0);
    // Skip: salutation (0), quote block (1-2), intro bridge (3), closing (last), sign-off (last)
    // Station paragraphs are the middle ones
    if (paragraphs.length <= 4) return paragraphs.slice(2, -1);
    return paragraphs.slice(3, -1); // Skip salutation, quote, bridge
}

function checkKlammer(tc: TestCase): CheckResult {
    const lastPara = getLastParagraph(tc.letter);
    const hasAuthorRef = lastPara.toLowerCase().includes(tc.quoteAuthor.toLowerCase());
    return {
        name: 'Klammer-Schluss',
        result: hasAuthorRef ? '✅' : '❌',
        detail: hasAuthorRef 
            ? `"${tc.quoteAuthor}" im Schlussabsatz gefunden` 
            : `"${tc.quoteAuthor}" fehlt im Schlussabsatz`,
        automatable: true,
    };
}

function checkJobtitelSchluss(tc: TestCase): CheckResult {
    const lastPara = getLastParagraph(tc.letter);
    const hasTitle = lastPara.toLowerCase().includes(tc.jobTitle.toLowerCase());
    // Also check partial match (e.g., "Consultant" in "Junior Consultant")
    const words = tc.jobTitle.split(' ');
    const hasPartial = words.length > 1 && words.some(w => w.length > 5 && lastPara.toLowerCase().includes(w.toLowerCase()));
    return {
        name: 'Jobtitel im Schluss',
        result: hasTitle ? '✅' : hasPartial ? '⚠️' : '❌',
        detail: hasTitle ? `"${tc.jobTitle}" im Schluss gefunden` : hasPartial ? `Teilmatch gefunden` : `Jobtitel fehlt im Schluss`,
        automatable: true,
    };
}

function checkWiedergefunden(tc: TestCase): CheckResult {
    const has = /wiedergefunden/i.test(tc.letter);
    return {
        name: 'Kein "wiedergefunden"',
        result: has ? '❌' : '✅',
        detail: has ? '"wiedergefunden" im Text gefunden' : 'Sauber',
        automatable: true,
    };
}

function checkTemplatePhrases(tc: TestCase): CheckResult {
    const TEMPLATE_TRAPS = [
        { pattern: /Die eigentliche Herausforderung war dabei selten technischer Natur/i, label: 'Lernkurven-Kopie aus Golden Template' },
        { pattern: /Ich hoffe,?\s*(Sie|ihr) konntet?\s*einen kleinen Eindruck/i, label: 'Closing-Template-Kopie' },
        { pattern: /genau daran habe ich bei .+ gearbeitet/i, label: 'Wiederfinden-Template' },
        { pattern: /habe ich mich in .+ sehr wiedergefunden/i, label: 'Wiederfinden-Pattern' },
        { pattern: /von den Erfahrungen .+(Teams?|Kolleg) zu lernen/i, label: 'Floskel: vom Team lernen' },
        { pattern: /nicht nur.*sondern (auch )?aktiv/i, label: '"nicht nur...sondern aktiv"' },
    ];
    const found = TEMPLATE_TRAPS.filter(t => t.pattern.test(tc.letter));
    return {
        name: 'Keine Template-Phrasen',
        result: found.length === 0 ? '✅' : '❌',
        detail: found.length === 0 ? 'Sauber' : `GEFUNDEN: ${found.map(f => f.label).join(', ')}`,
        automatable: true,
    };
}

function checkSatzlaenge(tc: TestCase): CheckResult {
    // Split into sentences (rough — by period, exclamation, question mark)
    const sentences = tc.letter.split(/[.!?]+\s+/).filter(s => s.trim().length > 10);
    const longSentences = sentences.filter(s => s.split(/\s+/).length > 30);
    return {
        name: 'Satzlänge ≤30 Wörter',
        result: longSentences.length === 0 ? '✅' : longSentences.length <= 2 ? '⚠️' : '❌',
        detail: longSentences.length === 0 ? 'Alle Sätze ≤30 Wörter' : `${longSentences.length} Satz/Sätze >30 Wörter`,
        automatable: true,
    };
}

function checkNichtNurSondern(tc: TestCase): CheckResult {
    const has = /nicht nur.*sondern/i.test(tc.letter);
    return {
        name: 'Kein "nicht nur...sondern"',
        result: has ? '❌' : '✅',
        detail: has ? '"nicht nur...sondern" gefunden' : 'Sauber',
        automatable: true,
    };
}

function checkVerbPhraseRepetition(tc: TestCase): CheckResult {
    const VERB_PHRASES = [
        /zeigte mir/gi, /hat mir gezeigt/gi, /wurde mir klar/gi,
        /habe ich gelernt/gi, /konnte ich/gi, /durfte ich/gi,
        /hat mich gelehrt/gi, /wurde mir bewusst/gi,
        /showed me/gi, /taught me/gi, /made me realize/gi,
    ];
    const repeated: string[] = [];
    for (const vp of VERB_PHRASES) {
        const matches = tc.letter.match(vp);
        if (matches && matches.length > 1) {
            repeated.push(`"${matches[0]}" ×${matches.length}`);
        }
    }
    return {
        name: 'Verb-Phrase max 1×',
        result: repeated.length === 0 ? '✅' : '❌',
        detail: repeated.length === 0 ? 'Sauber' : `Wiederholungen: ${repeated.join(', ')}`,
        automatable: true,
    };
}

function checkStationOpenerVarianz(tc: TestCase): CheckResult {
    if (tc.stationCount <= 1) {
        return { name: 'Station-Opener-Varianz', result: '✅', detail: 'N/A (1 Station)', automatable: true };
    }
    const stations = getStationParagraphs(tc.letter);
    if (stations.length < 2) {
        return { name: 'Station-Opener-Varianz', result: '⚠️', detail: `Nur ${stations.length} Stations-Absätze erkannt`, automatable: true };
    }
    // Check if station openings start with the same pattern
    const openers = stations.map(s => {
        const firstSentence = s.split(/[.!?]/)[0].trim().toLowerCase();
        // Extract opening pattern (first 3-4 words)
        return firstSentence.split(/\s+/).slice(0, 4).join(' ');
    });
    
    // Check for "kenne ich aus" repetition
    const kenneIchPattern = stations.filter(s => /kenne ich aus/i.test(s.split(/[.!?]/)[0]));
    const habeIchPattern = stations.filter(s => /habe ich bei/i.test(s.split(/[.!?]/)[0]) || /habe ich als/i.test(s.split(/[.!?]/)[0]));
    
    const repetitive = kenneIchPattern.length >= 2 || habeIchPattern.length >= 2;
    
    return {
        name: 'Station-Opener-Varianz',
        result: repetitive ? '❌' : '✅',
        detail: repetitive 
            ? `Repetitives Opener-Muster erkannt (${kenneIchPattern.length}× "kenne ich", ${habeIchPattern.length}× "habe ich")` 
            : `Opener variieren: ${openers.map(o => `"${o}..."`).join(' | ')}`,
        automatable: true,
    };
}

function checkIchPerspektive(tc: TestCase): CheckResult {
    // Heuristic: Check if company is described in 3rd person as objective fact
    const companyStatements = [
        new RegExp(`${tc.companyName}\\s+(begleitet|ist|hat|wurde|bietet|steht|verfolgt)`, 'i'),
        /der Anspruch.*ist.*kein/i,
    ];
    const violations = companyStatements.filter(p => p.test(tc.letter));
    return {
        name: 'Ich-Perspektive',
        result: violations.length === 0 ? '✅' : '⚠️',
        detail: violations.length === 0 ? 'Durchgehend Ich-Perspektive' : `${violations.length} mögliche Firmen-Statement(s) erkannt`,
        automatable: false, // Heuristic, not fully reliable
    };
}

// ─── Runner ──────────────────────────────────────────────────────────────────────

function runAllChecks(tc: TestCase): CheckResult[] {
    return [
        checkKlammer(tc),
        checkJobtitelSchluss(tc),
        checkWiedergefunden(tc),
        checkTemplatePhrases(tc),
        checkSatzlaenge(tc),
        checkNichtNurSondern(tc),
        checkVerbPhraseRepetition(tc),
        checkStationOpenerVarianz(tc),
        checkIchPerspektive(tc),
    ];
}

// ─── Output ──────────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════');
console.log('  COVER LETTER QUALITY SCORER — Deterministic Feature Table');
console.log('═══════════════════════════════════════════════════════════════\n');

let totalGreen = 0;
let totalChecks = 0;

for (const tc of TEST_CASES) {
    console.log(`\n┌─── ${tc.name} ───────────────────────────────`);
    console.log(`│ Preset: ${tc.preset} | Stationen: ${tc.stationCount} | Quote: ${tc.quoteAuthor}`);
    console.log('├─────────────────────────────────────────────────');
    
    const results = runAllChecks(tc);
    let green = 0;
    for (const r of results) {
        const icon = r.result;
        const auto = r.automatable ? '' : ' (heuristisch)';
        console.log(`│ ${icon} ${r.name.padEnd(28)} ${r.detail}${auto}`);
        if (r.result === '✅') green++;
    }
    totalGreen += green;
    totalChecks += results.length;
    
    const pct = Math.round((green / results.length) * 100);
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    console.log('├─────────────────────────────────────────────────');
    console.log(`│ Score: ${green}/${results.length} (${pct}%)  ${bar}`);
    console.log('└─────────────────────────────────────────────────\n');
}

const totalPct = Math.round((totalGreen / totalChecks) * 100);
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  GESAMT: ${totalGreen}/${totalChecks} checks grün (${totalPct}%)`);
console.log(`  Ziel:   >90% = ${Math.ceil(totalChecks * 0.9)}/${totalChecks} checks grün`);
console.log(`  Status: ${totalPct >= 90 ? '✅ BESTANDEN' : '❌ NICHT BESTANDEN'}`);
console.log('═══════════════════════════════════════════════════════════════');
