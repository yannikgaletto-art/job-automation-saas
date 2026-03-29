/**
 * Unit tests for quote-matcher (offline — no Supabase call).
 * Mocks the supabase client to return fixture data.
 */

import { matchQuote, matchQuotes } from '../quote-matcher'

// ── Mock Supabase ─────────────────────────────────────────
const mockSelect = jest.fn()
const mockEq = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      from: (table: string) => {
        mockFrom(table)
        const chain = {
          select: (...args: unknown[]) => { mockSelect(...args); return chain },
          eq: (...args: unknown[]) => { mockEq(...args); return chain },
        } as Record<string, jest.Mock>
        // Resolve with fixture data on await
        chain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({
            data: FIXTURE_QUOTES,
            error: null,
          }).then(resolve)
        return chain
      },
    }),
}))

// ── Fixture data ─────────────────────────────────────────
const FIXTURE_QUOTES = [
  {
    id: 'q1',
    theme: 'Innovation & Leadership',
    person: 'Steve Jobs',
    quote_en: 'Innovation distinguishes between a leader and a follower.',
    quote_de: 'Innovation unterscheidet einen Anführer von einem Mitläufer.',
    context: 'The Innovation Secrets of Steve Jobs',
    role_keywords: ['Product Owner', 'Innovation Manager', 'Team Lead'],
  },
  {
    id: 'q2',
    theme: 'Lieferfähigkeit (Execution)',
    person: 'Linus Torvalds',
    quote_en: 'Talk is cheap. Show me the code.',
    quote_de: 'Reden ist billig. Zeig mir den Code.',
    context: 'Linux Kernel Mailingliste',
    role_keywords: ['Software Developer', 'DevOps Engineer', 'Backend Engineer'],
  },
]

// ── Tests ─────────────────────────────────────────────────
describe('matchQuote', () => {
  it('returns the best matching quote for a job title', async () => {
    const result = await matchQuote({ jobTitle: 'Product Owner Agile' })
    expect(result).not.toBeNull()
    expect(result?.source).toBe('pool')
    expect(result?.person).toBe('Steve Jobs')
  })

  it('returns null when no quotes match', async () => {
    // Override fixture to empty
    jest.mocked(mockFrom).mockImplementationOnce(() => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }))
    const result = await matchQuote({ jobTitle: 'Unknowable Role XYZ' })
    expect(result).toBeNull()
  })

  it('returns DE text when locale is de', async () => {
    const result = await matchQuote({ jobTitle: 'Product Owner', locale: 'de' })
    expect(result?.text).toContain('Mitläufer')
  })

  it('returns EN text when locale is en', async () => {
    const result = await matchQuote({ jobTitle: 'Product Owner', locale: 'en' })
    expect(result?.text).toContain('follower')
  })
})

describe('matchQuotes', () => {
  it('returns multiple matches up to limit', async () => {
    const results = await matchQuotes({ jobTitle: 'Developer Engineer', limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
    expect(results.every((r) => r.source === 'pool')).toBe(true)
  })
})
