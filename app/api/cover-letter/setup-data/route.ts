import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SetupDataResponse, SelectedHook, TargetLanguage } from '@/types/cover-letter-setup';
import { enrichCompany, linkEnrichmentToJob } from '@/lib/services/company-enrichment';

export async function GET(req: NextRequest) {
    const jobId = req.nextUrl.searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // ─── Parallel Queries ─────────────────────────────────────────
        const [jobRes, docsRes, profileRes, allCLDocsRes] = await Promise.all([
            supabase
                .from('job_queue')
                .select('requirements, metadata, company_name, company_website, job_title')
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
            supabase
                .from('documents')
                .select('id, created_at, metadata->>original_name, metadata->style_analysis')
                .eq('user_id', user.id)
                .eq('document_type', 'cover_letter')
                .order('created_at', { ascending: false })
                .limit(15),
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
            .select('intel_data, suggested_quotes, recent_news, linkedin_activity, perplexity_citations')
            .eq('job_id', jobId)
            .maybeSingle();

        if (pass1Data) {
            research = pass1Data;
        }

        // Pass 2: Fallback — lookup by company_name (matches cache architecture)
        if (!research && job.company_name) {
            const { data } = await supabase
                .from('company_research')
                .select('intel_data, suggested_quotes, recent_news, linkedin_activity, perplexity_citations')
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
        // NOTE: On-demand enrichment was removed from setup-data.
        // The user now triggers enrichment explicitly via the "Analysieren" button
        // in StepHookSelection, which calls /api/jobs/enrich with the website URL.

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

        // 5. Quotes (Führungspersönlichkeiten — falls vorhanden)
        (research?.suggested_quotes || []).slice(0, 1).forEach((q: any, i: number) => {
            if (q?.quote) {
                hooks.push({
                    id: `quote-${i}`,
                    type: 'quote',
                    label: `Zitat: ${q.author || 'Führungsperson'}`,
                    content: `"${q.quote}" – ${q.author || ''}`,
                    sourceName: q.author || '',
                    sourceUrl: '',
                    sourceAge: '',
                    relevanceScore: q.match_score || 0.7,
                });
            }
        });

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

        // ─── CV Stations (Step B) ──────────────────────────────────────
        // First try to get it from job metadata (for legacy or direct uploads)
        let cvData = job.metadata?.cv_structured_data?.experience || [];

        // If not found on job, fallback to user_profile (standard onboarding flow)
        if (cvData.length === 0 && profileRes.data?.cv_structured_data) {
            const parsedCv = typeof profileRes.data.cv_structured_data === 'string'
                ? JSON.parse(profileRes.data.cv_structured_data)
                : profileRes.data.cv_structured_data;

            cvData = parsedCv?.experience || [];
        }
        const requirements: string[] = (job.requirements || []).slice(0, 3).map((r: any) =>
            typeof r === 'string' ? r : r?.text || r?.description || JSON.stringify(r)
        );

        // ─── Style Info (Step C) ───────────────────────────────────────
        const hasStyleSample = !!styleDoc;
        const styleAnalysisSummary = styleDoc?.metadata?.style_analysis
            ? `${styleDoc.metadata.style_analysis.tone || 'Formal'}, Ø ${styleDoc.metadata.style_analysis.avg_sentence_length || '?'} Wörter/Satz`
            : 'Kein Style-Sample — Standardton';

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
            cvStations: cvData,
            jobRequirements: requirements,
            hasStyleSample,
            styleAnalysisSummary,
            detectedJobLanguage,
            availableStyleDocs,
        };

        console.log(`✅ [SetupData] Built for job ${jobId}: ${hooks.length} hooks, ${cvData.length} stations`);
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
