import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SetupDataResponse, SelectedHook, TargetLanguage } from '@/types/cover-letter-setup';
import { enrichCompany, linkEnrichmentToJob } from '@/lib/services/company-enrichment';

// Auto-enrichment (Jina scrape + Claude extraction) can take 15-25s
export const maxDuration = 45;

export async function GET(req: NextRequest) {
    const jobId = req.nextUrl.searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // ─── Parallel Queries ─────────────────────────────────────────
        const [jobRes, docsRes, profileRes, allCLDocsRes, generatedCLCountRes] = await Promise.all([
            supabase
                .from('job_queue')
                .select('requirements, metadata, company_name, company_website, job_title, cv_optimization_proposal')
                .eq('id', jobId)
                .single(),

            supabase
                .from('documents')
                .select('metadata, created_at')
                .eq('user_id', user.id)
                .eq('document_type', 'cover_letter')
                .order('created_at', { ascending: false })
                .limit(1),

            supabase
                .from('user_profiles')
                .select('cv_structured_data')
                .eq('id', user.id)
                .single(),

            // All cover letter docs for tone source selection (slim payload)
            // WHY: metadata->>'original_name' fetches ONLY the key we need from the JSONB column,
            // preventing the full metadata blob (incl. extracted_text) from being loaded.
            // Filter: origin='upload' excludes AI-generated drafts from polluting the style picker
            supabase
                .from('documents')
                .select('id, created_at, metadata->>original_name, metadata->style_analysis')
                .eq('user_id', user.id)
                .eq('document_type', 'cover_letter')
                .neq('origin', 'generated')
                .order('created_at', { ascending: false })
                .limit(15),

            // Fix 3: Count generated cover letters to detect returning users
            // If count > 0, user has been through the wizard before → hide onboarding tips
            supabase
                .from('documents')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('document_type', 'cover_letter')
                .eq('origin', 'generated'),
        ]);

        if (jobRes.error || !jobRes.data) {
            console.error('❌ [SetupData] Job not found:', jobRes.error);
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const job = jobRes.data as any;
        const styleDoc = docsRes.data?.[0];

        // ─── Two-pass company_research lookup ─────────────────────────
        // Pass 1: Direct lookup via job_id
        let research: any = null;

        const { data: pass1Data } = await supabase
            .from('company_research')
            .select('intel_data, recent_news, linkedin_activity, perplexity_citations')
            .eq('job_id', jobId)
            .maybeSingle();

        if (pass1Data) {
            research = pass1Data;
        }

        // Pass 2: Fallback — lookup by company_name (matches cache architecture)
        if (!research && job.company_name) {
            const { data } = await supabase
                .from('company_research')
                .select('intel_data, recent_news, linkedin_activity, perplexity_citations')
                .eq('company_name', job.company_name)
                .gt('expires_at', new Date().toISOString())
                .order('researched_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            research = data;
            if (data) {
                console.log(`🔗 [SetupData] Fallback: found research for "${job.company_name}" via company_name lookup`);
            }
        }
        // ─── Auto-enrich if no research exists but company_website is available ───
        // Previously the user had to manually click "Analysieren". This caused empty
        // hook screens when research hadn't been triggered yet.
        if (!research && job.company_website) {
            console.log(`🔄 [SetupData] No research for "${job.company_name}" — auto-enriching via ${job.company_website}`);
            try {
                const enrichResult = await enrichCompany(
                    job.company_name,
                    job.company_name,
                    false, // use cache if available
                    { website: job.company_website }
                );
                if (enrichResult.id) {
                    await linkEnrichmentToJob(jobId, enrichResult.id);
                    // Re-fetch the research after enrichment
                    const { data: freshResearch } = await supabase
                        .from('company_research')
                        .select('intel_data, recent_news, linkedin_activity, perplexity_citations')
                        .eq('id', enrichResult.id)
                        .maybeSingle();
                    if (freshResearch) {
                        research = freshResearch;
                        console.log(`✅ [SetupData] Auto-enrichment succeeded for "${job.company_name}"`);
                    }
                }
            } catch (enrichErr) {
                console.warn(`⚠️ [SetupData] Auto-enrichment failed for "${job.company_name}":`, enrichErr);
                // Non-blocking — continue with empty hooks (manual fallback available)
            }
        }

        // ─── Build Hooks (Step A) — Company & Position focused ────────────
        // WICHTIG: Keine News-Hooks — Aufhänger soll sich auf Stelle/Unternehmen beziehen
        const citations: string[] = research?.perplexity_citations || [];
        const hooks: SelectedHook[] = [];

        // 1. Vision & Mission (höchste Relevanz — Unternehmensidentität)
        if (research?.intel_data?.vision_and_mission) {
            hooks.push({
                id: 'vision-0',
                type: 'vision',
                label: 'Vision & Mission',
                content: typeof research.intel_data.vision_and_mission === 'string'
                    ? research.intel_data.vision_and_mission
                    : String(research.intel_data.vision_and_mission),
                sourceName: extractDomain(citations[citations.length - 1] || ''),
                sourceUrl: citations[citations.length - 1] || '',
                sourceAge: 'Unternehmenswebsite',
                relevanceScore: 0.95,
            });
        }

        // 2. Unternehmenswerte (Kulturfit — direkt stellenbezogen)
        (research?.intel_data?.company_values || []).slice(0, 2).forEach((val: string, i: number) => {
            hooks.push({
                id: `value-${i}`,
                type: 'value',
                label: 'Unternehmenswert',
                content: typeof val === 'string' ? val : String(val),
                sourceName: extractDomain(citations[citations.length - 1] || ''),
                sourceUrl: citations[citations.length - 1] || '',
                sourceAge: 'Unternehmenswebsite',
                relevanceScore: 0.9,
            });
        });

        // 3. Key Projects / Produkte (Stellenbezug — womit wird man arbeiten)
        (research?.intel_data?.key_projects || []).slice(0, 2).forEach((proj: string, i: number) => {
            hooks.push({
                id: `project-${i}`,
                type: 'project',
                label: 'Kernprodukt / Projekt',
                content: typeof proj === 'string' ? proj : String(proj),
                sourceName: extractDomain(citations[citations.length - 1] || ''),
                sourceUrl: citations[citations.length - 1] || '',
                sourceAge: 'Website',
                relevanceScore: 0.85,
            });
        });

        // 4. Wachstum & Funding (Unternehmensphase — relevant für Motivation)
        if (research?.intel_data?.funding_status && String(research.intel_data.funding_status).trim() !== '') {
            hooks.push({
                id: 'funding-0',
                type: 'funding',
                label: 'Wachstum & Unternehmensphase',
                content: typeof research.intel_data.funding_status === 'string'
                    ? research.intel_data.funding_status
                    : String(research.intel_data.funding_status),
                sourceName: extractDomain(citations[0] || ''),
                sourceUrl: citations[0] || '',
                sourceAge: 'Quelle',
                relevanceScore: 0.78,
            });
        }

        // 5. Quotes — now served on-demand via /api/cover-letter/quotes (DB-backed quote-service.ts).
        // The old suggested_quotes field in company_research is always [] since 2026-03-29.
        // Users select quotes in the Cover Letter Wizard via the QuoteSelector component.

        // Fallback: Manual entry — immer als letzte Option
        hooks.push({
            id: 'manual-0',
            type: 'manual',
            label: 'Eigenen Aufhänger schreiben',
            content: '',
            sourceName: '',
            sourceUrl: '',
            sourceAge: '',
            relevanceScore: 0,
        });

        // ─── CV Station Bullets Source (priority order) ────────────────
        // 1. Optimiertes CV (finalCv aus cv_optimization_proposal) — wenn User Änderungen akzeptiert hat
        // 2. job.metadata.cv_structured_data (direkter Upload / Legacy)
        // 3. user_profiles.cv_structured_data (Standard-Onboarding)
        // WHY: Cover Letter Wizard soll dieselben Bullets zeigen wie das generierte PDF.
        let cvData: any[] = [];

        const optimizedFinalCv = (job as any).cv_optimization_proposal?.finalCv;
        if (optimizedFinalCv?.experience?.length > 0) {
            // ✅ Nutze optimiertes CV (Bullets übereinstimmend mit dem generierten PDF)
            cvData = optimizedFinalCv.experience;
            console.log(`🔄 [SetupData] Using optimized finalCv for job ${jobId} (${cvData.length} stations)`);
        } else if (job.metadata?.cv_structured_data?.experience?.length > 0) {
            // Fallback: job-level upload
            cvData = job.metadata.cv_structured_data.experience;
        } else if (profileRes.data?.cv_structured_data) {
            // Fallback: user profile (standard onboarding)
            const parsedCv = typeof profileRes.data.cv_structured_data === 'string'
                ? JSON.parse(profileRes.data.cv_structured_data)
                : profileRes.data.cv_structured_data;
            cvData = parsedCv?.experience || [];
        }

        // ─── Map raw CV experience → SetupDataResponse.cvStations format ──────
        // cv_structured_data.experience uses: dateRangeText, description: [{id, text}]
        // SetupDataResponse.cvStations expects: period, bullets: string[], hint?: string
        
        // Read CV Match result (if completed) for hint generation
        const cvMatch = job.metadata?.cv_match;
        const requirementRows: any[] = cvMatch?.requirementRows || [];

        // Read CV Optimizer changes (if completed) for context auto-fill
        // Structure: { appliedChanges: [{ target: { section }, before, after }] }
        const cvOptimizerChanges: Array<{ target: { section: string }; before: string; after: string }> =
            job.metadata?.cv_optimization_user_decisions?.appliedChanges || [];
        
        // Detect UI locale from Accept-Language or job language
        const acceptLang = req.headers.get('accept-language') || '';
        const uiLocale = acceptLang.startsWith('de') ? 'de' 
            : acceptLang.startsWith('es') ? 'es' : 'en';

        const mappedCvStations = cvData
            .filter((exp: any) => exp?.role && exp?.company) // Only complete stations
            .map((exp: any) => {
                const stationRole = exp.role || '';
                const stationBullets = Array.isArray(exp.description)
                    ? exp.description.map((d: any) =>
                        typeof d === 'string' ? d : (d?.text || '')
                    ).filter(Boolean)
                    : [];

                // ─── Hint generation from CV Match ──────────────────────
                let hint: string | undefined;
                
                if (requirementRows.length > 0 && stationBullets.length > 0) {
                    // Find role words for matching
                    const roleWords = stationRole.toLowerCase().split(/[\s|,]+/).filter((w: string) => w.length > 3);
                    const bulletText = stationBullets.join(' ').toLowerCase();
                    
                    // Find best matching requirement row
                    let bestRow: any = null;
                    let bestOverlap = 0;
                    
                    for (const row of requirementRows) {
                        const reqTitle = (row.title || '').toLowerCase();
                        const reqChips = (row.relevantChips || []).map((c: string) => c.toLowerCase());
                        const allReqTerms = [...reqTitle.split(/\s+/), ...reqChips].filter((w: string) => w.length > 3);
                        
                        // Score: keyword overlap between requirement and station's bullets
                        const overlap = allReqTerms.filter((term: string) => 
                            bulletText.includes(term) || roleWords.some((rw: string) => term.includes(rw) || rw.includes(term))
                        ).length;
                        
                        if (overlap > bestOverlap) {
                            bestOverlap = overlap;
                            bestRow = row;
                        }
                    }
                    
                    if (bestRow && bestOverlap > 0) {
                        const reqTitle = bestRow.title || '';
                        const isStrong = bestRow.level === 'strong' || bestRow.level === 'solid';
                        
                        if (isStrong) {
                            // Case 1: Station HAS relevant experience
                            hint = uiLocale === 'de'
                                ? `Nutze deine „${stationRole}"-Erfahrung für: ${reqTitle}.`
                                : uiLocale === 'es'
                                ? `Usa tu experiencia como "${stationRole}" para: ${reqTitle}.`
                                : `Use your "${stationRole}" experience to demonstrate: ${reqTitle}.`;
                        } else {
                            // Case 2: Station DOESN'T have direct experience
                            hint = uiLocale === 'de'
                                ? `Du hast keine direkte Erfahrung in „${reqTitle}", aber deine „${stationRole}"-Skills können helfen.`
                                : uiLocale === 'es'
                                ? `No tienes experiencia directa en "${reqTitle}", pero tus habilidades como "${stationRole}" pueden ayudar.`
                                : `You don't have direct "${reqTitle}" experience, but your "${stationRole}" skills can help bridge this.`;
                        }
                    }
                }

                // ─── CV Optimizer Context Auto-fill ──────────────────────────────
                // Match optimizer changes to this station by looking for company/role keywords
                // in the 'section' field (e.g. "experience.Ingrano Solutions" or similar)
                let cvOptimizerContext: string | undefined;
                if (cvOptimizerChanges.length > 0) {
                    const stationKeywords = [
                        exp.company?.toLowerCase(),
                        exp.role?.toLowerCase(),
                    ].filter(Boolean);

                    const matchingChanges = cvOptimizerChanges.filter(c => {
                        const section = (c.target?.section || '').toLowerCase();
                        return stationKeywords.some(kw => kw && section.includes(kw));
                    });

                    if (matchingChanges.length > 0) {
                        // Summarize: take the first 'after' text, trim to ~180 chars
                        const firstAfter = matchingChanges[0].after?.trim() || '';
                        if (firstAfter.length > 10) {
                            cvOptimizerContext = firstAfter.length > 180
                                ? firstAfter.substring(0, 177) + '...'
                                : firstAfter;
                        }
                    }
                }

                return {
                    company: exp.company || '',
                    role: stationRole,
                    period: exp.dateRangeText || exp.period || '',
                    bullets: stationBullets,
                    ...(hint ? { hint } : {}),
                    ...(cvOptimizerContext ? { cvOptimizerContext } : {}),
                };
            });
        const requirements: string[] = (job.requirements || []).slice(0, 3).map((r: any) =>
            typeof r === 'string' ? r : r?.text || r?.description || JSON.stringify(r)
        );

        // ─── Style Info (Step C) ───────────────────────────────────────
        const hasStyleSample = !!styleDoc;
        const styleAnalysisSummary = styleDoc?.metadata?.style_analysis
            ? `${styleDoc.metadata.style_analysis.tone || 'Formal'}`
            : '';


        const detectedJobLanguage: TargetLanguage =
            (job.metadata?.language || 'de') as TargetLanguage;

        // ─── Available Style Docs (for Tone Source Selection) ─────────
        // WHY: PostgREST JSON subkey select returns flattened keys:
        //   metadata->>original_name  → row.original_name (as string)
        //   metadata->style_analysis  → row.style_analysis (as object/null)
        const availableStyleDocs = (allCLDocsRes.data || []).map((doc: any) => ({
            id: doc.id,
            fileName: (doc.original_name as string) || 'Anschreiben',
            createdAt: doc.created_at,
            hasStyleAnalysis: !!doc.style_analysis,
        }));

        const response: SetupDataResponse = {
            hooks,
            hasPerplexityData: hooks.some((h) => h.type !== 'manual'),
            companyWebsite: job.company_website ?? null,
            jobTitle: job.metadata?.job_title ?? null,
            cvStations: mappedCvStations,
            jobRequirements: requirements,
            hasStyleSample,
            styleAnalysisSummary,
            detectedJobLanguage,
            availableStyleDocs,
            isReturningUser: (generatedCLCountRes.count ?? 0) > 0,
        };

        console.log(`✅ [SetupData] Built for job ${jobId}: ${hooks.length} hooks, ${mappedCvStations.length} stations (from ${cvData.length} raw)`);
        return NextResponse.json(response);

    } catch (err) {
        console.error('❌ [SetupData] Unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return url || 'Unbekannte Quelle';
    }
}
