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

/**
 * Generate a recommendation for WHY a station matches a job requirement.
 * Uses keyword overlap between bullet points and requirements.
 */
function generateRecommendation(
    bullets: string[] | undefined,
    role: string,
    company: string,
    requirements: string[],
    matchFallbackText: string
): { requirement: string; reasoning: string; _score: number } | null {
    if (requirements.length === 0) return null;

    // Fallback if no bullets available
    if (!bullets || bullets.length === 0) {
        return {
            requirement: requirements[0],
            reasoning: matchFallbackText,
            _score: 0
        };
    }

    // Find best matching requirement via keyword overlap
    let bestReq = '';
    let bestScore = 0;
    let bestBullet = '';

    for (const req of requirements) {
        const reqWords = req.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        for (const bullet of bullets) {
            const bulletWords = bullet.toLowerCase().split(/\s+/);
            const overlap = reqWords.filter(rw => bulletWords.some(bw => bw.includes(rw) || rw.includes(bw))).length;
            if (overlap > bestScore) {
                bestScore = overlap;
                bestReq = req;
                bestBullet = bullet;
            }
        }
    }

    if (bestScore === 0) {
        // Fallback: just use the first requirement
        return {
            requirement: requirements[0],
            reasoning: matchFallbackText,
            _score: 0
        };
    }

    // Truncate bullet to ~80 chars for display
    const shortBullet = bestBullet.length > 80 ? bestBullet.slice(0, 77) + '...' : bestBullet;

    return {
        requirement: bestReq,
        reasoning: `${company} zeigt, dass du "${shortBullet}" kannst — das belegt die Anforderung.`,
        _score: bestScore
    };
}

export function StepStationMapping({ setupData, onBack, onNext }: Props) {
    const t = useTranslations('cover_letter');
    const { cvStations, toggleStation, isStepComplete } = useCoverLetterSetupStore();
    const canProceed = isStepComplete(2);
    const autoSelectDone = useRef(false);

    // Upgrade 1: Daten-Hygiene — nur vollständige Stationen anzeigen
    const validStations = useMemo(
        () => setupData.cvStations.filter(s => s.role && s.company),
        [setupData.cvStations]
    );

    // Precalculate recommendations for all VALID stations and find the top matches
    const { recs, top3Set } = useMemo(() => {
        const computed = validStations.map((station, idx) => {
            const safeBullets = station.bullets || [];
            return {
                idx,
                rec: generateRecommendation(safeBullets, station.role, station.company, setupData.jobRequirements, t('recommendation_match'))
            };
        });
        const sortedIndices = [...computed].sort((a, b) => (b.rec?._score || 0) - (a.rec?._score || 0)).map(r => r.idx);
        return {
            recs: computed,
            top3Set: new Set(sortedIndices.slice(0, 3)),
        };
    }, [validStations, setupData.jobRequirements]);

    // Upgrade 2: Auto-Select — Top 2 beim ersten Betreten vorauswählen
    useEffect(() => {
        if (autoSelectDone.current) return;
        if (cvStations.length > 0) return; // User hat bereits manuell gewählt oder Store hat Daten
        if (recs.length === 0) return;

        autoSelectDone.current = true;

        const sorted = [...recs].sort((a, b) => (b.rec?._score || 0) - (a.rec?._score || 0));
        const top2 = sorted.slice(0, 2);

        for (const entry of top2) {
            const station = validStations[entry.idx];
            if (!station) continue;
            const safeBullets = station.bullets || [];
            const rec = entry.rec;
            toggleStation({
                company: station.company,
                role: station.role,
                period: station.period,
                keyBullet: safeBullets[0] || '',
                matchedRequirement: rec?.requirement || setupData.jobRequirements[0] || '',
                intent: `${t('intent_prefix')}: ${rec?.requirement || t('intent_experience_fallback')}`,
                bullets: safeBullets,
            });
        }
    }, [recs, validStations, cvStations.length, toggleStation, setupData.jobRequirements]);

    const handleToggle = (stationIndex: number, station: SetupDataResponse['cvStations'][number]) => {
        const safeBullets = station.bullets || [];
        const rec = recs[stationIndex]?.rec;
        toggleStation({
            company: station.company,
            role: station.role,
            period: station.period,
            keyBullet: safeBullets[0] || '',
            matchedRequirement: rec?.requirement || setupData.jobRequirements[0] || '',
            intent: `Beweis für: ${rec?.requirement || 'Berufserfahrung'}`,
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

            {/* Upgrade 3: Single-column layout — no more split-view */}
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
                            bullets={station.bullets}
                            selectedIndex={selected?.stationIndex ?? null}
                            isDisabled={!selected && cvStations.length >= 3}
                            onToggle={() => handleToggle(idx, station)}
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
