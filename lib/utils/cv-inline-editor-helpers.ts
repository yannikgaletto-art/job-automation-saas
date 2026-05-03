import { CvStructuredData } from '@/types/cv';

type IdFactory = () => string;

function cloneCvData(data: CvStructuredData): CvStructuredData {
    return structuredClone(data);
}

export function updateSkillCategory(
    data: CvStructuredData,
    skillIdx: number,
    value: string,
): CvStructuredData {
    const updated = cloneCvData(data);
    if (!updated.skills[skillIdx]) return updated;
    updated.skills[skillIdx].category = value;
    return updated;
}

export function addSkillItem(
    data: CvStructuredData,
    skillIdx: number,
): CvStructuredData {
    const updated = cloneCvData(data);
    if (!updated.skills[skillIdx]) return updated;
    updated.skills[skillIdx].items.push('');
    return updated;
}

export function addSkillGroup(
    data: CvStructuredData,
    createId: IdFactory,
): CvStructuredData {
    const updated = cloneCvData(data);
    updated.skills.push({
        id: createId(),
        category: '',
        items: [''],
        displayMode: 'comma',
    });
    return updated;
}

export function sanitizeCvPreviewDrafts(data: CvStructuredData): CvStructuredData {
    const sanitized = cloneCvData(data);

    sanitized.experience = sanitized.experience.map((exp) => ({
        ...exp,
        description: exp.description.filter((bullet) => bullet.text.trim().length > 0),
    }));

    sanitized.skills = sanitized.skills
        .map((group) => ({
            ...group,
            category: group.category?.trim(),
            items: group.items.map((item) => item.trim()).filter(Boolean),
        }))
        .filter((group) => group.items.length > 0);

    return sanitized;
}
