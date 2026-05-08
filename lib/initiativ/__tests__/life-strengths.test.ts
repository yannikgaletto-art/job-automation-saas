import { buildLifeStrengthsPayload, normalizeStrengthLines } from '../life-strengths';

describe('life strengths helpers', () => {
    it('normalizes multiline input, trims whitespace, and removes duplicates', () => {
        expect(normalizeStrengthLines('  Ruhe unter Druck  \n\nruhe unter druck\nPMO Erfahrung  ')).toEqual([
            'Ruhe unter Druck',
            'PMO Erfahrung',
        ]);
    });

    it('builds a safe preview payload without AI translations', () => {
        const result = buildLifeStrengthsPayload(
            {
                human_aspects: 'Pflege-Angehoerige',
                professional_results: '7 Jahre PMO',
                peer_perspective: 'strukturiert',
            },
            '2026-05-08T10:00:00.000Z'
        );

        expect(result.error).toBeNull();
        expect(result.payload).toEqual({
            version: 1,
            human_aspects: ['Pflege-Angehoerige'],
            professional_results: ['7 Jahre PMO'],
            peer_perspective: ['strukturiert'],
            ai_translations: {},
            translation_status: 'pending',
            source: 'initiativ_step1_preview',
            updated_at: '2026-05-08T10:00:00.000Z',
        });
    });

    it('rejects an empty profile', () => {
        const result = buildLifeStrengthsPayload({});

        expect(result.payload).toBeNull();
        expect(result.error).toBe('initiativ.life_strengths.empty');
    });

    it('rejects overlong single entries instead of silently truncating user text', () => {
        const result = buildLifeStrengthsPayload({
            human_aspects: 'x'.repeat(241),
        });

        expect(result.payload).toBeNull();
        expect(result.error).toBe('initiativ.life_strengths.too_long');
    });
});
