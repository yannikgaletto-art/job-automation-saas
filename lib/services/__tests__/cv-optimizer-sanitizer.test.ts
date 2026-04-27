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
    isProtectedEntityAdd,
    isMissingSection,
    sanitizeOptimizerChanges,
    sanitizeBeforeText,
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

// ──────────────────────────────────────────────────────────────────────
// Phase 8 (2026-04-27) — isProtectedEntityAdd
// Yannik's Avenga optimizer output had a hallucinated "KI-GTM-Beratung"
// experience entry that was nowhere in the source CV. The LLM emitted an
// `add` change targeting experience section without an entityId — i.e.
// proposing a NEW work station from training data. That must be dropped.
// ──────────────────────────────────────────────────────────────────────

describe('isProtectedEntityAdd — Phase 8 hallucinated work station guard', () => {
    test('REGRESSION: flags add-experience without entityId (KI-GTM-Beratung)', () => {
        const change = {
            id: 'bad-1',
            type: 'add',
            target: { section: 'experience', entityId: null, field: null, bulletId: null },
            after: 'KI-GTM-Beratung at Fraunhofer, 11.2023 - 09.2025',
        };
        expect(isProtectedEntityAdd(change)).toBe(true);
    });

    test('flags add-education without entityId (hallucinated degree)', () => {
        const change = {
            id: 'bad-1',
            type: 'add',
            target: { section: 'education', entityId: null, field: null, bulletId: null },
            after: 'PhD at Stanford',
        };
        expect(isProtectedEntityAdd(change)).toBe(true);
    });

    test('does NOT flag bullet-level add to existing experience entry', () => {
        const change = {
            id: 'good-1',
            type: 'add',
            target: { section: 'experience', entityId: 'exp-1', field: 'description', bulletId: null },
            after: 'New achievement bullet',
        };
        expect(isProtectedEntityAdd(change)).toBe(false);
    });

    test('does NOT flag bullet-level add with bulletId', () => {
        const change = {
            id: 'good-1',
            type: 'add',
            target: { section: 'experience', entityId: 'exp-1', field: 'description', bulletId: 'b-new' },
            after: 'New bullet',
        };
        expect(isProtectedEntityAdd(change)).toBe(false);
    });

    test('does NOT flag add to skills section (skills can grow)', () => {
        const change = {
            id: 'good-1',
            type: 'add',
            target: { section: 'skills', entityId: null, field: null, bulletId: null },
            after: 'New skill category',
        };
        expect(isProtectedEntityAdd(change)).toBe(false);
    });

    test('does NOT flag add to certifications (certs can be added)', () => {
        const change = {
            id: 'good-1',
            type: 'add',
            target: { section: 'certifications', entityId: null, field: null, bulletId: null },
            after: 'New cert',
        };
        expect(isProtectedEntityAdd(change)).toBe(false);
    });

    test('does NOT flag modify-type changes', () => {
        const change = {
            id: 'c-1',
            type: 'modify',
            target: { section: 'experience', entityId: null, field: null, bulletId: null },
            after: 'whatever',
        };
        expect(isProtectedEntityAdd(change)).toBe(false);
    });

    test('does NOT flag remove-type changes', () => {
        const change = {
            id: 'c-1',
            type: 'remove',
            target: { section: 'experience', entityId: 'exp-1', field: null, bulletId: null },
        };
        expect(isProtectedEntityAdd(change)).toBe(false);
    });

    test('end-to-end: sanitizeOptimizerChanges drops the entity-add hallucination', () => {
        const changes = [
            {
                id: 'good-1', type: 'add',
                target: { section: 'experience', entityId: 'exp-1', field: 'description', bulletId: null },
                after: 'New bullet on existing entry',
            },
            {
                id: 'halluc-1', type: 'add',
                target: { section: 'experience', entityId: null, field: null, bulletId: null },
                after: 'Hallucinated whole new work station',
            },
        ];
        const result = sanitizeOptimizerChanges(changes);
        expect(result.kept.map(c => c.id)).toEqual(['good-1']);
        expect(result.dropped.map(d => d.reason)).toEqual(['protected_entity_add']);
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

// ──────────────────────────────────────────────────────────────────────
// Phase 7 — sanitizeBeforeText (2026-04-27)
// Bug: Optimizer dropped every personalInfo.summary ADD when the master CV
// had summary === null. LLM emits type='modify' for what is semantically a
// CREATE, the sanitizer treated empty before as a path-mismatch and dropped.
// Fix: empty existing personalInfo + non-empty proposal is treated as ADD.
// ──────────────────────────────────────────────────────────────────────

describe('sanitizeBeforeText — Phase 7 personalInfo empty-as-ADD', () => {
    const cvWithSummaryNull = {
        personalInfo: {
            name: 'Yannik Galetto',
            email: 'info@yannik-galetto.site',
            phone: '+49 1590...',
            summary: null,
            targetRole: null,
        },
        experience: [],
    };

    const cvWithSummary = {
        personalInfo: {
            name: 'Yannik Galetto',
            summary: 'Innovation Manager mit 5 Jahren Erfahrung.',
        },
        experience: [],
    };

    test('REGRESSION: summary modify with null master + non-empty after → upgraded to ADD', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'personalInfo', entityId: null, field: 'summary', bulletId: null },
            before: 'Was hier auch immer LLM behauptet',
            after: 'Innovation Manager mit Schwerpunkt auf KI-getriebener Transformation.',
        };
        const result = sanitizeBeforeText([change], cvWithSummaryNull);
        expect(result.failures).toEqual([]);
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].type).toBe('add');
        expect(result.verified[0].before).toBe('');
        expect(result.verified[0].after).toContain('Innovation Manager');
    });

    test('summary modify with non-empty master → keeps modify, restores real before', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'personalInfo', entityId: null, field: 'summary', bulletId: null },
            before: 'AI-hallucinated before',
            after: 'New summary',
        };
        const result = sanitizeBeforeText([change], cvWithSummary);
        expect(result.failures).toEqual([]);
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].type).toBe('modify');
        expect(result.verified[0].before).toBe('Innovation Manager mit 5 Jahren Erfahrung.');
    });

    test('summary modify with empty master AND empty after → dropped (true mismatch)', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'personalInfo', entityId: null, field: 'summary', bulletId: null },
            before: 'whatever',
            after: '',
        };
        const result = sanitizeBeforeText([change], cvWithSummaryNull);
        expect(result.verified).toHaveLength(0);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].path).toBe('personalInfo.summary');
        expect(result.failures[0].reason).toContain('empty or missing');
    });

    test('explicit add type passes through regardless of master state', () => {
        const change = {
            id: 'change-1',
            type: 'add',
            target: { section: 'personalInfo', entityId: null, field: 'summary', bulletId: null },
            before: '',
            after: 'New summary text',
        };
        const result = sanitizeBeforeText([change], cvWithSummaryNull);
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].type).toBe('add');
    });

    test('targetRole same fix path (other personalInfo field)', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'personalInfo', entityId: null, field: 'targetRole', bulletId: null },
            before: '',
            after: 'Senior Innovation Consultant',
        };
        const result = sanitizeBeforeText([change], cvWithSummaryNull);
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].type).toBe('add');
        expect(result.verified[0].after).toBe('Senior Innovation Consultant');
    });

    test('whitespace-only after on empty master → dropped (treated as empty)', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'personalInfo', entityId: null, field: 'summary', bulletId: null },
            before: '',
            after: '   \n\t  ',
        };
        const result = sanitizeBeforeText([change], cvWithSummaryNull);
        expect(result.verified).toHaveLength(0);
        expect(result.failures).toHaveLength(1);
    });
});

