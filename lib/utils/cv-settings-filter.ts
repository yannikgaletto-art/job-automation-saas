import { CvStructuredData } from '@/types/cv';
import { CVOptSettings } from '@/types/cv-opt-settings';

/**
 * Applies CVOptSettings to structured CV data by filtering sections.
 * This is a pure function — it does NOT mutate the input.
 *
 * Used before passing data to PDF templates (Preview + Download).
 */
export function applyCVOptSettings(
    data: CvStructuredData,
    settings: CVOptSettings
): CvStructuredData {
    const filtered = { ...data };

    // Summary toggle
    if (!settings.showSummary) {
        filtered.personalInfo = {
            ...filtered.personalInfo,
            summary: undefined,
        };
    } else if (settings.summaryMode === 'compact' && filtered.personalInfo.summary) {
        // Truncate to max 2 sentences
        filtered.personalInfo = {
            ...filtered.personalInfo,
            summary: truncateToSentences(filtered.personalInfo.summary, 2),
        };
    }

    // Certificates toggle
    if (!settings.showCertificates) {
        filtered.certifications = undefined;
    }

    // Languages toggle
    if (!settings.showLanguages) {
        filtered.languages = [];
    }

    return filtered;
}

/**
 * Truncate text to the first N sentences.
 * Handles German/English punctuation (., !, ?).
 */
function truncateToSentences(text: string, maxSentences: number): string {
    // Match sentences ending with . ! or ? followed by space or end-of-string
    const sentenceRegex = /[^.!?]*[.!?]/g;
    const matches = text.match(sentenceRegex);
    if (!matches || matches.length <= maxSentences) return text;
    return matches.slice(0, maxSentences).join('').trim();
}
