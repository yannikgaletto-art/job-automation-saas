import { scanForFluff, buildLeanBlacklistSection, BLACKLIST_PATTERNS } from '../anti-fluff-blacklist';
import { validateCoverLetter } from '../cover-letter-validator';

describe('Anti-Fluff Blacklist', () => {

    describe('BLACKLIST_PATTERNS', () => {
        it('should contain at least 15 patterns', () => {
            expect(BLACKLIST_PATTERNS.length).toBeGreaterThanOrEqual(15);
        });

        it('should have valid category for each pattern', () => {
            const validCategories = ['cliche', 'ai_marker', 'passive', 'structure', 'source_leak'];
            BLACKLIST_PATTERNS.forEach(p => {
                expect(validCategories).toContain(p.category);
            });
        });
    });

    describe('scanForFluff', () => {
        it('should detect known fluff phrases', () => {
            const fluffyText = 'Ich bin überzeugt, dass ich ideal zu Ihrem Team passe und freue mich sehr darauf.';
            const result = scanForFluff(fluffyText);
            expect(result.found).toBe(true);
            expect(result.matches.length).toBeGreaterThanOrEqual(1);
        });

        it('should detect case-insensitive matches', () => {
            const text = 'HIERMIT BEWERBE ICH MICH auf die Stelle.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches[0].pattern.toLowerCase()).toBe('hiermit bewerbe ich mich');
        });

        it('should detect source leak phrases', () => {
            const text = 'Wie ich auf LinkedIn gefunden habe, suchen Sie einen Entwickler.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.category === 'source_leak')).toBe(true);
        });

        it('should detect multiple fluff patterns', () => {
            const text = 'Hiermit bewerbe ich mich mit großer Begeisterung. Meine Leidenschaft für Innovation treibt mich an.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.length).toBeGreaterThanOrEqual(3);
        });

        it('should detect humble-tone violations from the Fichtner storytelling regression', () => {
            const text = 'Was mich an Fichtner Management Consulting anzieht, ist die Aufrichtigkeit, mit der ihr Beratung betreibt.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern === 'Aufrichtigkeit, mit der')).toBe(true);
        });

        it('should detect generic kein/nicht-sondern contrast structures', () => {
            const text = 'Markteintrittsstrategien waren kein theoretisches Konstrukt, sondern tägliche Aufgabe.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern === 'kein/nicht X, sondern Y')).toBe(true);
        });

        it('should return found=false for clean text', () => {
            const cleanText = 'In meiner Rolle als Innovation Consultant bei Fraunhofer FOKUS habe ich ein Partnernetzwerk mit 15 Industrieunternehmen aufgebaut, das den Technologietransfer um 40% beschleunigte.';
            const result = scanForFluff(cleanText);
            expect(result.found).toBe(false);
            expect(result.matches).toHaveLength(0);
        });

        it('should handle empty text', () => {
            const result = scanForFluff('');
            expect(result.found).toBe(false);
            expect(result.matches).toHaveLength(0);
        });
    });

    describe('buildLeanBlacklistSection', () => {
        it('should return a non-empty string', () => {
            const section = buildLeanBlacklistSection();
            expect(section.length).toBeGreaterThan(100);
        });

        it('should contain VERBOTENE PHRASEN header', () => {
            const section = buildLeanBlacklistSection();
            expect(section).toContain('VERBOTENE PHRASEN');
        });

        it('should include the broad contrast structure as generation-time guidance', () => {
            const section = buildLeanBlacklistSection();
            expect(section).toContain('kein/nicht X, sondern Y');
        });
    });

    describe('validateCoverLetter', () => {
        it('should hard-fail generic contrast structures before judge handoff', () => {
            const text = [
                'Hallo zusammen,',
                '',
                'Beim Lesen eurer Ausschreibung bei Fichtner Management Consulting fiel mir ein Gedanke ein, den ich teilen möchte. Deshalb stelle ich mich kurz vor.',
                '',
                'Markteintrittsstrategien waren bei Fraunhofer FOKUS kein theoretisches Konstrukt, sondern tägliche Aufgabe. Ich entwickelte Go-to-Market-Ansätze für Deep-Tech-Themen und half Teams, Ideen in tragfähige Geschäftsmodelle zu übersetzen. Die Frage dahinter war immer: Wer braucht das wirklich; und warum jetzt?',
                '',
                'Bei Ingrano Solutions begleitete ich Entscheidungsträger bei KMU dabei, NIS-2 in operative Prozesse zu übersetzen. Dafür entwickelte ich Workflows, die Sicherheitsprozesse standardisierten und Entscheidungen greifbarer machten.',
                '',
                'Ich stehe in den nächsten Wochen flexibel für ein Gespräch bei Fichtner Management Consulting zur Verfügung.',
                '',
                'Viele Grüße',
                'Yannik'
            ].join('\n');

            const result = validateCoverLetter(text, 'Fichtner Management Consulting');
            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('kein/nicht X, sondern Y'))).toBe(true);
        });
    });
});
