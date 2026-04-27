/**
 * PII Sanitizer Tests — DSGVO Phase 2
 * Pattern: matches lib/__tests__/db.test.ts style
 */

import { sanitizeForAI, buildContentHash } from '../pii-sanitizer';

// Test 1 — German name detection + restore
test('sanitizeForAI: detects German name and restores correctly', () => {
    const input = 'Ich bin Max Mustermann und bewerbe mich.';
    const { sanitized, restore, warningFlags } = sanitizeForAI(input);

    expect(sanitized).toContain('__NAME_0__');
    expect(sanitized).not.toContain('Max Mustermann');
    expect(warningFlags).toContain('NAME');
    expect(restore(sanitized)).toBe(input);
});

// Test 2 — Email detection
test('sanitizeForAI: detects email address', () => {
    const input = 'Erreichbar unter max@example.com jederzeit.';
    const { sanitized, warningFlags } = sanitizeForAI(input);

    expect(sanitized).toContain('__EMAIL_0__');
    expect(sanitized).not.toContain('max@example.com');
    expect(warningFlags).toContain('EMAIL');
});

// Test 3 — Phone number detection (11-digit German mobile)
test('sanitizeForAI: detects German phone number', () => {
    const input = 'Ruf mich an: +49 170 12345678 bitte.';
    const { sanitized, warningFlags } = sanitizeForAI(input);

    expect(sanitized).toContain('__PHONE_0__');
    expect(warningFlags).toContain('PHONE');
});

// Test 3b — Year ranges must NOT be tokenized as phone numbers
test('sanitizeForAI: year ranges are NOT false-positived as phone numbers', () => {
    const input = 'Ich habe von 2020-2023 bei ABC GmbH gearbeitet.';
    const { sanitized, warningFlags } = sanitizeForAI(input);

    expect(warningFlags).not.toContain('PHONE');
    // Year range must remain in the text
    expect(sanitized).toContain('2020-2023');
});


// Test 4 — Claude reformulation regression test
test('sanitizeForAI: restore works in Claude-reformulated context', () => {
    const input = 'Ich bin Max Mustermann und habe Erfahrung.';
    const { sanitized, restore } = sanitizeForAI(input);

    // Simulate Claude reformulating the sentence around the token
    const claudeOutput = `Die Bewerbung von ${sanitized.match(/__NAME_\d+__/)?.[0]} war überzeugend.`;
    const restored = restore(claudeOutput);

    expect(restored).toContain('Max Mustermann');
    expect(restored).not.toContain('__NAME_');
});

// Test 5 — Empty input
test('sanitizeForAI: handles empty input gracefully', () => {
    const { sanitized, warningFlags, restore } = sanitizeForAI('');

    expect(sanitized).toBe('');
    expect(warningFlags).toEqual([]);
    expect(restore('')).toBe('');
});

// Test 6 — False-positive guard (tech terms + city names)
test('sanitizeForAI: no false positives for tech terms and city names', () => {
    const input = 'JavaScript und TypeScript sind in Berlin sehr gefragt.';
    const { sanitized, warningFlags } = sanitizeForAI(input);

    expect(warningFlags).not.toContain('NAME');
    expect(sanitized).not.toContain('__NAME_');
    // Original text unchanged (no PII found)
    expect(sanitized).toBe(input);
});

// Bonus: buildContentHash produces consistent SHA256
test('buildContentHash: returns consistent SHA256 hex string', () => {
    const hash1 = buildContentHash('test text');
    const hash2 = buildContentHash('test text');
    const hashDiff = buildContentHash('different text');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiff);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA256 = 64 hex chars
});

// ═══════════════════════════════════════════════════════════════════
// REGRESSION TESTS — PII Hardening (2026-04-09)
// ═══════════════════════════════════════════════════════════════════

// Test 7 — Name at start of line (Satzanfang-Bug fix)
test('sanitizeForAI: detects name at start of line', () => {
    const input = 'Max Mustermann bewirbt sich auf die Stelle.';
    const { sanitized, warningFlags } = sanitizeForAI(input);

    expect(warningFlags).toContain('NAME');
    expect(sanitized).toContain('__NAME_0__');
    expect(sanitized).not.toContain('Max Mustermann');
});

// Test 7b — Name at start of multiline text
test('sanitizeForAI: detects name at start of text', () => {
    const input = 'Anna Schmidt\nBerlinstraße 42\n10115 Berlin';
    const { sanitized, warningFlags } = sanitizeForAI(input);

    expect(warningFlags).toContain('NAME');
    expect(sanitized).toContain('__NAME_0__');
    expect(sanitized).not.toContain('Anna Schmidt');
});

