import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { registerPdfFonts } from '@/lib/utils/pdf-fonts';
import { CvStructuredData } from '@/types/cv';

registerPdfFonts();

const ACCENT = '#2563EB';
const DARK = '#1F2937';
const GRAY = '#6B7280';
const LIGHT_BG = '#F8FAFC';
const DIVIDER = '#E5E7EB';

const s = StyleSheet.create({
    page: {
        flexDirection: 'row',
        fontFamily: 'Inter',
        fontSize: 9,
        color: DARK,
    },
    sidebar: {
        width: '30%',
        backgroundColor: LIGHT_BG,
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 40,
    },
    main: {
        width: '70%',
        paddingHorizontal: 28,
        paddingTop: 40,
        paddingBottom: 40,
    },
    // Sidebar styles
    name: {
        fontSize: 18,
        fontWeight: 700,
        color: DARK,
        marginBottom: 4,
    },
    contactItem: {
        fontSize: 8,
        color: GRAY,
        marginBottom: 3,
    },
    sidebarSection: {
        marginTop: 20,
    },
    sidebarSectionTitle: {
        fontSize: 9,
        fontWeight: 700,
        color: ACCENT,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: ACCENT,
        paddingBottom: 4,
    },
    skillCategory: {
        fontSize: 8,
        fontWeight: 600,
        color: DARK,
        marginTop: 6,
        marginBottom: 2,
    },
    skillItem: {
        fontSize: 8,
        color: GRAY,
        marginBottom: 1,
    },
    languageRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    languageName: {
        fontSize: 8,
        fontWeight: 600,
        color: DARK,
    },
    languageLevel: {
        fontSize: 8,
        color: GRAY,
    },
    // Main styles
    mainSectionTitle: {
        fontSize: 10,
        fontWeight: 700,
        color: ACCENT,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 10,
        borderBottomWidth: 1.5,
        borderBottomColor: ACCENT,
        paddingBottom: 4,
    },
    experienceBlock: {
        marginBottom: 14,
    },
    expHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    expRole: {
        fontSize: 10,
        fontWeight: 700,
        color: DARK,
    },
    expDate: {
        fontSize: 8,
        color: GRAY,
        textAlign: 'right',
    },
    expCompany: {
        fontSize: 9,
        color: GRAY,
        marginBottom: 4,
    },
    expSummary: {
        fontSize: 8,
        color: GRAY,
        marginBottom: 4,
    },
    bulletRow: {
        flexDirection: 'row',
        marginBottom: 3,
        paddingRight: 8,
    },
    bulletDot: {
        width: 10,
        fontSize: 8,
        color: ACCENT,
    },
    bulletText: {
        flex: 1,
        fontSize: 8.5,
        color: DARK,
        lineHeight: 1.4,
    },
    eduBlock: {
        marginBottom: 10,
    },
    eduHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    eduDegree: {
        fontSize: 10,
        fontWeight: 700,
        color: DARK,
    },
    eduDate: {
        fontSize: 8,
        color: GRAY,
    },
    eduInstitution: {
        fontSize: 9,
        color: GRAY,
        marginBottom: 2,
    },
    eduDescription: {
        fontSize: 8,
        color: GRAY,
    },
    mainSectionContainer: {
        marginBottom: 10,
    },
    divider: {
        borderBottomWidth: 0.5,
        borderBottomColor: DIVIDER,
        marginVertical: 6,
    },
});

interface ModernTemplateProps {
    data: CvStructuredData;
}

const RenderBullet = ({ text }: { text: string }) => {
    const parts = text.split(':');
    if (parts.length > 1) {
        const before = parts[0];
        const after = parts.slice(1).join(':');
        return (
            <Text style={s.bulletText}>
                <Text style={{ fontWeight: 700, color: DARK }}>{before}:</Text>
                {after}
            </Text>
        );
    }
    return <Text style={s.bulletText}>{text}</Text>;
};

