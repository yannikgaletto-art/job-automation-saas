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

        it('regex patterns must set either regex or regexBuilder', () => {
            BLACKLIST_PATTERNS
                .filter(p => p.pattern.startsWith('[REGEX]'))
                .forEach(p => {
                    expect(p.regex || p.regexBuilder).toBeDefined();
                });
        });
    });

    describe('scanForFluff — substring patterns', () => {
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

    // ─── Phase 5 — Regex-Patterns (Regression-Fixtures aus Fichtner + HiSolutions) ──
    describe('scanForFluff — regex patterns (Phase 5)', () => {
        it('Bug B: catches "keine Tugend, sondern eine Bedingung" (Fichtner)', () => {
            const text = 'Authentizität war dabei keine Tugend, sondern eine Bedingung.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('nicht/kein X, sondern Y'))).toBe(true);
        });

        it('Bug B: catches "nicht den perfekten Plan zu liefern, sondern sicherzustellen" (Fichtner)', () => {
            const text = 'Vielleicht ist das die eigentliche Aufgabe: nicht den perfekten Plan zu liefern, sondern sicherzustellen, dass Strategie und Umsetzung passen.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('nicht/kein X, sondern Y'))).toBe(true);
        });

        it('Bug A: catches "besser trägt als jede Selbstbeschreibung" (Fichtner)', () => {
            const text = 'Ein Gedanke, der meine Perspektive auf Beratung besser trägt als jede Selbstbeschreibung.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('Komparativ-Selbstlob'))).toBe(true);
        });

        it('Bug D: catches "suche ich bei Fichtner" (Fichtner)', () => {
            const text = 'Genau diese Verbindung suche ich bei Fichtner Management Consulting als Consultant.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('ich-zentrierte Brücke'))).toBe(true);
        });

        it('Bug E: catches "laut einer Studie des BSI" (HiSolutions)', () => {
            const text = 'Laut einer Studie des BSI scheitern über 60 Prozent der Unternehmen im Krisenfall.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('halluzinierte Quelle'))).toBe(true);
        });

        it('Bug C: catches "HiSolutions AG; einem Unternehmen, das..." (Apposition)', () => {
            const text = 'Genau dieser Gedanke hat mich zu HiSolutions AG geführt; einem Unternehmen, das Security Management Systeme als partnerschaftliche Beratungsleistung begreift.';
            const result = scanForFluff(text, 'HiSolutions AG');
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('Definitions-Apposition'))).toBe(true);
        });

        it('Bug C: apposition regex works when DB stores legal-suffix but text omits it', () => {
            // DB may have "HiSolutions AG" but text uses only "HiSolutions" — strip-suffix logic should still fire.
            const text = 'Ich wende mich an HiSolutions, einer Firma, die Security anbietet.';
            const result = scanForFluff(text, 'HiSolutions AG');
            expect(result.matches.some(m => m.pattern.includes('Definitions-Apposition'))).toBe(true);
        });

        it('apposition regex is safe when companyName is undefined', () => {
            const text = 'HiSolutions AG; einem Unternehmen, das Security anbietet.';
            const result = scanForFluff(text);
            // Without companyName, apposition regex must NOT fire (regexBuilder needs it)
            expect(result.matches.some(m => m.pattern.includes('Definitions-Apposition'))).toBe(false);
        });

        it('no false positives on legitimate text with "bei" (e.g. "Erfahrung bei Fraunhofer")', () => {
            const text = 'Meine Erfahrung bei Fraunhofer war prägend. Die Zeit dort hat mich geformt.';
            const result = scanForFluff(text);
            // Must not trigger "suche ich bei" — that regex requires "suche|finde|erwarte|erhoffe"
            expect(result.matches.some(m => m.pattern.includes('ich-zentrierte Brücke'))).toBe(false);
        });

        it('no false positives on legitimate "mehr als 3 Jahre" phrasing', () => {
            // Note: the regex targets comparative self-praise "besser als jede/alle/viele/..."
            // It should NOT match neutral duration phrases like "mehr als 3 Jahre".
            const text = 'Ich arbeite seit mehr als drei Jahren im Consulting.';
            const result = scanForFluff(text);
            expect(result.matches.some(m => m.pattern.includes('Komparativ-Selbstlob'))).toBe(false);
        });

        // ─── Phase 5.1 (Porsche/Buena QA Findings) ─────────────────────────
        it('Porsche Bug: catches "Drucker meinte damit" (Allwissend über Autor)', () => {
            const text = 'Drucker meinte damit, dass selbst die präziseste Organisationsarchitektur verpufft.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('meinte damit'))).toBe(true);
        });

        it('Porsche Bug: catches 3rd-person "auf der Website von Porsche Consulting"', () => {
            const text = 'Als ich auf der Website von Porsche Consulting vom Smart-Factory-Projekt las, fragte ich mich...';
            const result = scanForFluff(text, 'Porsche Consulting');
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('3rd-Person'))).toBe(true);
        });

        it('3rd-person regex safe without companyName', () => {
            const text = 'Als ich auf der Website von Porsche Consulting las...';
            const result = scanForFluff(text);
            expect(result.matches.some(m => m.pattern.includes('3rd-Person'))).toBe(false);
        });

        it('3rd-person regex does NOT match legitimate 2nd-person "auf Ihrer Website"', () => {
            const text = 'Als ich auf Ihrer Website vom Smart-Factory-Projekt las...';
            const result = scanForFluff(text, 'Porsche Consulting');
            expect(result.matches.some(m => m.pattern.includes('3rd-Person'))).toBe(false);
        });

        it('"meinte damit" regex does NOT match legitimate "Ich denke, Drucker deutete damit an"', () => {
            const text = 'Ich denke, Drucker deutete damit an, dass Kultur entscheidend ist.';
            const result = scanForFluff(text);
            expect(result.matches.some(m => m.pattern.includes('meinte damit'))).toBe(false);
        });

        // ─── Phase 5.2 (Atruvia QA Findings) ─────────────────────────────
        it('Atruvia Bug: catches "war mir sofort klar"', () => {
            const text = 'Als ich Ihre Website las, war mir sofort klar, warum die Stelle relevant ist.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('Sofort-Einsicht'))).toBe(true);
        });

        it('Atruvia Bug: catches "war mir schnell klar" variant', () => {
            const text = 'Beim Lesen war mir schnell klar, dass ich hier passen würde.';
            const result = scanForFluff(text);
            expect(result.matches.some(m => m.pattern.includes('Sofort-Einsicht'))).toBe(true);
        });

        it('Sofort-Einsicht regex does NOT match legitimate "wurde mir klar, dass" (phase 4 fluff, separate rule)', () => {
            // This one IS caught by a different rule ("wurde mir klar"), but NOT by Phase 5.2 regex.
            const text = 'Dabei wurde mir klar, dass Stakeholder früh eingebunden werden müssen.';
            const result = scanForFluff(text);
            // Should be caught by the legacy "wurde mir klar" substring pattern, NOT the new regex.
            expect(result.matches.some(m => m.pattern.includes('Sofort-Einsicht'))).toBe(false);
        });

        it('Atruvia Bug: catches anthropomorphic "Fraunhofer hat mich gelehrt"', () => {
            const text = 'Fraunhofer hat mich gelehrt, dass Anforderungserhebung eine eigene Kunst ist.';
            const result = scanForFluff(text, 'Atruvia AG');
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('anthropomorphe'))).toBe(true);
        });

        it('anthropomorphic regex does NOT match legitimate "Bei Fraunhofer habe ich gelernt"', () => {
            const text = 'Bei Fraunhofer habe ich gelernt, dass Stakeholder-Dynamiken entscheidend sind.';
            const result = scanForFluff(text, 'Atruvia AG');
            expect(result.matches.some(m => m.pattern.includes('anthropomorphe'))).toBe(false);
        });

        // ─── Phase 5.3 (Atruvia DNA-ON Findings) ─────────────────────────
        it('Atruvia DNA-ON Bug: catches "kein Versprechen, sondern tägliche Arbeit" (real leak)', () => {
            // This was the ACTUAL pattern that slipped through the sync-loop because
            // Judge-PASS broke before scanForFluff could inject feedback. Phase 5.3 makes
            // scanForFluff a break-blocker, AND the regex is verified here.
            const text = 'Transformation ist bei Atruvia AG kein Versprechen, sondern tägliche Arbeit an konkreten Zielbildern für Banken.';
            const result = scanForFluff(text, 'Atruvia AG');
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('nicht/kein X, sondern Y'))).toBe(true);
        });

        it('Phase 5.3: catches "auf ihrem Weg in die digitale Zukunft"', () => {
            const text = 'Ich freue mich darauf, Banken auf ihrem Weg in die digitale Zukunft zu begleiten.';
            const result = scanForFluff(text);
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('Chat-Floskel'))).toBe(true);
        });

        it('Phase 5.3: catches "in die digitale Zukunft" as standalone floskel', () => {
            const text = 'Gemeinsam gestalten wir den Übergang in die digitale Zukunft.';
            const result = scanForFluff(text);
            expect(result.matches.some(m => m.pattern.includes('Chat-Floskel'))).toBe(true);
        });

        it('Phase 5.3: catches "ist bei [Firma]" Allwissens-Definition', () => {
            const text = 'Transformation ist bei Atruvia AG eine tägliche Aufgabe.';
            const result = scanForFluff(text, 'Atruvia AG');
            expect(result.found).toBe(true);
            expect(result.matches.some(m => m.pattern.includes('Allwissens-Definition'))).toBe(true);
        });

        it('Phase 5.3: Allwissens-Definition regex safe without companyName', () => {
            const text = 'Transformation ist bei Atruvia AG eine tägliche Aufgabe.';
            const result = scanForFluff(text);
            expect(result.matches.some(m => m.pattern.includes('Allwissens-Definition'))).toBe(false);
        });

        it('Phase 5.3: Chat-Floskel regex does NOT match legitimate "auf meinem Weg"', () => {
            const text = 'Auf meinem bisherigen Weg habe ich viel über Transformation gelernt.';
            const result = scanForFluff(text);
            expect(result.matches.some(m => m.pattern.includes('Chat-Floskel'))).toBe(false);
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

        it('should not expose regex-label patterns to the prompt', () => {
            const section = buildBlacklistPromptSection();
            // Regex-label patterns (starting with "[REGEX]") are internal only — never shown to Claude.
            BLACKLIST_PATTERNS
                .filter(p => p.pattern.startsWith('[REGEX]'))
                .forEach(p => {
                    expect(section).not.toContain(p.pattern);
                });
        });
    });
});
