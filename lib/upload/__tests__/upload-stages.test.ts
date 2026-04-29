import {
    estimateDurationSec,
    getStagesForFile,
    computeStageProgress,
    computeFinishDurationMs,
    BASELINE_STAGES,
} from '../upload-stages';

describe('estimateDurationSec', () => {
    it('clamps tiny files to the 12s minimum', () => {
        expect(estimateDurationSec(0)).toBe(12);
        expect(estimateDurationSec(50_000)).toBe(12);
    });

    it('scales linearly between min and max', () => {
        expect(estimateDurationSec(1_000_000)).toBe(20);  // 8 + 12*1
        expect(estimateDurationSec(2_500_000)).toBe(38);  // 8 + 12*2.5
    });

    it('clamps large files to the 70s maximum', () => {
        expect(estimateDurationSec(6_000_000)).toBe(70);
        expect(estimateDurationSec(20_000_000)).toBe(70);
    });

    it('handles negative or NaN-like sizes defensively', () => {
        expect(estimateDurationSec(-1)).toBe(12);
    });
});

describe('getStagesForFile', () => {
    it('keeps pct + statusKey identical to the baseline', () => {
        const stages = getStagesForFile(1_000_000);
        expect(stages.map((s) => s.pct)).toEqual(BASELINE_STAGES.map((s) => s.pct));
        expect(stages.map((s) => s.statusKey)).toEqual(BASELINE_STAGES.map((s) => s.statusKey));
    });

    it('scales atSec proportionally for small files', () => {
        const stages = getStagesForFile(100_000);  // est ~12s
        const last = stages[stages.length - 1];
        expect(last.atSec).toBeCloseTo(12, 1);
    });

    it('scales atSec proportionally for large files', () => {
        const stages = getStagesForFile(5_000_000);  // est ~68s (8 + 5*12)
        const last = stages[stages.length - 1];
        expect(last.atSec).toBeCloseTo(68, 1);
    });
});

describe('computeStageProgress', () => {
    it('interpolates linearly between stages', () => {
        const stages = [
            { atSec: 0, pct: 0, statusKey: 'a' },
            { atSec: 10, pct: 50, statusKey: 'b' },
            { atSec: 20, pct: 100, statusKey: 'c' },
        ];
        expect(computeStageProgress(5_000, stages).pct).toBe(25);
        expect(computeStageProgress(15_000, stages).pct).toBe(75);
    });

    it('returns the cap when elapsed exceeds the last stage', () => {
        const stages = getStagesForFile(1_000_000);
        const result = computeStageProgress(60_000_000, stages);
        expect(result.pct).toBe(90);  // last pct, still capped
    });

    it('paces small files faster — same elapsed → higher pct than for a large file', () => {
        const small = getStagesForFile(100_000);
        const large = getStagesForFile(5_000_000);
        const elapsed = 8_000;  // 8s
        const smallPct = computeStageProgress(elapsed, small).pct;
        const largePct = computeStageProgress(elapsed, large).pct;
        expect(smallPct).toBeGreaterThan(largePct);
    });
});

describe('computeFinishDurationMs', () => {
    it('returns 5000ms when bar is barely started', () => {
        expect(computeFinishDurationMs(0)).toBe(5000);
        expect(computeFinishDurationMs(10)).toBe(4500);
    });

    it('shrinks proportionally when bar is far along', () => {
        expect(computeFinishDurationMs(80)).toBe(1000);
        expect(computeFinishDurationMs(90)).toBe(800);  // floor
    });

    it('floors at 800ms even at 99%', () => {
        expect(computeFinishDurationMs(99)).toBe(800);
    });

    it('handles already-at-100 defensively', () => {
        expect(computeFinishDurationMs(100)).toBe(800);
    });
});