export function ModernTemplate({ data }: ModernTemplateProps) {
    const pi = data.personalInfo;

    return (
        <Document>
            <Page size="A4" style={s.page}>
                {/* ======= LEFT SIDEBAR ======= */}
                <View style={s.sidebar}>
                    {/* Name & Contact */}
                    <Text style={s.name}>{pi.name || ''}</Text>
                    {pi.location && <Text style={s.contactItem}>📍 {pi.location}</Text>}
                    {pi.email && <Text style={s.contactItem}>✉ {pi.email}</Text>}
                    {pi.phone && <Text style={s.contactItem}>📞 {pi.phone}</Text>}
                    {pi.linkedin && <Text style={s.contactItem}>🔗 {pi.linkedin}</Text>}

                    {/* Skills */}
                    {data.skills.length > 0 && (
                        <View style={s.sidebarSection}>
                            <Text style={s.sidebarSectionTitle}>Skills</Text>
                            {data.skills.map((group) => (
                                <View key={group.id}>
                                    {group.category && (
                                        <Text style={s.skillCategory}>{group.category}</Text>
                                    )}
                                    {group.items.map((item, idx) => (
                                        <Text key={idx} style={s.skillItem}>• {item}</Text>
                                    ))}
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Languages */}
                    {data.languages.length > 0 && (
                        <View style={s.sidebarSection}>
                            <Text style={s.sidebarSectionTitle}>Sprachen</Text>
                            {data.languages.map((lang) => (
                                <View key={lang.id} style={s.languageRow}>
                                    <Text style={s.languageName}>{lang.language || ''}</Text>
                                    <Text style={s.languageLevel}>{lang.proficiency || ''}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* ======= MAIN CONTENT ======= */}
                <View style={s.main}>
                    {/* Summary */}
                    {pi.summary && (
                        <View style={s.mainSectionContainer}>
                            <Text style={s.mainSectionTitle}>Profil</Text>
                            <Text style={{ fontSize: 9, color: GRAY, lineHeight: 1.5 }}>
                                {pi.summary}
                            </Text>
                        </View>
                    )}

                    {/* Experience */}
                    {data.experience.length > 0 && (
                        <View style={s.mainSectionContainer}>
                            <Text style={s.mainSectionTitle}>Berufserfahrung</Text>
                            {data.experience.map((exp, idx) => (
                                <View key={exp.id} style={s.experienceBlock} wrap={false}>
                                    <View style={s.expHeader}>
                                        <Text style={s.expRole}>{exp.role || ''}</Text>
                                        <Text style={s.expDate}>{exp.dateRangeText || ''}</Text>
                                    </View>
                                    {exp.company && (
                                        <Text style={s.expCompany}>
                                            {exp.company}
                                            {exp.location ? ` · ${exp.location}` : ''}
                                        </Text>
                                    )}
                                    {exp.summary && <Text style={s.expSummary}>{exp.summary}</Text>}
                                    {exp.description?.map((bullet) => (
                                        <View key={bullet.id} style={s.bulletRow}>
                                            <Text style={s.bulletDot}>•</Text>
                                            <RenderBullet text={bullet.text} />
                                        </View>
                                    ))}
                                    {(!exp.description || exp.description.length === 0) && !exp.summary && (
                                        <View style={{ height: 2 }} /> // Small spacer for empty roles
                                    )}
                                    {idx < data.experience.length - 1 && <View style={s.divider} />}
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Education */}
                    {data.education.length > 0 && (
                        <View style={s.mainSectionContainer}>
                            <Text style={s.mainSectionTitle}>Ausbildung</Text>
                            {data.education.map((edu) => (
                                <View key={edu.id} style={s.eduBlock} wrap={false}>
                                    <View style={s.eduHeader}>
                                        <Text style={s.eduDegree}>{edu.degree || ''}</Text>
                                        <Text style={s.eduDate}>{edu.dateRangeText || ''}</Text>
                                    </View>
                                    {edu.institution && (
                                        <Text style={s.eduInstitution}>{edu.institution}</Text>
                                    )}
                                    {edu.description && (
                                        <Text style={s.eduDescription}>{edu.description}</Text>
                                    )}
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </Page>
        </Document>
    );
}
