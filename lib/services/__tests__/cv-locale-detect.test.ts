import { detectCvLocale } from '../cv-locale-detect';
import type { CvStructuredData } from '@/types/cv';

function makeCv(overrides: Partial<CvStructuredData>): CvStructuredData {
    return {
        version: '1.0',
        personalInfo: {},
        experience: [],
        education: [],
        skills: [],
        languages: [],
        certifications: [],
        ...overrides,
    };
}

describe('detectCvLocale', () => {
    it('returns "de" for a German CV', () => {
        const cv = makeCv({
            personalInfo: { summary: 'Innovation Manager mit Erfahrung in der Beratung und Entwicklung digitaler Produkte für Konzerne.' },
            experience: [{
                id: 'e1',
                role: 'Sales & Business Development Manager',
                company: 'Ingrano Solutions',
                description: [
                    { id: 'b1', text: 'Geleitet ein Team von fünf Beratern bei der Umsetzung neuer Vertriebsprozesse.' },
                    { id: 'b2', text: 'Verantwortlich für die Entwicklung und den Aufbau einer neuen Kundenpipeline.' },
                ],
            }],
        });
        expect(detectCvLocale(cv)).toBe('de');
    });

    it('returns "en" for an English CV', () => {
        const cv = makeCv({
            personalInfo: { summary: 'Innovation manager with experience leading consulting and digital product development for enterprise clients.' },
            experience: [{
                id: 'e1',
                role: 'Senior Manager',
                company: 'Acme Corp',
                description: [
                    { id: 'b1', text: 'Led a team of five consultants delivering new sales processes for global accounts.' },
                    { id: 'b2', text: 'Responsible for the development and launch of a new customer pipeline.' },
                ],
            }],
        });
        expect(detectCvLocale(cv)).toBe('en');
    });

    it('returns "es" for a Spanish CV', () => {
        const cv = makeCv({
            personalInfo: { summary: 'Manager de innovación con experiencia en consultoría y desarrollo de productos digitales para empresas.' },
            experience: [{
                id: 'e1',
                role: 'Senior Manager',
                description: [
                    { id: 'b1', text: 'Dirigí un equipo de cinco consultores responsable de la implementación de nuevos procesos de venta.' },
                    { id: 'b2', text: 'Desarrollé y gestioné una nueva canalización de clientes para la empresa.' },
                ],
            }],
        });
        expect(detectCvLocale(cv)).toBe('es');
    });

    it('returns "unknown" for an empty CV', () => {
        expect(detectCvLocale(makeCv({}))).toBe('unknown');
    });

    it('returns "unknown" when only proper nouns are present (no language signal)', () => {
        const cv = makeCv({
            experience: [{
                id: 'e1',
                role: 'Manager',
                company: 'Acme',
                description: [{ id: 'b1', text: 'Salesforce Excel Python Tableau' }],
            }],
        });
        expect(detectCvLocale(cv)).toBe('unknown');
    });

    it('returns "unknown" for ambiguous mix without clear majority', () => {
        const cv = makeCv({
            experience: [{
                id: 'e1',
                role: 'Manager',
                description: [
                    { id: 'b1', text: 'Led the and for' },
                    { id: 'b2', text: 'Geleitet das und für' },
                ],
            }],
        });
        // EN=4, DE=4 → tie → not 1.5× → 'unknown'
        expect(detectCvLocale(cv)).toBe('unknown');
    });

    it('returns the dominant language when one side clearly wins', () => {
        const cv = makeCv({
            experience: [{
                id: 'e1',
                role: 'Manager',
                description: [
                    { id: 'b1', text: 'Led the team and delivered for clients with new processes' },
                    { id: 'b2', text: 'Geleitet das Team' },
                ],
            }],
        });
        // EN clearly dominates by token count
        expect(detectCvLocale(cv)).toBe('en');
    });
});
