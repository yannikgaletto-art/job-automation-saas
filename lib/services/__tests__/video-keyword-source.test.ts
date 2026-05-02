import { buildVideoKeywordList, constrainCategorizedVideoKeywords } from '../video-keyword-source';

describe('video-keyword-source', () => {
    it('builds video keywords through the central ATS cleaner', () => {
        const keywords = buildVideoKeywordList({
            ats_keywords: ['SAP S/4HANA', 'DSGVO', 'Teamfähigkeit'],
            buzzwords: ['SAP S/4HANA', 'Stakeholder Management'],
            hard_requirements: ['Sehr lange Anforderung mit vielen Worten die kein Keyword sein sollte'],
            description: 'Gesucht werden SAP S/4HANA, Stakeholder Management und Projektmanagement.',
        });

        expect(keywords).toEqual(['SAP S/4HANA', 'Stakeholder Management']);
    });

    it('caps keyword list to 18 items', () => {
        const source = Array.from({ length: 25 }, (_, index) => `Keyword ${index}`);
        const keywords = buildVideoKeywordList({
            buzzwords: source,
            description: 'Kurzer Text ohne bekannte Halluzinationsbegriffe.',
        });

        expect(keywords).toHaveLength(18);
    });

    it('constrains AI categories to the cleaned source keywords', () => {
        expect(constrainCategorizedVideoKeywords({
            mustHave: ['SAP S/4HANA', 'DSGVO'],
            niceToHave: ['Stakeholder Management'],
            companySpecific: ['Homeoffice'],
        }, ['SAP S/4HANA', 'Stakeholder Management'])).toEqual({
            mustHave: ['SAP S/4HANA'],
            niceToHave: ['Stakeholder Management'],
            companySpecific: [],
        });
    });
});
