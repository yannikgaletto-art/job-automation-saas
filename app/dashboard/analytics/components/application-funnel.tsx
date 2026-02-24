'use client';

interface Job { status: string; }

const STAGES = [
    { key: 'pending', label: 'Hinzugefügt' },
    { key: 'processing', label: 'Analysiert' },
    { key: 'ready_for_review', label: 'CV optimiert' },
    { key: 'ready_to_apply', label: 'CL generiert' },
    { key: 'submitted', label: 'Beworben' },
];

export function ApplicationFunnel({ jobs }: { jobs: Job[] }) {
    // Cumulative counts: how many jobs have reached at least this stage
    const STATUS_ORDER = STAGES.map(s => s.key);
    const counts = STAGES.map((_, i) => {
        return jobs.filter(j => {
            const idx = STATUS_ORDER.indexOf(j.status);
            return idx >= i;
        }).length;
    });
    const max = counts[0] || 1;

    if (jobs.length === 0) {
        return (
            <div className="py-8 text-center">
                <p className="text-xs text-[#A8A29E]">Noch keine Jobs in der Queue.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {STAGES.map((stage, i) => {
                const pct = Math.round((counts[i] / max) * 100);
                return (
                    <div key={stage.key} className="flex items-center gap-3">
                        <span className="text-xs text-stone-500 w-28 text-right shrink-0">
                            {stage.label}
                        </span>
                        <div className="flex-1 h-7 bg-[#f4f4f0] rounded-md overflow-hidden">
                            <div
                                className="h-full rounded-md transition-all duration-500 flex items-center px-2"
                                style={{
                                    width: `${pct}%`,
                                    backgroundColor: `rgba(0, 46, 122, ${0.25 + (pct / 100) * 0.75})`,
                                    minWidth: counts[i] > 0 ? '2rem' : '0',
                                }}
                            >
                                {counts[i] > 0 && (
                                    <span className="text-white text-[10px] font-medium whitespace-nowrap">
                                        {counts[i]}
                                    </span>
                                )}
                            </div>
                        </div>
                        <span className="text-xs font-medium text-[#002e7a] w-10 text-right shrink-0">
                            {pct}%
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
