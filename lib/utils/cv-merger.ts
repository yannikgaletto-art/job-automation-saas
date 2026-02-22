import { CvStructuredData, CvChange, UserDecisions } from '@/types/cv';

/**
 * Apply accepted AI optimizations to the base CV data.
 * Changes are matched by entity ID (not array index) for stability.
 */
export function applyOptimizations(
    baseData: CvStructuredData,
    decisions: UserDecisions
): CvStructuredData {
    const result: CvStructuredData = JSON.parse(JSON.stringify(baseData));
    const accepted = (decisions.appliedChanges || []).filter(
        (c) => decisions.choices[c.id] === 'accepted'
    );

    for (const change of accepted) {
        if (!change || !change.target) continue;
        const { section, entityId, field, bulletId } = change.target;
        if (!section) continue;

        // personalInfo is a flat object, not an array
        if (section === 'personalInfo') {
            if (field && change.after) {
                (result.personalInfo as any)[field] = change.after;
            }
            continue;
        }

        const sectionArray = (result as any)[section];
        if (!Array.isArray(sectionArray)) continue;

        if (change.type === 'add' && !entityId) {
            // Adding a new top-level entry (rare but possible)
            continue;
        }

        const entity = sectionArray.find((e: any) => e.id === entityId);
        if (!entity) continue;

        if (change.type === 'remove') {
            if (field === 'description' && bulletId && Array.isArray(entity.description)) {
                entity.description = entity.description.filter((b: any) => b.id !== bulletId);
            }
            continue;
        }

        if (!change.after) continue;

        // Modify or add
        if (field === 'description' && Array.isArray(entity.description)) {
            if (change.type === 'modify' && bulletId) {
                const bullet = entity.description.find((b: any) => b.id === bulletId);
                if (bullet) bullet.text = change.after;
            } else if (change.type === 'add') {
                entity.description.push({
                    id: `bullet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    text: change.after,
                });
            }
        } else if (section === 'skills' && field === 'items') {
            entity.items = change.after.split(',').map((s: string) => s.trim());
        } else if (field) {
            (entity as any)[field] = change.after;
        }
    }

    return result;
}

/**
 * Strip all TODO items from CV data before rendering.
 * Removes description bullets and summary strings that start with "TODO" (case-insensitive).
 */
export function stripTodoItems(data: CvStructuredData): CvStructuredData {
    const result: CvStructuredData = JSON.parse(JSON.stringify(data));
    const isTodo = (text: string | undefined | null): boolean =>
        typeof text === 'string' && text.trimStart().toLowerCase().startsWith('todo');

    // Clean personalInfo summary
    if (isTodo(result.personalInfo.summary)) {
        result.personalInfo.summary = '';
    }

    // Clean experience bullets and summaries
    for (const exp of result.experience) {
        if (isTodo(exp.summary)) exp.summary = '';
        if (Array.isArray(exp.description)) {
            exp.description = exp.description.filter((b) => !isTodo(b.text));
        }
    }

    // Clean education descriptions
    for (const edu of result.education) {
        if (isTodo(edu.description)) edu.description = '';
    }

    return result;
}
