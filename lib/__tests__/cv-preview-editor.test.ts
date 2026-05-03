import { splitBulletLeadIn } from '@/lib/utils/cv-template-helpers';
import {
    addSkillGroup,
    addSkillItem,
    sanitizeCvPreviewDrafts,
    updateSkillCategory,
} from '@/lib/utils/cv-inline-editor-helpers';
import { CvStructuredData } from '@/types/cv';

function fixtureCv(): CvStructuredData {
    return {
        version: '1.0',
        personalInfo: { name: 'Anna Mueller' },
        experience: [
            {
                id: 'exp-1',
                role: 'Innovation Managerin',
                company: 'Pathly',
                description: [
                    { id: 'b-1', text: 'C-Level-Engagement & Geschaeftsentwicklung: Stakeholder synchronisiert' },
                    { id: 'b-2', text: '   ' },
                ],
            },
        ],
        education: [],
        skills: [
            {
                id: 'skills-1',
                category: 'Strategie',
                items: ['Go-to-Market', '  ', 'Stakeholder Management '],
            },
            {
                id: 'skills-empty',
                category: 'Leer',
                items: [''],
            },
        ],
        languages: [],
        certifications: [],
    };
}

describe('CV preview editor rendering helpers', () => {
    it('splits long but intentional bullet lead-ins before the colon', () => {
        expect(splitBulletLeadIn('C-Level-Engagement & Geschaeftsentwicklung: Stakeholder synchronisiert')).toEqual({
            leadIn: 'C-Level-Engagement & Geschaeftsentwicklung:',
            rest: ' Stakeholder synchronisiert',
        });
    });

    it('normalizes markdown-bold lead-ins so PDF bullets do not show stars', () => {
        expect(splitBulletLeadIn('**Regulatorik & KI-Transformation:** Roadmap gebaut')).toEqual({
            leadIn: 'Regulatorik & KI-Transformation:',
            rest: ' Roadmap gebaut',
        });
    });

    it('keeps plain bullets and very long colon clauses unstyled', () => {
        expect(splitBulletLeadIn('Stakeholder synchronisiert')).toBeNull();
        expect(splitBulletLeadIn('Ein sehr langer Satz ohne klare Lead-in-Struktur, der nur zufaellig spaeter einen Doppelpunkt hat: normal')).toBeNull();
    });

    it('adds skill groups and skill items without mutating the source CV', () => {
        const cv = fixtureCv();
        const withGroup = addSkillGroup(cv, () => 'skills-new');
        const withItem = addSkillItem(withGroup, 0);
        const renamed = updateSkillCategory(withItem, 2, 'Tools');

        expect(cv.skills).toHaveLength(2);
        expect(renamed.skills).toHaveLength(3);
        expect(renamed.skills[0].items).toEqual(['Go-to-Market', '  ', 'Stakeholder Management ', '']);
        expect(renamed.skills[2]).toMatchObject({
            id: 'skills-new',
            category: 'Tools',
            items: [''],
            displayMode: 'comma',
        });
    });

    it('sanitizes preview drafts before PDF preview and download', () => {
        const cv = fixtureCv();
        const sanitized = sanitizeCvPreviewDrafts(cv);

        expect(sanitized.experience[0].description).toEqual([
            { id: 'b-1', text: 'C-Level-Engagement & Geschaeftsentwicklung: Stakeholder synchronisiert' },
        ]);
        expect(sanitized.skills).toEqual([
            {
                id: 'skills-1',
                category: 'Strategie',
                items: ['Go-to-Market', 'Stakeholder Management'],
            },
        ]);
        expect(cv.skills[0].items).toEqual(['Go-to-Market', '  ', 'Stakeholder Management ']);
    });
});
