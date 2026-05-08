import type { CvStructuredData } from '@/types/cv';

export type CvResultSuggestion = {
    id: string;
    text: string;
    source: string;
};

const MAX_SUGGESTIONS = 8;
const MAX_TEXT_LENGTH = 180;
const MIN_TEXT_LENGTH = 18;

function normalizeText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function shorten(text: string): string {
    if (text.length <= MAX_TEXT_LENGTH) return text;
    return `${text.slice(0, MAX_TEXT_LENGTH - 1).trim()}...`;
}

function isUsefulResult(text: string): boolean {
    if (text.length < MIN_TEXT_LENGTH) return false;
    if (/^(responsible for|zuständig für|mitarbeit bei)\b/i.test(text)) return false;
    return true;
}

function sourceLabel(exp: CvStructuredData['experience'][number]): string {
    const parts = [exp.role, exp.company]
        .map((part) => normalizeText(part))
        .filter(Boolean);
    return parts.join(' · ') || 'Lebenslauf';
}

export function extractProfessionalResultsFromCv(cv: CvStructuredData | null | undefined): CvResultSuggestion[] {
    if (!cv || !Array.isArray(cv.experience)) return [];

    const seen = new Set<string>();
    const suggestions: CvResultSuggestion[] = [];

    for (const exp of cv.experience.slice(0, 6)) {
        const source = sourceLabel(exp);
        const candidates = [
            normalizeText(exp.summary),
            ...(Array.isArray(exp.description)
                ? exp.description.map((bullet) => normalizeText(bullet?.text))
                : []),
        ];

        for (const candidate of candidates) {
            if (!isUsefulResult(candidate)) continue;
            const text = shorten(candidate);
            const key = text.toLocaleLowerCase('de-DE');
            if (seen.has(key)) continue;

            seen.add(key);
            suggestions.push({
                id: `cv-result-${suggestions.length + 1}`,
                text,
                source,
            });

            if (suggestions.length >= MAX_SUGGESTIONS) return suggestions;
        }
    }

    return suggestions;
}
