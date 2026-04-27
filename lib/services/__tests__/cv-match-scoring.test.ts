/**
 * CV-Match Scoring Stresstests — Welle Re-1 (2026-04-27).
 *
 * Three stress-test classes:
 *   1. computeDeterministicScoreFromGapCensus: every band hit (8 cases).
 *   2. applyChipsConsistencyGuardrail (log-only): the regression that
 *      triggered Welle Re-1 — PwC Senior Consultant BPM. Score must stay 38.
 *   3. applyChipsConsistencyGuardrail (enforce): legacy behavior preserved
 *      so that emergency rollback is possible without code changes.
 */

import {
    computeDeterministicScoreFromGapCensus,
    applyChipsConsistencyGuardrail,
} from '../cv-match-scoring';
import type { RequirementRow } from '../cv-match-analyzer';

function makeRow(overrides: Partial<RequirementRow>): RequirementRow {
    return {
        title: overrides.title ?? 'Untitled',
        orbitCategory: overrides.orbitCategory ?? 'technical',
        level: overrides.level ?? 'solid',
        relevantChips: overrides.relevantChips ?? [],
        context: overrides.context ?? 'context',
        gaps: overrides.gaps ?? [],
        additionalChips: overrides.additionalChips ?? ['x'],
    };
}

describe('computeDeterministicScoreFromGapCensus — score band table', () => {
    it.each([
        ['0 major, 0 minor → 92', { major: 0, minor: 0, llmRawScore: 50 }, 92],
        ['0 major, 1 minor → 77', { major: 0, minor: 1, llmRawScore: 50 }, 77],
        ['0 major, 2 minor → 77', { major: 0, minor: 2, llmRawScore: 50 }, 77],
        ['0 major, 3 minor → 72', { major: 0, minor: 3, llmRawScore: 50 }, 72],
        ['1 major, 0 minor → 62', { major: 1, minor: 0, llmRawScore: 50 }, 62],
        ['1 major, 1 minor → 55', { major: 1, minor: 1, llmRawScore: 50 }, 55],
        ['1 major, 5 minor → 55', { major: 1, minor: 5, llmRawScore: 50 }, 55],
        ['2 major, 0 minor → 45', { major: 2, minor: 0, llmRawScore: 50 }, 45],
        ['2 major, 1 minor → 38', { major: 2, minor: 1, llmRawScore: 50 }, 38],
        ['2 major, 2 minor → 38 (PwC pattern)', { major: 2, minor: 2, llmRawScore: 50 }, 38],
        ['3 major, 0 minor → 32', { major: 3, minor: 0, llmRawScore: 50 }, 32],
        ['4 major, 2 minor → 32', { major: 4, minor: 2, llmRawScore: 50 }, 32],
        ['fundamental mismatch (LLM=19) → 15', { major: 5, minor: 0, llmRawScore: 19 }, 15],
        ['fundamental mismatch (LLM=10) → 15', { major: 6, minor: 0, llmRawScore: 10 }, 15],
    ])('%s', (_label, input, expected) => {
        expect(computeDeterministicScoreFromGapCensus(input)).toBe(expected);
    });
});

describe('STRESSTEST 1 — PwC Senior Consultant BPM regression (log-only mode)', () => {
    // Reproduces the exact pattern from the user's PwC server log:
    //   📊 [CV Match] DETERMINISTIC OVERRIDE: LLM score 48 → 38
    //   🛡️ Chips-consistency fix: "Geschäftsprozessanalyse..." had 3 chips → solid
    //   🛡️ Chips-consistency fix: "BPM-Applikationen..." had 3 chips → solid
    //   🛡️ Score corrected: 38 → 77
    // After Welle Re-1 (log-only): Score MUST stay 38, rows MUST stay "gap".
    const rows: RequirementRow[] = [
        makeRow({
            title: 'Geschäftsprozessanalyse & Prozessmanagement',
            level: 'gap',
            relevantChips: ['Process Mining', 'Stakeholder Coordination', 'Workshop Facilitation'],
        }),
        makeRow({
            title: 'BPM-Applikationen & digitale Prozesstools',
            level: 'gap',
            relevantChips: ['Camunda', 'Power Automate', 'Visio'],
        }),
        makeRow({
            title: 'Project Management',
            level: 'solid',
            relevantChips: ['PM Werkstudent', 'KPMG'],
        }),
    ];
    const gapCensus = { majorGaps: 2, minorGaps: 2 };
    const startScore = 38;

    it('emits 2 detections in log-only mode', () => {
        const result = applyChipsConsistencyGuardrail(rows, gapCensus, startScore);
        expect(result.detections).toHaveLength(2);
        expect(result.detections[0].title).toContain('Geschäftsprozessanalyse');
        expect(result.detections[0].chipsCount).toBe(3);
        expect(result.detections[1].title).toContain('BPM-Applikationen');
        expect(result.detections[1].chipsCount).toBe(3);
    });

    it('does NOT mutate row.level (stays "gap")', () => {
        applyChipsConsistencyGuardrail(rows, gapCensus, startScore);
        expect(rows[0].level).toBe('gap');
        expect(rows[1].level).toBe('gap');
        expect(rows[2].level).toBe('solid');
    });

    it('does NOT inflate score — stays 38, never 77', () => {
        const result = applyChipsConsistencyGuardrail(rows, gapCensus, startScore);
        expect(result.adjustedScore).toBe(38);
        expect(result.fixCount).toBe(0);
        expect(result.adjustedCensus).toEqual(gapCensus);
    });

    it('does NOT mutate gapCensus identity', () => {
        const result = applyChipsConsistencyGuardrail(rows, gapCensus, startScore);
        expect(result.adjustedCensus).toBe(gapCensus);
    });
});

