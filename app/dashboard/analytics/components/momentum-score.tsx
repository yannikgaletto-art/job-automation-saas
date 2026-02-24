'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { CountUp } from '@/components/motion/count-up';
import { motion } from 'framer-motion';

interface Session {
    started_at: string;
    completed: boolean;
}

export function MomentumScore({ score, sessions }: { score: number; sessions: Session[] }) {
    // Group sessions by date for sparkline
    const dailyMap = new Map<string, number>();
    sessions.forEach(s => {
        if (!s.completed) return;
        const day = s.started_at.split('T')[0];
        dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    });

    const sparkData = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, count]) => ({ v: count }));

    const scoreColor = score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-500' : 'text-red-500';

    return (
        <div className="space-y-4">
            <div className="flex items-end gap-4">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-5xl font-bold tabular-nums ${scoreColor}`}
                >
                    <CountUp value={score} duration={1.5} />
                </motion.div>
                <p className="text-xs text-stone-400 pb-2">/ 100</p>
            </div>

            {sparkData.length > 1 ? (
                <ResponsiveContainer width="100%" height={60}>
                    <LineChart data={sparkData}>
                        <Line
                            type="monotone"
                            dataKey="v"
                            stroke="#002e7a"
                            strokeWidth={2}
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <p className="text-xs text-stone-400">Mehr Sessions nötig für den Trend-Graphen.</p>
            )}

            <p className="text-[10px] text-stone-400">
                Gewichtung: 40% Completion Rate · 25% Energielevel · 20% Bewerbungen · 15% Match Score
            </p>
        </div>
    );
}
