import { parseCvTextToJson } from '../services/cv-parser';
import { complete } from '@/lib/ai/model-router';

jest.mock('@/lib/ai/model-router', () => ({
    complete: jest.fn()
}));

describe('cv-parser', () => {
    it('should parse valid JSON from Claude and return structured data', async () => {
        const mockResponse = {
            version: "1.0",
            personalInfo: {
                name: "John Doe",
                email: "john@example.com"
            },
            experience: [
                {
                    id: "exp-1",
                    company: "Tech Corp",
                    description: [{ id: "bullet-1", text: "Did things" }]
                }
            ],
            education: [],
            skills: [],
            languages: []
        };

        (complete as jest.Mock).mockResolvedValue({
            text: JSON.stringify(mockResponse),
            model: 'claude-3-haiku-20240307',
            tokensUsed: 100,
            costCents: 0,
            latencyMs: 100
        });

        const result = await parseCvTextToJson("raw text");
        expect(result.personalInfo.name).toBe("John Doe");
        expect(result.experience[0].id).toBe("exp-1");
        expect(result.experience[0].description[0].text).toBe("Did things");
    });
});