describe('STRESSTEST 2 — KI-Tools regression (log-only mode)', () => {
    // The original use-case the guardrail was built for:
    //   Card "KI-Tools, LLMs" had 2 chips but level "gap"
    // After Welle Re-1: still observed (logged), but no upgrade. UX is now
    // a separate problem to solve in the frontend (Option E from the analysis).
    const rows: RequirementRow[] = [
        makeRow({
            title: 'KI-Tools, LLMs',
            level: 'gap',
            relevantChips: ['ChatGPT', 'Claude'],
        }),
    ];
    const gapCensus = { majorGaps: 1, minorGaps: 0 };

    it('logs 1 detection but does not upgrade', () => {
        const result = applyChipsConsistencyGuardrail(rows, gapCensus, 62);
        expect(result.detections).toHaveLength(1);
        expect(result.detections[0].chipsCount).toBe(2);
        expect(rows[0].level).toBe('gap');
        expect(result.adjustedScore).toBe(62);
    });
});

describe('STRESSTEST 3 — Clean path (no inconsistencies)', () => {
    // No card has gap+chips. Guardrail should be a complete no-op.
    const rows: RequirementRow[] = [
        makeRow({ title: 'A', level: 'strong', relevantChips: ['x', 'y'] }),
        makeRow({ title: 'B', level: 'solid', relevantChips: ['z'] }),
        makeRow({ title: 'C', level: 'gap', relevantChips: [] }),
    ];
    const gapCensus = { majorGaps: 1, minorGaps: 1 };

    it('returns zero detections', () => {
        const result = applyChipsConsistencyGuardrail(rows, gapCensus, 55);
        expect(result.detections).toHaveLength(0);
        expect(result.fixCount).toBe(0);
        expect(result.adjustedScore).toBe(55);
    });

    it('preserves all row levels', () => {
        applyChipsConsistencyGuardrail(rows, gapCensus, 55);
        expect(rows.map(r => r.level)).toEqual(['strong', 'solid', 'gap']);
    });
});

describe('Defensive guards', () => {
    it('handles empty rows array', () => {
        const result = applyChipsConsistencyGuardrail([], { majorGaps: 0, minorGaps: 0 }, 92);
        expect(result.detections).toHaveLength(0);
        expect(result.adjustedScore).toBe(92);
    });

    it('handles non-array rows defensively', () => {
        const result = applyChipsConsistencyGuardrail(
            null as unknown as RequirementRow[],
            { majorGaps: 0, minorGaps: 0 },
            50,
        );
        expect(result.detections).toHaveLength(0);
        expect(result.adjustedScore).toBe(50);
    });

    it('ignores rows with relevantChips=null/undefined', () => {
        const rows: RequirementRow[] = [
            makeRow({ title: 'no-chips', level: 'gap', relevantChips: undefined as unknown as string[] }),
            makeRow({ title: 'null-chips', level: 'gap', relevantChips: null as unknown as string[] }),
        ];
        const result = applyChipsConsistencyGuardrail(rows, { majorGaps: 2, minorGaps: 0 }, 45);
        expect(result.detections).toHaveLength(0);
    });
});

describe('LEGACY enforce mode — kept for emergency rollback', () => {
    // The old PwC pattern under enforce mode: should still upgrade and inflate.
    // This test documents the behavior we explicitly disabled by default.
    it('upgrades gap→solid and inflates PwC score 38 → 77 (enforce only)', () => {
        const rows: RequirementRow[] = [
            makeRow({ title: 'A', level: 'gap', relevantChips: ['c1', 'c2', 'c3'] }),
            makeRow({ title: 'B', level: 'gap', relevantChips: ['c1', 'c2', 'c3'] }),
        ];
        const gapCensus = { majorGaps: 2, minorGaps: 2 };
        const result = applyChipsConsistencyGuardrail(rows, gapCensus, 38, { mode: 'enforce' });

        expect(result.fixCount).toBe(2);
        expect(result.adjustedCensus.majorGaps).toBe(0);
        expect(result.adjustedCensus.minorGaps).toBe(2);
        expect(result.adjustedScore).toBe(77);
        expect(rows[0].level).toBe('solid');
        expect(rows[1].level).toBe('solid');
    });

    it('enforce mode is opt-in — default is log-only', () => {
        const rows: RequirementRow[] = [
            makeRow({ title: 'A', level: 'gap', relevantChips: ['c1'] }),
        ];
        const result = applyChipsConsistencyGuardrail(rows, { majorGaps: 1, minorGaps: 0 }, 62);
        // No mode = log-only by default
        expect(result.fixCount).toBe(0);
        expect(rows[0].level).toBe('gap');
        expect(result.adjustedScore).toBe(62);
    });
});
