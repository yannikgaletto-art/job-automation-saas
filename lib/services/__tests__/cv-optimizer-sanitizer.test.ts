/**
 * Tests for cv-optimizer-sanitizer — Identity-Lock for AI-emitted CV optimizer changes.
 *
 * Created: 2026-04-25 (CV Preview Phase 2)
 * Bug: AI optimizer was rewriting "Innovation Manager" → "Sales & Business Development"
 *      and removing the "Projektleitung" role from Medieninnovationszentrum.
 * Fix: Server-side sanitizer drops ANY change that targets identity fields (role,
 *      company, institution, dates, PII), regardless of what the AI prompted.
 */

import {
    FORBIDDEN_FIELDS,
    isIdentityFieldChange,
    isProtectedEntityRemove,
    isMissingSection,
    sanitizeOptimizerChanges,
} from '../cv-optimizer-sanitizer';

const baseChange = (overrides: Partial<{
    id: string; type: string;
    section: string; entityId: string | null; field: string | null; bulletId: string | null;
    after: string; before: string;
}> = {}) => ({
    id: 'id' in overrides ? overrides.id! : 'c-1',
    type: 'type' in overrides ? overrides.type! : 'modify',
    target: {
        // Use 'in' check so explicit `null` is honored (vs. `??` which would fall through)
        section: 'section' in overrides ? overrides.section! : 'experience',
        entityId: 'entityId' in overrides ? overrides.entityId! : 'exp-1',
        field: 'field' in overrides ? overrides.field! : 'description',
        bulletId: 'bulletId' in overrides ? overrides.bulletId! : 'b-1',
    },
    after: 'after' in overrides ? overrides.after! : 'Some content',
    before: 'before' in overrides ? overrides.before! : 'Old content',
});

describe('FORBIDDEN_FIELDS — completeness contract', () => {
    test('contains all experience-identity fields', () => {
        ['role', 'company', 'dateRangeText', 'location'].forEach(f => {
            expect(FORBIDDEN_FIELDS.has(f)).toBe(true);
        });
    });

    test('contains all education-identity fields', () => {
        ['institution', 'degree', 'grade'].forEach(f => {
            expect(FORBIDDEN_FIELDS.has(f)).toBe(true);
        });
    });

    test('contains all PII fields', () => {
        ['name', 'email', 'phone', 'linkedin', 'website'].forEach(f => {
            expect(FORBIDDEN_FIELDS.has(f)).toBe(true);
        });
    });

    test('does NOT contain editable content fields', () => {
        ['description', 'summary', 'category', 'items', 'targetRole'].forEach(f => {
            expect(FORBIDDEN_FIELDS.has(f)).toBe(false);
        });
    });
});

describe('isIdentityFieldChange — primary regression case', () => {
    test('flags AI-rewriting "role" field (the Innovation-Manager-bug)', () => {
        const change = baseChange({
            section: 'experience',
            field: 'role',
            after: 'Sales & Business Development',
            before: 'Innovation Manager',
        });
        expect(isIdentityFieldChange(change)).toBe(true);
    });

    test('flags AI-rewriting "company" field', () => {
        const change = baseChange({ field: 'company', after: 'Acme Corp' });
        expect(isIdentityFieldChange(change)).toBe(true);
    });

    test('flags AI-rewriting "degree" field', () => {
        const change = baseChange({ section: 'education', field: 'degree' });
        expect(isIdentityFieldChange(change)).toBe(true);
    });

    test('flags AI-rewriting "institution" field', () => {
        const change = baseChange({ section: 'education', field: 'institution' });
        expect(isIdentityFieldChange(change)).toBe(true);
    });

    test('flags AI-rewriting "grade" field', () => {
        const change = baseChange({ section: 'education', field: 'grade' });
        expect(isIdentityFieldChange(change)).toBe(true);
    });

    test('flags AI-rewriting "name"/"email" PII fields', () => {
        expect(isIdentityFieldChange(baseChange({ section: 'personalInfo', field: 'name' }))).toBe(true);
        expect(isIdentityFieldChange(baseChange({ section: 'personalInfo', field: 'email' }))).toBe(true);
    });

    test('does NOT flag legitimate bullet edits (description)', () => {
        const change = baseChange({ field: 'description', bulletId: 'b-1' });
        expect(isIdentityFieldChange(change)).toBe(false);
    });

    test('does NOT flag summary edits', () => {
        expect(isIdentityFieldChange(baseChange({ section: 'personalInfo', field: 'summary' }))).toBe(false);
    });

    test('does NOT flag skills.items edits', () => {
        expect(isIdentityFieldChange(baseChange({ section: 'skills', field: 'items' }))).toBe(false);
    });

    test('does NOT flag skills.category edits (translator/optimizer can reorder)', () => {
        expect(isIdentityFieldChange(baseChange({ section: 'skills', field: 'category' }))).toBe(false);
    });
});

