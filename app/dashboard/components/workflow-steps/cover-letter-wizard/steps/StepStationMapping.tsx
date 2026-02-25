'use client';

import { CVStationCard } from '../cards/CVStationCard';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse } from '@/types/cover-letter-setup';
import { ChevronLeft, ChevronRight, Lightbulb, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { generateStationReasoning } from '@/app/actions/generate-station-reasoning';

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
    requirements: string[]
): { requirement: string; reasoning: string; _score: number } | null {
    if (requirements.length === 0) return null;

    // Fallback if no bullets available
    if (!bullets || bullets.length === 0) {
        return {
            requirement: requirements[0],
            reasoning: `${company} (${role}) zeigt grundsätzlich deine Erfahrung in diesem Bereich.`,
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
        bestReq = requirements[0];
        bestBullet = bullets[0];
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
    const { cvStations, toggleStation, isStepComplete } = useCoverLetterSetupStore();
    const canProceed = isStepComplete(2);

    const [expandedRecs, setExpandedRecs] = useState<Record<number, string[]>>({});
    const [loadingRecs, setLoadingRecs] = useState<Record<number, boolean>>({});

    const handleExpandRec = async (
        idx: number,
        role: string,
        company: string,
        bullets: string[],
        requirement: string
    ) => {
        if (expandedRecs[idx]) {
            // Toggle off
            const next = { ...expandedRecs };
            delete next[idx];
            setExpandedRecs(next);
            return;
        }
        setLoadingRecs((prev) => ({ ...prev, [idx]: true }));
        try {
            const reasons = await generateStationReasoning(role, company, bullets, requirement);
            setExpandedRecs((prev) => ({ ...prev, [idx]: reasons }));
        } finally {
            setLoadingRecs((prev) => ({ ...prev, [idx]: false }));
        }
    };

    // Precalculate recommendations for all stations and find the top 3 best matching ones
    const { recs, top3Set } = useMemo(() => {
        const computed = setupData.cvStations.map((station, idx) => {
            const safeBullets = station.bullets || [];
            return {
                idx,
                rec: generateRecommendation(safeBullets, station.role, station.company, setupData.jobRequirements)
            };
        });
        const sortedIndices = [...computed].sort((a, b) => (b.rec?._score || 0) - (a.rec?._score || 0)).map(r => r.idx);
        return {
            recs: computed,
            top3Set: new Set(sortedIndices.slice(0, 3)),
        };
    }, [setupData.cvStations, setupData.jobRequirements]);

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
        });
    };

    if (setupData.cvStations.length === 0) {
        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-semibold text-[#37352F]">Relevante Erfahrungen</h3>
                    <p className="text-xs text-[#73726E] mt-0.5">
                        Kein CV hochgeladen. Du kannst trotzdem fortfahren.
                    </p>
                </div>
                <div className="text-xs text-[#A8A29E] italic">Lebenslaufdaten nicht verfügbar.</div>
                <div className="flex justify-between pt-2">
                    <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#37352F]">
                        <ChevronLeft className="w-3.5 h-3.5" /> Zurück
                    </button>
                    <button
                        onClick={onNext}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#002e7a] text-white rounded-lg text-xs font-semibold hover:bg-[#001e5a] transition-colors"
                    >
                        Weiter <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-[15.5px] font-semibold text-[#37352F]">Wähle deine relevantesten Stationen</h3>
                <p className="text-xs text-[#73726E] mt-0.5">
                    Wähle max. 3 Stationen, die die Stelle am besten belegen.
                </p>

                {/* Job Requirements */}
                {setupData.jobRequirements.length > 0 && (
                    <div className="mt-3 space-y-1">
                        <p className="text-[11.5px] font-semibold text-[#A8A29E] uppercase tracking-wide">Top-Anforderungen</p>
                        {setupData.jobRequirements.map((req, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                                <span className="text-[11.5px] text-[#002e7a] font-bold">{i + 1}.</span>
                                <span className="text-[13px] leading-snug text-[#73726E]">{req}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* CV Stations — two-column: left=station, right=recommendation */}
            <div className="space-y-2">
                {setupData.cvStations.map((station, idx) => {
                    const selected = cvStations.find(
                        (s) => s.company === station.company && s.role === station.role
                    );
                    const rec = top3Set.has(idx) ? recs[idx]?.rec : null;

                    return (
                        <div key={idx} className="grid grid-cols-2 gap-3 items-stretch">
                            {/* Left: Station Card */}
                            <div className="flex-1 min-w-0">
                                <CVStationCard
                                    company={station.company}
                                    role={station.role}
                                    period={station.period}
                                    bullets={station.bullets}
                                    selectedIndex={selected?.stationIndex ?? null}
                                    isDisabled={!selected && cvStations.length >= 3}
                                    onToggle={() => handleToggle(idx, station)}
                                />
                            </div>

                            {/* Right: Recommendation */}
                            {rec ? (
                                <div
                                    onClick={() => handleExpandRec(idx, station.role, station.company, station.bullets || [], rec.requirement)}
                                    className="min-w-0 bg-[#F8FAFC] border border-[#E7E7E5] rounded-lg p-3 flex flex-col justify-center cursor-pointer hover:bg-[#F1F5F9] transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-start gap-2">
                                            <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                                            <div className="min-w-0 pt-0.5">
                                                <p className="text-[10px] font-semibold text-[#002e7a] uppercase tracking-wide mb-1">
                                                    Empfehlung
                                                </p>
                                                <p className="text-[10px] text-[#73726E] leading-relaxed">
                                                    {rec.reasoning}
                                                </p>

                                                {/* Expanded Content */}
                                                {loadingRecs[idx] ? (
                                                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[#002e7a] opacity-70">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        Berechne tiefere Begründung...
                                                    </div>
                                                ) : expandedRecs[idx] && (
                                                    <div className="mt-3 space-y-1.5 border-t border-[#E7E7E5] pt-2">
                                                        {expandedRecs[idx].map((r, i) => (
                                                            <div key={i} className="flex gap-1.5 items-start">
                                                                <span className="text-[10px] text-[#002e7a] font-bold mt-0.5">•</span>
                                                                <span className="text-[10.5px] leading-snug text-[#73726E]">{r}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {/* Dropdown Chevron */}
                                        <div className="shrink-0 pt-0.5">
                                            {expandedRecs[idx] ? (
                                                <ChevronUp className="w-4 h-4 text-[#A8A29E]" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-[#A8A29E]" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : <div /> /* Empty div to pad the second grid column if no recommendation */}
                        </div>
                    );
                })}
            </div>

            {/* Sticky Summary */}
            {cvStations.length > 0 && (
                <div className="text-xs text-[#002e7a] font-medium">
                    {cvStations.length}/3 Stationen gewählt
                </div>
            )}

            <div className="flex justify-between pt-2">
                <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#37352F]">
                    <ChevronLeft className="w-3.5 h-3.5" /> Zurück
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
                    {!canProceed ? 'min. 1 Station wählen' : <>Weiter <ChevronRight className="w-3.5 h-3.5" /></>}
                </button>
            </div>
        </div>
    );
}
