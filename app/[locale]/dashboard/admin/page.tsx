'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isAdmin } from '@/lib/admin';
import { useTranslations } from 'next-intl';
import {
    Users, Trash2, RotateCcw, CheckCircle, XCircle, Shield, Loader2,
    Mail, Clock, Briefcase, FileText, Inbox, AlertTriangle,
    Activity, Bot, TrendingUp, MessageSquare, ChevronRight,
    AlertCircle, CircleCheck, Info, Zap,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

type AdminUser = {
    id: string;
    email: string;
    full_name: string | null;
    created_at: string;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    onboarding_completed: boolean;
    onboarding_goals: string[];
    active_jobs: number;
    applications: number;
};

type WaitlistLead = {
    id: string;
    email: string;
    source: string;
    locale: string;
    plan_preference: string | null;
    confirmed_at: string | null;
    created_at: string;
};

type Alert = { level: 'critical' | 'warn' | 'info' | 'good'; message: string };

type ObsData = {
    cached_at: string;
    posthog: { ok: true; data: { dau_series: number[]; dau_labels: string[]; events: { name: string; label: string; count: number; series: number[] }[] } } | { ok: false; error: string };
    sentry: { ok: true; data: { unresolved: number; issues: { title: string; count: number; level: string; lastSeen: string; culprit: string }[] } } | { ok: false; error: string };
    helicone: { ok: true; data: { total_cost_eur: number; total_requests: number; avg_latency_ms: number; by_model: { model: string; requests: number; cost_eur: number; avg_latency: number; tokens: number }[] } } | { ok: false; error: string };
    internal: {
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
        plan_intents: Record<string, number>;
    };
    alerts: Alert[];
};

// ── Constants ──────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
    active_applications: 'Bewerbungen abschicken',
    personalization: 'Personalisierung',
    exploring: 'Nur umschauen',
    interview_prep: 'Interview-Vorbereitung',
};

const TABS = [
    { key: 'pulse', icon: Activity, label: 'Platform Pulse' },
    { key: 'analytics', icon: TrendingUp, label: 'Analytics' },
    { key: 'ai', icon: Bot, label: 'AI & Kosten' },
    { key: 'growth', icon: MessageSquare, label: 'Wachstum & Feedback' },
    { key: 'users', icon: Users, label: 'User & Warteliste' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelative(d: string | null | undefined) {
    if (!d) return '—';
    const ts = new Date(d).getTime();
    // Guard against invalid date strings (e.g. empty stings from Sentry)
    if (isNaN(ts)) return '—';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `vor ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `vor ${days}d`;
}

// ── Inline Components ──────────────────────────────────────────────────────

function Sparkline({ data, color = '#012e7a', height = 32, width = 100 }: { data: number[]; color?: string; height?: number; width?: number }) {
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * width},${height - (v / max) * (height - 4)}`).join(' ');
    return (
        <svg width={width} height={height} className="block">
            <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
        </svg>
    );
}

function KPICard({ icon: Icon, label, value, sub, sparkData, color = '#012e7a' }: {
    icon: typeof Activity; label: string; value: string | number; sub?: string; sparkData?: number[]; color?: string;
}) {
    return (
        <div className="bg-white border border-[#E7E7E5] rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[#73726E] text-xs font-medium">
                <Icon className="w-3.5 h-3.5" style={{ color }} />
                {label}
            </div>
            <div className="flex items-end justify-between">
                <div>
                    <p className="text-2xl font-bold text-[#37352F]">{value}</p>
                    {sub && <p className="text-xs text-[#B4B4B0] mt-0.5">{sub}</p>}
                </div>
                {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} color={color} />}
            </div>
        </div>
    );
}

function SourceBadge({ ok, error }: { ok: boolean; error?: string }) {
    if (ok) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200">Live</span>;
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200" title={error}>
            Nicht erreichbar
        </span>
    );
}

