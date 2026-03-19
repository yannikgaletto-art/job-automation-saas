/**
 * mood-symbols — Day/Night symbol sets for the Mood Check-in.
 *
 * Day (06:00–20:59): Weather progression (🌧️ → ☀️)
 * Night (21:00–05:59): Moon phase progression (🌑 → 🌕)
 *
 * Pure utility — no React, no PII, safe to import from any context.
 * Canonical path: @/lib/mood/mood-symbols
 */

export type TimeOfDay = 'day' | 'night';

const SYMBOLS = {
    day: ['🌧️', '⛅', '🌤️', '🌞', '☀️'],
    night: ['🌑', '🌒', '🌓', '🌔', '🌕'],
} as const;

export function useTimeOfDay(): TimeOfDay {
    const hour = new Date().getHours();
    return hour >= 6 && hour < 21 ? 'day' : 'night';
}

export function getSymbolsForTime(timeOfDay: TimeOfDay): readonly string[] {
    return SYMBOLS[timeOfDay];
}

export function getSymbolForScore(score: number, timeOfDay: TimeOfDay): string {
    const idx = Math.max(0, Math.min(4, score - 1));
    return SYMBOLS[timeOfDay][idx];
}
