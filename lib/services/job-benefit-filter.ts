export const MAX_JOB_BENEFITS = 6;

export function cleanJobBenefits(
    benefits: string[] | null | undefined,
    maxBenefits = MAX_JOB_BENEFITS,
): string[] {
    if (!Array.isArray(benefits) || maxBenefits <= 0) return [];

    const seen = new Set<string>();
    const cleaned: string[] = [];

    for (const rawBenefit of benefits) {
        if (typeof rawBenefit !== 'string') continue;
        const benefit = rawBenefit.trim();
        const key = benefit.toLowerCase().replace(/\s+/g, ' ');

        if (key.length < 2 || seen.has(key)) continue;

        seen.add(key);
        cleaned.push(benefit);

        if (cleaned.length >= maxBenefits) break;
    }

    return cleaned;
}
