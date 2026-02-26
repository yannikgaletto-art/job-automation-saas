import { createClient } from '@supabase/supabase-js';
import { BLACKLIST_PATTERNS } from './anti-fluff-blacklist';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    stats: {
        wordCount: number;
        paragraphCount: number;
        companyMentions: number;
        forbiddenPhraseCount: number;
    };
}

/**
 * Hard validation checks BEFORE Quality Judge
 * Prevents obvious errors and saves API costs
 */
export function validateCoverLetter(
    coverLetter: string,
    companyName: string
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. WORD COUNT CHECK
    const words = coverLetter.trim().split(/\s+/);
    const wordCount = words.length;

    if (wordCount < 200) {
        errors.push(`Word count too low: ${wordCount} words (minimum: 200)`);
    } else if (wordCount > 400) {
        errors.push(`Word count too high: ${wordCount} words (maximum: 400)`);
    } else if (wordCount < 250 || wordCount > 380) {
        warnings.push(`Word count outside ideal range: ${wordCount} words (ideal: 250-380)`);
    }

    // 2. COMPANY NAME CHECK
    const companyPattern = new RegExp(companyName, 'gi');
    const companyMentions = (coverLetter.match(companyPattern) || []).length;

    if (companyMentions === 0) {
        errors.push(`Company name "${companyName}" not mentioned at all`);
    } else if (companyMentions === 1) {
        warnings.push(`Company name only mentioned once (recommend: 2-3 times)`);
    }

    // 3. FORBIDDEN PHRASES CHECK (centralized via BLACKLIST_PATTERNS)
    let forbiddenCount = 0;
    const lowerText = coverLetter.toLowerCase();

    for (const { pattern, reason } of BLACKLIST_PATTERNS) {
        if (lowerText.includes(pattern.toLowerCase())) {
            errors.push(`Forbidden phrase detected: "${pattern}" - ${reason}`);
            forbiddenCount++;
        }
    }

    // 4. BASIC STRUCTURE CHECK
    const paragraphs = coverLetter.split(/\n\n+/).filter(p => p.trim().length > 0);
    const paragraphCount = paragraphs.length;

    if (paragraphCount < 3) {
        errors.push(`Too few paragraphs: ${paragraphCount} (minimum: 3)`);
    } else if (paragraphCount > 6) {
        warnings.push(`Many paragraphs: ${paragraphCount} (ideal: 4-5)`);
    }

    // Check for extremely short paragraphs
    const shortParagraphs = paragraphs.filter(p => p.split(/\s+/).length < 20);
    if (shortParagraphs.length > 1) {
        warnings.push(`${shortParagraphs.length} paragraphs are very short (< 20 words)`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        stats: {
            wordCount,
            paragraphCount,
            companyMentions,
            forbiddenPhraseCount: forbiddenCount
        }
    };
}

/**
 * Log validation results for monitoring
 */
export async function logValidation(
    jobId: string,
    userId: string,
    iteration: number,
    validation: ValidationResult
) {
    try {
        await supabase.from('validation_logs').insert({
            job_id: jobId,
            user_id: userId,
            iteration,
            is_valid: validation.isValid,
            errors: validation.errors,
            warnings: validation.warnings,
            word_count: validation.stats.wordCount,
            paragraph_count: validation.stats.paragraphCount,
            company_mentions: validation.stats.companyMentions,
            forbidden_phrase_count: validation.stats.forbiddenPhraseCount
        });
    } catch (e) {
        console.error('Failed to log validation:', e);
    }
}