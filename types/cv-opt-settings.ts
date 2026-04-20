/**
 * CVOptSettings — User-controllable CV display customization.
 *
 * These settings live ONLY as React state in the UI.
 * NOT persisted to Supabase. No user-tracking.
 * See: directives/AGENT_4.3_CV_TEMPLATE_EVOLUTION.md
 */

/**
 * Layout mode for the Valley template.
 * - 'default': Standard auto-layout (react-pdf decides page breaks)
 * - 'compact': Tighter spacing, max 2 bullets per experience → pulls content to page 1
 * - 'spacious': Force page break before Education → spreads content across 2 pages
 */
export type LayoutMode = 'default' | 'compact' | 'spacious';

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
    /** Layout density control (Valley template only). Default: 'default' */
    layoutMode: LayoutMode;
}

export const DEFAULT_CV_OPT_SETTINGS: CVOptSettings = {
    showSummary: true,
    summaryMode: 'full',
    showCertificates: true,
    showLanguages: true,
    templateId: 'valley',
    layoutMode: 'default',
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
