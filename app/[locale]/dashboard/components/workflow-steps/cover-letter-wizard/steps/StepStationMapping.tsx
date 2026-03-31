'use client';

import { CVStationCard } from '../cards/CVStationCard';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse } from '@/types/cover-letter-setup';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
    setupData: SetupDataResponse;
    onBack: () => void;
    onNext: () => void;
}

export function StepStationMapping({ setupData, onBack, onNext }: Props) {
    const t = useTranslations('cover_letter');
    const { cvStations, toggleStation, isStepComplete } = useCoverLetterSetupStore();
    const canProceed = isStepComplete(2);
    const autoSelectDone = useRef(false);

    // Only show stations with both role AND company
    const validStations = useMemo(
        () => setupData.cvStations.filter(s => s.role && s.company),
        [setupData.cvStations]
    );

    // Auto-Select: pick the first 2 stations on first visit
    useEffect(() => {
        if (autoSelectDone.current) return;
        if (cvStations.length > 0) return; // User already has selections
        if (validStations.length === 0) return;

        autoSelectDone.current = true;

        const top2 = validStations.slice(0, 2);
        for (const station of top2) {
            const safeBullets = station.bullets || [];
            toggleStation({
                company: station.company,
                role: station.role,
                period: station.period,
                keyBullet: safeBullets[0] || '',
                matchedRequirement: setupData.jobRequirements[0] || '',
                intent: `${t('intent_prefix')}: ${setupData.jobRequirements[0] || t('intent_experience_fallback')}`,
                bullets: safeBullets,
            });
        }
    }, [validStations, cvStations.length, toggleStation, setupData.jobRequirements]);

    const handleToggle = (station: SetupDataResponse['cvStations'][number]) => {
        const safeBullets = station.bullets || [];
        toggleStation({
            company: station.company,
            role: station.role,
            period: station.period,
            keyBullet: safeBullets[0] || '',
            matchedRequirement: setupData.jobRequirements[0] || '',
            intent: `${t('intent_prefix')}: ${setupData.jobRequirements[0] || t('intent_experience_fallback')}`,
            bullets: safeBullets,
        });
    };

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
                    <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#37352F]">
                        <ChevronLeft className="w-3.5 h-3.5" /> {t('btn_back')}
                    </button>
                    <button
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

            {/* Station cards */}
            <div className="space-y-2">
                {validStations.map((station, idx) => {
                    const selected = cvStations.find(
                        (s) => s.company === station.company && s.role === station.role
                    );

                    return (
                        <CVStationCard
                            key={idx}
                            company={station.company}
                            role={station.role}
                            period={station.period}
                            selectedIndex={selected?.stationIndex ?? null}
                            isDisabled={!selected && cvStations.length >= 3}
                            onToggle={() => handleToggle(station)}
                            hint={station.hint}
                        />
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
                <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#37352F]">
                    <ChevronLeft className="w-3.5 h-3.5" /> {t('btn_back')}
                </button>
                <button
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