describe('isProtectedEntityRemove — protect work history from AI deletion', () => {
    test('flags experience entity-level remove (the Medieninnovationszentrum-bug)', () => {
        const change = baseChange({
            type: 'remove',
            section: 'experience',
            entityId: 'exp-mediainnozentrum',
            field: null,
            bulletId: null,
        });
        expect(isProtectedEntityRemove(change)).toBe(true);
    });

    test('flags education entity-level remove', () => {
        const change = baseChange({
            type: 'remove',
            section: 'education',
            entityId: 'edu-1',
            field: null,
            bulletId: null,
        });
        expect(isProtectedEntityRemove(change)).toBe(true);
    });

    test('does NOT flag bullet-level remove (legitimate "drop weak bullet")', () => {
        const change = baseChange({
            type: 'remove',
            section: 'experience',
            entityId: 'exp-1',
            field: 'description',
            bulletId: 'b-3',
        });
        expect(isProtectedEntityRemove(change)).toBe(false);
    });

    test('does NOT flag remove on non-protected sections (e.g. certifications, skills)', () => {
        // Removing an old cert is a normal optimization (the AI is allowed to drop irrelevant certs).
        expect(isProtectedEntityRemove(baseChange({
            type: 'remove',
            section: 'certifications',
            entityId: 'cert-old',
            field: null,
            bulletId: null,
        }))).toBe(false);

        expect(isProtectedEntityRemove(baseChange({
            type: 'remove',
            section: 'skills',
            entityId: 'skill-old',
            field: null,
            bulletId: null,
        }))).toBe(false);
    });

    test('does NOT flag modify-type changes', () => {
        expect(isProtectedEntityRemove(baseChange({ type: 'modify' }))).toBe(false);
    });
});

describe('isMissingSection', () => {
    test('flags change with no target.section', () => {
        const change = { id: 'c-1', type: 'modify', target: {} };
        expect(isMissingSection(change)).toBe(true);
    });

    test('flags change with no target at all', () => {
        const change = { id: 'c-1', type: 'modify' } as any;
        expect(isMissingSection(change)).toBe(true);
    });

    test('does NOT flag valid change', () => {
        expect(isMissingSection(baseChange())).toBe(false);
    });
});

describe('sanitizeOptimizerChanges — end-to-end triage', () => {
    test('keeps legitimate bullet edit, drops the role-rewrite', () => {
        const changes = [
            baseChange({ id: 'good-1', section: 'experience', field: 'description', bulletId: 'b-1' }),
            baseChange({
                id: 'bad-role', section: 'experience', field: 'role',
                after: 'Sales & Business Development', before: 'Innovation Manager',
            }),
        ];

        const result = sanitizeOptimizerChanges(changes);
        expect(result.kept.map(c => c.id)).toEqual(['good-1']);
        expect(result.dropped).toHaveLength(1);
        expect(result.dropped[0].reason).toBe('identity_field');
        expect(result.dropped[0].change.id).toBe('bad-role');
    });

    test('drops missing-section AND identity-field AND entity-remove in one pass', () => {
        const changes = [
            { id: 'no-section', type: 'modify', target: { field: 'description' } } as any,
            baseChange({ id: 'role-bad', field: 'role' }),
            baseChange({
                id: 'entity-remove-bad',
                type: 'remove',
                section: 'experience',
                entityId: 'exp-1',
                field: null,
                bulletId: null,
            }),
            baseChange({ id: 'good', field: 'description', bulletId: 'b-2' }),
        ];

        const result = sanitizeOptimizerChanges(changes);
        expect(result.kept.map(c => c.id)).toEqual(['good']);
        expect(result.dropped).toHaveLength(3);
        expect(result.dropped.map(d => d.reason).sort()).toEqual([
            'identity_field',
            'missing_section',
            'protected_entity_remove',
        ]);
    });

    test('keeps all changes when none target identity fields', () => {
        const changes = [
            baseChange({ id: 'b-1', field: 'description', bulletId: 'b-1' }),
            baseChange({ id: 'b-2', section: 'personalInfo', field: 'summary', bulletId: null, entityId: null }),
            baseChange({ id: 'b-3', section: 'skills', field: 'items', entityId: 'skill-1', bulletId: null }),
            baseChange({ id: 'b-4', section: 'certifications', field: 'description', entityId: 'cert-1', bulletId: null }),
        ];
        const result = sanitizeOptimizerChanges(changes);
        expect(result.kept).toHaveLength(4);
        expect(result.dropped).toHaveLength(0);
    });

    test('empty input returns empty arrays', () => {
        const result = sanitizeOptimizerChanges([]);
        expect(result.kept).toEqual([]);
        expect(result.dropped).toEqual([]);
    });

    test('preserves change order in kept array (deterministic)', () => {
        const changes = [
            baseChange({ id: 'a' }),
            baseChange({ id: 'b' }),
            baseChange({ id: 'c' }),
        ];
        const result = sanitizeOptimizerChanges(changes);
        expect(result.kept.map(c => c.id)).toEqual(['a', 'b', 'c']);
    });
});
