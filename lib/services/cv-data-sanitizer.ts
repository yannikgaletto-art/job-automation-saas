/**
 * CV Data Sanitizer — defensive cleanup at use-time boundaries.
 *
 * Purpose: guarantees that the CV data rendered to users or passed to downstream
 * pipelines is free of known OCR/extraction artefacts, regardless of what is
 * stored in the database. This acts as a "read-time safety net" that cleans
 * historical corrupted data without requiring a DB migration.
 *
 * Design principles:
 *   - PURE FUNCTION — no side effects, no IO, no await. Safe to call anywhere.
 *   - IDEMPOTENT — sanitizing already-clean data is a no-op.
 *   - NON-DESTRUCTIVE — never drops user content; only strips obvious artefacts.
 *
 * Wired into: app/api/cv/optimize/route.ts (primary defence — cleans proposal
 * before it is persisted and displayed).
 */

import type { CvStructuredData } from '@/types/cv';
import { KNOWN_LANGUAGES, stripRoleDateMarkers } from './cv-parser';

/**
 * Two- or three-word institutional prefixes that are never part of a person's
 * first/last name, even when they appear directly before it in OCR output.
 * These are matched at the START of the name string, case-insensitive, and
 * stripped along with the trailing space.
 *
 * Trigger example:
 *   OCR: "Deutsche Rentenversicherung\nYannik Galetto" (cover page + name)
 *   → Claude concatenates: name = "Deutsche Rentenversicherung Yannik Galetto"
 *   → sanitizer strips the prefix: name = "Yannik Galetto"
 */
const INSTITUTIONAL_NAME_PREFIXES: readonly string[] = [
    // Public sector / governmental (DE)
    'deutsche rentenversicherung',
    'deutsche bundesbank',
    'deutsche bank',
    'deutsche telekom',
    'deutsche bahn',
    'deutsche post',
    'bundesagentur für arbeit',
    'bundesministerium',
    'bundesamt',
    'bundesnetzagentur',
    'bundesinstitut',
    // Universities / higher education
    'technische universität',
    'universität',
    'fachhochschule',
    'hochschule',
    // Common OCR salutation leakage
    'sehr geehrte damen und herren',
    'curriculum vitae',
    'lebenslauf',
];

/**
 * Removes obvious OCR-doubling artefacts where Azure Document Intelligence
 * (or pdf-parse fallback) interleaved a section header with bullet text,
 * producing patterns like "Kommunikation und Kommunikation: Konzeption …".
 *
 * Two conservative patterns:
 *   P1 — Header doubling at start: `Word + connector + same Word + separator`
 *        e.g. "Kommunikation und Kommunikation: Konzeption …" → "Konzeption …"
 *   P2 — Direct adjacent repeat (≥5 chars, case-insensitive)
 *        e.g. "developed developed pipelines" → "developed pipelines"
 *
 * Conservative thresholds (≥5 chars + word boundaries) avoid false positives
 * on legitimate phrases like "Hand in Hand" (intervening word) or short
 * repeats like "is is" (typo, but unlikely in CV bullets).
 *
 * Idempotent and non-destructive: if the result would be empty, returns the
 * original input unchanged.
 */
function dedupePhraseRepeats(text: string | null | undefined): string | null | undefined {
    if (!text || typeof text !== 'string') return text;
    let out = text;
    // P1: leading "Word und Word:" / "Word and Word -" header doubling
    out = out.replace(
        /^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-]{3,})\s+(?:und|and|&|-)\s+\1\s*[:\-]?\s*/i,
        ''
    );
    // P2: directly adjacent identical words, ≥5 letters (case-insensitive)
    out = out.replace(/\b([A-Za-zÄÖÜäöüß\-]{5,})\s+\1\b/gi, '$1');
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : text;
}

