/**
 * CVOptSettings — User-controllable CV display customization.
 *
 * These settings live ONLY as React state in the UI.
 * NOT persisted to Supabase. No user-tracking.
 * See: directives/AGENT_4.3_CV_TEMPLATE_EVOLUTION.md
 */

/**
 * Layout mode for the Valley template.
 * - 'compact': Tighter spacing, content-dense — maximum page utilization (UI: "Standard")
 * - 'default': Normal spacing, more breathing room (UI: "Ausführlich")
 * NOTE: All modes render 3 bullets per experience entry. The difference is only spacing density.
 */
export type LayoutMode = 'default' | 'compact';

/**
 * Welle E (2026-04-27) — page-count target for the optimizer + template caps.
 *  - '1-page' (Phase 9 added): tightest cap for early-career / executive-summary CVs.
 *    Max 2 bullets per entry, oldest 3 entries get 1 bullet each.
 *  - '2-pages' (default): aggressive cap, oldest stations max 1 bullet, 2-page submission.
 *  - '3-pages': preserves more detail across older stations (good for 6+ work years).
 */
export type PageMode = '1-page' | '2-pages' | '3-pages';

export interface CVOptSettings {
    /** Whether to show the professional summary section. Default: true */
    showSummary: boolean;
    /** Summary length mode. 'compact' = max 2 sentences. Default: 'full' */
    summaryMode: 'full' | 'compact';
    /** Whether to show the certificates section. Default: true */
    showCertificates: boolean;
    /** Whether to show the languages section. Default: true */
    showLanguages: boolean;
    /** Active template ID. FAANG-optimized template. Default: 'valley' */
    templateId: 'tech' | 'valley';
    /** Layout density control (Valley template only). Default: 'compact' (tightest, most ATS-dense) */
    layoutMode: LayoutMode;
    /** Page-count target for optimizer + template caps. Default: '2-pages' (industry standard). */
    pageMode: PageMode;
}

export const DEFAULT_CV_OPT_SETTINGS: CVOptSettings = {
    showSummary: true,
    summaryMode: 'full',
    showCertificates: true,
    showLanguages: true,
    templateId: 'valley',
    layoutMode: 'compact',
    pageMode: '2-pages',
};

/** Station-specific metrics provided by the user for the Numbers Check Flow */
export interface StationMetrics {
    /** Read-only — from parsed CV experience entry */
    company: string;
    /** Read-only — from parsed CV experience entry */
    role: string;
    /** User-input, max 150 chars */
    metrics: string;
}
