/**
 * CV-Match deterministic scoring helpers — extracted for testability.
 *
 * Two pure functions live here:
 *   1. computeDeterministicScoreFromGapCensus — maps (major, minor) gap counts
 *      to a fixed score band, replacing the LLM's raw 0-100 score with a
 *      stable, label-consistent number.
 *   2. applyChipsConsistencyGuardrail — detects rows where the LLM emitted
 *      relevantChips (= evidence found in CV) but labelled the row as "gap"
 *      (= no evidence). Configurable mode: "log-only" (observe + warn,
 *      do NOT mutate scores) or "enforce" (legacy behavior — upgrade to
 *      "solid" and recompute score).
 *
 * Why log-only is the default (Welle Re-1 — 2026-04-27):
 *   The "enforce" mode caused Score-Inflation on senior roles. PwC Senior
 *   Consultant BPM produced a deterministic Score of 38 (correct: Werkstudent
 *   profile vs senior requirement) — guardrail upgraded 2 cards from gap →
 *   solid because each had 3 chips, recomputed Score to 77. The chips were
 *   weak touchpoints from a Werkstudent project, not Senior-level evidence.
 *   The LLM's "gap" label was correct; the guardrail overrode correctness.
 */

import type { RequirementRow } from './cv-match-analyzer';

export interface GapCensus {
    majorGaps: number;
    minorGaps: number;
}

export interface DeterministicScoreInput {
    major: number;
    minor: number;
    llmRawScore: number;
}

/**
 * Maps a gap census (number of major + minor gaps) to a deterministic score
 * band. The LLM's raw score is only consulted as a tiebreaker for the
 * "Fundamental mismatch" tier (≤19).
 *
 * Score bands (must mirror the legacy inline logic in cv-match-analyzer.ts
 * exactly — both call sites here remain in sync via this single function):
 *
 *   0 major, 0 minor  → 92  ("Fokus auf Nuancen")
 *   0 major, 1-2 minor → 77 ("Fokus auf Nuancen")
 *   0 major, 3+ minor  → 72 ("Fokus auf Nuancen — minimal")
 *   1 major, 0 minor   → 62 ("Grundgerüst steht")
 *   1 major, 1+ minor  → 55 ("Grundgerüst steht")
 *   2 major, 0 minor   → 45 ("Wir fixen das")
 *   2 major, 1+ minor  → 38 ("Wir fixen das")
 *   3+ major           → 32 ("Wir fixen das")
 *   Fundamental mismatch (LLM ≤19) → 15
 */
export function computeDeterministicScoreFromGapCensus(input: DeterministicScoreInput): number {
    const { major, minor, llmRawScore } = input;

    if (major === 0 && minor === 0) return 92;
    if (major === 0 && minor <= 2) return 77;
    if (major === 0 && minor >= 3) return 72;
    if (major === 1 && minor === 0) return 62;
    if (major === 1 && minor >= 1) return 55;
    if (major === 2 && minor === 0) return 45;
    if (major === 2 && minor >= 1) return 38;
    if (llmRawScore <= 19) return 15;
    return 32;
}

export type GuardrailMode = 'log-only' | 'enforce';

export interface GuardrailDetection {
    title: string;
    chipsCount: number;
}

export interface GuardrailResult {
    detections: GuardrailDetection[];
    /** Only populated in "enforce" mode — number of rows mutated to "solid". */
    fixCount: number;
    /** Only populated in "enforce" mode — adjusted gap census. Same identity as input gapCensus when nothing changed. */
    adjustedCensus: GapCensus;
    /** Only populated in "enforce" mode — recomputed score. Equal to currentScore when nothing changed. */
    adjustedScore: number;
}

/**
 * Detects rows where level === "gap" but relevantChips.length > 0.
 *
 * In "log-only" mode (DEFAULT — Welle Re-1, 2026-04-27): only collects
 * detections, no mutations. Caller can console.warn the result. Score is
 * untouched.
 *
 * In "enforce" mode (legacy — disabled by default): upgrades each detected
 * row to "solid", reduces gapCensus.majorGaps by fixCount, and recomputes
 * the score using computeDeterministicScoreFromGapCensus.
 */
export function applyChipsConsistencyGuardrail(
    rows: RequirementRow[],
    gapCensus: GapCensus,
    currentScore: number,
    opts: { mode: GuardrailMode } = { mode: 'log-only' },
): GuardrailResult {
    const detections: GuardrailDetection[] = [];

    if (!Array.isArray(rows)) {
        return { detections, fixCount: 0, adjustedCensus: gapCensus, adjustedScore: currentScore };
    }

    for (const row of rows) {
        if (row.level === 'gap' && Array.isArray(row.relevantChips) && row.relevantChips.length > 0) {
            detections.push({ title: row.title, chipsCount: row.relevantChips.length });
        }
    }

    if (opts.mode === 'log-only' || detections.length === 0) {
        return { detections, fixCount: 0, adjustedCensus: gapCensus, adjustedScore: currentScore };
    }

    // Enforce mode — legacy behavior (kept for emergency rollback path)
    for (const row of rows) {
        if (row.level === 'gap' && Array.isArray(row.relevantChips) && row.relevantChips.length > 0) {
            row.level = 'solid';
        }
    }

    const fixCount = detections.length;
    const adjustedCensus: GapCensus = {
        majorGaps: Math.max(0, gapCensus.majorGaps - fixCount),
        minorGaps: gapCensus.minorGaps,
    };
    const adjustedScore = computeDeterministicScoreFromGapCensus({
        major: adjustedCensus.majorGaps,
        minor: adjustedCensus.minorGaps,
        llmRawScore: currentScore,
    });

    return { detections, fixCount, adjustedCensus, adjustedScore };
}
