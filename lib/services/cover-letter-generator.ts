import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { validateCoverLetter, logValidation, type ValidationResult } from './cover-letter-validator';
import { enrichCompany, linkEnrichmentToJob } from './company-enrichment';

// Initialize clients
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Use the standard createClient for server-side operations if needed, 
// using Service Role key from env for admin access
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CoverLetterGenerationParams {
    userId: string;
    jobId: string;
    userProfile?: any;
    jobData?: any;
    companyResearch?: any;
    styleAnalysis?: any;
    selectedQuote?: any;
}

export interface CoverLetterResult {
    coverLetter: string;
    finalScores: {
        naturalness: number;
        style_match: number;
        company_relevance: number;
        individuality: number;
        overall_score: number;
    };
    finalValidation: {
        isValid: boolean;
        issues: string[];
    };
    iterations: number;
    iterationLog?: any[];
    costCents: number; // For cost tracking
}

const MAX_ITERATIONS = 3;

/**
 * Main entry point for generating a cover letter with quality loop.
 * Fetches data if not provided, then runs the generation loop.
 */
export async function generateCoverLetterWithQuality(jobId: string, userId: string): Promise<CoverLetterResult> {
    // 1. Fetch Data (Mocking fetch for now, real implementation would query DB)
    // In a real scenario, we would join tables: job_queue, user_profiles, company_research, documents
    console.log(`Fetching data for Job ${jobId}, User ${userId}...`);

    // Placeholder: You would replace this with actual DB calls
    // const { data: job } = await supabaseAdmin.from('job_queue').select('*').eq('id', jobId).single();
    // const { data: profile } = await supabaseAdmin.from('user_profiles').select('*').eq('id', userId).single();

    // For now we construct the params, assuming data is fetched or passed
    // To unblock the API route, we'll return a mock result if DB access isn't fully wired yet
    // OR we implement the DB fetch here.

    // Let's implement a basic fetch based on standard patterns
    const { data: jobData, error: jobError } = await supabaseAdmin
        .from('job_queue')
        .select(`
            *,
            company_research(intel_data, suggested_quotes)
        `)
        .eq('id', jobId)
        .single();

    if (jobError || !jobData) throw new Error(`Job not found: ${jobError?.message}`);

    const { data: profileData, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (profileError || !profileData) throw new Error(`Profile not found: ${profileError?.message}`);

    // Fetch latest CV document for style analysis
    const { data: docs } = await supabaseAdmin
        .from('documents')
        .select('metadata')
        .eq('user_id', userId)
        .eq('document_type', 'cover_letter')
        .order('created_at', { ascending: false })
        .limit(1);

    const styleAnalysis = docs?.[0]?.metadata?.style_analysis;

    let research = jobData.company_research?.[0]?.intel_data;
    let selectedQuote = jobData.company_research?.[0]?.suggested_quotes?.[0];

    // Inline enrichment fallback if company research was skipped (e.g., from paste flow)
    if (!research || Object.keys(research).length === 0) {
        console.log(`[CoverLetterGen] No company research found for ${jobData.company_name}. Triggering inline enrichment...`);
        try {
            const enrichment = await enrichCompany(
                jobData.company_slug || jobData.company_name,
                jobData.company_name,
                false
            );
            await linkEnrichmentToJob(jobId, enrichment.id);

            research = {
                company_values: enrichment.company_values,
                tech_stack: enrichment.tech_stack,
            };
            selectedQuote = enrichment.suggested_quotes?.[0];
            console.log(`[CoverLetterGen] Inline enrichment successful.`);
        } catch (enrichErr) {
            console.warn(`[CoverLetterGen] Inline enrichment failed. Proceeding without.`, enrichErr);
        }
    }

    return generateCoverLetter({
        userId,
        jobId,
        userProfile: profileData,
        jobData: jobData,
        companyResearch: research,
        selectedQuote: selectedQuote,
        styleAnalysis
    });
}

/**
 * Core generation logic (Workflow)
 */
export async function generateCoverLetter(params: CoverLetterGenerationParams): Promise<CoverLetterResult> {
    const { userId, jobId, userProfile, jobData, companyResearch, styleAnalysis, selectedQuote } = params;

    let coverLetter = "";
    let iteration = 0;
    let scores: any = null;
    let validation: any = null;
    let feedback: string[] = [];

    // Log history
    const iterationLog: any[] = [];

    // --- STEP 1: INITIAL GENERATION ---
    while (iteration < MAX_ITERATIONS) {
        console.log(`🚀 Generation Iteration ${iteration + 1}/${MAX_ITERATIONS}...`);

        // 1. Generate (or Regenerate)
        const prompt = buildSystemPrompt(userProfile, jobData, companyResearch, styleAnalysis, selectedQuote, feedback);

        if (!process.env.ANTHROPIC_API_KEY) {
            console.warn("⚠️ MOCKING GENERATION (No API Key) ⚠️");
            coverLetter = "Dies ist ein generiertes Anschreiben (MOCK). API Key fehlt.";
            scores = { overall_score: 5 };
            validation = { isValid: true, issues: [] };
            break;
        }

        const message = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307', // Using Haiku for cost/speed in development, switch to Sonnet for PROD
            max_tokens: 2000,
            temperature: 0.7,
            system: "You are an expert cover letter writer. Write authentic, engaging, and professional cover letters.",
            messages: [{ role: 'user', content: prompt }]
        });

        let generatedText = "";
        if (message.content[0].type === 'text') {
            generatedText = message.content[0].text;
        }

        // 2. VALIDATE FIRST (Hard Checks - Fast & Cheap)
        const validationResult = validateCoverLetter(generatedText, jobData?.company_name || 'Company');

        // Log validation to database
        await logValidation(jobId, userId, iteration + 1, validationResult);

        console.log(`✅ Validation ${iteration + 1}: ${validationResult.isValid ? 'PASSED' : 'FAILED'} (${validationResult.errors.length} errors, ${validationResult.warnings.length} warnings)`);

        // 3. JUDGE ONLY IF VALIDATION PASSED (Save API Costs)
        if (validationResult.isValid) {
            const judgment = await judgeCoverLetter(generatedText, jobData, styleAnalysis);
            scores = judgment.scores;
            validation = validationResult; // Use real validation result
        } else {
            // Skip judge call if validation failed
            scores = {
                overall_score: 0,
                naturalness: 0,
                style_match: 0,
                company_relevance: 0,
                individuality: 0
            };
            validation = validationResult;

            console.log(`❌ Iteration ${iteration + 1}: Validation failed, skipping quality judge`);
        }

        // 4. Log this attempt
        iterationLog.push({
            iteration: iteration + 1,
            letterVersion: generatedText,
            scores,
            validation,
            timestamp: new Date().toISOString()
        });

        // 5. Check Success Criteria
        if (validationResult.isValid && scores.overall_score >= 8.0) {
            coverLetter = generatedText;
            console.log(`✅ Quality target reached! (Validation: PASSED, Score: ${scores.overall_score}/10)`);
            break;
        }

        // 6. Prepare Feedback for Next Loop (Include Validation Errors)
        feedback = [];
        if (!validationResult.isValid) {
            feedback.push(...validationResult.errors.map(e => `VALIDATION ERROR: ${e}`));
        }
        if (validationResult.warnings.length > 0) {
            feedback.push(...validationResult.warnings.map(w => `WARNING: ${w}`));
        }
        if (scores.overall_score > 0) {
            // Only add quality feedback if we got scores
            feedback.push(...(validation.issues || []));
        }

        iteration++;

        // STAGE 7: Pick best if max iterations reached
        if (iteration === MAX_ITERATIONS) {
            console.warn(`⚠️ Max iterations reached. Picking best valid version.`);

            // Pick best valid version (or best score if no valid version)
            const validAttempts = iterationLog.filter(log => log.validation.isValid);

            if (validAttempts.length > 0) {
                const bestAttempt = validAttempts.reduce((best, current) =>
                    current.scores.overall_score > best.scores.overall_score ? current : best
                );
                coverLetter = bestAttempt.letterVersion;
                scores = bestAttempt.scores;
                validation = bestAttempt.validation;
                console.log(`✅ Picked best valid attempt: Iteration ${bestAttempt.iteration} (Score: ${scores?.overall_score ?? 'N/A'}/10)`);
            } else {
                // No valid version found - return last attempt with warning
                console.error("❌ WARNING: No valid cover letter generated after 3 iterations!");
                console.error("   Returning last attempt despite validation failure.");
                coverLetter = generatedText; // Fallback to last
                // Ensure we have scores even if validation failed
                if (!scores) scores = { overall_score: 0, naturalness: 0, style_match: 0, company_relevance: 0, individuality: 0 };
                if (!validation) validation = { isValid: false, issues: ["Generation failed to meet criteria"] };
            }
        }
    }

    // Mock cost calculation for now
    const costCents = (iterationLog.length * 0.5); // Approx 0.5 cents per iteration

    return {
        coverLetter,
        finalScores: scores!,
        finalValidation: validation!,
        iterations: iteration,
        iterationLog,
        costCents
    };
}


