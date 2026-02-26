import { scanForFluff, BLACKLIST_PATTERNS, buildBlacklistPromptSection } from '../anti-fluff-blacklist';

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

    describe('buildBlacklistPromptSection', () => {
        it('should return a non-empty string', () => {
            const section = buildBlacklistPromptSection();
            expect(section.length).toBeGreaterThan(100);
        });

        it('should contain VERBOTENE PHRASEN header', () => {
            const section = buildBlacklistPromptSection();
            expect(section).toContain('VERBOTENE PHRASEN');
        });

        it('should include all patterns', () => {
            const section = buildBlacklistPromptSection();
            BLACKLIST_PATTERNS.forEach(p => {
                expect(section).toContain(p.pattern);
            });
        });
    });
});
