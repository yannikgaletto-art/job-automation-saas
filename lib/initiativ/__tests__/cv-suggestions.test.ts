import { extractProfessionalResultsFromCv } from '../cv-suggestions';
import type { CvStructuredData } from '@/types/cv';

function fixtureCv(): CvStructuredData {
    return {
        version: '1.0',
        personalInfo: { name: 'Test User' },
        experience: [
            {
                id: 'exp-1',
                role: 'PMO Lead',
                company: 'Acme GmbH',
                summary: 'Steuerte ein Transformationsprogramm mit 4 Workstreams und direkter C-Level-Abstimmung.',
                description: [
                    { id: 'b-1', text: 'Stakeholder-Kommunikation fuer 30 Beteiligte aufgebaut und woechentliche Entscheidungsrunden moderiert.' },
                    { id: 'b-2', text: 'Stakeholder-Kommunikation fuer 30 Beteiligte aufgebaut und woechentliche Entscheidungsrunden moderiert.' },
                    { id: 'b-3', text: '   ' },
                ],
            },
            {
                id: 'exp-2',
                role: 'Consultant',
                company: 'Beta AG',
                description: [
                    { id: 'b-4', text: 'Responsible for reporting' },
                    { id: 'b-5', text: 'Reporting-Prozess standardisiert und die Abstimmungszeit im Team reduziert.' },
                ],
            },
        ],
        education: [],
        skills: [],
        languages: [],
        certifications: [],
    };
}

describe('extractProfessionalResultsFromCv', () => {
    it('extracts useful recent CV summary and bullet suggestions', () => {
        const suggestions = extractProfessionalResultsFromCv(fixtureCv());

        expect(suggestions).toEqual([
            {
                id: 'cv-result-1',
                text: 'Steuerte ein Transformationsprogramm mit 4 Workstreams und direkter C-Level-Abstimmung.',
                source: 'PMO Lead · Acme GmbH',
            },
            {
                id: 'cv-result-2',
                text: 'Stakeholder-Kommunikation fuer 30 Beteiligte aufgebaut und woechentliche Entscheidungsrunden moderiert.',
                source: 'PMO Lead · Acme GmbH',
            },
            {
                id: 'cv-result-3',
                text: 'Reporting-Prozess standardisiert und die Abstimmungszeit im Team reduziert.',
                source: 'Consultant · Beta AG',
            },
        ]);
    });

    it('returns an empty list for missing CV data', () => {
        expect(extractProfessionalResultsFromCv(null)).toEqual([]);
    });
});
