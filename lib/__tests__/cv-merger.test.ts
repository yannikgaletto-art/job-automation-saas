import { applyOptimizations, stripTodoItems } from '../utils/cv-merger';
import { CvStructuredData, UserDecisions } from '@/types/cv';

const baseCv: CvStructuredData = {
    version: '1.0',
    personalInfo: {
        name: 'Max Mustermann',
        email: 'max@test.de',
        phone: '+49 123',
        location: 'Berlin',
        summary: 'Experienced developer',
    },
    experience: [
        {
            id: 'exp-1',
            company: 'ACME Corp',
            role: 'Developer',
            dateRangeText: '2020-2023',
            description: [
                { id: 'b-1', text: 'Built APIs' },
                { id: 'b-2', text: 'Wrote tests' },
            ],
        },
    ],
    education: [
        {
            id: 'edu-1',
            institution: 'TU Berlin',
            degree: 'B.Sc. Informatik',
            dateRangeText: '2016-2020',
        },
    ],
    skills: [
        { id: 'sk-1', category: 'Languages', items: ['TypeScript', 'Python'] },
    ],
    languages: [
        { id: 'lang-1', language: 'Deutsch', proficiency: 'Muttersprachlich' },
    ],
};

describe('applyOptimizations', () => {
    it('applies an accepted modify change by entity + bullet ID', () => {
        const decisions: UserDecisions = {
            choices: { 'c-1': 'accepted' },
            appliedChanges: [
                {
                    id: 'c-1',
                    target: { section: 'experience', entityId: 'exp-1', field: 'description', bulletId: 'b-1' },
                    type: 'modify',
                    before: 'Built APIs',
                    after: 'Designed and built REST APIs serving 10k req/s',
                    reason: 'More specific',
                },
            ],
        };

        const result = applyOptimizations(baseCv, decisions);
        const bullet = result.experience[0].description.find((b) => b.id === 'b-1');
        expect(bullet?.text).toBe('Designed and built REST APIs serving 10k req/s');
    });

    it('skips rejected changes', () => {
        const decisions: UserDecisions = {
            choices: { 'c-1': 'rejected' },
            appliedChanges: [
                {
                    id: 'c-1',
                    target: { section: 'experience', entityId: 'exp-1', field: 'description', bulletId: 'b-1' },
                    type: 'modify',
                    before: 'Built APIs',
                    after: 'CHANGED TEXT',
                    reason: 'test',
                },
            ],
        };

        const result = applyOptimizations(baseCv, decisions);
        const bullet = result.experience[0].description.find((b) => b.id === 'b-1');
        expect(bullet?.text).toBe('Built APIs');
    });
});

describe('stripTodoItems', () => {
    it('removes bullets starting with TODO', () => {
        const data: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    ...baseCv.experience[0],
                    description: [
                        { id: 'b-1', text: 'Built APIs' },
                        { id: 'b-2', text: 'TODO: Ask user about Python experience' },
                        { id: 'b-3', text: '  todo check this later' },
                    ],
                },
            ],
        };

        const result = stripTodoItems(data);
        expect(result.experience[0].description).toHaveLength(1);
        expect(result.experience[0].description[0].text).toBe('Built APIs');
    });

    it('clears summary if it starts with TODO', () => {
        const data: CvStructuredData = {
            ...baseCv,
            personalInfo: { ...baseCv.personalInfo, summary: 'TODO: Write a proper summary' },
        };

        const result = stripTodoItems(data);
        expect(result.personalInfo.summary).toBe('');
    });
});
