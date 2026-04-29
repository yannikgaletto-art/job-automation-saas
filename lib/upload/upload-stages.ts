export interface ProgressStage {
    atSec: number;
    pct: number;
    statusKey: string;
}

/**
 * Baseline stages — calibrated against the average ~51s end-to-end latency
 * of Azure DI + Mistral OCR + Mistral Medium. Adaptive scaling stretches or
 * compresses these timestamps based on file size.
 */
export const BASELINE_STAGES: ReadonlyArray<ProgressStage> = [
    { atSec: 0, pct: 0, statusKey: 'status_uploading' },
    { atSec: 1, pct: 10, statusKey: 'status_uploading' },
    { atSec: 9, pct: 20, statusKey: 'status_analyzing' },
    { atSec: 21, pct: 40, statusKey: 'status_extracting' },
    { atSec: 41, pct: 60, statusKey: 'status_saving' },
    { atSec: 51, pct: 90, statusKey: 'status_formulating' },
];

const BASELINE_TOTAL_SEC = 51;

/**
 * Estimate how long the full pipeline will take for a given file size.
 *
 * Empirical observations on the EU pipeline (Azure DI + Mistral OCR + Mistral
 * Medium) show that small text-only PDFs finish in ~12s and image-heavy PDFs
 * around 3 MB take ~45-55s. The linear model is intentionally simple — server
 * stage polling would be more accurate but is a separate wave.
 *
 * Clamped to [12, 70] so a 10-byte upload doesn't show 8-second stages and a
 * 10 MB upload doesn't run the bar past 90% before the server is done.
 */
export function estimateDurationSec(fileSizeBytes: number): number {
    const sizeMB = Math.max(0, fileSizeBytes) / 1_000_000;
    return Math.min(70, Math.max(12, 8 + sizeMB * 12));
}

/**
 * Returns adaptive stages whose timestamps are scaled to match the estimated
 * duration. The pct + statusKey values are preserved — only `atSec` shifts.
 */
export function getStagesForFile(fileSizeBytes: number): ProgressStage[] {
    const target = estimateDurationSec(fileSizeBytes);
    const factor = target / BASELINE_TOTAL_SEC;
    return BASELINE_STAGES.map((s) => ({ ...s, atSec: s.atSec * factor }));
}

/**
 * Linear interpolation across a stage list. Returns the cap (last entry) once
 * elapsed time has exceeded the final stage — server response then handles the
 * jump to 100%.
 */
export function computeStageProgress(elapsedMs: number, stages: ReadonlyArray<ProgressStage>): { pct: number; statusKey: string } {
    const sec = elapsedMs / 1000;
    for (let i = 0; i < stages.length - 1; i++) {
        const a = stages[i];
        const b = stages[i + 1];
        if (sec < b.atSec) {
            const span = b.atSec - a.atSec;
            const ratio = span > 0 ? (sec - a.atSec) / span : 1;
            return {
                pct: Math.round(a.pct + ratio * (b.pct - a.pct)),
                statusKey: b.statusKey,
            };
        }
    }
    const last = stages[stages.length - 1];
    return { pct: last.pct, statusKey: last.statusKey };
}

/**
 * When the server response arrives, the bar should ramp the *remaining*
 * distance to 100% in proportion to how far it still has to travel. A bar
 * that's already at 80% feels broken if it takes 5s to fill the last 20%;
 * a bar at 12% would jump too abruptly without a longer animation.
 *
 * 50ms per pct, clamped to [800ms, 5000ms].
 */
export function computeFinishDurationMs(currentPct: number): number {
    const remaining = Math.max(0, 100 - currentPct);
    return Math.min(5000, Math.max(800, remaining * 50));
}
