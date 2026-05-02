import { cleanAtsKeywords } from './ats-keyword-filter';

export const MAX_VIDEO_KEYWORDS = 18;

interface VideoKeywordJobSource {
    ats_keywords?: unknown;
    buzzwords?: unknown;
    hard_requirements?: unknown;
    description?: string | null;
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}

export function buildVideoKeywordList(
    job: VideoKeywordJobSource,
    maxKeywords = MAX_VIDEO_KEYWORDS,
): string[] {
    const rawKeywords = [
        ...stringArray(job.ats_keywords),
        ...stringArray(job.buzzwords),
        ...stringArray(job.hard_requirements),
    ];

    return cleanAtsKeywords(rawKeywords, job.description || null).kept.slice(0, maxKeywords);
}

export function constrainCategorizedVideoKeywords<T extends Record<string, unknown>>(
    categorized: T,
    allowedKeywords: string[],
): T {
    const allowed = new Set(allowedKeywords.map(keyword => keyword.toLowerCase().trim()));
    const next: Record<string, unknown> = { ...categorized };

    for (const key of ['mustHave', 'niceToHave', 'companySpecific']) {
        const value = next[key];
        if (!Array.isArray(value)) continue;
        next[key] = value.filter(
            item => typeof item === 'string' && allowed.has(item.toLowerCase().trim())
        );
    }

    return next as T;
}