/** Strips a single leading institutional prefix (case-insensitive, word-boundary safe). */
function stripInstitutionalPrefix(input: string): string {
    const collapsed = input.trim().replace(/\s+/g, ' ');
    const lower = collapsed.toLowerCase();
    for (const prefix of INSTITUTIONAL_NAME_PREFIXES) {
        // Require a trailing space — avoids false positives like "Universitätsklinik" (univ. hospital).
        if (lower.startsWith(prefix + ' ')) {
            return collapsed.slice(prefix.length).trim();
        }
    }
    return collapsed;
}

/**
 * Cleans the extracted name. Priority:
 *   1. trustedName (user_profiles.full_name) — highest trust, but still
 *      prefix-stripped in case historical data was persisted uncleaned.
 *   2. Strip institutional prefixes from the raw extracted name.
 */
function cleanName(
    name: string | null | undefined,
    trustedName?: string | null
): string | null | undefined {
    const trusted = trustedName?.trim();
    if (trusted) return stripInstitutionalPrefix(trusted) || trusted;
    if (!name) return name;

    const cleaned = stripInstitutionalPrefix(name);
    return cleaned || name;
}

/**
 * Certificate heuristic — swaps name ↔ description when the name looks like
 * prose description (common when OCR 2-column layout interleaves cert titles
 * with course content).
 *
 * Triggers a swap only when there is STRONG evidence of OCR misattribution:
 *   - name length > 80 characters (real cert titles rarely exceed 80), OR
 *   - name contains a newline (titles are always one line)
 *   AND the description field is empty or shorter than the name.
 *
 * This deliberately does NOT trigger on cases like "Azure, AWS, GCP Fundamentals"
 * (multi-tech cert titles) to avoid false positives.
 */
function fixCertNameDescription(cert: any): any {
    const name = (cert?.name || '').trim();
    const desc = (cert?.description || '').trim();
    if (!name) return cert;

    const looksLikeDescription = name.length > 80 || name.includes('\n');
    if (!looksLikeDescription || desc.length >= name.length) return cert;

    // Promote the first clause (up to 80 chars, split on comma/newline) as new name,
    // and move the full original name into the description so no content is lost.
    const fallbackName = name.split(/[,\n]/)[0].trim().slice(0, 80);
    return {
        ...cert,
        name: fallbackName || name,
        description: name,
    };
}

/**
 * Idempotent pure-function sanitizer. Runs at every boundary where a CV is
 * displayed or passed to downstream processing.
 *
 * @param cv the structured CV data to clean
 * @param options.trustedName a name from a higher-trust source (e.g.
 *        user_profiles.full_name). When provided, it overrides cv.personalInfo.name.
 */
export function sanitizeCv(
    cv: CvStructuredData,
    options: { trustedName?: string | null } = {}
): CvStructuredData {
    if (!cv) return cv;

    return {
        ...cv,
        personalInfo: {
            ...(cv.personalInfo || {}),
            name: cleanName(cv.personalInfo?.name, options.trustedName) ?? undefined,
        },
        experience: (cv.experience || []).map(e => ({
            ...e,
            role: stripRoleDateMarkers(e.role) ?? undefined,
            summary: typeof e.summary === 'string'
                ? (dedupePhraseRepeats(e.summary) ?? e.summary)
                : e.summary,
            description: Array.isArray(e.description)
                ? e.description.map((b: any) =>
                    typeof b?.text === 'string'
                        ? { ...b, text: dedupePhraseRepeats(b.text) ?? b.text }
                        : b)
                : e.description,
        })),
        education: (cv.education || []).map(ed => ({
            ...ed,
            description: typeof ed.description === 'string'
                ? (dedupePhraseRepeats(ed.description) ?? ed.description)
                : ed.description,
        })),
        languages: (cv.languages || []).filter(l => {
            const lang = (l.language || '').trim().toLowerCase();
            return lang.length > 0 && KNOWN_LANGUAGES.has(lang);
        }),
        certifications: (cv.certifications || []).map(fixCertNameDescription),
    };
}