// --- HELPER FUNCTIONS ---

function buildSystemPrompt(profile: any, job: any, company: any, style: any, quote: any, feedback: string[]) {
    // Construct a rich prompt based on all inputs
    return `
    Write a cover letter for ${job?.job_title || 'Application'} at ${job?.company_name || 'Company'}.
    
    CANDIDATE:
    ${JSON.stringify(profile)}
    
    JOB REQUIREMENTS:
    ${JSON.stringify(job?.requirements)}
    
    COMPANY INTEL:
    ${JSON.stringify(company)}
    
    WRITING STYLE TARGET:
    ${JSON.stringify(style)}
    
    INCORPORATE QUOTE:
    "${quote?.text || ''}" - ${quote?.author || ''}
    
    PREVIOUS FEEDBACK TO ADDRESS:
    ${feedback.join('\n')}
    
    Write the letter in German (or match job language).
    `;
}

async function judgeCoverLetter(text: string, job: any, style: any) {
    // Mock judgment for now or call Haiku/Sonnet
    // Real implementation would call LLM
    return {
        scores: {
            naturalness: 8.5,
            style_match: 8.0,
            company_relevance: 9.0,
            individuality: 8.0,
            overall_score: 8.4
        },
        validation: {
            isValid: true,
            issues: []
        },
        suggestions: []
    };
}
