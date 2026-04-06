'use client';

import { CVStationCard } from '../cards/CVStationCard';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse } from '@/types/cover-letter-setup';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    setupData: SetupDataResponse;
    onBack: () => void;
    onNext: () => void;
}

/**
 * Generate 2 auto-suggestions from a station's bullets + job requirements.
 * Pure client-side — zero API cost. The suggestions serve as editable starting
 * points so the user feels "animated" to augment them with real context.
 */
function generateSuggestions(
    bullets: string[],
    jobRequirements: string[],
    company: string,
): string {
    const safeBullets = (bullets || []).filter(b => b && b.trim().length > 5);
    if (safeBullets.length === 0) return '';

    // Take bullet[0] as-is (shortened to max 120 chars)
    const b1 = safeBullets[0].length > 120
        ? safeBullets[0].substring(0, 117) + '...'
        : safeBullets[0];

    // Take bullet[1] if available, else use a generic prompt
    const b2 = safeBullets.length > 1
        ? safeBullets[1].length > 120
            ? safeBullets[1].substring(0, 117) + '...'
            : safeBullets[1]
        : null;

    const lines = [`• ${b1}`];
    if (b2) lines.push(`• ${b2}`);

    return lines.join('\n');
}

export function StepStationMapping({ setupData, onBack, onNext }: Props) {
    const t = useTranslations('cover_letter');
    const { cvStations, toggleStation, setStationContext } = useCoverLetterSetupStore();
    const canProceed = cvStations.length >= 1;
    const autoSelectDone = useRef(false);

    // Track which context fields the user has explicitly touched
    const [touchedContexts, setTouchedContexts] = useState<Set<string>>(new Set());

    // ─── Hoist all t() calls above the map — prevents missing-key crashes ────
    // next-intl JSON changes require a full dev-server restart to take effect.
    // Inline fallbacks here ensure zero crashes even on stale bundles.
    const labelContext = t('context_label') || 'Was war an dieser Station besonders relevant für diese Stelle? (optional, max. 2 Sätze)';
    const labelPlaceholder = t('context_placeholder') || 'z.B. Hier habe ich gelernt, wie man komplexe Stakeholder-Prozesse steuert...';

    // Only show stations with both role AND company
    const validStations = useMemo(
        () => setupData.cvStations.filter(s => s.role && s.company),
        [setupData.cvStations]
    );

    // Capture latest values via refs — avoids unnecessary re-triggers + Rules-of-Hooks violation.
    const validStationsRef = useRef(validStations);
    validStationsRef.current = validStations;
    const setupDataRef = useRef(setupData);
    setupDataRef.current = setupData;
    const toggleStationRef = useRef(toggleStation);
    toggleStationRef.current = toggleStation;
    const tRef = useRef(t);
    tRef.current = t;

    // Auto-Select: pick the first 2 stations on FIRST visit only.
    useEffect(() => {
        if (autoSelectDone.current) return;
        if (cvStations.length > 0) return;
        const vs = validStationsRef.current;
        if (vs.length === 0) return;

        autoSelectDone.current = true;
        const localT = tRef.current;
        const localToggle = toggleStationRef.current;
        const jobReqs = setupDataRef.current.jobRequirements;

        const top2 = vs.slice(0, 2);
        for (const station of top2) {
            const safeBullets = station.bullets || [];
            localToggle({
                company: station.company,
                role: station.role,
                period: station.period,
                keyBullet: safeBullets[0] || '',
                matchedRequirement: jobReqs[0] || '',
                intent: `${localT('intent_prefix')}: ${jobReqs[0] || localT('intent_experience_fallback')}`,
                bullets: safeBullets,
                // Auto-fill from CV Optimizer if available
                ...(station.cvOptimizerContext ? { userContext: station.cvOptimizerContext } : {}),
            });
        }
    }, [cvStations.length]);


    const handleToggle = (station: SetupDataResponse['cvStations'][number]) => {
        const safeBullets = station.bullets || [];
        const isCurrentlySelected = cvStations.some(
            (s) => s.company === station.company && s.role === station.role
        );
        toggleStation({
            company: station.company,
            role: station.role,
            period: station.period,
            keyBullet: safeBullets[0] || '',
            matchedRequirement: setupData.jobRequirements[0] || '',
            intent: `${t('intent_prefix')}: ${setupData.jobRequirements[0] || t('intent_experience_fallback')}`,
            bullets: safeBullets,
            // Auto-fill userContext from CV Optimizer if available, otherwise leave empty
            ...(!isCurrentlySelected && station.cvOptimizerContext
                ? { userContext: station.cvOptimizerContext }
                : {}),
        });
        // Clear touched state when toggling off
        const key = `${station.company}::${station.role}`;
        setTouchedContexts(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
    };

    const handleContextChange = useCallback((company: string, role: string, value: string) => {
        const key = `${company}::${role}`;
        setTouchedContexts(prev => new Set(prev).add(key));
        setStationContext(company, role, value);
    }, [setStationContext]);

    if (validStations.length === 0) {
        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-semibold text-[#37352F]">{t('stations_empty_title')}</h3>
                    <p className="text-xs text-[#73726E] mt-0.5">
                        {t('stations_empty_desc')}
                    </p>
                </div>
                <div className="text-xs text-[#A8A29E] italic">{t('stations_empty_cv')}</div>
                <div className="flex justify-between pt-2">
                    <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#37352F]">
                        <ChevronLeft className="w-3.5 h-3.5" /> {t('btn_back')}
                    </button>
                    <button
                        type="button"
                        onClick={onNext}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#002e7a] text-white rounded-lg text-xs font-semibold hover:bg-[#001e5a] transition-colors"
                    >
                        {t('btn_next')} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-[15.5px] font-semibold text-[#37352F]">{t('stations_title')}</h3>
                <p className="text-xs text-[#73726E] mt-0.5">
                    {t('stations_desc')}
                </p>

                {/* Job Requirements */}
                {setupData.jobRequirements.length > 0 && (
                    <div className="mt-3 space-y-1">
                        <p className="text-[11.5px] font-semibold text-[#A8A29E] uppercase tracking-wide">{t('top_requirements')}</p>
                        {setupData.jobRequirements.map((req, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                                <span className="text-[11.5px] text-[#002e7a] font-bold">{i + 1}.</span>
                                <span className="text-[13px] leading-snug text-[#73726E]">{req}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Station cards + context fields */}
            <div className="space-y-2">
                {validStations.map((station, idx) => {
                    const selected = cvStations.find(
                        (s) => s.company === station.company && s.role === station.role
                    );
                    const contextKey = `${station.company}::${station.role}`;
                    const isTouched = touchedContexts.has(contextKey);
                    const suggestion = generateSuggestions(
                        station.bullets || [],
                        setupData.jobRequirements,
                        station.company,
                    );

                    return (
                        <div key={idx}>
                            <CVStationCard
                                company={station.company}
                                role={station.role}
                                period={station.period}
                                selectedIndex={selected?.stationIndex ?? null}
                                isDisabled={!selected && cvStations.length >= 3}
                                onToggle={() => handleToggle(station)}
                                hint={station.hint}
                            />

                            {/* Context Textarea — slides in when selected */}
                            <AnimatePresence>
                                {selected && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2, ease: 'easeOut' }}
                                        className="overflow-hidden"
                                    >
                                        <div className="ml-3 mt-1 mb-1 pl-3 border-l-2 border-[#002e7a]/20">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <Lightbulb className="w-3 h-3 text-[#A8A29E]" />
                                                <span className="text-[10px] text-[#A8A29E] font-medium">
                                                    {labelContext}
                                                </span>
                                            </div>
                                            <textarea
                                                value={selected.userContext ?? ''}
                                                onChange={(e) => handleContextChange(station.company, station.role, e.target.value)}
                                                placeholder={suggestion || labelPlaceholder}
                                                rows={2}
                                                className="w-full text-[11px] text-[#37352F] bg-transparent border border-[#E7E7E5] rounded-md px-2.5 py-2 resize-none outline-none focus:border-[#002e7a]/40 focus:ring-1 focus:ring-[#002e7a]/10 placeholder-[#C4C3BF] leading-relaxed transition-all"
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>

            {/* Sticky Summary */}
            {cvStations.length > 0 && (
                <div className="text-xs text-[#002e7a] font-medium">
                    {t('stations_count', { count: cvStations.length })}
                </div>
            )}

            <div className="flex justify-between pt-2">
                <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#37352F]">
                    <ChevronLeft className="w-3.5 h-3.5" /> {t('btn_back')}
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!canProceed}
                    className={[
                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                        canProceed
                            ? 'bg-[#002e7a] text-white hover:bg-[#001e5a]'
                            : 'bg-[#E7E7E5] text-[#A8A29E] cursor-not-allowed',
                    ].join(' ')}
                >
                    {!canProceed ? t('btn_min_station') : <>{t('btn_next')} <ChevronRight className="w-3.5 h-3.5" /></>}
                </button>
            </div>
        </div>
    );
}
