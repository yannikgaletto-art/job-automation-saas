import { optimizeCV } from '../cv-optimizer';

// Mock dependencies
jest.mock('@/lib/ai/model-router', () => ({
    complete: jest.fn().mockResolvedValue({
        text: `Test Optimized CV
    
---METRICS---
ADDED_KEYWORDS: React, TypeScript
REORDERED_BULLETS: 5
QUANTIFICATIONS: 3
ATS_SCORE: 85
---END---`,
        model: 'claude-3-5-sonnet-latest',
        tokensUsed: 100,
        costCents: 10,
        latencyMs: 500
    })
}));

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({
        from: jest.fn(() => ({
            insert: jest.fn().mockResolvedValue({ error: null }),
            select: jest.fn().mockResolvedValue({ data: { metadata: { extracted_text: 'Test CV' } }, error: null }),
            update: jest.fn().mockResolvedValue({ error: null })
        }))
    }))
}));

describe('CV Optimizer Service', () => {
    const mockRequest = {
        userId: 'test-user',
        jobId: 'test-job',
        cvText: 'Original CV Content',
        jobTitle: 'Frontend Developer',
        jobRequirements: ['React', 'Node.js'],
        jobDescription: 'Looking for a dev'
    };

    it('should parse optimization result correctly', async () => {
        const result = await optimizeCV(mockRequest);

        expect(result.atsScore).toBe(85);
        expect(result.changesLog.added_keywords).toContain('React');
        expect(result.changesLog.reordered_bullets).toBe(5);
        expect(result.optimizedCV).toContain('Test Optimized CV');
    });
});
