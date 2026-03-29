/**
 * cv-match-pipeline.ts — Inngest Background Function
 *
 * Replaces the synchronous LLM call in /api/cv/match/route.ts.
 * Event: 'cv-match/analyze'
 * Payload: { jobId: string, userId: string, cvDocumentId?: string }
 *
 * Contracts: §3 (user-scoped), §8 (supabaseAdmin), §9 (status), JSONB Merge Pflicht
 */

import { inngest } from './client';
import { NonRetriableError } from 'inngest';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { runCVMatchAnalysis } from '@/lib/services/cv-match-analyzer';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export const analyzeCVMatch = inngest.createFunction(
    {
        id: 'analyze-cv-match',
        name: 'Analyze CV Match',
        retries: 2,
        // Single Sonnet call with integrated Self-Critique: expected 40-70s.
        // 120s gives safe headroom for edge cases (cold API, large CVs).
        timeouts: { finish: '120s' },
        rateLimit: {
            key: 'event.data.userId',
            limit: 10,
            period: '1m',
        },
        onFailure: async ({ event, error }) => {
            // Dead-letter handler: write error status to DB so the frontend
            // never gets stuck polling a 'processing' state that will never resolve.
            //
            // §BUG-FIX: Wrap in try-catch + use safe optional chaining.
            // Previously: `event.data.event.data` could throw at runtime if the
            // Inngest wrapper shape differed — silently crashing this handler
            // and leaving cv_match_status='processing' forever in the DB.
            const errMsg = error?.message || 'Unknown pipeline failure';

            // Safe extraction — Inngest onFailure wraps the original event
            const originalData = (event?.data as any)?.event?.data;
            const jobId = originalData?.jobId as string | undefined;
            const userId = originalData?.userId as string | undefined;

            console.error(`❌ [CV Match] Pipeline permanently failed${jobId ? ` for job ${jobId}` : ''}: ${errMsg}`);

            if (!jobId || !userId) {
                console.error('❌ [CV Match] onFailure: Cannot write error status — jobId or userId missing from event payload', event?.data);
                return;
            }

            try {
                const { data: freshJob } = await supabaseAdmin
                    .from('job_queue')
                    .select('metadata')
                    .eq('id', jobId)
                    .eq('user_id', userId)
                    .single();

                const currentMetadata = (freshJob?.metadata as Record<string, unknown>) || {};

                const { error: updateErr } = await supabaseAdmin
                    .from('job_queue')
                    .update({
                        metadata: {
                            ...currentMetadata,
                            cv_match_status: 'error',
                            cv_match_error: errMsg,
                        },
                    })
                    .eq('id', jobId)
                    .eq('user_id', userId);

                if (updateErr) {
                    console.error(`❌ [CV Match] DB update in onFailure failed:`, updateErr.message);
                } else {
                    console.log(`📝 [CV Match] Error status written to DB for job ${jobId}`);
                }
            } catch (dbErr) {
                console.error(`❌ [CV Match] Failed to write error status to DB:`, dbErr);
            }
        },
    },
    { event: 'cv-match/analyze' },
    async ({ event, step }) => {
        const { jobId, userId, cvDocumentId, locale } = event.data as {
            jobId: string;
            userId: string;
            cvDocumentId?: string;
            locale?: string;
        };

        // Step 1: Read job data (§3 — user-scoped)
        const job = await step.run('read-job', async () => {
            const { data } = await supabaseAdmin
                .from('job_queue')
                .select('id, job_title, company_name, description, requirements, buzzwords, seniority, location, metadata')
                .eq('id', jobId)
                .eq('user_id', userId) // §3: user-scoped
                .single();

            if (!data) throw new NonRetriableError('Job not found — no retry');
            return data;
        });

        // Step 2: Load CV text
        const cvData = await step.run('load-cv', async () => {
            const result = await getCVText(userId, cvDocumentId);
            if (!result) throw new NonRetriableError('CV not found — no retry');
            return result;
        });

        // Step 2.5: Deterministic ATS keyword pre-match (Stufe 2)
        // Reads structured CV skills from user_profiles.cv_structured_data
        // and matches against job.buzzwords BEFORE the LLM call.
        const preMatchedKeywords = await step.run('pre-match-keywords', async () => {
            const buzzwords = Array.isArray(job.buzzwords) ? job.buzzwords : [];
            if (buzzwords.length === 0) {
                console.log('[pre-match] No buzzwords to match — skipping');
                return null;
            }

            // Load structured CV data
            let cvData: any = null;
            try {
                const { data: profile, error: profileErr } = await supabaseAdmin
                    .from('user_profiles')
                    .select('cv_structured_data')
                    .eq('id', userId)
                    .single();

                if (profileErr) {
                    console.warn('[pre-match] Supabase query failed — LLM-only fallback:', profileErr.message);
                    return null;
                }
                cvData = profile?.cv_structured_data;
            } catch (dbErr: any) {
                console.warn('[pre-match] Unexpected DB error — LLM-only fallback:', dbErr?.message);
                return null;
            }

            if (!cvData?.skills || !Array.isArray(cvData.skills)) {
                console.log('[pre-match] No cv_structured_data.skills found — LLM-only fallback');
                return null;
            }

            // Hobby/personal skill categories to EXCLUDE from ATS matching
            // ATS = professional skills (CRM, Python, Project Management), NOT hobbies (Gitarre, Kochen)
            const EXCLUDED_CATEGORIES = new Set([
                'hobbies', 'hobby', 'interests', 'interessen', 'personal', 'persönlich',
                'freizeit', 'leisure', 'sonstige', 'other', 'sonstiges',
            ]);

            // Flatten all professional skills into a single lowercase array
            const cvSkillsFlat: string[] = [];

            for (const group of cvData.skills) {
                const cat = (group.category || '').toLowerCase().trim();
                if (EXCLUDED_CATEGORIES.has(cat)) continue; // Skip hobbies

                if (Array.isArray(group.items)) {
                    for (const item of group.items) {
                        if (typeof item === 'string' && item.trim().length >= 2) {
                            cvSkillsFlat.push(item.trim().toLowerCase());
                        }
                    }
                }
            }

            // Also include: job titles from experience (e.g. "Business Development Manager")
            if (Array.isArray(cvData.experience)) {
                for (const exp of cvData.experience) {
                    if (exp.role && typeof exp.role === 'string') {
                        cvSkillsFlat.push(exp.role.trim().toLowerCase());
                    }
                }
            }

            // Also include: language names
            if (Array.isArray(cvData.languages)) {
                for (const lang of cvData.languages) {
                    if (lang.language && typeof lang.language === 'string') {
                        cvSkillsFlat.push(lang.language.trim().toLowerCase());
                    }
                }
            }

            // Also include: certification names
            if (Array.isArray(cvData.certifications)) {
                for (const cert of cvData.certifications) {
                    if (cert.name && typeof cert.name === 'string') {
                        cvSkillsFlat.push(cert.name.trim().toLowerCase());
                    }
                }
            }

            // Deduplicate
            const uniqueSkills = [...new Set(cvSkillsFlat)];

            // Match each buzzword against CV skills
            const found: string[] = [];
            const missing: string[] = [];

            for (const keyword of buzzwords) {
                const kw = keyword.trim().toLowerCase();
                if (kw.length < 2) continue;

                // Word-boundary-safe matching: prevent "AI" matching "Email"
                // For short keywords (<=3 chars), require exact match or start/end of skill
                const isShort = kw.length <= 3;

                const isFound = uniqueSkills.some(skill => {
                    if (isShort) {
                        // Exact match only for short terms
                        return skill === kw
                            || skill.startsWith(kw + ' ')
                            || skill.startsWith(kw + '.')
                            || skill.endsWith(' ' + kw)
                            || skill.includes('(' + kw + ')')
                            || skill.includes(' ' + kw + ' ');
                    }
                    // Longer keywords: substring match (case-insensitive)
                    // skill.includes(kw): e.g. skill="b2b sales" matches kw="sales" ✅
                    // kw.includes(skill): e.g. skill="crm" matches kw="crm software" ✅
                    // BUT: skill="java" must NOT match kw="javascript" ❌
                    // Guard: for kw.includes(skill), require skill is a whole word in kw
                    if (skill.includes(kw)) return true;
                    if (kw.includes(skill)) {
                        // Word-boundary check: skill must be surrounded by spaces, start, or end
                        const wordBoundaryRegex = new RegExp(`(^|[\\s\\-\/])${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s\\-\/])`);
                        return wordBoundaryRegex.test(kw);
                    }
                    return false;
                });

                if (isFound) {
                    found.push(keyword); // preserve original casing
                } else {
                    missing.push(keyword);
                }
            }

            console.log(`[pre-match] Matched ${found.length}/${buzzwords.length} keywords deterministically. CV skills index: ${uniqueSkills.length} entries.`);
            if (found.length > 0) console.log(`[pre-match] Found: ${found.join(', ')}`);
            if (missing.length > 0) console.log(`[pre-match] Missing: ${missing.join(', ')}`);

            return { found, missing };
        });

        // Step 3: Run CV Match Analysis (the heavy LLM work)
        const matchResult = await step.run('analyze-match', async () => {
            try {
                return await runCVMatchAnalysis({
                    userId,
                    jobId: job.id,
                    cvText: cvData.text,
                    jobTitle: job.job_title || 'Unknown Title',
                    company: job.company_name || 'Unknown Company',
                    jobDescription: job.description || '',
                    requirements: job.requirements || [],
                    atsKeywords: job.buzzwords || [],
                    level: job.seniority || '',
                    locale: (locale as any) || 'de',
                    // Stufe 2: Pass deterministic pre-match results (or undefined for LLM-only fallback)
                    preMatchedKeywords: preMatchedKeywords ?? undefined,
                });
            } catch (err: any) {
                if (err?.status === 400 || err?.status === 401 || err?.status === 404) {
                    throw new NonRetriableError(`AI API permanent error: ${err.message}`);
                }
                throw err;
            }
        });

        // Step 4: Save result to DB (JSONB Merge! + Status → cv_matched per DB constraint)
        await step.run('save-results', async () => {
            // Re-read CURRENT metadata to avoid overwriting changes made between Step 1 and now
            // (e.g. cv_match_started_at written by /api/cv/match/route.ts)
            const { data: freshJob } = await supabaseAdmin
                .from('job_queue')
                .select('metadata')
                .eq('id', jobId)
                .eq('user_id', userId)
                .single();

            const currentMetadata = (freshJob?.metadata as Record<string, unknown>) || {};

            // Normalize matchResult — restore §7 compliance: validate before flagging done
            const missingFields: string[] = [];

            // Defensive: convert legacy score:number to level-based format
            function normalizeScoreCategory(val: any): { level: string; reasons: string[] } {
                if (val && typeof val === 'object' && typeof val.level === 'string') {
                    return { level: val.level, reasons: Array.isArray(val.reasons) ? val.reasons : [] };
                }
                if (val && typeof val === 'object' && typeof val.score === 'number') {
                    const level = val.score >= 70 ? 'strong' : val.score >= 40 ? 'solid' : 'gap';
                    return { level, reasons: Array.isArray(val.reasons) ? val.reasons : [] };
                }
                if (typeof val === 'number') {
                    return { level: val >= 70 ? 'strong' : val >= 40 ? 'solid' : 'gap', reasons: [] };
                }
                return { level: 'solid', reasons: [] }; // safe default
            }

            const rawBreakdown = (matchResult.scoreBreakdown && typeof matchResult.scoreBreakdown === 'object')
                ? matchResult.scoreBreakdown as Record<string, any> : {};

            const normalizedBreakdown = {
                technicalSkills: normalizeScoreCategory(rawBreakdown.technicalSkills),
                softSkills: normalizeScoreCategory(rawBreakdown.softSkills),
                experienceLevel: normalizeScoreCategory(rawBreakdown.experienceLevel),
                domainKnowledge: normalizeScoreCategory(rawBreakdown.domainKnowledge),
                languageMatch: normalizeScoreCategory(rawBreakdown.languageMatch),
            };

            // V2: Normalize each requirement row's array fields to prevent frontend crashes
            const VALID_ORBIT_CATS = new Set(['technical', 'soft', 'experience', 'domain', 'language']);
            const rawRows = Array.isArray(matchResult.requirementRows)
                ? matchResult.requirementRows : (missingFields.push('requirementRows'), []);

            const normalizedRows = rawRows.map((row: any) => ({
                ...row,
                title: row.title || row.requirement || '',
                orbitCategory: VALID_ORBIT_CATS.has(String(row.orbitCategory).toLowerCase())
                    ? String(row.orbitCategory).toLowerCase()
                    : 'domain', // safe fallback
                level: ['strong', 'solid', 'gap'].includes(row.level) ? row.level : 'solid',
                relevantChips: Array.isArray(row.relevantChips) ? row.relevantChips : [],
                context: row.context || row.currentState || '',
                gaps: Array.isArray(row.gaps) ? row.gaps : [],
                additionalChips: Array.isArray(row.additionalChips) ? row.additionalChips : [],
            }));

            const safeResult = {
                ...matchResult,
                _schemaVersion: 2,
                requirementRows: normalizedRows,
                strengths: Array.isArray(matchResult.strengths)
                    ? matchResult.strengths : (missingFields.push('strengths'), []),
                gaps: Array.isArray(matchResult.gaps)
                    ? matchResult.gaps : (missingFields.push('gaps'), []),
                potentialHighlights: Array.isArray(matchResult.potentialHighlights)
                    ? matchResult.potentialHighlights : (missingFields.push('potentialHighlights'), []),
                keywordsFound: Array.isArray(matchResult.keywordsFound)
                    ? matchResult.keywordsFound : (missingFields.push('keywordsFound'), []),
                keywordsMissing: Array.isArray(matchResult.keywordsMissing)
                    ? matchResult.keywordsMissing : (missingFields.push('keywordsMissing'), []),
                scoreBreakdown: normalizedBreakdown,
                _normalized: missingFields.length > 0,
            };

            if (missingFields.length > 0) {
                console.warn(`[cv-match-pipeline] ⚠️ Normalized missing fields:`, missingFields);
            }

            const { error: updateError } = await supabaseAdmin
                .from('job_queue')
                .update({
                    metadata: {
                        ...currentMetadata, // JSONB Merge — fresh read, no data loss
                        cv_match: {
                            analyzed_at: new Date().toISOString(),
                            cv_document_id: cvData.documentId,
                            ...safeResult,
                        },
                        cv_match_error: null, // Clear any previous error
                        cv_match_status: 'done',
                    },
                    // Status: cv_matched (DB CHECK constraint value, maps to cv_match_done in §9)
                    status: 'cv_matched',
                })
                .eq('id', jobId)
                .eq('user_id', userId); // §3

            if (updateError) {
                console.error('❌ Failed to save CV match to DB:', updateError.message);
                throw updateError;
            }

            console.log(`✅ [CV Match] Job ${jobId} analyzed successfully`);
        });

        // Step 5: Sync user_profiles.cv_structured_data if user selected a specific CV
        // This prevents the desync bug where the Optimizer reads a different CV than the one matched.
        // Only runs when a specific cvDocumentId was provided (user selected via CVSelectDialog).
        if (cvDocumentId) {
            await step.run('sync-profile-cv', async () => {
                try {
                    // Check if the profile already references this document
                    const { data: profile } = await supabaseAdmin
                        .from('user_profiles')
                        .select('cv_original_file_path')
                        .eq('id', userId)
                        .single();

                    // Load the document's file path for comparison
                    const { data: doc } = await supabaseAdmin
                        .from('documents')
                        .select('file_url_encrypted, metadata')
                        .eq('id', cvDocumentId)
                        .eq('user_id', userId)
                        .single();

                    if (!doc) {
                        console.log(`[cv-match-pipeline] ℹ️ Document ${cvDocumentId} not found, skipping profile sync`);
                        return;
                    }

                    // Skip if profile already points to this document
                    if (profile?.cv_original_file_path === doc.file_url_encrypted) {
                        console.log(`[cv-match-pipeline] ℹ️ Profile already synced with document ${cvDocumentId}`);
                        return;
                    }

                    // Re-parse the document's extracted text to get structured data
                    const extractedText = (doc.metadata as Record<string, unknown>)?.extracted_text as string;
                    if (!extractedText || extractedText.trim().length < 50) {
                        console.warn(`[cv-match-pipeline] ⚠️ Document ${cvDocumentId} has no extracted text, skipping profile sync`);
                        return;
                    }

                    const { parseCvTextToJson } = await import('@/lib/services/cv-parser');
                    const structuredCv = await parseCvTextToJson(extractedText);

                    const { error: updateErr } = await supabaseAdmin
                        .from('user_profiles')
                        .update({
                            cv_structured_data: structuredCv,
                            cv_original_file_path: doc.file_url_encrypted,
                        })
                        .eq('id', userId);

                    if (updateErr) {
                        console.error(`[cv-match-pipeline] ⚠️ Profile sync failed (non-blocking):`, updateErr.message);
                    } else {
                        console.log(`[cv-match-pipeline] ✅ Profile cv_structured_data synced to document ${cvDocumentId}`);
                    }
                } catch (syncErr) {
                    // Non-blocking — profile sync failure must never crash the match pipeline
                    const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
                    console.error(`[cv-match-pipeline] ⚠️ Profile sync error (non-blocking):`, errMsg);
                }
            });
        }

        return { success: true, jobId };
    }
);