// Test 8 — Multiple PII types in a single text
test('sanitizeForAI: detects multiple PII types in one text', () => {
    const input = 'Ich bin Max Mustermann, erreichbar unter max@example.com oder +49 170 12345678.';
    const { sanitized, warningFlags, restore } = sanitizeForAI(input);

    expect(warningFlags).toContain('NAME');
    expect(warningFlags).toContain('EMAIL');
    expect(warningFlags).toContain('PHONE');
    expect(sanitized).not.toContain('Max Mustermann');
    expect(sanitized).not.toContain('max@example.com');
    // Restore roundtrip
    expect(restore(sanitized)).toBe(input);
});

// Test 9 — Multiple occurrences of the same name
test('sanitizeForAI: handles same name appearing multiple times', () => {
    const input = 'Max Mustermann hat Erfahrung. Kontakt: Max Mustermann.';
    const { sanitized } = sanitizeForAI(input);

    // Both occurrences should be tokenized (may have different indices)
    expect(sanitized).not.toContain('Max Mustermann');
});

// ═══════════════════════════════════════════════════════════════════
// PHASE 9 (2026-04-27) — User-reported "Berlin Familienstatus" bug
// Yannik's CV header: "Exxeta 04.08.1996 in Berlin   Familienstatus: ledig"
// Old behavior: NAME_REGEX matched "Berlin Familienstatus" as the FIRST
// person name → encryptedPii.name was passed downstream as the user's name
// → user_profiles.full_name = "Berlin   Familienstatus" → CV header showed
// "Berlin Familienstatus" instead of "Yannik Galetto".
// ═══════════════════════════════════════════════════════════════════

test('REGRESSION: "Berlin Familienstatus" must NOT be picked as a name', () => {
    const input = 'Exxeta 04.08.1996 in Berlin   Familienstatus: ledig\nYannik Galetto';
    const { sanitized, tokenMap } = sanitizeForAI(input);

    // Real name should be tokenised
    expect(sanitized).toContain('__NAME_');
    expect(sanitized).not.toContain('Yannik Galetto');

    // The first __NAME_ token MUST resolve to the real name, not the city+noun.
    const firstName = tokenMap.get('__NAME_0__');
    expect(firstName).not.toBe('Berlin Familienstatus');
    expect(firstName).not.toMatch(/^Berlin\s+/);
    expect(firstName).toBe('Yannik Galetto');
});

test('REGRESSION: "München Geburtstag" must NOT be picked as a name', () => {
    const input = 'In München Geburtstag: 04.08.1996\nMaria Schmidt';
    const { sanitized, tokenMap } = sanitizeForAI(input);

    const firstName = tokenMap.get('__NAME_0__');
    expect(firstName).not.toMatch(/^München\s+/);
    // Maria Schmidt should still be picked
    expect(sanitized).not.toContain('Maria Schmidt');
});

test('Cities followed by common nouns are rejected (Hamburg Anschrift)', () => {
    const input = 'Aus Hamburg Anschrift: Beispielstraße 1';
    const { sanitized, warningFlags, tokenMap } = sanitizeForAI(input);

    // Should NOT find a name in this input
    if (warningFlags.includes('NAME')) {
        const firstName = tokenMap.get('__NAME_0__');
        expect(firstName).not.toMatch(/^Hamburg\s+/);
    }
});

test('Real name BEFORE city still works (Petra Müller in Berlin)', () => {
    const input = 'Petra Müller wohnt in Berlin.';
    const { sanitized, tokenMap } = sanitizeForAI(input);

    expect(sanitized).toContain('__NAME_0__');
    expect(tokenMap.get('__NAME_0__')).toBe('Petra Müller');
});

test('Single-line city + common noun does not block a real name later', () => {
    // Yannik's actual extracted_text pattern (simplified)
    const input = `04.08.1996 in Berlin   Familienstatus: ledig
Borsigstraße 12   10115 Berlin
Yannik Galetto`;
    const { tokenMap, warningFlags } = sanitizeForAI(input);

    expect(warningFlags).toContain('NAME');
    // The first NAME should be Yannik Galetto, NOT "Berlin Familienstatus" or any other city pair
    const firstName = tokenMap.get('__NAME_0__');
    expect(firstName).toBe('Yannik Galetto');
});
