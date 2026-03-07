'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const MOON_LABELS = ['', '🌑', '🌒', '🌓', '🌔', '🌕'];
const BAR_COLORS = ['#d6d6d6', '#d6d6d6', '#93c5fd', '#1a4a9a', '#002e7a'];

interface Session { energy_level: number | null; completed: boolean; }

export function EnergyResonanceChart({ sessions }: { sessions: Session[] }) {
    const data = [1, 2, 3, 4, 5].map(level => {
        const atLevel = sessions.filter(s => s.energy_level === level);
        const rate = atLevel.length > 0
            ? Math.round((atLevel.filter(s => s.completed).length / atLevel.length) * 100)
            : 0;
        return { level: MOON_LABELS[level], rate, count: atLevel.length };
    });

    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.length) return null;
        const d = payload[0].payload;
        return (
            <div className="bg-white border border-[#d6d6d6] rounded-lg p-2 text-xs shadow-sm">
                <p className="font-medium">{d.level} Energie-Level</p>
                <p className="text-[#002e7a]">{d.rate}% Completion Rate</p>
                <p className="text-stone-400">{d.count} Session{d.count !== 1 ? 's' : ''}</p>
            </div>
        );
    };

    return (
        <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} barSize={32} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="level" axisLine={false} tickLine={false} tick={{ fontSize: 16 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#73726E' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f0' }} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                    {data.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
