/**
 * Admin Observability BFF — Aggregates PostHog, Sentry, Helicone & internal DB.
 *
 * Security: Session-Auth + isAdmin() whitelist (identical to /api/admin/users).
 * Cache: Upstash Redis, 5-min TTL. Bypass with ?refresh=true.
 * Resilience: Promise.allSettled — each source can fail independently.
 *
 * GET /api/admin/observability
 * GET /api/admin/observability?refresh=true
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSSRClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin';
import { Redis } from '@upstash/redis';

// ── Cache ──────────────────────────────────────────────────────────────────

const CACHE_KEY = 'admin:obs:v1';
const CACHE_TTL = 300; // 5 minutes

let _redis: Redis | null | undefined;
function getRedis(): Redis | null {
    if (_redis !== undefined) return _redis;
    const url = (process.env.UPSTASH_REDIS_URL ?? '').trim().replace(/^["']|["']$/g, '');
    const token = (process.env.UPSTASH_REDIS_TOKEN ?? '').trim().replace(/^["']|["']$/g, '');
    if (!url || !token) { _redis = null; return null; }
    _redis = new Redis({ url, token });
    return _redis;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Alert {
    level: 'critical' | 'warn' | 'info' | 'good';
    message: string;
}

interface SourceOk<T> { ok: true; data: T }
interface SourceErr { ok: false; error: string }
type SourceResult<T> = SourceOk<T> | SourceErr;

interface PostHogData {
    dau_series: number[];
    dau_labels: string[];
    events: { name: string; label: string; count: number; series: number[] }[];
}

interface SentryData {
    unresolved: number;
    issues: { title: string; count: number; level: string; lastSeen: string; culprit: string }[];
}

interface HeliconeData {
    total_cost_eur: number;
    total_requests: number;
    avg_latency_ms: number;
    by_model: { model: string; requests: number; cost_eur: number; avg_latency: number; tokens: number }[];
}

interface InternalData {
    feedback: { id: string; name: string | null; feedback: string; locale: string; created_at: string }[];
    onboarding_goals: Record<string, number>;
    total_users: number;
    credits: { debits: number; refills: number; beta_grants: number };
    pipeline: { pending: number; processing: number; stale: number; ready: number; total: number };
    generation: {
        total_calls: number;
        total_tokens: number;
        by_model: Record<string, number>;
        by_feature: { feature: string; calls: number; tokens: number }[];
        by_user: { user_id: string; calls: number; tokens: number }[];
    };
    plan_intents: Record<string, number>; // waitlist plan_preference distribution
}

// ── Main Handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    // §8: Auth Guard — session + admin whitelist
    const supabase = await createSSRClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !isAdmin(user.email)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Cache check (skip if ?refresh=true)
    const forceRefresh = req.nextUrl.searchParams.get('refresh') === 'true';
    const redis = getRedis();

    if (!forceRefresh && redis) {
        try {
            const cached = await redis.get<string>(CACHE_KEY);
            if (cached) {
                const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
                return NextResponse.json(parsed);
            }
        } catch {
            // Cache miss or Redis error — proceed to live fetch
        }
    }

    // Fetch all external sources in parallel — each can fail independently
    const [posthogResult, sentryResult, heliconeResult] = await Promise.allSettled([
        fetchPostHog(),
        fetchSentry(),
        fetchHelicone(),
    ]);

    // Internal DB queries (always use admin client, never fails catastrophically)
    const internal = await fetchInternal();

    const posthog: SourceResult<PostHogData> =
        posthogResult.status === 'fulfilled'
            ? posthogResult.value
            : { ok: false, error: String((posthogResult as PromiseRejectedResult).reason ?? 'Unknown') };

    const sentry: SourceResult<SentryData> =
        sentryResult.status === 'fulfilled'
            ? sentryResult.value
            : { ok: false, error: String((sentryResult as PromiseRejectedResult).reason ?? 'Unknown') };

    const helicone: SourceResult<HeliconeData> =
        heliconeResult.status === 'fulfilled'
            ? heliconeResult.value
            : { ok: false, error: String((heliconeResult as PromiseRejectedResult).reason ?? 'Unknown') };

    const alerts = computeAlerts(posthog, sentry, helicone, internal);

    const data = {
        cached_at: new Date().toISOString(),
        posthog,
        sentry,
        helicone,
        internal,
        alerts,
    };

    // Cache result in Redis
    if (redis) {
        await redis.set(CACHE_KEY, JSON.stringify(data), { ex: CACHE_TTL }).catch(() => { });
    }

    return NextResponse.json(data);
}

// ── PostHog ────────────────────────────────────────────────────────────────

async function fetchPostHog(): Promise<SourceResult<PostHogData>> {
    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
    const projectId = process.env.POSTHOG_PROJECT_ID || '157652';
    if (!apiKey) return { ok: false, error: 'POSTHOG_PERSONAL_API_KEY nicht konfiguriert' };

    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    try {
        // Single query with DAU + all feature events
        const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: {
                    kind: 'TrendsQuery',
                    series: [
                        { kind: 'EventsNode', event: '$pageview', name: 'DAU', math: 'dau' },
                        { kind: 'EventsNode', event: 'cover_letter_generated', name: 'Cover Letter' },
                        { kind: 'EventsNode', event: 'job_added_to_queue', name: 'Job Added' },
                        { kind: 'EventsNode', event: 'onboarding_completed', name: 'Onboarding' },
                        { kind: 'EventsNode', event: 'upgrade_intent', name: 'Upgrade Intent' },
                        { kind: 'EventsNode', event: 'stripe_checkout_started', name: 'Stripe Checkout' },
                        { kind: 'EventsNode', event: 'beta_credit_granted', name: 'Beta Credits erhalten' },
                        { kind: 'EventsNode', event: 'coaching_session_started', name: 'Coaching gestartet' },
                        { kind: 'EventsNode', event: 'cv_optimized', name: 'CV Optimiert' },
                    ],
                    dateRange: { date_from: '-7d' },
                    interval: 'day',
                },
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return { ok: false, error: `PostHog ${res.status}: ${errText.slice(0, 200)}` };
        }

        const json = await res.json();
        const results = json?.results ?? [];

        // First result = DAU
        const dauResult = results[0];
        const dau_series: number[] = dauResult?.data ?? [];
        const dau_labels: string[] = dauResult?.days ?? dauResult?.labels ?? [];

        // Rest = feature events (human-friendly names returned from series config)
        const events = results.slice(1).map((r: Record<string, unknown>) => ({
            name: String(r.label ?? (r.action as Record<string, unknown> | undefined)?.name ?? 'unknown'),
            label: String(r.label ?? ''),
            count: typeof r.count === 'number' ? r.count : (Array.isArray(r.data) ? (r.data as number[]).reduce((a: number, b: number) => a + b, 0) : 0),
            series: Array.isArray(r.data) ? r.data as number[] : [],
        }));

        return { ok: true, data: { dau_series, dau_labels, events } };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'PostHog fetch fehlgeschlagen' };
    }
}

// ── Sentry ─────────────────────────────────────────────────────────────────

async function fetchSentry(): Promise<SourceResult<SentryData>> {
    const token = process.env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG_SLUG;
    const project = process.env.SENTRY_PROJECT_SLUG;

    if (!token || !org) return { ok: false, error: 'SENTRY_AUTH_TOKEN / SENTRY_ORG_SLUG nicht konfiguriert' };

    try {
        const query = project ? `is:unresolved project:${project}` : 'is:unresolved';
        const res = await fetch(
            `https://sentry.io/api/0/organizations/${org}/issues/?query=${encodeURIComponent(query)}&limit=10&sort=freq`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: AbortSignal.timeout(10000),
            }
        );

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return { ok: false, error: `Sentry ${res.status}: ${errText.slice(0, 200)}` };
        }

        const issues = await res.json();
        const parsed = (Array.isArray(issues) ? issues : []).map((i: Record<string, unknown>) => ({
            title: String(i.title ?? ''),
            count: Number(i.count ?? 0),
            level: String(i.level ?? 'error'),
            lastSeen: String(i.lastSeen ?? ''),
            culprit: String(i.culprit ?? ''),
        }));

        return {
            ok: true,
            data: {
                unresolved: parsed.length,
                issues: parsed,
            },
        };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Sentry fetch fehlgeschlagen' };
    }
}

// ── Helicone ───────────────────────────────────────────────────────────────
// Tries the Helicone Query API first. On 401/403 (Proxy Key limitation),
// falls back to computing costs directly from generation_logs (DB Fallback).

async function fetchHelicone(): Promise<SourceResult<HeliconeData>> {
    const apiKey = process.env.HELICONE_QUERY_API_KEY ?? process.env.HELICONE_API_KEY;
    // No key at all → go straight to DB fallback
    if (!apiKey) return fetchHeliconeFromDB();

    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const res = await fetch('https://api.helicone.ai/v1/request/query', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filter: { request: { created_at: { gte: sevenDaysAgo } } },
                offset: 0,
                limit: 2000,
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            // 401/403 = Proxy Key can't access Query API → use DB fallback silently
            if (res.status === 401 || res.status === 403) {
                return fetchHeliconeFromDB();
            }
            const errText = await res.text().catch(() => '');
            return { ok: false, error: `Helicone ${res.status}: ${errText.slice(0, 200)}` };
        }

        const json = await res.json();
        const requests: Record<string, unknown>[] = Array.isArray(json) ? json : (json?.data ?? []);

        const modelMap = new Map<string, { requests: number; cost_usd: number; latency_sum: number; tokens: number }>();

        for (const r of requests) {
            const model = String(
                r.model ?? r.request_model ?? (r.body as Record<string, unknown> | undefined)?.model ?? 'unknown'
            );
            const cost = Number(r.cost_usd ?? r.cost ?? r.total_cost ?? 0);
            const latency = Number(r.latency ?? r.delay_ms ?? r.response_time ?? 0);
            const tokens = Number(r.total_tokens ?? r.completion_tokens ?? 0) + Number(r.prompt_tokens ?? 0);

            const existing = modelMap.get(model) ?? { requests: 0, cost_usd: 0, latency_sum: 0, tokens: 0 };
            existing.requests += 1;
            existing.cost_usd += cost;
            existing.latency_sum += latency;
            existing.tokens += tokens;
            modelMap.set(model, existing);
        }

        let total_cost = 0;
        let total_latency = 0;
        const by_model = Array.from(modelMap.entries()).map(([model, stats]) => {
            total_cost += stats.cost_usd;
            total_latency += stats.latency_sum;
            return {
                model: model.replace(/^claude-/, '').replace(/-\d{8}$/, ''),
                requests: stats.requests,
                cost_eur: +(stats.cost_usd * 0.93).toFixed(4),
                avg_latency: stats.requests > 0 ? Math.round(stats.latency_sum / stats.requests) : 0,
                tokens: stats.tokens,
            };
        }).sort((a, b) => b.cost_eur - a.cost_eur);

        return {
            ok: true,
            data: {
                total_cost_eur: +(total_cost * 0.93).toFixed(2),
                total_requests: requests.length,
                avg_latency_ms: requests.length > 0 ? Math.round(total_latency / requests.length) : 0,
                by_model,
            },
        };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Helicone fetch fehlgeschlagen' };
    }
}

// ── Helicone DB Fallback ────────────────────────────────────────────────────
// Called when Helicone Proxy Keys can't access the Query API (401).
// Computes costs from generation_logs using official Anthropic pricing (USD/MTok).

const MODEL_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
    'claude-haiku-4-5-20251001':  { input: 1.00,  output: 5.00  },
    'claude-haiku-4-5-20250929':  { input: 1.00,  output: 5.00  },
    'claude-haiku-4-5':           { input: 1.00,  output: 5.00  },
    'claude-sonnet-4-6-20260220': { input: 3.00,  output: 15.00 },
    'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
    'claude-sonnet-4-5':          { input: 3.00,  output: 15.00 },
    'mistral-small-2503':         { input: 0.15,  output: 0.60  },
    'default':                    { input: 1.50,  output: 7.50  },
};

function computeModelCostUSD(modelName: string, promptTokens: number, completionTokens: number): number {
    const key = Object.keys(MODEL_PRICING_USD_PER_MTOK).find(k => k !== 'default' && modelName.includes(k)) ?? 'default';
    const pricing = MODEL_PRICING_USD_PER_MTOK[key];
    return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}

async function fetchHeliconeFromDB(): Promise<SourceResult<HeliconeData>> {
    try {
        const admin = getSupabaseAdmin();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: logs, error } = await admin
            .from('generation_logs')
            .select('model_name, prompt_tokens, completion_tokens')
            .gte('created_at', sevenDaysAgo);

        if (error) return { ok: false, error: `DB-Fallback Fehler: ${error.message}` };

        const rows = logs ?? [];
        const modelMap = new Map<string, { requests: number; cost_usd: number; tokens: number }>();
        let total_cost = 0;

        for (const row of rows) {
            const model = (row.model_name as string) ?? 'unknown';
            const ptok = Number(row.prompt_tokens ?? 0);
            const ctok = Number(row.completion_tokens ?? 0);
            const cost = computeModelCostUSD(model, ptok, ctok);
            total_cost += cost;

            const existing = modelMap.get(model) ?? { requests: 0, cost_usd: 0, tokens: 0 };
            existing.requests += 1;
            existing.cost_usd += cost;
            existing.tokens += ptok + ctok;
            modelMap.set(model, existing);
        }

        const by_model = Array.from(modelMap.entries()).map(([model, stats]) => ({
            model: model.replace(/^claude-/, '').replace(/-\d{8}$/, ''),
            requests: stats.requests,
            cost_eur: +(stats.cost_usd * 0.93).toFixed(4),
            avg_latency: 0,
            tokens: stats.tokens,
        })).sort((a, b) => b.cost_eur - a.cost_eur);

        return {
            ok: true,
            data: {
                total_cost_eur: +(total_cost * 0.93).toFixed(2),
                total_requests: rows.length,
                avg_latency_ms: 0,
                by_model,
            },
        };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'DB-Fallback fehlgeschlagen' };
    }
}

// ── Internal DB ────────────────────────────────────────────────────────────

const INTERNAL_FALLBACK: InternalData = {
    feedback: [],
    onboarding_goals: {},
    total_users: 0,
    credits: { debits: 0, refills: 0, beta_grants: 0 },
    pipeline: { pending: 0, processing: 0, stale: 0, ready: 0, total: 0 },
    generation: { total_calls: 0, total_tokens: 0, by_model: {}, by_feature: [], by_user: [] },
    plan_intents: {},
};

async function fetchInternal(): Promise<InternalData> {
    try {
        const admin = getSupabaseAdmin();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [feedbackRes, profilesRes, creditsRes, pipelineRes, genLogsRes, usersRes, waitlistRes] = await Promise.all([
            // Feedback inbox (latest 20, admin bypasses RLS)
            admin.from('user_feedback')
                .select('id, name, feedback, locale, created_at')
                .order('created_at', { ascending: false })
                .limit(20),

            // Onboarding goals distribution
            admin.from('user_profiles')
                .select('onboarding_goals'),

            // Credit events (7d)
            admin.from('credit_events')
                .select('event_type, amount')
                .gte('created_at', sevenDaysAgo),

            // Pipeline health
            admin.from('job_queue')
                .select('status, updated_at'),

            // Generation logs (7d) — with task_type and user_id for per-feature/per-user breakdown
            admin.from('generation_logs')
                .select('model_name, task_type, user_id, prompt_tokens, completion_tokens')
                .gte('created_at', sevenDaysAgo),

            // Total registered users — perPage:1000 is Supabase max per page.
            // We only need the count for the dashboard, not all user objects.
            admin.auth.admin.listUsers({ perPage: 1000, page: 1 }),

            // Waitlist plan intents
            admin.from('waitlist_leads')
                .select('plan_preference'),
        ]);

        // Aggregate onboarding goals
        const goalCounts: Record<string, number> = {};
        for (const p of profilesRes.data ?? []) {
            const goals = p.onboarding_goals as string[] | null;
            if (Array.isArray(goals)) {
                for (const g of goals) {
                    goalCounts[g] = (goalCounts[g] || 0) + 1;
                }
            }
        }

        // Aggregate credits
        let debits = 0;
        let refills = 0;
        let beta_grants = 0;
        for (const c of creditsRes.data ?? []) {
            const amount = Math.abs(Number(c.amount ?? 0));
            if (c.event_type === 'debit') debits += amount;
            else if (c.event_type === 'beta_grant' || c.event_type === 'grant') beta_grants += amount;
            else refills += amount;
        }

        // Pipeline health + stale detection
        const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
        const now = Date.now();
        let pending = 0, processing = 0, stale = 0, ready = 0;
        for (const j of pipelineRes.data ?? []) {
            const status = j.status as string;
            if (status === 'pending' || status === 'pending_review') pending++;
            else if (status === 'processing') {
                processing++;
                if (j.updated_at && now - new Date(j.updated_at).getTime() > STALE_THRESHOLD_MS) stale++;
            } else if (['ready_for_review', 'ready_to_apply', 'cover_letter_done', 'cv_optimized', 'cv_matched', 'steckbrief_confirmed'].includes(status)) {
                ready++;
            }
        }

        // Generation logs aggregation — by model, by feature, by user
        let totalCalls = 0;
        let totalTokens = 0;
        const byModel: Record<string, number> = {};
        const byFeatureMap = new Map<string, { calls: number; tokens: number }>();
        const byUserMap = new Map<string, { calls: number; tokens: number }>();

        for (const g of genLogsRes.data ?? []) {
            totalCalls++;
            const tokens = Number(g.prompt_tokens ?? 0) + Number(g.completion_tokens ?? 0);
            totalTokens += tokens;

            const model = (g.model_name as string) ?? 'unknown';
            byModel[model] = (byModel[model] || 0) + 1;

            const feature = (g.task_type as string) ?? 'unbekannt';
            const fExisting = byFeatureMap.get(feature) ?? { calls: 0, tokens: 0 };
            fExisting.calls += 1;
            fExisting.tokens += tokens;
            byFeatureMap.set(feature, fExisting);

            const uid = (g.user_id as string) ?? 'anonymous';
            const uExisting = byUserMap.get(uid) ?? { calls: 0, tokens: 0 };
            uExisting.calls += 1;
            uExisting.tokens += tokens;
            byUserMap.set(uid, uExisting);
        }

        const by_feature = Array.from(byFeatureMap.entries())
            .map(([feature, stats]) => ({ feature, ...stats }))
            .sort((a, b) => b.calls - a.calls);

        // Top users by AI usage (anonymized — show only user count, not UIDs)
        const by_user = Array.from(byUserMap.entries())
            .map(([user_id, stats]) => ({ user_id: user_id.slice(0, 8) + '…', ...stats }))
            .sort((a, b) => b.calls - a.calls)
            .slice(0, 10);

        // Waitlist plan intents
        const planIntents: Record<string, number> = {};
        for (const w of waitlistRes.data ?? []) {
            const plan = (w.plan_preference as string) ?? 'nicht angegeben';
            planIntents[plan] = (planIntents[plan] || 0) + 1;
        }

        // usersRes.data.total is the true count (server-side), users array is page-capped
        const totalUsers = (usersRes.data as { total?: number; users: unknown[] } | null)?.total
            ?? usersRes.data?.users?.length
            ?? 0;

        return {
            feedback: (feedbackRes.data ?? []).map(f => ({
                id: f.id,
                name: f.name,
                feedback: f.feedback,
                locale: f.locale ?? 'de',
                created_at: f.created_at,
            })),
            onboarding_goals: goalCounts,
            total_users: totalUsers,
            credits: { debits, refills, beta_grants },
            pipeline: { pending, processing, stale, ready, total: pipelineRes.data?.length ?? 0 },
            generation: {
                total_calls: totalCalls,
                total_tokens: totalTokens,
                by_model: byModel,
                by_feature,
                by_user,
            },
            plan_intents: planIntents,
        };
    } catch (err) {
        // DB failure is non-fatal — return empty fallback and let alerts inform the admin
        console.error('[admin/obs] fetchInternal failed:', err instanceof Error ? err.message : err);
        return INTERNAL_FALLBACK;
    }
}

// ── Smart Alert Engine ─────────────────────────────────────────────────────

function computeAlerts(
    posthog: SourceResult<PostHogData>,
    sentry: SourceResult<SentryData>,
    helicone: SourceResult<HeliconeData>,
    internal: InternalData,
): Alert[] {
    const alerts: Alert[] = [];

    // Sentry: unresolved errors
    if (sentry.ok && sentry.data.unresolved >= 15) {
        alerts.push({ level: 'critical', message: `${sentry.data.unresolved} offene Sentry-Fehler — sofort prüfen` });
    } else if (sentry.ok && sentry.data.unresolved >= 5) {
        alerts.push({ level: 'warn', message: `${sentry.data.unresolved} offene Sentry-Fehler` });
    }

    // Stale jobs
    if (internal.pipeline.stale >= 5) {
        alerts.push({ level: 'critical', message: `${internal.pipeline.stale} Jobs stecken seit >10 Min im Processing` });
    } else if (internal.pipeline.stale >= 2) {
        alerts.push({ level: 'warn', message: `${internal.pipeline.stale} Jobs stecken im Processing` });
    }

    // AI costs
    if (helicone.ok) {
        const dailyCost = helicone.data.total_cost_eur / 7;
        if (dailyCost > 5) {
            alerts.push({ level: 'critical', message: `AI-Kosten €${dailyCost.toFixed(2)}/Tag — Budget prüfen` });
        } else if (dailyCost > 2) {
            alerts.push({ level: 'warn', message: `AI-Kosten €${dailyCost.toFixed(2)}/Tag — Modell-Routing effizient?` });
        }
    }

    // No activity (PostHog DAU)
    if (posthog.ok) {
        const lastThreeDays = posthog.data.dau_series.slice(-3);
        if (lastThreeDays.length > 0 && lastThreeDays.every(d => d === 0)) {
            alerts.push({ level: 'warn', message: '3 Tage keine aktiven User — Marketing-Kanal prüfen?' });
        }
    }

    // Upgrade intent without conversion
    if (posthog.ok) {
        const upgradeIntent = posthog.data.events.find(e => e.name === 'Upgrade Intent');
        const checkout = posthog.data.events.find(e => e.name === 'Checkout');
        if (upgradeIntent && upgradeIntent.count > 0 && (!checkout || checkout.count === 0)) {
            alerts.push({ level: 'info', message: `${upgradeIntent.count} Upgrade-Intents ohne Checkout — Paywall-Copy prüfen?` });
        }
    }

    // All good
    if (alerts.length === 0) {
        const clCount = posthog.ok
            ? posthog.data.events.find(e => e.name === 'Cover Letter')?.count ?? 0
            : 0;
        if (clCount > 0) {
            alerts.push({ level: 'good', message: `${clCount} Cover Letters diese Woche generiert — Produkt aktiv ✅` });
        } else {
            alerts.push({ level: 'good', message: 'Keine kritischen Probleme erkannt' });
        }
    }

    return alerts;
}
