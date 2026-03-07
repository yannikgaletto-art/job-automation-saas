/**
 * Insight engine — Pure TS logic, no AI, $0 cost, 0ms latency.
 * Generates actionable insight texts from raw analytics data.
 */

interface PomodoroSession {
    started_at: string;
    completed: boolean;
    duration_min: number;
    energy_level: number | null;
}

interface Job {
    status: string;
    match_score_overall?: number | null;
}

// ─── Momentum Score (0–100, rolling 7-day) ───────────────────────

export function calcMomentumScore(sessions: PomodoroSession[], jobs: Job[]): number {
    const last7 = sessions.filter(s => {
        const age = (Date.now() - new Date(s.started_at).getTime()) / 86400000;
        return age <= 7;
    });

    if (last7.length === 0) return 0;

    const completionRate = last7.filter(s => s.completed).length / last7.length;
    const energySessions = last7.filter(s => s.energy_level !== null);
    const avgEnergy = energySessions.length > 0
        ? energySessions.reduce((sum, s) => sum + (s.energy_level ?? 0), 0) / energySessions.length
        : 3; // Default neutral

    const appliedRecently = jobs.filter(j => j.status === 'submitted').length;
    const matchJobs = jobs.filter(j => j.match_score_overall != null);
    const avgMatch = matchJobs.length > 0
        ? matchJobs.reduce((sum, j) => sum + (j.match_score_overall ?? 0), 0) / matchJobs.length
        : 50;

    const score = Math.round(
        completionRate * 40 +
        (avgEnergy / 5) * 25 +
        Math.min(appliedRecently / 5, 1) * 20 +
        (avgMatch / 100) * 15
    );

    return Math.min(score, 100);
}

// ─── Peak Insight ────────────────────────────────────────────────

export function generatePeakInsight(
    peak: { day: number; startHour: number; count: number },
    totalSessions: number
): string | null {
    if (totalSessions === 0 || peak.count === 0) return null;

    const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    const dayAvg = totalSessions / 7;
    const factor = dayAvg > 0 ? (peak.count / dayAvg).toFixed(1) : '—';

    return `Du bist ${days[peak.day]}s zwischen ${peak.startHour}:00 und ${peak.startHour + 3}:00 Uhr am produktivsten. ` +
        `${factor}× mehr Sessions als dein Wochendurchschnitt.`;
}

// ─── Energy Insight ──────────────────────────────────────────────

export function generateEnergyInsight(sessions: PomodoroSession[]): string | null {
    const highEnergy = sessions.filter(s => (s.energy_level ?? 0) >= 4);
    const lowEnergy = sessions.filter(s => (s.energy_level ?? 0) <= 2 && s.energy_level !== null);

    if (highEnergy.length < 3 || lowEnergy.length < 3) return null;

    const highRate = highEnergy.filter(s => s.completed).length / highEnergy.length;
    const lowRate = lowEnergy.filter(s => s.completed).length / lowEnergy.length;
    const factor = lowRate > 0 ? (highRate / lowRate).toFixed(1) : '—';

    return `An 🌕-Tagen schließt du ${factor}× mehr Sessions ab als an 🌑-Tagen.`;
}

// ─── Funnel Insight ──────────────────────────────────────────────

export function generateFunnelInsight(jobs: Job[]): string | null {
    const STATUS_ORDER = ['pending', 'processing', 'ready_for_review', 'ready_to_apply', 'submitted'];
    const cumulative: number[] = [];

    // Count jobs that have reached at least each stage
    for (let i = 0; i < STATUS_ORDER.length; i++) {
        cumulative[i] = jobs.filter(j => {
            const idx = STATUS_ORDER.indexOf(j.status);
            return idx >= i;
        }).length;
    }

    const total = jobs.length;
    if (total < 5) return null;

    let biggestDropStep = 1;
    let biggestDrop = 0;
    for (let i = 1; i < cumulative.length; i++) {
        const drop = cumulative[i - 1] > 0
            ? (cumulative[i - 1] - cumulative[i]) / cumulative[i - 1]
            : 0;
        if (drop > biggestDrop) { biggestDrop = drop; biggestDropStep = i; }
    }

    if (biggestDrop < 0.05) return null;

    const LABELS = ['Analysierung', 'CV-Optimierung', 'CL-Generierung', 'Bewerbung'];
    return `Du verlierst ${Math.round(biggestDrop * 100)}% zwischen ${LABELS[biggestDropStep - 1]} und ${LABELS[biggestDropStep] ?? 'Bewerbung'}. Hier liegt dein Bottleneck.`;
}

// ─── Streak Calculator ──────────────────────────────────────────

export function calcStreak(sessions: PomodoroSession[]): number {
    const completedDays = new Set(
        sessions
            .filter(s => s.completed)
            .map(s => new Date(s.started_at).toISOString().split('T')[0])
    );

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        if (completedDays.has(key)) {
            streak++;
        } else if (i > 0) {
            break; // Grace: allow today to be incomplete
        }
    }
    return streak;
}

// ─── Coaching Trend (deterministic, $0 cost) ────────────────────

interface CoachingSession {
    coaching_score: number | null;
    created_at: string;
}

export function calcCoachingTrend(sessions: CoachingSession[]): {
    scores: { date: string; score: number }[];
    trend: 'improving' | 'stable' | 'declining' | 'none';
    improvementPct: number;
} {
    // QA: Strictly filter out sessions where score is null (race condition during report generation)
    const scored = sessions
        .filter((s): s is CoachingSession & { coaching_score: number } => s.coaching_score !== null)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const scores = scored.map(s => ({
        date: new Date(s.created_at).toISOString().split('T')[0],
        score: s.coaching_score,
    }));

    if (scores.length < 2) return { scores, trend: 'none', improvementPct: 0 };

    const mid = Math.floor(scores.length / 2);
    const firstHalf = scores.slice(0, mid);
    const secondHalf = scores.slice(mid);

    const avgFirst = firstHalf.reduce((s, x) => s + x.score, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, x) => s + x.score, 0) / secondHalf.length;

    const diff = avgSecond - avgFirst;
    const improvementPct = avgFirst > 0 ? Math.round((diff / avgFirst) * 100) : 0;

    const trend: 'improving' | 'stable' | 'declining' =
        diff > 1 ? 'improving' : diff < -1 ? 'declining' : 'stable';

    return { scores, trend, improvementPct };
}
