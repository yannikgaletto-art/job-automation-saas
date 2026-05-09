"use client";

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    BriefcaseBusiness,
    Building2,
    CheckCircle2,
    Compass,
    ExternalLink,
    FileText,
    Loader2,
    Radar,
    Save,
    Search,
    ShieldCheck,
} from 'lucide-react';
import { buildInitiativInsight } from '@/lib/initiativ/insight';

type StrengthsForm = {
    human_aspects: string;
    professional_results: string;
    peer_perspective: string;
};

type LifeStrengthsPayload = {
    human_aspects?: string[];
    professional_results?: string[];
    peer_perspective?: string[];
};

type CvResultSuggestion = {
    id: string;
    text: string;
    source: string;
};

type DiscoveryForm = {
    branche: string;
    region: string;
    focus: string;
};

type DiscoverySignal = {
    id: string;
    triggerType: string;
    companyName: string;
    companyUrl: string | null;
    branche: string | null;
    region: string | null;
    sourceUrl: string;
    sourceName: string;
    triggerDate: string;
    summary: string;
    confidence: 'green' | 'yellow' | 'gray';
    matchReasons: Array<'branche' | 'region' | 'focus'>;
};

const EMPTY_FORM: StrengthsForm = {
    human_aspects: '',
    professional_results: '',
    peer_perspective: '',
};

const EMPTY_DISCOVERY_FORM: DiscoveryForm = {
    branche: '',
    region: '',
    focus: '',
};

const FIELD_KEYS = ['human_aspects', 'professional_results', 'peer_perspective'] as const;
const STEP_ICONS = [Radar, Building2, FileText] as const;
const TOUR_ICONS = [Compass, ShieldCheck, Radar] as const;
const LOCALE_TAG: Record<string, string> = {
    de: 'de-DE',
    en: 'en-US',
    es: 'es-ES',
};

function listToText(value: unknown): string {
    if (!Array.isArray(value)) return '';
    return value.filter((entry): entry is string => typeof entry === 'string').join('\n');
}

