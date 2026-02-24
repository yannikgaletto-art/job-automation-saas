/**
 * Heatmap utilities — Grid builder and peak finder.
 * Pure functions, no dependencies.
 */

export type HeatmapCell = {
    day_of_week: number;   // 1 (Mo) bis 7 (So)
    hour_of_day: number;   // 0 bis 23
    session_count: number;
    completed_count: number;
    avg_energy: number | null;
};

export function buildHeatmapGrid(cells: HeatmapCell[]): number[][] {
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    cells.forEach(c => {
        grid[c.day_of_week - 1][c.hour_of_day] = c.session_count;
    });
    return grid;
}

export function findPeakWindow(
    grid: number[][],
    windowHours = 3
): { day: number; startHour: number; count: number } {
    let best = { day: 0, startHour: 8, count: 0 };
    for (let d = 0; d < 7; d++) {
        for (let h = 0; h <= 24 - windowHours; h++) {
            const sum = grid[d].slice(h, h + windowHours).reduce((a, b) => a + b, 0);
            if (sum > best.count) best = { day: d, startHour: h, count: sum };
        }
    }
    return best;
}