function AlertBanner({ alerts }: { alerts: Alert[] }) {
    if (!alerts.length) return null;
    const levelStyles: Record<string, string> = {
        critical: 'bg-red-50 border-red-200 text-red-700',
        warn: 'bg-amber-50 border-amber-200 text-amber-700',
        info: 'bg-blue-50 border-blue-200 text-blue-700',
        good: 'bg-green-50 border-green-200 text-green-700',
    };
    const levelIcons: Record<string, typeof AlertCircle> = {
        critical: AlertTriangle,
        warn: AlertCircle,
        info: Info,
        good: CircleCheck,
    };

    return (
        <div className="space-y-2 mb-6">
            {alerts.map((alert, i) => {
                const LevelIcon = levelIcons[alert.level] ?? Info;
                return (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${levelStyles[alert.level] ?? ''}`}>
                        <LevelIcon className="w-4 h-4 shrink-0" />
                        <span>{alert.message}</span>
                    </div>
                );
            })}
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminPage() {
    const router = useRouter();
    const t = useTranslations('admin');
    const [authorized, setAuthorized] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>('pulse');

    // Observability data
    const [obs, setObs] = useState<ObsData | null>(null);
    const [obsLoading, setObsLoading] = useState(true);

    // User/Waitlist data (existing)
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [leads, setLeads] = useState<WaitlistLead[]>([]);
    const [leadsTotal, setLeadsTotal] = useState(0);
    const [leadsConfirmed, setLeadsConfirmed] = useState(0);
    const [leadsLoading, setLeadsLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; email: string; type: 'user' | 'lead' } | null>(null);

    // ── Init ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !isAdmin(user.email)) {
                router.replace('/dashboard');
                return;
            }
            setAuthorized(true);
            await Promise.all([loadObs(), loadUsers(), loadWaitlist()]);
        };
        init();
    }, [router]);

    // ── Data Loaders ───────────────────────────────────────────────────────

    const loadObs = useCallback(async (refresh = false) => {
        setObsLoading(true);
        try {
            const url = refresh ? '/api/admin/observability?refresh=true' : '/api/admin/observability';
            const res = await fetch(url);
            const data = await res.json();
            if (data && !data.error) setObs(data);
        } catch (err) {
            console.error('[admin] obs load failed:', err);
        } finally {
            setObsLoading(false);
        }
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (data.success) { setUsers(data.users); setTotal(data.total); }
        } catch (err) { console.error('Failed to load users:', err); }
        finally { setLoading(false); }
    };

    const loadWaitlist = async () => {
        setLeadsLoading(true);
        try {
            const res = await fetch('/api/admin/waitlist');
            const data = await res.json();
            if (data.success) { setLeads(data.leads); setLeadsTotal(data.total); setLeadsConfirmed(data.confirmed); }
        } catch (err) { console.error('Failed to load waitlist:', err); }
        finally { setLeadsLoading(false); }
    };

    // ── Actions (existing) ─────────────────────────────────────────────────

    const handleDelete = (userId: string, email: string) => setConfirmDelete({ id: userId, email, type: 'user' });
    const handleDeleteLead = (leadId: string, email: string) => setConfirmDelete({ id: leadId, email, type: 'lead' });

    const executeDelete = async () => {
        if (!confirmDelete) return;
        const { id, type } = confirmDelete;
        setConfirmDelete(null);
        setErrorMsg(null);
        setActionLoading(id);
        try {
            if (type === 'user') {
                const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: id }) });
                const data = await res.json();
                if (data.success) { setUsers(prev => prev.filter(u => u.id !== id)); setTotal(prev => prev - 1); }
                else setErrorMsg(data.error || `Fehler ${res.status}`);
            } else {
                const wasConfirmed = leads.find(l => l.id === id)?.confirmed_at != null;
                const res = await fetch('/api/admin/waitlist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: id }) });
                const data = await res.json();
                if (data.success) { setLeads(prev => prev.filter(l => l.id !== id)); setLeadsTotal(prev => prev - 1); if (wasConfirmed) setLeadsConfirmed(prev => prev - 1); }
                else setErrorMsg(data.error || `Fehler ${res.status}`);
            }
        } catch { setErrorMsg('Netzwerkfehler.'); }
        finally { setActionLoading(null); }
    };

    const handleResetOnboarding = async (userId: string) => {
        setActionLoading(userId);
        try {
            const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, action: 'reset_onboarding' }) });
            const data = await res.json();
            if (data.success) setUsers(prev => prev.map(u => u.id === userId ? { ...u, onboarding_completed: false } : u));
        } finally { setActionLoading(null); }
    };

    // ── Auth Guard ─────────────────────────────────────────────────────────

    if (!authorized) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-[#012e7a]" />
            </div>
        );
    }

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="p-8 max-w-7xl mx-auto">

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 border border-[#E7E7E5]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-red-50 rounded-xl"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
                            <h3 className="font-semibold text-[#37352F]">
                                {confirmDelete.type === 'user' ? t('delete_user_title') : t('delete_lead_title')}
                            </h3>
                        </div>
                        <p className="text-sm text-[#73726E] mb-6">
                            <span className="font-medium text-[#37352F]">{confirmDelete.email}</span> {t('delete_confirm')}
                            {confirmDelete.type === 'user' && ` ${t('delete_all_data')}`}
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 px-4 rounded-lg border border-[#E7E7E5] text-sm font-medium text-[#37352F] hover:bg-[#FAFAF9] transition-colors">
                                {t('cancel')}
                            </button>
                            <button onClick={executeDelete} className="flex-1 py-2 px-4 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors">
                                {t('delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
                <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                    <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-600"><XCircle className="w-4 h-4" /></button>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-xl">
                        <Shield className="h-6 w-6 text-red-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-[#37352F]">{t('title')}</h1>
                        <p className="text-sm text-[#73726E]">
                            {obs?.internal?.total_users ?? total} {t('registered_users')} • {t('admin_only')}
                            {obs?.cached_at && <span className="ml-2 text-[#B4B4B0]">• Cache: {formatRelative(obs.cached_at)}</span>}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => loadObs(true)}
                    disabled={obsLoading}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#73726E] border border-[#E7E7E5] rounded-lg hover:bg-[#FAFAF9] hover:text-[#012e7a] transition-colors disabled:opacity-40"
                >
                    <RotateCcw className={`w-3.5 h-3.5 ${obsLoading ? 'animate-spin' : ''}`} />
                    {t('refresh')}
                </button>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 mb-6 border-b border-[#E7E7E5] overflow-x-auto">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${isActive
                                ? 'border-[#012e7a] text-[#012e7a]'
                                : 'border-transparent text-[#73726E] hover:text-[#37352F] hover:border-[#E7E7E5]'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {obsLoading && !obs ? (
                <div className="p-12 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#73726E]" /></div>
            ) : (
                <>
                    {activeTab === 'pulse' && <TabPulse obs={obs} total={total} />}
                    {activeTab === 'analytics' && <TabAnalytics obs={obs} />}
                    {activeTab === 'ai' && <TabAI obs={obs} />}
                    {activeTab === 'growth' && <TabGrowth obs={obs} />}
                    {activeTab === 'users' && (
                        <TabUsers
                            users={users} total={total} loading={loading} loadUsers={loadUsers}
                            leads={leads} leadsTotal={leadsTotal} leadsConfirmed={leadsConfirmed} leadsLoading={leadsLoading} loadWaitlist={loadWaitlist}
                            actionLoading={actionLoading}
                            handleDelete={handleDelete} handleDeleteLead={handleDeleteLead}
                            handleResetOnboarding={handleResetOnboarding}
                        />
                    )}
                </>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1: PLATFORM PULSE
// ════════════════════════════════════════════════════════════════════════════

function TabPulse({ obs, total }: { obs: ObsData | null; total: number }) {
    if (!obs) return <p className="text-sm text-[#B4B4B0]">Lade Daten…</p>;

    const dauTotal = obs.posthog.ok ? obs.posthog.data.dau_series.reduce((a, b) => a + b, 0) : 0;

    return (
        <div>
            {/* Alerts */}
            <AlertBanner alerts={obs.alerts} />

            {/* Source Status */}
            <div className="flex gap-3 mb-6 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-[#73726E]">PostHog <SourceBadge ok={obs.posthog.ok} error={!obs.posthog.ok ? obs.posthog.error : undefined} /></div>
                <div className="flex items-center gap-1.5 text-xs text-[#73726E]">Sentry <SourceBadge ok={obs.sentry.ok} error={!obs.sentry.ok ? obs.sentry.error : undefined} /></div>
                <div className="flex items-center gap-1.5 text-xs text-[#73726E]">Helicone <SourceBadge ok={obs.helicone.ok} error={!obs.helicone.ok ? obs.helicone.error : undefined} /></div>
                <div className="flex items-center gap-1.5 text-xs text-[#73726E]">DB <SourceBadge ok={true} /></div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                <KPICard
                    icon={Activity} label="DAU (7d)" color="#012e7a"
                    value={obs.posthog.ok ? Math.max(...obs.posthog.data.dau_series, 0) : '–'}
                    sub={obs.posthog.ok ? `${dauTotal} Gesamt-Visits` : undefined}
                    sparkData={obs.posthog.ok ? obs.posthog.data.dau_series : undefined}
                />
                <KPICard
                    icon={AlertTriangle} label="Offene Fehler" color={obs.sentry.ok && obs.sentry.data.unresolved > 5 ? '#ef4444' : '#22c55e'}
                    value={obs.sentry.ok ? obs.sentry.data.unresolved : '–'}
                    sub={obs.sentry.ok ? (obs.sentry.data.unresolved === 0 ? 'Alles sauber ✅' : 'Sentry Issues') : undefined}
                />
                <KPICard
                    icon={Zap} label="AI-Kosten / 7d" color="#8b5cf6"
                    value={obs.helicone.ok ? `€${obs.helicone.data.total_cost_eur}` : '–'}
                    sub={obs.helicone.ok ? `${obs.helicone.data.total_requests} Requests` : undefined}
                />
                <KPICard
                    icon={Users} label="Registriert" color="#3b82f6"
                    value={obs.internal?.total_users ?? total}
                />
                <KPICard
                    icon={Briefcase} label="Pipeline" color="#14b8a6"
                    value={obs.internal?.pipeline.total ?? 0}
                    sub={obs.internal?.pipeline.stale ? `⚠ ${obs.internal.pipeline.stale} Stale` : `${obs.internal?.pipeline.ready ?? 0} Ready`}
                />
            </div>

            {/* Quick Sentry Issues */}
            {obs.sentry.ok && obs.sentry.data.issues.length > 0 && (
                <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden mb-6">
                    <div className="px-5 py-3 bg-[#FAFAF9] border-b border-[#E7E7E5]">
                        <h3 className="text-sm font-semibold text-[#37352F]">Letzte Sentry-Fehler</h3>
                    </div>
                    <div className="divide-y divide-[#E7E7E5]">
                        {obs.sentry.data.issues.slice(0, 5).map((issue, i) => (
                            <div key={i} className="px-5 py-3 flex items-center gap-3 text-sm">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${issue.level === 'error' ? 'bg-red-500' : 'bg-amber-400'}`} />
                                <span className="text-[#37352F] truncate flex-1">{issue.title}</span>
                                <span className="text-xs text-[#B4B4B0] shrink-0">{issue.count}×</span>
                                <span className="text-xs text-[#B4B4B0] shrink-0">{formatRelative(issue.lastSeen)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2: ANALYTICS (PostHog)
// ════════════════════════════════════════════════════════════════════════════

function TabAnalytics({ obs }: { obs: ObsData | null }) {
    if (!obs) return null;
    if (!obs.posthog.ok) return <SourceUnavailable name="PostHog" error={obs.posthog.error} />;

    const { dau_series, dau_labels, events } = obs.posthog.data;
    const maxEvent = Math.max(...events.map(e => e.count), 1);

    return (
        <div>
            {/* DAU Chart */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-[#37352F] mb-4">Tägl. aktive User (7 Tage)</h3>
                <div className="flex items-end gap-2 h-24">
                    {dau_series.map((value, i) => {
                        const max = Math.max(...dau_series, 1);
                        const heightPct = (value / max) * 100;
                        const dayLabel = dau_labels[i] ? new Date(dau_labels[i]).toLocaleDateString('de-DE', { weekday: 'short' }) : '';
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-xs text-[#37352F] font-medium">{value}</span>
                                <div className="w-full bg-[#012e7a]/10 rounded-t" style={{ height: `${Math.max(heightPct, 4)}%` }}>
                                    <div className="w-full h-full bg-[#012e7a] rounded-t transition-all" />
                                </div>
                                <span className="text-[10px] text-[#B4B4B0]">{dayLabel}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Feature Events */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#37352F] mb-4">Feature Events (7 Tage)</h3>
                <div className="space-y-3">
                    {events.map((ev, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <span className="text-sm text-[#73726E] w-40 truncate">{ev.name}</span>
                            <div className="flex-1 h-5 bg-[#F5F5F4] rounded overflow-hidden">
                                <div className="h-full bg-[#012e7a]/70 rounded transition-all" style={{ width: `${(ev.count / maxEvent) * 100}%` }} />
                            </div>
                            <span className="text-sm font-semibold text-[#37352F] w-10 text-right">{ev.count}</span>
                            <Sparkline data={ev.series} color="#012e7a" width={60} height={20} />
                        </div>
                    ))}
                    {events.length === 0 && <p className="text-sm text-[#B4B4B0]">Noch keine Events in den letzten 7 Tagen.</p>}
                </div>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 3: AI & KOSTEN (Helicone + generation_logs)
// ════════════════════════════════════════════════════════════════════════════

function TabAI({ obs }: { obs: ObsData | null }) {
    if (!obs) return null;

    // Stripe Funnel from PostHog
    const upgradeIntent = obs.posthog.ok ? obs.posthog.data.events.find(e => e.name === 'Upgrade Intent') : null;
    const stripeCheckout = obs.posthog.ok ? obs.posthog.data.events.find(e => e.name === 'Stripe Checkout') : null;
    const betaCredits = obs.posthog.ok ? obs.posthog.data.events.find(e => e.name === 'Beta Credits erhalten') : null;
    const conversionRate = upgradeIntent?.count && stripeCheckout?.count
        ? Math.round((stripeCheckout.count / upgradeIntent.count) * 100)
        : null;

    return (
        <div>
            {/* Helicone Model Table */}
            {!obs.helicone.ok ? (
                <SourceUnavailable name="Helicone" error={obs.helicone.error} />
            ) : (() => {
                const isDBFallback = obs.helicone.data.by_model.every(m => m.avg_latency === 0);
                return (
                <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden mb-6">
                    <div className="px-5 py-3 bg-[#FAFAF9] border-b border-[#E7E7E5] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-[#37352F]">Kosten nach Modell (7 Tage)</h3>
                            {isDBFallback && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200" title="Helicone Query API nicht erreichbar — Kosten werden aus generation_logs berechnet">DB-Fallback</span>
                            )}
                        </div>
                        <span className="text-xs text-[#73726E]">Gesamt: €{obs.helicone.data.total_cost_eur} · {obs.helicone.data.total_requests} Req</span>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E7E7E5] text-[#73726E]">
                                <th className="px-5 py-3 text-left font-medium">Modell</th>
                                <th className="px-5 py-3 text-right font-medium">Requests</th>
                                <th className="px-5 py-3 text-right font-medium">Kosten</th>
                                <th className="px-5 py-3 text-right font-medium">Ø Latenz</th>
                                <th className="px-5 py-3 text-right font-medium">Tokens</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E7E7E5]">
                            {obs.helicone.data.by_model.map((m, i) => (
                                <tr key={i} className="hover:bg-[#FAFAF9] transition-colors">
                                    <td className="px-5 py-3 font-medium text-[#37352F]">{m.model}</td>
                                    <td className="px-5 py-3 text-right text-[#73726E]">{m.requests}</td>
                                    <td className="px-5 py-3 text-right font-medium text-[#37352F]">€{m.cost_eur.toFixed(4)}</td>
                                    <td className="px-5 py-3 text-right text-[#73726E]">{m.avg_latency > 1000 ? `${(m.avg_latency / 1000).toFixed(1)}s` : `${m.avg_latency}ms`}</td>
                                    <td className="px-5 py-3 text-right text-[#73726E]">{m.tokens.toLocaleString('de-DE')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                );
            })()}

            {/* Per-Feature AI Breakdown (from internal DB) */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden mb-6">
                <div className="px-5 py-3 bg-[#FAFAF9] border-b border-[#E7E7E5] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#37352F]">AI-Calls nach Feature (7 Tage, DB)</h3>
                    <span className="text-xs text-[#73726E]">{obs.internal?.generation.total_calls ?? 0} Calls · {(obs.internal?.generation.total_tokens ?? 0).toLocaleString('de-DE')} Tokens</span>
                </div>
                {(!obs.internal?.generation.by_feature || obs.internal.generation.by_feature.length === 0) ? (
                    <div className="p-6 text-center text-sm text-[#B4B4B0]">
                        Noch keine Feature-Aufschlüsselung. Neue AI-Calls schreiben <code className="bg-[#F5F5F4] px-1 rounded">task_type</code> in generation_logs.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E7E7E5] text-[#73726E]">
                                <th className="px-5 py-3 text-left font-medium">Feature / Service</th>
                                <th className="px-5 py-3 text-right font-medium">AI-Calls</th>
                                <th className="px-5 py-3 text-right font-medium">Tokens</th>
                                <th className="px-5 py-3 text-right font-medium">Ø Tokens/Call</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E7E7E5]">
                            {obs.internal.generation.by_feature.map((f, i) => (
                                <tr key={i} className="hover:bg-[#FAFAF9] transition-colors">
                                    <td className="px-5 py-3 font-medium text-[#37352F] capitalize">{f.feature.replace(/_/g, ' ')}</td>
                                    <td className="px-5 py-3 text-right text-[#73726E]">{f.calls}</td>
                                    <td className="px-5 py-3 text-right text-[#73726E]">{f.tokens.toLocaleString('de-DE')}</td>
                                    <td className="px-5 py-3 text-right text-[#73726E]">{f.calls > 0 ? Math.round(f.tokens / f.calls).toLocaleString('de-DE') : 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Stripe Conversion Funnel */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-[#37352F] mb-4">Monetarisierungs-Funnel (7 Tage)</h3>
                <div className="flex gap-4 flex-wrap items-center">
                    {[{
                        label: 'Upgrade Intent', value: upgradeIntent?.count ?? '–', color: '#3b82f6'
                    }, {
                        label: 'Stripe Checkout', value: stripeCheckout?.count ?? '–', color: '#8b5cf6'
                    }, {
                        label: 'Beta Credits', value: betaCredits?.count ?? '–', color: '#14b8a6'
                    }, {
                        label: 'Conversion', value: conversionRate !== null ? `${conversionRate}%` : '–', color: conversionRate && conversionRate > 10 ? '#22c55e' : '#f59e0b'
                    }].map(item => (
                        <div key={item.label} className="flex-1 min-w-[120px] bg-[#FAFAF9] border border-[#E7E7E5] rounded-xl p-4 text-center">
                            <p className="text-xs text-[#73726E] mb-1">{item.label}</p>
                            <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
                        </div>
                    ))}
                </div>
                {!obs.posthog.ok && <p className="text-xs text-[#B4B4B0] mt-3">PostHog nicht erreichbar — Funnel-Daten fehlen.</p>}
            </div>

            {/* Pipeline Health */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#37352F] mb-4">Pipeline-Gesundheit</h3>
                <div className="flex gap-6 flex-wrap">
                    {[
                        { label: 'Pending', value: obs.internal?.pipeline.pending ?? 0, color: '#73726E' },
                        { label: 'Processing', value: obs.internal?.pipeline.processing ?? 0, color: '#3b82f6' },
                        { label: 'Stale (>10 min)', value: obs.internal?.pipeline.stale ?? 0, color: obs.internal?.pipeline.stale ? '#ef4444' : '#22c55e' },
                        { label: 'Ready', value: obs.internal?.pipeline.ready ?? 0, color: '#22c55e' },
                    ].map(item => (
                        <div key={item.label} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-sm text-[#73726E]">{item.label}:</span>
                            <span className="text-sm font-semibold text-[#37352F]">{item.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 4: WACHSTUM & FEEDBACK
// ════════════════════════════════════════════════════════════════════════════

function TabGrowth({ obs }: { obs: ObsData | null }) {
    const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);

    if (!obs) return null;
    const goals = obs.internal?.onboarding_goals ?? {};
    const totalGoalUsers = Object.values(goals).reduce((a, b) => a + b, 0);
    const maxGoal = Math.max(...Object.values(goals), 1);

    return (
        <div>
            {/* Onboarding Goals Distribution */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-[#37352F] mb-4">Onboarding-Ziele (alle User)</h3>
                {Object.keys(goals).length === 0 ? (
                    <p className="text-sm text-[#B4B4B0]">Noch keine Onboarding-Daten.</p>
                ) : (
                    <div className="space-y-3">
                        {Object.entries(goals)
                            .sort(([, a], [, b]) => b - a)
                            .map(([key, count]) => {
                                const pct = totalGoalUsers > 0 ? Math.round((count / obs.internal.total_users) * 100) : 0;
                                return (
                                    <div key={key} className="flex items-center gap-3">
                                        <span className="text-sm text-[#73726E] w-48 truncate">{GOAL_LABELS[key] ?? key}</span>
                                        <div className="flex-1 h-5 bg-[#F5F5F4] rounded overflow-hidden">
                                            <div className="h-full bg-[#012e7a]/60 rounded transition-all" style={{ width: `${(count / maxGoal) * 100}%` }} />
                                        </div>
                                        <span className="text-xs text-[#73726E] w-16 text-right">{pct}% ({count})</span>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>

            {/* Credit & Beta Balance */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white border border-[#E7E7E5] rounded-xl p-5">
                    <p className="text-xs text-[#73726E] mb-1">Credits verbraucht (7d)</p>
                    <p className="text-2xl font-bold text-[#37352F]">{obs.internal?.credits.debits ?? 0}</p>
                </div>
                <div className="bg-white border border-[#E7E7E5] rounded-xl p-5">
                    <p className="text-xs text-[#73726E] mb-1">Credits aufgeladen (7d)</p>
                    <p className="text-2xl font-bold text-[#37352F]">{obs.internal?.credits.refills ?? 0}</p>
                </div>
                <div className="bg-white border border-[#E7E7E5] rounded-xl p-5">
                    <p className="text-xs text-[#73726E] mb-1">Beta-Grants (7d) 🎁</p>
                    <p className="text-2xl font-bold text-teal-600">{obs.internal?.credits.beta_grants ?? 0}</p>
                </div>
            </div>



            {/* Feedback Inbox — expandable cards */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-[#FAFAF9] border-b border-[#E7E7E5] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-[#012e7a]" />
                        Feedback Inbox
                    </h3>
                    <span className="text-xs text-[#73726E]">{obs.internal?.feedback.length ?? 0} Einträge</span>
                </div>
                {(!obs.internal?.feedback || obs.internal.feedback.length === 0) ? (
                    <div className="p-8 text-center text-[#B4B4B0] text-sm">Noch kein Feedback erhalten.</div>
                ) : (
                    <div className="divide-y divide-[#E7E7E5]">
                        {obs.internal.feedback.map(fb => {
                            const isExpanded = expandedFeedback === fb.id;
                            return (
                                <div
                                    key={fb.id}
                                    className="px-5 py-4 cursor-pointer hover:bg-[#FAFAF9] transition-colors"
                                    onClick={() => setExpandedFeedback(isExpanded ? null : fb.id)}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-[#37352F]">{fb.name || 'Anonym'}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-[#B4B4B0]">{formatRelative(fb.created_at)}</span>
                                            <ChevronRight className={`w-3.5 h-3.5 text-[#B4B4B0] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                        </div>
                                    </div>
                                    <p className={`text-sm text-[#73726E] ${isExpanded ? '' : 'line-clamp-2'}`}>{fb.feedback}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 5: USER & WARTELISTE (existing functionality, extracted)
// ════════════════════════════════════════════════════════════════════════════

function TabUsers({
    users, total, loading, loadUsers,
    leads, leadsTotal, leadsConfirmed, leadsLoading, loadWaitlist,
    actionLoading,
    handleDelete, handleDeleteLead, handleResetOnboarding,
}: {
    users: AdminUser[]; total: number; loading: boolean; loadUsers: () => void;
    leads: WaitlistLead[]; leadsTotal: number; leadsConfirmed: number; leadsLoading: boolean; loadWaitlist: () => void;
    actionLoading: string | null;
    handleDelete: (id: string, email: string) => void;
    handleDeleteLead: (id: string, email: string) => void;
    handleResetOnboarding: (id: string) => void;
}) {
    return (
        <div>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                <KPICard icon={Users} label="Gesamt" value={total} color="#37352F" />
                <KPICard icon={CheckCircle} label="Onboarding fertig" value={users.filter(u => u.onboarding_completed).length} color="#22c55e" />
                <KPICard icon={Mail} label="E-Mail bestätigt" value={users.filter(u => u.email_confirmed_at).length} color="#f59e0b" />
                <KPICard icon={Briefcase} label="Aktive Jobs" value={users.reduce((s, u) => s + u.active_jobs, 0)} color="#3b82f6" />
                <KPICard icon={Inbox} label="Warteliste" value={leadsTotal} sub={leadsConfirmed > 0 ? `${leadsConfirmed} bestätigt` : undefined} color="#14b8a6" />
            </div>

            {/* User Table */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden mb-6">
                <div className="px-5 py-3 bg-[#FAFAF9] border-b border-[#E7E7E5] flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#37352F]">Registrierte User</h2>
                    <button onClick={loadUsers} disabled={loading} className="text-xs text-[#73726E] hover:text-[#012e7a] transition-colors flex items-center gap-1">
                        <RotateCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Aktualisieren
                    </button>
                </div>
                {loading ? (
                    <div className="p-12 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#73726E]" /></div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E7E7E5] text-[#73726E]">
                                <th className="px-5 py-3 text-left font-medium">User</th>
                                <th className="px-5 py-3 text-left font-medium">Status</th>
                                <th className="px-5 py-3 text-center font-medium">Jobs</th>
                                <th className="px-5 py-3 text-center font-medium">Bewerbungen</th>
                                <th className="px-5 py-3 text-left font-medium">Registriert</th>
                                <th className="px-5 py-3 text-left font-medium">Letzter Login</th>
                                <th className="px-5 py-3 text-right font-medium">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E7E7E5]">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-[#FAFAF9] transition-colors">
                                    <td className="px-5 py-3">
                                        <p className="font-medium text-[#37352F]">{u.full_name || 'kein Name'}</p>
                                        <p className="text-xs text-[#73726E]">{u.email}</p>
                                        {u.onboarding_goals?.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {u.onboarding_goals.map(g => (
                                                    <span key={g} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#012e7a]/8 text-[#012e7a] border border-[#012e7a]/15">
                                                        {GOAL_LABELS[g] ?? g}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2">
                                            {u.onboarding_completed ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"><CheckCircle className="w-3 h-3" />Aktiv</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" />Onboarding</span>
                                            )}
                                            {!u.email_confirmed_at && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200"><XCircle className="w-3 h-3" />Unbestätigt</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {u.active_jobs > 0 ? <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">{u.active_jobs}</span> : <span className="text-xs text-[#B4B4B0]">0</span>}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {u.applications > 0 ? <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">{u.applications}</span> : <span className="text-xs text-[#B4B4B0]">0</span>}
                                    </td>
                                    <td className="px-5 py-3 text-[#73726E] text-xs">{formatDate(u.created_at)}</td>
                                    <td className="px-5 py-3 text-[#73726E] text-xs">{u.last_sign_in_at ? formatRelative(u.last_sign_in_at) : '—'}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {u.onboarding_completed && (
                                                <button onClick={() => handleResetOnboarding(u.id)} disabled={actionLoading === u.id} className="p-1.5 text-[#73726E] hover:text-amber-600 hover:bg-amber-50 rounded-md transition-all disabled:opacity-40" title="Onboarding zurücksetzen">
                                                    {actionLoading === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                                </button>
                                            )}
                                            {u.email !== 'galettoyannik7@gmail.com' && (
                                                <button onClick={() => handleDelete(u.id, u.email)} disabled={actionLoading === u.id} className="p-1.5 text-[#73726E] hover:text-red-600 hover:bg-red-50 rounded-md transition-all disabled:opacity-40" title="User löschen">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Waitlist Table */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-[#FAFAF9] border-b border-[#E7E7E5] flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#37352F] flex items-center gap-2"><Inbox className="w-4 h-4 text-teal-500" />Warteliste</h2>
                    <button onClick={loadWaitlist} disabled={leadsLoading} className="text-xs text-[#73726E] hover:text-[#012e7a] transition-colors flex items-center gap-1">
                        <RotateCcw className={`w-3 h-3 ${leadsLoading ? 'animate-spin' : ''}`} /> Aktualisieren
                    </button>
                </div>
                {leadsLoading ? (
                    <div className="p-12 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#73726E]" /></div>
                ) : leads.length === 0 ? (
                    <div className="p-8 text-center text-[#B4B4B0] text-sm">Noch keine Warteliste-Einträge.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E7E7E5] text-[#73726E]">
                                <th className="px-5 py-3 text-left font-medium">E-Mail</th>
                                <th className="px-5 py-3 text-center font-medium">Plan-Interesse</th>
                                <th className="px-5 py-3 text-center font-medium">Status</th>
                                <th className="px-5 py-3 text-center font-medium">Sprache</th>
                                <th className="px-5 py-3 text-left font-medium">Quelle</th>
                                <th className="px-5 py-3 text-left font-medium">Eingetragen</th>
                                <th className="px-5 py-3 text-right font-medium">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E7E7E5]">
                            {leads.map(lead => (
                                <tr key={lead.id} className="hover:bg-[#FAFAF9] transition-colors">
                                    <td className="px-5 py-3 font-medium text-[#37352F]">{lead.email}</td>
                                    <td className="px-5 py-3 text-center">
                                        {lead.plan_preference ? (
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                lead.plan_preference === 'durchstarter'
                                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                                    : lead.plan_preference === 'starter'
                                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                    : lead.plan_preference === 'quarterly'
                                                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {lead.plan_preference === 'quarterly' ? 'Quartalspaket' : lead.plan_preference}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-[#B4B4B0]">—</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {lead.confirmed_at ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"><CheckCircle className="w-3 h-3" />Bestätigt</span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" />Offen</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{lead.locale?.toUpperCase() || 'DE'}</span></td>
                                    <td className="px-5 py-3 text-[#73726E] text-xs capitalize">{lead.source}</td>
                                    <td className="px-5 py-3 text-[#73726E] text-xs">{formatDate(lead.created_at)}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center justify-end">
                                            <button onClick={() => handleDeleteLead(lead.id, lead.email)} disabled={actionLoading === lead.id} className="p-1.5 text-[#73726E] hover:text-red-600 hover:bg-red-50 rounded-md transition-all disabled:opacity-40" title="Lead löschen">
                                                {actionLoading === lead.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ── Shared ──────────────────────────────────────────────────────────────────

function SourceUnavailable({ name, error }: { name: string; error: string }) {
    return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-amber-700">{name} nicht erreichbar</p>
            <p className="text-xs text-amber-500 mt-1">{error}</p>
        </div>
    );
}
