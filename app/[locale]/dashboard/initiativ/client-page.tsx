"use client";

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    AlertCircle,
    ArrowRight,
    Building2,
    CheckCircle2,
    Compass,
    FileText,
    Loader2,
    Radar,
    Save,
    ShieldCheck,
} from 'lucide-react';

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

const EMPTY_FORM: StrengthsForm = {
    human_aspects: '',
    professional_results: '',
    peer_perspective: '',
};

const FIELD_KEYS = ['human_aspects', 'professional_results', 'peer_perspective'] as const;
const STEP_ICONS = [Radar, Building2, FileText] as const;
const TOUR_ICONS = [Compass, ShieldCheck, Radar] as const;

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
    const [showTour, setShowTour] = useState(true);
    const [tourStep, setTourStep] = useState(0);
    const [form, setForm] = useState<StrengthsForm>(EMPTY_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [schemaReady, setSchemaReady] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const filledCount = useMemo(
        () => FIELD_KEYS.reduce((total, key) => total + countLines(form[key]), 0),
        [form]
    );
    const canSave = filledCount > 0 && !loading && !saving;
    const currentTourIcon = TOUR_ICONS[tourStep];

    useEffect(() => {
        let cancelled = false;

        async function loadLifeStrengths() {
            try {
                const response = await fetch('/api/initiativ/life-strengths');
                const data = await response.json();
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
            } catch {
                if (!cancelled) setError('load_failed');
            } finally {
                if (!cancelled) setLoading(false);
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
        setError(null);
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
                    const active = index === 0;
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
            ) : (
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
                                disabled
                                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#C8D4EA] bg-white px-4 py-2 text-sm font-semibold text-[#73726E]"
                            >
                                <Building2 className="h-4 w-4" />
                                {t('discovery_locked')}
                            </button>
                        </div>
                    </aside>
                </section>
            )}
        </div>
    );
}
