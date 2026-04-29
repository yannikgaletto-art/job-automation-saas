import type { CvStructuredData } from '@/types/cv';

export type CvLocale = 'de' | 'en' | 'es' | 'unknown';

const MARKERS: Record<Exclude<CvLocale, 'unknown'>, ReadonlySet<string>> = {
    de: new Set([
        'und', 'mit', 'für', 'fuer', 'von', 'der', 'die', 'das', 'bei', 'durch', 'im', 'am',
        'zu', 'zur', 'zum', 'eine', 'einen', 'einem', 'einer', 'sowie', 'zwischen',
        'geleitet', 'entwickelt', 'verantwortlich', 'verantwortet', 'umgesetzt',
        'erstellt', 'aufgebaut', 'durchgeführt', 'durchgefuehrt',
        'projektleitung', 'werkstudent', 'praktikum', 'abschluss', 'hochschule',
        'kenntnisse', 'erfahrung', 'bereich', 'bereichen',
    ]),
    en: new Set([
        'and', 'with', 'for', 'the', 'of', 'in', 'at', 'on', 'as', 'a', 'an',
        'between', 'including', 'across', 'within', 'over', 'through',
        'led', 'leading', 'developed', 'managed', 'responsible', 'designed',
        'implemented', 'delivered', 'launched', 'built', 'created',
        'experience', 'skills', 'knowledge', 'team', 'project', 'company',
        'university', 'bachelor', 'master', 'degree',
    ]),
    es: new Set([
        'y', 'con', 'para', 'de', 'el', 'la', 'los', 'las', 'en', 'entre', 'sobre',
        'desde', 'hasta', 'durante', 'mediante', 'según', 'segun',
        'dirigí', 'dirigi', 'desarrollé', 'desarrolle', 'implementé', 'implemente',
        'gestioné', 'gestione', 'responsable', 'encargado', 'lideré', 'lidere',
        'experiencia', 'conocimientos', 'habilidades', 'empresa', 'equipo',
        'universidad', 'licenciatura', 'maestría', 'maestria', 'título', 'titulo',
    ]),
};

function tokenise(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[.,;:()\-—–"'`!?¿¡]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1);
}

function collectSamples(cv: CvStructuredData): string[] {
    const samples: string[] = [];

    const personal = cv.personalInfo ?? {};
    if (personal.summary) samples.push(personal.summary);
    if (personal.targetRole) samples.push(personal.targetRole);

    const exp = (cv.experience ?? []).slice(0, 3);
    for (const e of exp) {
        if (e.role) samples.push(e.role);
        if (e.summary) samples.push(e.summary);
        for (const b of (e.description ?? []).slice(0, 4)) {
            if (b?.text) samples.push(b.text);
        }
    }

    const edu = (cv.education ?? []).slice(0, 3);
    for (const e of edu) {
        if (e.degree) samples.push(e.degree);
        if (e.description) samples.push(e.description);
    }

    return samples;
}

/**
 * Detects the dominant natural language of a parsed CV.
 *
 * Returns 'unknown' when the signal is weak or ambiguous so that callers can
 * choose to skip language-mismatch UI rather than show wrong hints.
 *
 * Heuristic: token-count against curated marker sets per language. A language
 * wins when it has ≥3 total marker hits AND its count is at least 1.5× the
 * runner-up. Below that threshold the result is 'unknown'.
 */
export function detectCvLocale(cv: CvStructuredData): CvLocale {
    const samples = collectSamples(cv);
    if (samples.length === 0) return 'unknown';

    const counts: Record<Exclude<CvLocale, 'unknown'>, number> = { de: 0, en: 0, es: 0 };
    for (const sample of samples) {
        for (const token of tokenise(sample)) {
            if (MARKERS.de.has(token)) counts.de++;
            if (MARKERS.en.has(token)) counts.en++;
            if (MARKERS.es.has(token)) counts.es++;
        }
    }

    const ranked = (Object.entries(counts) as Array<[Exclude<CvLocale, 'unknown'>, number]>)
        .sort((a, b) => b[1] - a[1]);
    const [topLang, topCount] = ranked[0];
    const runnerUpCount = ranked[1]?.[1] ?? 0;

    if (topCount < 3) return 'unknown';
    if (topCount < runnerUpCount * 1.5) return 'unknown';
    return topLang;
}
