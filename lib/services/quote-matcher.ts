/**
 * quote-matcher.ts
 * ─────────────────────────────────────────────────────────
 * PRIMARY quote selection from the curated quote_pool table.
 * FALLBACK: returns null → caller decides (AI generation or skip).
 *
 * Usage in cover-letter pipeline:
 *   const quote = await matchQuote({ jobTitle, theme, locale })
 *   if (!quote) { /* use AI fallback * / }
 */

import { createClient } from '@/lib/supabase/server'

export interface QuoteMatch {
  id: string
  theme: string
  person: string
  quote_en: string
  quote_de: string
  context: string | null
  role_keywords: string[]
  /** 'pool' = curated table, 'ai' = AI-generated fallback */
  source: 'pool' | 'ai'
  /** Locale-resolved quote text ready to inject */
  text: string
}

export interface MatchQuoteOptions {
  /** Job title from job_queue — used for keyword matching */
  jobTitle: string
  /** Optional: explicit theme override (e.g. from company research) */
  theme?: string
  /** Locale for quote text selection ('de' | 'en' | 'es') */
  locale?: string
  /** How many candidates to return (default: 3) */
  limit?: number
}

/**
 * Returns up to `limit` curated quotes ranked by keyword overlap
 * with the given jobTitle (and optional theme).
 *
 * Returns empty array if no quotes match (→ trigger AI fallback).
 */
export async function matchQuotes(
  options: MatchQuoteOptions
): Promise<QuoteMatch[]> {
  const { jobTitle, theme, locale = 'de', limit = 3 } = options
  const supabase = await createClient()

  // Build role keyword tokens from job title (lowercase, split on spaces/slashes)
  const titleTokens = jobTitle
    .toLowerCase()
    .split(/[\s/,()]+/)
    .filter((t) => t.length > 2)

  let query = supabase
    .from('quote_pool')
    .select('id, theme, person, quote_en, quote_de, context, role_keywords')
    .eq('is_active', true)

  // If theme is provided directly (e.g. from Perplexity company research), filter by it
  if (theme) {
    query = query.eq('theme', theme)
  }

  const { data, error } = await query

  if (error || !data || data.length === 0) {
    return []
  }

  // Score each quote by keyword overlap with jobTitle tokens
  const scored = data.map((row) => {
    const keywordsLower = row.role_keywords.map((k: string) => k.toLowerCase())
    const score = titleTokens.reduce((acc, token) => {
      const hit = keywordsLower.some((kw) => kw.includes(token) || token.includes(kw))
      return acc + (hit ? 1 : 0)
    }, 0)
    return { ...row, score }
  })

  // Sort by score desc, take top N
  const topMatches = scored
    .filter((r) => r.score > 0 || !!theme) // if theme given, include even score=0
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return topMatches.map((row) => ({
    id: row.id,
    theme: row.theme,
    person: row.person,
    quote_en: row.quote_en,
    quote_de: row.quote_de,
    context: row.context,
    role_keywords: row.role_keywords,
    source: 'pool' as const,
    text: locale === 'en' ? row.quote_en : row.quote_de,
  }))
}

/**
 * Convenience: get the single best match, or null (→ AI fallback).
 */
export async function matchQuote(
  options: MatchQuoteOptions
): Promise<QuoteMatch | null> {
  const results = await matchQuotes({ ...options, limit: 1 })
  return results[0] ?? null
}
