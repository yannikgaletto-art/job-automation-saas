/**
 * CV Template Labels — locale-aware section headers for PDF templates.
 * 
 * @react-pdf/renderer components cannot use React hooks (useTranslations).
 * Instead, the calling component builds this labels object and passes it as a prop.
 */

export interface CvTemplateLabels {
    experience: string;
    education: string;
    skills: string;
    languages: string;
    certificates: string;
    grade: string;
    summary: string;
    qrLabel: string;
    qrSubLabel: string;
    techStack: string;
    present: string;  // locale-specific word for 'current/today' in date ranges
}

type SupportedLocale = 'de' | 'en' | 'es';

const LABELS: Record<SupportedLocale, CvTemplateLabels> = {
    de: {
        experience: 'Berufserfahrung',
        education: 'Ausbildung',
        skills: 'Kenntnisse',
        languages: 'Sprachen',
        certificates: 'Zertifikate',
        grade: 'Abschlussnote',
        summary: 'Zusammenfassung',
        qrLabel: 'Video Pitch',
        qrSubLabel: '14 Tage verfügbar',
        techStack: 'Tech Stack',
        present: 'Heute',
    },
    en: {
        experience: 'Professional Experience',
        education: 'Education',
        skills: 'Skills',
        languages: 'Languages',
        certificates: 'Certifications',
        grade: 'Grade',
        summary: 'Summary',
        qrLabel: 'Video Pitch',
        qrSubLabel: 'Available 14 days',
        techStack: 'Tech Stack',
        present: 'Present',
    },
    es: {
        experience: 'Experiencia Profesional',
        education: 'Educación',
        skills: 'Conocimientos',
        languages: 'Idiomas',
        certificates: 'Certificados',
        grade: 'Nota',
        summary: 'Resumen',
        qrLabel: 'Video Pitch',
        qrSubLabel: 'Disponible 14 días',
        techStack: 'Tech Stack',
        present: 'Actualidad',
    },
};

/**
 * Returns locale-aware labels for CV PDF templates.
 * Call from a client component ('use client') and pass the result to the template as a prop.
 */
export function getCvTemplateLabels(locale: string): CvTemplateLabels {
    const key = (['de', 'en', 'es'].includes(locale) ? locale : 'de') as SupportedLocale;
    return LABELS[key];
}
