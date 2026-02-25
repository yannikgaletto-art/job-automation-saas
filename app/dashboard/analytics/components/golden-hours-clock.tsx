'use client';

import { useMemo } from 'react';
import type { HeatmapCell } from '@/lib/analytics/heatmap-utils';

export function GoldenHoursClock({ cells }: { cells: HeatmapCell[] }) {
    const hourCounts = useMemo(() => {
        const map = new Array(24).fill(0);
        cells.forEach(c => { map[c.hour_of_day] = (map[c.hour_of_day] ?? 0) + c.session_count; });
        return map;
    }, [cells]);

    const max = useMemo(() => Math.max(...hourCounts, 1), [hourCounts]);
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    const cx = 100, cy = 100, r_inner = 40, r_outer = 85;

    const segmentPath = (hour: number, intensity: number) => {
        const startAngle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
        const endAngle = ((hour + 1) / 24) * 2 * Math.PI - Math.PI / 2;
        const r = r_inner + intensity * (r_outer - r_inner);

        const x1 = cx + r_inner * Math.cos(startAngle);
        const y1 = cy + r_inner * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(startAngle);
        const y2 = cy + r * Math.sin(startAngle);
        const x3 = cx + r * Math.cos(endAngle);
        const y3 = cy + r * Math.sin(endAngle);
        const x4 = cx + r_inner * Math.cos(endAngle);
        const y4 = cy + r_inner * Math.sin(endAngle);

        return `M ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${r_inner} ${r_inner} 0 0 0 ${x1} ${y1} Z`;
    };

    const labelAngle = (hour: number) => (hour / 24) * 2 * Math.PI - Math.PI / 2;
    const labelRadius = 93;

    return (
        <div className="flex flex-col items-center gap-3">
            <svg viewBox="0 0 200 200" className="w-48 h-48">
                <circle cx={cx} cy={cy} r={r_outer} fill="none" stroke="#f0ede8" strokeWidth="1" />
                <circle cx={cx} cy={cy} r={r_inner} fill="none" stroke="#f0ede8" strokeWidth="1" />

                {hourCounts.map((count, hour) => {
                    const intensity = count / max;
                    const isPeak = hour === peakHour && count > 0;
                    return (
                        <path
                            key={hour}
                            d={segmentPath(hour, Math.max(intensity, 0.15))}
                            fill={
                                isPeak
                                    ? '#f59e0b'
                                    : intensity === 0
                                        ? '#f4f4f0'
                                        : `rgba(0, 46, 122, ${0.1 + intensity * 0.9})`
                            }
                            stroke="white"
                            strokeWidth="0.5"
                        >
                            <title>{hour}:00 — {count} Sessions</title>
                        </path>
                    );
                })}

                {[0, 6, 12, 18].map(h => {
                    const a = labelAngle(h);
                    const lx = cx + labelRadius * Math.cos(a);
                    const ly = cy + labelRadius * Math.sin(a);
                    return (
                        <text
                            key={h}
                            x={lx} y={ly}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="8"
                            fill="#73726E"
                            fontFamily="sans-serif"
                        >
                            {h}h
                        </text>
                    );
                })}

                <circle cx={cx} cy={cy} r={r_inner - 2} fill="white" />
                <text x={cx} y={cy - 6} textAnchor="middle" fontSize="9" fill="#73726E" fontFamily="sans-serif">
                    Golden
                </text>
                <text x={cx} y={cy + 6} textAnchor="middle" fontSize="9" fill="#73726E" fontFamily="sans-serif">
                    Hours
                </text>
            </svg>
            <p className="text-xs text-stone-500 text-center">
                Peak: <strong className="text-[#002e7a]">{peakHour}:00 – {(peakHour + 2) % 24}:00 Uhr</strong>
            </p>
        </div>
    );
}
