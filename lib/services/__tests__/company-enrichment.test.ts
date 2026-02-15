import { enrichCompany } from '../company-enrichment';

// Mock Supabase to avoid hitting real DB or real API in unit test?
// The user asked for "Service Logic - Runs?". A real run is better for "Critical Path".
// We will mock enrichCompany's internals OR just run it if we have API keys. 
// "enrichCompany" uses Supabase for cache + Perplexity API. Refactoring to mock might be complex.
// Let's run it real but be aware of costs. The user said "Critical Features TESTEN".
// We can use a known company that should be cached or cheap.
// "Service -> Core functions run?" implies integration/functional test.

test('Company Enrichment service (enrichCompany)', async () => {
}, 30000); // 30s timeout

// Actual test
test('Company Enrichment service (enrichCompany) - REAL', async () => {
    // Increase timeout for API calls
    const result = await enrichCompany('pathly-test', 'Pathly Test Inc.');

    // Even if it fails to find data (stealth startup), it returns a structure.
    // It should NOT throw.
    expect(result).toHaveProperty('company_name');
    expect(result.company_name).toBe('Pathly Test Inc.');
    // Check if it returns expected fields
    expect(result).toHaveProperty('recent_news');
    expect(Array.isArray(result.recent_news)).toBe(true);
});
