import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { scanForFluff } from './anti-fluff-blacklist';

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

    // 2. COMPANY NAME CHECK (fuzzy — strips legal suffixes like AG, GmbH, SE)
    const LEGAL_SUFFIXES = /\s*(AG|GmbH|SE|e\.V\.|Inc\.?|Ltd\.?|Co\.?|KG|OHG|UG|mbH|S\.A\.|GbR|Corp\.?)\s*$/gi;
    // Business words that often follow the core brand name
    const BUSINESS_WORDS = /\s*(Group|Gruppe|Software|Digital|Solutions|Technologies|Consulting|Services|Partners|Systems|Holdings|International|Deutschland|Europe)\s*$/gi;
    const baseName = companyName.replace(LEGAL_SUFFIXES, '').trim();
    const coreName = baseName.replace(BUSINESS_WORDS, '').trim();
    
    // Try exact name first, then base name (without legal suffix), then core name (without business words)
    const exactPattern = new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const basePattern = baseName.length > 2 
        ? new RegExp(baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        : null;
    const corePattern = coreName.length > 2 && coreName !== baseName
        ? new RegExp(coreName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        : null;
    
    const exactMentions = (coverLetter.match(exactPattern) || []).length;
    const baseMentions = basePattern ? (coverLetter.match(basePattern) || []).length : 0;
    const coreMentions = corePattern ? (coverLetter.match(corePattern) || []).length : 0;
    const companyMentions = Math.max(exactMentions, baseMentions, coreMentions);

    if (companyMentions === 0) {
        errors.push(`Company name "${companyName}" not mentioned at all`);
    } else if (companyMentions === 1) {
        warnings.push(`Company name only mentioned once (recommend: 2-3 times)`);
    }

    // 3. FORBIDDEN PHRASES CHECK (centralized via scanForFluff — Single Source of Truth)
    // Patterns with a `feedback` field are hard-stop phrases that have been observed to survive
    // the LLM Judge across MAX_ITERATIONS. Their feedback strings provide explicit re-generation
    // guidance to the sync-loop (§Fix F — Deterministic pre-delivery stop).
    const fluffScan = scanForFluff(coverLetter);
    const forbiddenCount = fluffScan.matches.length;

    for (const { pattern, reason, feedback } of fluffScan.matches) {
        if (feedback) {
            // Hard-stop phrase with explicit feedback → high-priority error
            errors.push(`HARD_BLACKLIST: "${pattern}" — ${feedback}`);
        } else {
            errors.push(`Forbidden phrase detected: "${pattern}" - ${reason}`);
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

    // 4b. VERB-PHRASE REPETITION CHECK (Defect #6: "zeigte mir" × 3)
    // Catches repeated verb phrases like "zeigte mir", "hat mir gezeigt", "wurde mir klar"
    const VERB_PHRASES_DE = [
        /zeigte mir/gi, /hat mir gezeigt/gi, /wurde mir klar/gi,
        /habe ich gelernt/gi, /konnte ich/gi, /durfte ich/gi,
        /hat mich gelehrt/gi, /wurde mir bewusst/gi,
    ];
    const VERB_PHRASES_EN = [
        /showed me/gi, /taught me/gi, /made me realize/gi,
        /I was able to/gi, /I learned that/gi,
    ];
    const verbPhrases = [...VERB_PHRASES_DE, ...VERB_PHRASES_EN];
    for (const vp of verbPhrases) {
        const matches = coverLetter.match(vp);
        if (matches && matches.length > 1) {
            warnings.push(`Verb-phrase "${matches[0]}" appears ${matches.length}x (max 1x recommended)`);
        }
    }

    // 5. JD CITATION FRAGMENT LENGTH CHECK (Anti-Halluzination)
    // Detects when Claude quotes full sentences from the job ad instead of 2-5 word fragments.
    // German quotation marks: „..." (U+201E / U+201C) or regular "..."
    // EXCLUSION: Quoted phrases followed by an author attribution (– Author) are inspirational
    // quotes — NOT JD fragments. Threshold: 10 words (quotes can be 8-9 words without being JD hallucinations).
    const fragmentPattern = /[\u201e\u201c"](.*?)[\u201c\u201d"]/g;
    let fragmentMatch;
    while ((fragmentMatch = fragmentPattern.exec(coverLetter)) !== null) {
        const fragment = fragmentMatch[1].trim();
        const fragmentWords = fragment.split(/\s+/).length;
        if (fragmentWords > 10) {
            // Exclude quote attributions: text after closing quote starts with – Author
            const afterQuote = coverLetter.slice(fragmentMatch.index + fragmentMatch[0].length, fragmentMatch.index + fragmentMatch[0].length + 80);
            const isQuoteAttribution = /^\s*[\u2013\u2014\-]{1,2}\s*\w+/.test(afterQuote);
            if (!isQuoteAttribution) {
                warnings.push(`JD citation too long (${fragmentWords} words): "${fragment.slice(0, 60)}${fragment.length > 60 ? '...' : ''}" — max 5 words. Possibly hallucinated full-sentence quote.`);
            }
        }
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
        await getSupabaseAdmin().from('validation_logs').insert({
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
