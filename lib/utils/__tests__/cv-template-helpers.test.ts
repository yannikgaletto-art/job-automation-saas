/**
 * Tests for cv-template-helpers — focus on cleanGrade() (added 2026-04-25 for
 * the CV Preview Phase 2 fix: US-GPA conversions polluted DE-locale CVs).
 */

import { cleanGrade, normalizeDateRangeText } from '../cv-template-helpers';

describe('cleanGrade — strip US-GPA conversions', () => {
    test('strips "(approx. GPA 3.7)" suffix from German grade', () => {
        expect(cleanGrade('1.3 (approx. GPA 3.7)')).toBe('1.3');
    });

    test('strips "(GPA 3.7)" without "approx" prefix', () => {
        expect(cleanGrade('1,3 (GPA 3.7)')).toBe('1,3');
    });

    test('strips "(approximately GPA 3.7)" full word', () => {
        expect(cleanGrade('1.3 (approximately GPA 3.7)')).toBe('1.3');
    });

    test('handles case insensitivity', () => {
        expect(cleanGrade('1.3 (Approx. gpa 3.7)')).toBe('1.3');
    });

    test('preserves grades without GPA marker (Sehr gut)', () => {
        expect(cleanGrade('Sehr gut (1,3)')).toBe('Sehr gut (1,3)');
    });

    test('preserves clean numeric grade', () => {
        expect(cleanGrade('1.3')).toBe('1.3');
    });

    test('returns empty string for null/undefined/empty', () => {
        expect(cleanGrade(null)).toBe('');
        expect(cleanGrade(undefined)).toBe('');
        expect(cleanGrade('')).toBe('');
    });

    test('trims whitespace introduced by removal', () => {
        expect(cleanGrade('  1.3   (approx. GPA 3.7)   ')).toBe('1.3');
    });

    test('handles "(approximately 3.7 GPA)" reverse format', () => {
        // Pattern: "(approximately 3.7 GPA)" or "(approx. 3.7 GPA)"
        expect(cleanGrade('1.3 (approximately 3.7 GPA)')).toBe('1.3');
        expect(cleanGrade('1.3 (approx. 3.7 GPA)')).toBe('1.3');
    });

    test('does not strip German "Note" or other annotations', () => {
        // We only target GPA-related annotations
        expect(cleanGrade('1,3 (Note)')).toBe('1,3 (Note)');
    });
});

describe('normalizeDateRangeText — sanity check existing helper still works', () => {
    test('replaces "Heute" with English "Present"', () => {
        expect(normalizeDateRangeText('09.2025 - Heute', 'Present')).toBe('09.2025 - Present');
    });

    test('returns empty for null', () => {
        expect(normalizeDateRangeText(null, 'Present')).toBe('');
    });
});
