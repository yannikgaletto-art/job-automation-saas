import { createClient } from '@supabase/supabase-js';
import { BLACKLIST_PATTERNS } from './anti-fluff-blacklist';

// ─── Supabase Admin (per-call, not module-level — §QA Audit: Serverless Hygiene) ──
function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

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

    // 3. FORBIDDEN PHRASES CHECK (centralized via BLACKLIST_PATTERNS)
    let forbiddenCount = 0;
    const lowerText = coverLetter.toLowerCase();

    for (const { pattern, reason } of BLACKLIST_PATTERNS) {
        if (lowerText.includes(pattern.toLowerCase())) {
            errors.push(`Forbidden phrase detected: "${pattern}" - ${reason}`);
            forbiddenCount++;
        }
    }

    // 3b. HARD PHRASE BLACKLIST — Deterministic pre-delivery stop (§Fix F)
    // These phrases have been observed to survive the LLM Judge across MAX_ITERATIONS.
    // Unlike BLACKLIST_PATTERNS (which are guidance to Claude), these are hard stops
    // that produce explicit feedback strings for the re-generation loop.
    const HARD_PHRASE_BLACKLIST: Array<{ phrase: string; feedback: string }> = [
        {
            phrase: 'Vielmehr als nur',
            feedback: 'Entferne sofort den Ausdruck "Vielmehr als nur" — er ist logisch gebrochen (korrekt wäre "Mehr als nur", aber auch das ist gestelzt). Formuliere den Satz komplett um.',
        },
        {
            phrase: 'Möchte ich mein Projekt',
            feedback: 'Der Satz beginnt mit einem invertierten Modalsatz ("Möchte ich..."), der als Aussagesatz grammatikalisch falsch ist. Schreibe: "Zudem habe ich bei [Firma]..." oder "Auch meine Zeit bei [Firma] zeigt...".',
        },
        {
            phrase: 'schnell den Sprung von',
            feedback: 'Entferne das "Sprung von X zur Y"-Konstrukt — es ist eine erkennbare KI-Schablone. Formuliere stattdessen konkret, was du einbringen willst.',
        },
    ];

    for (const { phrase, feedback } of HARD_PHRASE_BLACKLIST) {
        if (lowerText.includes(phrase.toLowerCase())) {
            errors.push(`HARD_BLACKLIST: "${phrase}" — ${feedback}`);
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
        await getSupabase().from('validation_logs').insert({
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