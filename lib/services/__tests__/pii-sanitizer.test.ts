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
