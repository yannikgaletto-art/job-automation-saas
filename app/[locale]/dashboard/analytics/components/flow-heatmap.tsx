'use client';

import { useMemo } from 'react';
import { buildHeatmapGrid, findPeakWindow, type HeatmapCell } from '@/lib/analytics/heatmap-utils';
import { useTranslations } from 'next-intl';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

type HeatmapDayKey = 'heatmap_day_0' | 'heatmap_day_1' | 'heatmap_day_2' | 'heatmap_day_3' | 'heatmap_day_4' | 'heatmap_day_5' | 'heatmap_day_6';

export function FlowHeatmap({ cells }: { cells: HeatmapCell[] }) {
    const t = useTranslations('dashboard.analytics');

    // i18n day abbreviations
    const DAYS = useMemo(() =>
        Array.from({ length: 7 }, (_, i) => t(`heatmap_day_${i}` as HeatmapDayKey)),
    [t]);

    const grid = useMemo(() => buildHeatmapGrid(cells), [cells]);
    const max = useMemo(() => Math.max(...grid.flat(), 1), [grid]);
    const peak = useMemo(() => findPeakWindow(grid, 3), [grid]);

    const toColor = (count: number) =>
        count === 0
            ? '#f4f4f0'
            : `rgba(0, 46, 122, ${0.12 + (count / max) * 0.88})`;

    return (
        <div className="space-y-3">
            <div
                className="grid gap-[3px]"
                style={{ gridTemplateColumns: `32px repeat(24, 1fr)` }}
            >
                {/* Hour labels */}
                <div />
                {HOURS.map(h => (
                    <div key={h} className="text-[8px] text-center text-stone-400 leading-none">
                        {h % 3 === 0 ? `${h}` : ''}
                    </div>
                ))}

                {/* Day rows */}
                {DAYS.map((day, di) => (
                    <div key={day} className="contents">
                        <div className="text-[11px] text-stone-500 flex items-center font-medium">
                            {day}
                        </div>
                        {HOURS.map(h => {
                            const count = grid[di][h];
                            const isPeak = di === peak.day && h >= peak.startHour && h < peak.startHour + 3;
                            return (
                                <div
                                    key={`${di}-${h}`}
                                    title={t('heatmap_tooltip', { day: DAYS[di], hour: h, count })}
                                    className={`aspect-square rounded-sm transition-all duration-200 cursor-default
                    ${isPeak ? 'ring-1 ring-offset-0 ring-[#002e7a]/40' : ''}`}
                                    style={{ backgroundColor: toColor(count) }}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-[10px] text-stone-400">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm bg-[#f4f4f0] border border-stone-200" />
                    <span>0</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(0,46,122,0.25)' }} />
                    <span>{t('heatmap_legend_low')}</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(0,46,122,0.65)' }} />
                    <span>{t('heatmap_legend_medium')}</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm bg-[#002e7a]" />
                    <span>{t('heatmap_legend_high')}</span>
                </div>
            </div>
        </div>
    );
}