function countLines(value: string): number {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

function mapErrorToKey(error: string | null) {
    if (!error) return null;
    if (error.includes('empty')) return 'errors_empty';
    if (error.includes('too_long')) return 'errors_too_long';
    if (error.includes('schema_missing')) return 'errors_schema_missing';
    if (error.includes('verify_failed')) return 'errors_verify_failed';
    if (error.includes('load_failed')) return 'errors_load_failed';
    return 'errors_save_failed';
}

export function InitiativClientPage() {
    const t = useTranslations('dashboard.initiativ');
    const locale = useLocale();
    const [showTour, setShowTour] = useState(true);
    const [activeStep, setActiveStep] = useState<'strengths' | 'discovery' | 'insight'>('strengths');
    const [tourStep, setTourStep] = useState(0);
    const [form, setForm] = useState<StrengthsForm>(EMPTY_FORM);
    const [discoveryForm, setDiscoveryForm] = useState<DiscoveryForm>(EMPTY_DISCOVERY_FORM);
    const [discoveryLoading, setDiscoveryLoading] = useState(false);
    const [discoverySearched, setDiscoverySearched] = useState(false);
    const [discoverySchemaReady, setDiscoverySchemaReady] = useState(true);
    const [discoverySignals, setDiscoverySignals] = useState<DiscoverySignal[]>([]);
    const [discoveryError, setDiscoveryError] = useState(false);
    const [regionFallback, setRegionFallback] = useState(false);
    const [appliedRegion, setAppliedRegion] = useState('');
    const [regionStrict, setRegionStrict] = useState(false);
    const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [schemaReady, setSchemaReady] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cvSuggestions, setCvSuggestions] = useState<CvResultSuggestion[]>([]);
    const [cvSuggestionsLoading, setCvSuggestionsLoading] = useState(true);
    const [hasCvProfile, setHasCvProfile] = useState(true);

    const filledCount = useMemo(
        () => FIELD_KEYS.reduce((total, key) => total + countLines(form[key]), 0),
        [form]
    );
    const canSave = filledCount > 0 && !loading && !saving;
    const canOpenDiscovery = saved && filledCount > 0 && schemaReady;
    const canRunDiscovery = canOpenDiscovery && !discoveryLoading && Boolean(
        discoveryForm.branche.trim() || discoveryForm.region.trim() || discoveryForm.focus.trim()
    );
    const displayedSignals = useMemo(() => {
        if (!regionStrict) return discoverySignals;
        return discoverySignals.filter((signal) => signal.matchReasons.includes('region'));
    }, [discoverySignals, regionStrict]);
    const selectedSignal = useMemo(
        () => discoverySignals.find((signal) => signal.id === selectedSignalId) ?? null,
        [discoverySignals, selectedSignalId]
    );
    const selectedInsight = useMemo(() => {
        if (!selectedSignal) return null;

        return buildInitiativInsight({
            signal: selectedSignal,
            professionalResults: form.professional_results,
            peerPerspective: form.peer_perspective,
            focus: discoveryForm.focus,
        });
    }, [discoveryForm.focus, form.peer_perspective, form.professional_results, selectedSignal]);
    const currentTourIcon = TOUR_ICONS[tourStep];

    useEffect(() => {
        let cancelled = false;

        async function loadLifeStrengths() {
            try {
                const [response, suggestionsResponse] = await Promise.all([
                    fetch('/api/initiativ/life-strengths'),
                    fetch('/api/initiativ/cv-suggestions'),
                ]);
                const data = await response.json();
                const suggestionsData = await suggestionsResponse.json();
                if (cancelled) return;

                if (!response.ok || !data.success) {
                    setError(data.error ?? 'load_failed');
                    return;
                }

                setSchemaReady(data.schemaReady !== false);
                const strengths = data.life_strengths as LifeStrengthsPayload | null;
                if (strengths) {
                    setForm({
                        human_aspects: listToText(strengths.human_aspects),
                        professional_results: listToText(strengths.professional_results),
                        peer_perspective: listToText(strengths.peer_perspective),
                    });
                    setSaved(true);
                    setShowTour(false);
                }

                if (suggestionsResponse.ok && suggestionsData.success) {
                    setHasCvProfile(Boolean(suggestionsData.hasCv));
                    setCvSuggestions(Array.isArray(suggestionsData.suggestions) ? suggestionsData.suggestions : []);
                } else {
                    setHasCvProfile(false);
                }
            } catch {
                if (!cancelled) setError('load_failed');
            } finally {
                if (!cancelled) setLoading(false);
                if (!cancelled) setCvSuggestionsLoading(false);
            }
        }

        loadLifeStrengths();
        return () => {
            cancelled = true;
        };
    }, []);

    const updateField = (key: keyof StrengthsForm, value: string) => {
        setForm((current) => ({ ...current, [key]: value }));
        setSaved(false);
        setActiveStep('strengths');
        setSelectedSignalId(null);
        setError(null);
    };

    const addProfessionalResult = (text: string) => {
        const currentLines = form.professional_results
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        const alreadyExists = currentLines.some((line) => line.toLocaleLowerCase('de-DE') === text.toLocaleLowerCase('de-DE'));
        if (alreadyExists) return;
        updateField('professional_results', [...currentLines, text].join('\n'));
    };

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            const response = await fetch('/api/initiativ/life-strengths', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                setError(data.error ?? 'save_failed');
                return;
            }

            setSaved(true);
        } catch {
            setError('save_failed');
        } finally {
            setSaving(false);
        }
    };

    const updateDiscoveryField = (key: keyof DiscoveryForm, value: string) => {
        setDiscoveryForm((current) => ({ ...current, [key]: value }));
        setSelectedSignalId(null);
        setDiscoveryError(false);
    };

    const openDiscovery = () => {
        if (!canOpenDiscovery) return;
        setActiveStep('discovery');
    };

    const runDiscoveryWith = async (formOverride: Partial<DiscoveryForm> = {}) => {
        if (!canOpenDiscovery || discoveryLoading) return;
        const effectiveForm: DiscoveryForm = { ...discoveryForm, ...formOverride };
        const branche = effectiveForm.branche.trim();
        const region = effectiveForm.region.trim();
        const focus = effectiveForm.focus.trim();
        if (!branche && !region && !focus) return;

        setDiscoveryLoading(true);
        setDiscoverySearched(true);
        setDiscoveryError(false);
        setRegionStrict(false);
        setAppliedRegion(region);

        try {
            const params = new URLSearchParams();
            if (branche) params.set('branche', branche);
            if (region) params.set('region', region);
            if (focus) params.set('focus', focus);

            const response = await fetch(`/api/initiativ/discovery?${params.toString()}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                setDiscoveryError(true);
                return;
            }

            const signals = Array.isArray(data.signals) ? data.signals : [];
            setDiscoverySchemaReady(data.schemaReady !== false);
            setDiscoverySignals(signals);
            setRegionFallback(Boolean(data.regionFallback));
            setSelectedSignalId(null);
        } catch {
            setDiscoveryError(true);
        } finally {
            setDiscoveryLoading(false);
        }
    };

    const runDiscovery = () => {
        if (!canRunDiscovery) return;
        runDiscoveryWith();
    };

    const expandRegionToDach = () => {
        setDiscoveryForm((current) => ({ ...current, region: 'DACH' }));
        runDiscoveryWith({ region: 'DACH' });
    };

    const openInsight = (signalId: string) => {
        setSelectedSignalId(signalId);
        setActiveStep('insight');
    };

    const formatDate = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString(LOCALE_TAG[locale] ?? 'de-DE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    };

    const errorKey = mapErrorToKey(error);
    const CurrentTourIcon = currentTourIcon;

    return (
        <div className="mx-auto max-w-6xl space-y-8 pb-12">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C8D4EA] bg-[#F4F7FC] px-3 py-1 text-xs font-semibold text-[#012e7a]">
                        <Compass className="h-3.5 w-3.5" />
                        {t('eyebrow')}
                    </div>
                    <h1 className="text-3xl font-semibold tracking-normal text-[#37352F]">
                        {t('title')}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#73726E]">
                        {t('subtitle')}
                    </p>
                </div>
                <div className="rounded-lg border border-[#E7E7E5] bg-white px-4 py-3 text-sm text-[#73726E] shadow-sm">
                    <span className="font-semibold text-[#37352F]">{t('status_label')}</span>{' '}
                    {schemaReady ? t('status_value') : t('status_schema_missing')}
                </div>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
                {STEP_ICONS.map((Icon, index) => {
                    const key = index === 0 ? 'strengths' : index === 1 ? 'signals' : 'brief';
                    const active =
                        (index === 0 && activeStep === 'strengths')
                        || (index === 1 && activeStep === 'discovery')
                        || (index === 2 && activeStep === 'insight');
                    return (
                        <article
                            key={key}
                            className={`rounded-lg border bg-white p-5 shadow-sm ${active ? 'border-[#012e7a]' : 'border-[#E7E7E5]'}`}
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${active ? 'bg-[#EAF0FB] text-[#012e7a]' : 'bg-[#F4F7FC] text-[#73726E]'}`}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <span className="text-xs font-semibold text-[#A8A29E]">
                                    {t('step_label', { number: index + 1 })}
                                </span>
                            </div>
                            <h2 className="text-base font-semibold text-[#37352F]">
                                {t(`${key}_title`)}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                {t(`${key}_body`)}
                            </p>
                        </article>
                    );
                })}
            </section>

            {showTour ? (
                <section className="rounded-lg border border-[#E7E7E5] bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#EAF0FB] text-[#012e7a]">
                                <CurrentTourIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="mb-2 flex gap-1.5">
                                    {[0, 1, 2].map((dot) => (
                                        <span
                                            key={dot}
                                            className={`h-2 w-8 rounded-full ${dot === tourStep ? 'bg-[#012e7a]' : 'bg-[#E7E7E5]'}`}
                                        />
                                    ))}
                                </div>
                                <h2 className="text-xl font-semibold text-[#37352F]">
                                    {t(`tour_${tourStep + 1}_title`)}
                                </h2>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#73726E]">
                                    {t(`tour_${tourStep + 1}_body`)}
                                </p>
                            </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <button
                                type="button"
                                onClick={() => setShowTour(false)}
                                className="rounded-lg border border-[#E7E7E5] bg-white px-4 py-2 text-sm font-semibold text-[#73726E] transition-colors hover:bg-[#F7F7F5] hover:text-[#37352F]"
                            >
                                {t('tour_skip')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (tourStep >= 2) {
                                        setShowTour(false);
                                    } else {
                                        setTourStep((step) => step + 1);
                                    }
                                }}
                                className="inline-flex items-center gap-2 rounded-lg bg-[#012e7a] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#001f52]"
                            >
                                {tourStep >= 2 ? t('tour_start') : t('tour_next')}
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </section>
            ) : activeStep === 'strengths' ? (
                <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-lg border border-[#E7E7E5] bg-white p-6 shadow-sm">
                        <div className="mb-5">
                            <h2 className="text-xl font-semibold text-[#37352F]">
                                {t('step1_title')}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                {t('step1_body')}
                            </p>
                        </div>

                        <div className="space-y-5">
                            {FIELD_KEYS.map((key) => (
                                <div key={key}>
                                    <label htmlFor={key} className="block text-sm font-semibold text-[#37352F]">
                                        {t(`${key}_label`)}
                                    </label>
                                    <p className="mt-1 text-xs leading-5 text-[#8E8D89]">
                                        {t(`${key}_hint`)}
                                    </p>
                                    <textarea
                                        id={key}
                                        value={form[key]}
                                        maxLength={900}
                                        rows={4}
                                        onChange={(event) => updateField(key, event.target.value)}
                                        placeholder={t(`${key}_placeholder`)}
                                        className="mt-2 w-full resize-none rounded-lg border border-[#E7E7E5] bg-white px-3 py-2 text-sm leading-6 text-[#37352F] placeholder-[#A8A29E] outline-none transition-all focus:border-[#012e7a] focus:ring-2 focus:ring-[#012e7a]/20"
                                    />
                                    {key === 'professional_results' && (
                                        <div className="mt-3 rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] p-3">
                                            <div className="flex items-center gap-2 text-xs font-semibold text-[#37352F]">
                                                <BriefcaseBusiness className="h-3.5 w-3.5 text-[#012e7a]" />
                                                {t('cv_suggestions_title')}
                                            </div>
                                            {cvSuggestionsLoading ? (
                                                <p className="mt-2 text-xs leading-5 text-[#73726E]">
                                                    {t('cv_suggestions_loading')}
                                                </p>
                                            ) : cvSuggestions.length > 0 ? (
                                                <div className="mt-3 space-y-2">
                                                    {cvSuggestions.map((suggestion) => (
                                                        <button
                                                            key={suggestion.id}
                                                            type="button"
                                                            onClick={() => addProfessionalResult(suggestion.text)}
                                                            className="block w-full rounded-md border border-[#E7E7E5] bg-white px-3 py-2 text-left transition-colors hover:border-[#012e7a] hover:bg-[#F4F7FC]"
                                                        >
                                                            <span className="block text-xs font-semibold text-[#37352F]">
                                                                {suggestion.text}
                                                            </span>
                                                            <span className="mt-1 block text-[11px] text-[#8E8D89]">
                                                                {suggestion.source}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="mt-2 text-xs leading-5 text-[#73726E]">
                                                    {hasCvProfile ? t('cv_suggestions_empty') : t('cv_suggestions_no_cv')}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {errorKey && (
                            <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{t(errorKey)}</span>
                            </div>
                        )}

                        <div className="mt-6 flex flex-col gap-3 border-t border-[#E7E7E5] pt-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs text-[#73726E]">
                                {t('step1_counter', { count: filledCount })}
                            </div>
                            <button
                                type="button"
                                disabled={!canSave}
                                onClick={handleSave}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#012e7a] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#001f52] disabled:cursor-not-allowed disabled:bg-[#C8D4EA]"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {saving ? t('save_saving') : t('save_button')}
                            </button>
                        </div>
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-lg border border-[#E7E7E5] bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[#37352F]">
                                {saved ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                    <ShieldCheck className="h-4 w-4 text-[#012e7a]" />
                                )}
                                {saved ? t('saved_title') : t('privacy_title')}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                {saved ? t('saved_body') : t('privacy_body')}
                            </p>
                        </div>

                        <div className="rounded-lg border border-dashed border-[#B9C7E3] bg-[#F8FAFE] p-5">
                            <h2 className="text-base font-semibold text-[#37352F]">
                                {t('next_title')}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                {t('next_body_step1')}
                            </p>
                            <button
                                type="button"
                                disabled={!canOpenDiscovery}
                                onClick={openDiscovery}
                                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#C8D4EA] bg-white px-4 py-2 text-sm font-semibold text-[#012e7a] transition-colors hover:bg-[#F4F7FC] disabled:cursor-not-allowed disabled:text-[#73726E] disabled:hover:bg-white"
                            >
                                <Building2 className="h-4 w-4" />
                                {canOpenDiscovery ? t('discovery_open') : t('discovery_locked')}
                            </button>
                        </div>
                    </aside>
                </section>
            ) : activeStep === 'discovery' ? (
                <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-6">
                        <div className="rounded-lg border border-[#E7E7E5] bg-white p-6 shadow-sm">
                            <button
                                type="button"
                                onClick={() => setActiveStep('strengths')}
                                className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#73726E] transition-colors hover:text-[#012e7a]"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                {t('discovery_back')}
                            </button>

                            <div className="mb-6">
                                <h2 className="text-xl font-semibold text-[#37352F]">
                                    {t('step2_title')}
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                    {t('step2_body')}
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-sm font-semibold text-[#37352F]">
                                        {t('discovery_branche_label')}
                                    </span>
                                    <input
                                        type="text"
                                        value={discoveryForm.branche}
                                        onChange={(event) => updateDiscoveryField('branche', event.target.value)}
                                        placeholder={t('discovery_branche_placeholder')}
                                        className="mt-2 w-full rounded-lg border border-[#E7E7E5] bg-white px-3 py-2 text-sm text-[#37352F] placeholder-[#A8A29E] outline-none transition-all focus:border-[#012e7a] focus:ring-2 focus:ring-[#012e7a]/20"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-semibold text-[#37352F]">
                                        {t('discovery_region_label')}
                                    </span>
                                    <input
                                        type="text"
                                        value={discoveryForm.region}
                                        onChange={(event) => updateDiscoveryField('region', event.target.value)}
                                        placeholder={t('discovery_region_placeholder')}
                                        className="mt-2 w-full rounded-lg border border-[#E7E7E5] bg-white px-3 py-2 text-sm text-[#37352F] placeholder-[#A8A29E] outline-none transition-all focus:border-[#012e7a] focus:ring-2 focus:ring-[#012e7a]/20"
                                    />
                                </label>
                                <label className="block md:col-span-2">
                                    <span className="text-sm font-semibold text-[#37352F]">
                                        {t('discovery_focus_label')}
                                    </span>
                                    <textarea
                                        value={discoveryForm.focus}
                                        onChange={(event) => updateDiscoveryField('focus', event.target.value)}
                                        placeholder={t('discovery_focus_placeholder')}
                                        rows={3}
                                        maxLength={180}
                                        className="mt-2 w-full resize-none rounded-lg border border-[#E7E7E5] bg-white px-3 py-2 text-sm leading-6 text-[#37352F] placeholder-[#A8A29E] outline-none transition-all focus:border-[#012e7a] focus:ring-2 focus:ring-[#012e7a]/20"
                                    />
                                </label>
                            </div>

                            {discoveryError && (
                                <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{t('discovery_error')}</span>
                                </div>
                            )}

                            {!discoverySchemaReady && (
                                <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{t('discovery_schema_missing')}</span>
                                </div>
                            )}

                            <div className="mt-6 flex flex-col gap-3 border-t border-[#E7E7E5] pt-5 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs leading-5 text-[#73726E]">
                                    {t('discovery_privacy_note')}
                                </p>
                                <button
                                    type="button"
                                    disabled={!canRunDiscovery}
                                    onClick={runDiscovery}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#012e7a] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#001f52] disabled:cursor-not-allowed disabled:bg-[#C8D4EA]"
                                >
                                    {discoveryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    {discoveryLoading ? t('discovery_searching') : t('discovery_search')}
                                </button>
                            </div>
                        </div>

                        <div className="rounded-lg border border-[#E7E7E5] bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-[#37352F]">
                                        {t('discovery_results_title')}
                                    </h2>
                                    <p className="mt-1 text-sm leading-6 text-[#73726E]">
                                        {t('discovery_results_body')}
                                    </p>
                                </div>
                                <span className="shrink-0 rounded-full border border-[#E7E7E5] px-3 py-1 text-xs font-semibold text-[#73726E]">
                                    {t('discovery_results_count', { count: displayedSignals.length })}
                                </span>
                            </div>

                            {regionFallback && !regionStrict && discoverySignals.length > 0 && appliedRegion && (
                                <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[#F1D9A6] bg-[#FFFBEF] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm leading-6 text-[#7A5A12]">
                                        {t('discovery_region_fallback_banner', { region: appliedRegion })}
                                    </p>
                                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                                        <button
                                            type="button"
                                            onClick={() => setRegionStrict(true)}
                                            className="inline-flex items-center justify-center rounded-lg border border-[#E1C68C] bg-white px-3 py-1.5 text-xs font-semibold text-[#7A5A12] transition-colors hover:bg-[#FFF6E0]"
                                        >
                                            {t('discovery_region_strict', { region: appliedRegion })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={expandRegionToDach}
                                            className="inline-flex items-center justify-center rounded-lg bg-[#012e7a] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#001f52]"
                                        >
                                            {t('discovery_region_expand')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {regionStrict && appliedRegion && (
                                <div className="mb-4 flex flex-col gap-2 rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs leading-5 text-[#73726E]">
                                        {t('discovery_region_strict_active', { region: appliedRegion, count: displayedSignals.length })}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setRegionStrict(false)}
                                        className="text-xs font-semibold text-[#012e7a] transition-colors hover:text-[#001f52]"
                                    >
                                        {t('discovery_region_strict_undo')}
                                    </button>
                                </div>
                            )}

                            {discoveryLoading ? (
                                <div className="rounded-lg border border-dashed border-[#C8D4EA] bg-[#F8FAFE] p-5 text-sm text-[#73726E]">
                                    {t('discovery_loading_body')}
                                </div>
                            ) : !discoverySearched ? (
                                <div className="rounded-lg border border-dashed border-[#C8D4EA] bg-[#F8FAFE] p-5 text-sm text-[#73726E]">
                                    {t('discovery_initial_empty')}
                                </div>
                            ) : displayedSignals.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-[#C8D4EA] bg-[#F8FAFE] p-5 text-sm leading-6 text-[#73726E]">
                                    {regionStrict
                                        ? t('discovery_region_strict_empty', { region: appliedRegion })
                                        : t('discovery_empty')}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {displayedSignals.map((signal) => (
                                        <article
                                            key={signal.id}
                                            className={`rounded-lg border bg-[#FAFAF9] p-4 ${
                                                selectedSignalId === signal.id ? 'border-[#012e7a]' : 'border-[#E7E7E5]'
                                            }`}
                                        >
                                            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="text-base font-semibold text-[#37352F]">
                                                            {signal.companyName}
                                                        </h3>
                                                        <span className="rounded-full bg-[#EAF0FB] px-2 py-0.5 text-[11px] font-semibold text-[#012e7a]">
                                                            {t(`trigger_${signal.triggerType}`)}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-xs text-[#8E8D89]">
                                                        {[signal.branche, signal.region].filter(Boolean).join(' · ') || t('discovery_no_classification')}
                                                    </p>
                                                </div>
                                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                                    signal.confidence === 'green'
                                                        ? 'bg-green-50 text-green-700'
                                                        : signal.confidence === 'yellow'
                                                            ? 'bg-amber-50 text-amber-700'
                                                            : 'bg-[#F1F1EF] text-[#73726E]'
                                                }`}>
                                                    {t(`confidence_${signal.confidence}`)}
                                                </span>
                                            </div>

                                            <p className="text-sm leading-6 text-[#37352F]">
                                                {signal.summary || t('discovery_no_summary')}
                                            </p>

                                            <div className="mt-4 flex flex-col gap-3 border-t border-[#E7E7E5] pt-3 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-xs text-[#8E8D89]">
                                                    {signal.sourceName} · {formatDate(signal.triggerDate)}
                                                </p>
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                    <a
                                                        href={signal.sourceUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#C8D4EA] bg-white px-3 py-2 text-sm font-semibold text-[#012e7a] transition-colors hover:bg-[#F4F7FC]"
                                                    >
                                                        {t('source_open')}
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() => openInsight(signal.id)}
                                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#012e7a] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#001f52]"
                                                    >
                                                        {t('insight_open')}
                                                        <ArrowRight className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-lg border border-[#E7E7E5] bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[#37352F]">
                                <ShieldCheck className="h-4 w-4 text-[#012e7a]" />
                                {t('discovery_rules_title')}
                            </div>
                            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#73726E]">
                                <li>{t('discovery_rule_1')}</li>
                                <li>{t('discovery_rule_2')}</li>
                                <li>{t('discovery_rule_3')}</li>
                            </ul>
                        </div>

                        <div className="rounded-lg border border-dashed border-[#B9C7E3] bg-[#F8FAFE] p-5">
                            <h2 className="text-base font-semibold text-[#37352F]">
                                {t('next_title')}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                {t('next_body_step2')}
                            </p>
                            <button
                                type="button"
                                disabled={!selectedSignal}
                                onClick={() => selectedSignal && openInsight(selectedSignal.id)}
                                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#C8D4EA] bg-white px-4 py-2 text-sm font-semibold text-[#012e7a] transition-colors hover:bg-[#F4F7FC] disabled:cursor-not-allowed disabled:text-[#73726E] disabled:hover:bg-white"
                            >
                                <FileText className="h-4 w-4" />
                                {selectedSignal ? t('insight_selected') : t('brief_locked')}
                            </button>
                        </div>
                    </aside>
                </section>
            ) : selectedInsight ? (
                <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-lg border border-[#E7E7E5] bg-white p-6 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setActiveStep('discovery')}
                            className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#73726E] transition-colors hover:text-[#012e7a]"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            {t('insight_back')}
                        </button>

                        <div className="mb-6">
                            <h2 className="text-xl font-semibold text-[#37352F]">
                                {t('insight_title')}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                {t('insight_body')}
                            </p>
                        </div>

                        <div className="grid gap-4">
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] lg:items-stretch">
                                <div className="rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-normal text-[#8E8D89]">
                                        {t('insight_strength_label')}
                                    </p>
                                    <p className="mt-2 text-sm font-semibold leading-6 text-[#37352F]">
                                        {selectedInsight.strengthText ?? t('insight_strength_missing')}
                                    </p>
                                    <p className="mt-2 text-xs leading-5 text-[#73726E]">
                                        {selectedInsight.hasConcreteStrength
                                            ? t(`insight_strength_source_${selectedInsight.strengthSource}`)
                                            : t('insight_strength_needs_concrete')}
                                    </p>
                                </div>

                                <div className="flex items-center justify-center" aria-hidden="true">
                                    <svg
                                        className="hidden h-full min-h-32 w-16 lg:block"
                                        viewBox="0 0 64 144"
                                        preserveAspectRatio="none"
                                    >
                                        <path
                                            d="M8 72 C20 72 26 42 32 42 C38 42 44 72 56 72"
                                            fill="none"
                                            stroke="#8EA6D4"
                                            strokeWidth="2"
                                        />
                                        <path
                                            d="M8 72 C20 72 26 102 32 102 C38 102 44 72 56 72"
                                            fill="none"
                                            stroke="#8EA6D4"
                                            strokeDasharray="5 5"
                                            strokeWidth="2"
                                        />
                                        <circle cx="8" cy="72" r="4" fill="#012e7a" />
                                        <circle cx="56" cy="72" r="4" fill="#012e7a" />
                                    </svg>
                                    <svg className="h-10 w-8 lg:hidden" viewBox="0 0 32 40">
                                        <path
                                            d="M16 2 C16 12 16 22 16 38"
                                            fill="none"
                                            stroke="#8EA6D4"
                                            strokeDasharray="5 5"
                                            strokeWidth="2"
                                        />
                                        <circle cx="16" cy="5" r="4" fill="#012e7a" />
                                        <circle cx="16" cy="35" r="4" fill="#012e7a" />
                                    </svg>
                                </div>

                                <div className="rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-normal text-[#8E8D89]">
                                        {t('insight_signal_label')}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-semibold text-[#37352F]">
                                            {selectedInsight.companyName}
                                        </h3>
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                            selectedInsight.confidence === 'green'
                                                ? 'bg-green-50 text-green-700'
                                                : selectedInsight.confidence === 'yellow'
                                                    ? 'bg-amber-50 text-amber-700'
                                                    : 'bg-[#F1F1EF] text-[#73726E]'
                                        }`}>
                                            {t(`confidence_${selectedInsight.confidence}`)}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-[#37352F]">
                                        {selectedInsight.signalAnchor || t('discovery_no_summary')}
                                    </p>
                                    <a
                                        href={selectedInsight.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#012e7a] transition-colors hover:text-[#001f52]"
                                    >
                                        {selectedInsight.sourceName} · {formatDate(selectedInsight.triggerDate)}
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                </div>
                            </div>

                            <div className="rounded-lg border border-[#C8D4EA] bg-[#F8FAFE] p-4">
                                <p className="text-xs font-semibold uppercase tracking-normal text-[#012e7a]">
                                    {t('insight_bridge_label')}
                                </p>
                                <p className="mt-2 text-sm leading-6 text-[#37352F]">
                                    {selectedInsight.hasConcreteStrength
                                        ? t('insight_bridge_text', {
                                            company: selectedInsight.companyName,
                                            strength: selectedInsight.strengthText ?? t('insight_strength_fallback'),
                                            theme: selectedInsight.bridgeTheme,
                                        })
                                        : t('insight_bridge_text_fallback', {
                                            theme: selectedInsight.bridgeTheme,
                                        })}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col gap-3 border-t border-[#E7E7E5] pt-5 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs leading-5 text-[#73726E]">
                                {t('insight_privacy_note')}
                            </p>
                            <button
                                type="button"
                                disabled
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#C8D4EA] bg-white px-5 py-2.5 text-sm font-semibold text-[#73726E]"
                            >
                                <FileText className="h-4 w-4" />
                                {t('brief_prepare_locked')}
                            </button>
                        </div>
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-lg border border-[#E7E7E5] bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[#37352F]">
                                <ShieldCheck className="h-4 w-4 text-[#012e7a]" />
                                {t('discovery_rules_title')}
                            </div>
                            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#73726E]">
                                <li>{t('discovery_rule_1')}</li>
                                <li>{t('discovery_rule_2')}</li>
                                <li>{t('discovery_rule_3')}</li>
                            </ul>
                        </div>

                        <div className="rounded-lg border border-dashed border-[#B9C7E3] bg-[#F8FAFE] p-5">
                            <h2 className="text-base font-semibold text-[#37352F]">
                                {t('next_title')}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                {t('next_body_step3')}
                            </p>
                            <button
                                type="button"
                                disabled
                                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#C8D4EA] bg-white px-4 py-2 text-sm font-semibold text-[#73726E]"
                            >
                                <FileText className="h-4 w-4" />
                                {t('brief_prepare_locked')}
                            </button>
                        </div>
                    </aside>
                </section>
            ) : null}
        </div>
    );
}
