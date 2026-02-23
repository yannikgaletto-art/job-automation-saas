'use client';

import { CVStationCard } from '../cards/CVStationCard';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse } from '@/types/cover-letter-setup';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
    setupData: SetupDataResponse;
    onBack: () => void;
    onNext: () => void;
}

// Suggest which requirement best matches a station's bullets
function suggestMatch(bullets: string[] | undefined, requirements: string[]): string {
    if (!bullets || bullets.length === 0) return requirements[0] || '';
    return requirements.find((req) =>
        bullets.some((b) =>
            b.toLowerCase().split(' ').some((word) =>
                req.toLowerCase().includes(word) && word.length > 4
            )
        )
    ) || requirements[0] || '';
}

export function StepStationMapping({ setupData, onBack, onNext }: Props) {
    const { cvStations, toggleStation, isStepComplete } = useCoverLetterSetupStore();
    const canProceed = isStepComplete(2);

    const handleToggle = (station: SetupDataResponse['cvStations'][number]) => {
        const safeBullets = station.bullets || [];
        const matched = suggestMatch(safeBullets, setupData.jobRequirements);
        toggleStation({
            company: station.company,
            role: station.role,
            period: station.period,
            keyBullet: safeBullets[0] || '',
            matchedRequirement: matched,
            intent: `Beweis für: ${matched || 'Berufserfahrung'}`,
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
                <h3 className="text-sm font-semibold text-[#37352F]">Wähle deine relevantesten Stationen</h3>
                <p className="text-xs text-[#73726E] mt-0.5">
                    Wähle max. 3 Stationen, die die Stelle am besten belegen.
                </p>

                {/* Job Requirements */}
                {setupData.jobRequirements.length > 0 && (
                    <div className="mt-3 space-y-1">
                        <p className="text-[10px] font-semibold text-[#A8A29E] uppercase tracking-wide">Top-Anforderungen</p>
                        {setupData.jobRequirements.map((req, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                                <span className="text-[10px] text-[#002e7a] font-bold">{i + 1}.</span>
                                <span className="text-[11px] text-[#73726E]">{req}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* CV Stations */}
            <div className="space-y-2">
                {setupData.cvStations.map((station, idx) => {
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
                            onToggle={() => handleToggle(station)}
                        />
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
