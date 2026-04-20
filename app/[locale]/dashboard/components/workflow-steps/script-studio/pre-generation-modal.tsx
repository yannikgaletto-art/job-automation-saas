"use client";

// PreGenerationModal removed — the 2-step Archetype/Tone wizard was UX theater.
// Analysis (2026-04-20): archetype added 1 hint sentence to a 130-word script;
// tone_mode was overridden by a hard-coded intro block anyway.
// Replacement: One-Click generation triggered directly from the empty state.
// This file is kept as a pass-through export so imports don't break.

export type ApplicantArchetype = 'builder' | 'strategist' | 'teamplayer' | 'specialist';
export type ToneMode = 'standard' | 'direct' | 'initiative';

export interface PreGenParams {
    applicant_archetype?: ApplicantArchetype;
    tone_mode?: ToneMode;
}
