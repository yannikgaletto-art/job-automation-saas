export type LifeStrengthsInput = {
    human_aspects?: unknown;
    professional_results?: unknown;
    peer_perspective?: unknown;
};

export type LifeStrengthsPayload = {
    version: 1;
    human_aspects: string[];
    professional_results: string[];
    peer_perspective: string[];
    ai_translations: Record<string, never>;
    translation_status: 'pending';
    source: 'initiativ_step1_preview';
    updated_at: string;
};

const MAX_ITEMS_PER_FIELD = 8;
const MAX_ITEM_LENGTH = 240;

function asLines(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap((entry) => asLines(entry));
    }

    if (typeof value !== 'string') {
        return [];
    }

    return value
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter(Boolean);
}

export function normalizeStrengthLines(value: unknown): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const line of asLines(value)) {
        const key = line.toLocaleLowerCase('de-DE');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(line);
        if (result.length >= MAX_ITEMS_PER_FIELD) break;
    }

    return result;
}

export function buildLifeStrengthsPayload(
    input: LifeStrengthsInput,
    now = new Date().toISOString()
): { payload: LifeStrengthsPayload; error: null } | { payload: null; error: string } {
    const human_aspects = normalizeStrengthLines(input.human_aspects);
    const professional_results = normalizeStrengthLines(input.professional_results);
    const peer_perspective = normalizeStrengthLines(input.peer_perspective);

    const allItems = [...human_aspects, ...professional_results, ...peer_perspective];

    if (allItems.length === 0) {
        return { payload: null, error: 'initiativ.life_strengths.empty' };
    }

    if (allItems.some((item) => item.length > MAX_ITEM_LENGTH)) {
        return { payload: null, error: 'initiativ.life_strengths.too_long' };
    }

    return {
        payload: {
            version: 1,
            human_aspects,
            professional_results,
            peer_perspective,
            ai_translations: {},
            translation_status: 'pending',
            source: 'initiativ_step1_preview',
            updated_at: now,
        },
        error: null,
    };
}
