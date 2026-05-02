import { Page, expect } from '@playwright/test';

export interface VarianceResult<T> {
  runs: T[];
  identical: boolean;
  divergence?: string;
}

export async function runThriceAndCompare<T>(
  description: string,
  run: () => Promise<T>,
  compare: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
): Promise<VarianceResult<T>> {
  const runs: T[] = [];
  for (let i = 0; i < 3; i++) {
    runs.push(await run());
  }

  const allIdentical = runs.every((r) => compare(runs[0], r));
  if (allIdentical) {
    return { runs, identical: true };
  }

  const divergence = runs
    .map((r, i) => `Run ${i + 1}: ${JSON.stringify(r).slice(0, 200)}`)
    .join('\n');

  return {
    runs,
    identical: false,
    divergence: `AI-Variance erkannt für "${description}":\n${divergence}`,
  };
}

export async function expectStableExtraction<T>(
  description: string,
  run: () => Promise<T>,
  toleranceField?: keyof T
): Promise<T> {
  const result = await runThriceAndCompare(description, run, (a, b) => {
    if (toleranceField) {
      return a[toleranceField] === b[toleranceField];
    }
    return JSON.stringify(a) === JSON.stringify(b);
  });

  expect(
    result.identical,
    `AI-Variance: ${description}\n${result.divergence ?? ''}`
  ).toBe(true);

  return result.runs[0];
}