describe('sanitizeBeforeText — array sections (regression coverage)', () => {
    const cv = {
        personalInfo: { name: 'Y' },
        experience: [
            {
                id: 'exp-1',
                role: 'Innovation Manager',
                company: 'Ingrano',
                description: [
                    { id: 'b-1', text: 'Original bullet text' },
                    { id: 'b-2', text: 'Second bullet' },
                ],
            },
        ],
        education: [
            { id: 'edu-1', degree: 'B.A.', institution: 'Universität Potsdam', description: 'Some plain string' },
        ],
        skills: [{ id: 's-1', category: 'Technical', items: ['React', 'TypeScript'] }],
    };

    test('bullet-level lookup restores real before from id', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'experience', entityId: 'exp-1', field: 'description', bulletId: 'b-1' },
            before: 'AI-hallucinated',
            after: 'New bullet',
        };
        const result = sanitizeBeforeText([change], cv);
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].before).toBe('Original bullet text');
    });

    test('field-level lookup on education plain string', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'education', entityId: 'edu-1', field: 'description', bulletId: null },
            before: '',
            after: 'New description',
        };
        const result = sanitizeBeforeText([change], cv);
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].before).toBe('Some plain string');
    });

    test('skills items array gets joined for before-text', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'skills', entityId: 's-1', field: 'items', bulletId: null },
            before: '',
            after: 'React, TypeScript, Vue',
        };
        const result = sanitizeBeforeText([change], cv);
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].before).toBe('React, TypeScript');
    });

    test('non-existent entityId is dropped with diagnostic path', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'experience', entityId: 'exp-XYZ', field: 'description', bulletId: null },
            before: '',
            after: 'New',
        };
        const result = sanitizeBeforeText([change], cv);
        expect(result.verified).toHaveLength(0);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].reason).toBe('entityId not found');
        expect(result.failures[0].path).toBe('experience.exp-XYZ');
    });

    test('non-existent bulletId is dropped with diagnostic path', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'experience', entityId: 'exp-1', field: 'description', bulletId: 'b-99' },
            before: '',
            after: 'New',
        };
        const result = sanitizeBeforeText([change], cv);
        expect(result.verified).toHaveLength(0);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].reason).toBe('bulletId not found');
    });

    test('missing entityId on array section is dropped', () => {
        const change = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'experience', entityId: null, field: 'role', bulletId: null },
            before: '',
            after: 'New',
        };
        const result = sanitizeBeforeText([change], cv);
        expect(result.verified).toHaveLength(0);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].reason).toContain('entityId missing');
    });

    test('idempotent: running twice yields same shape (after first pass)', () => {
        const original = {
            id: 'change-1',
            type: 'modify',
            target: { section: 'personalInfo', entityId: null, field: 'summary', bulletId: null },
            before: 'whatever',
            after: 'New summary',
        };
        const cvNullSummary = { personalInfo: { summary: null }, experience: [] };
        const r1 = sanitizeBeforeText([{ ...original, target: { ...original.target } }], cvNullSummary);
        const r2 = sanitizeBeforeText([{ ...r1.verified[0], target: { ...r1.verified[0].target } }], cvNullSummary);
        expect(r2.verified).toHaveLength(1);
        expect(r2.verified[0].type).toBe('add'); // already 'add', stays 'add'
        expect(r2.verified[0].before).toBe('');
    });

    test('empty change array yields empty result, no errors', () => {
        const result = sanitizeBeforeText([], cv);
        expect(result.verified).toEqual([]);
        expect(result.failures).toEqual([]);
    });

    test('add-type with array section just passes through (no before-lookup)', () => {
        const change = {
            id: 'change-1',
            type: 'add',
            target: { section: 'experience', entityId: 'exp-1', field: 'description', bulletId: null },
            before: '',
            after: 'New bullet',
        };
        const result = sanitizeBeforeText([change], cv);
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].type).toBe('add');
    });
});
