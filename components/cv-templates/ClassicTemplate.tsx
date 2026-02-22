import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { registerPdfFonts } from '@/lib/utils/pdf-fonts';
import { CvStructuredData } from '@/types/cv';

registerPdfFonts();

const DARK = '#111827';
const GRAY = '#4B5563';

const s = StyleSheet.create({
    page: {
        fontFamily: 'Inter',
        fontSize: 10,
        color: DARK,
        paddingTop: 40,
        paddingBottom: 40,
        paddingHorizontal: 48,
    },
    header: {
        alignItems: 'center',
        marginBottom: 16,
    },
    name: {
        fontSize: 22,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom: 6,
    },
    contactInfo: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        fontSize: 9,
        color: GRAY,
        gap: 8,
    },
    section: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 1,
        borderBottomWidth: 1,
        borderBottomColor: DARK,
        paddingBottom: 4,
        marginBottom: 10,
    },
    // Experience
    expBlock: {
        marginBottom: 12,
    },
    expHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    expRole: {
        fontSize: 10,
        fontWeight: 700,
    },
    expCompany: {
        fontSize: 10,
        fontStyle: 'italic',
        color: GRAY,
    },
    expDate: {
        fontSize: 10,
        fontWeight: 600,
    },
    expLocation: {
        fontSize: 9,
        color: GRAY,
        textAlign: 'right',
    },
    expSummary: {
        fontSize: 9.5,
        color: GRAY,
        marginBottom: 4,
        marginTop: 2,
    },
    bulletRow: {
        flexDirection: 'row',
        marginBottom: 3,
        paddingRight: 10,
    },
    bulletDot: {
        width: 12,
        fontSize: 10,
    },
    bulletText: {
        flex: 1,
        fontSize: 9.5,
        lineHeight: 1.4,
    },
    // Education
    eduBlock: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    eduLeft: {
        flex: 1,
    },
    eduRight: {
        alignItems: 'flex-end',
    },
    eduDegree: {
        fontSize: 10,
        fontWeight: 700,
    },
    eduInstitution: {
        fontSize: 10,
        color: GRAY,
    },
    eduDate: {
        fontSize: 9,
        fontWeight: 600,
    },
    eduDesc: {
        fontSize: 9,
        color: GRAY,
        marginTop: 2,
    },
    // Skills
    skillRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    skillCategory: {
        width: 120,
        fontWeight: 700,
        fontSize: 9.5,
    },
    skillItems: {
        flex: 1,
        fontSize: 9.5,
        color: GRAY,
    },
});

const RenderBullet = ({ text }: { text: string }) => {
    const parts = text.split(':');
    if (parts.length > 1) {
        const before = parts[0];
        const after = parts.slice(1).join(':');
        return (
            <Text style={s.bulletText}>
                <Text style={{ fontWeight: 700 }}>{before}:</Text>
                {after}
            </Text>
        );
    }
    return <Text style={s.bulletText}>{text}</Text>;
};

export function ClassicTemplate({ data }: { data: CvStructuredData }) {
    const pi = data.personalInfo;

    return (
        <Document>
            <Page size="A4" style={s.page}>
                {/* Header */}
                <View style={s.header}>
                    <Text style={s.name}>{pi.name || ''}</Text>
                    <View style={s.contactInfo}>
                        {pi.location && <Text>{pi.location}</Text>}
                        {pi.location && pi.phone && <Text>•</Text>}
                        {pi.phone && <Text>{pi.phone}</Text>}
                        {pi.phone && pi.email && <Text>•</Text>}
                        {pi.email && <Text>{pi.email}</Text>}
                        {pi.email && pi.linkedin && <Text>•</Text>}
                        {pi.linkedin && <Text>{pi.linkedin}</Text>}
                    </View>
                </View>

                {/* Profile Summary */}
                {pi.summary && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>Summary</Text>
                        <Text style={{ fontSize: 9.5, lineHeight: 1.5, color: GRAY }}>{pi.summary}</Text>
                    </View>
                )}

                {/* Experience */}
                {data.experience.length > 0 && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>Professional Experience</Text>
                        {data.experience.map((exp) => (
                            <View key={exp.id} style={s.expBlock} wrap={false}>
                                <View style={s.expHeaderRow}>
                                    <View>
                                        <Text style={s.expRole}>{exp.role || ''}</Text>
                                        <Text style={s.expCompany}>{exp.company || ''}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={s.expDate}>{exp.dateRangeText || ''}</Text>
                                        {exp.location && <Text style={s.expLocation}>{exp.location}</Text>}
                                    </View>
                                </View>
                                {exp.summary && <Text style={s.expSummary}>{exp.summary}</Text>}
                                {exp.description?.map((bullet) => (
                                    <View key={bullet.id} style={s.bulletRow}>
                                        <Text style={s.bulletDot}>•</Text>
                                        <RenderBullet text={bullet.text} />
                                    </View>
                                ))}
                            </View>
                        ))}
                    </View>
                )}

                {/* Education */}
                {data.education.length > 0 && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>Education</Text>
                        {data.education.map((edu) => (
                            <View key={edu.id} style={s.eduBlock} wrap={false}>
                                <View style={s.eduLeft}>
                                    <Text style={s.eduDegree}>{edu.degree || ''}</Text>
                                    <Text style={s.eduInstitution}>{edu.institution || ''}</Text>
                                    {edu.description && <Text style={s.eduDesc}>{edu.description}</Text>}
                                </View>
                                <View style={s.eduRight}>
                                    <Text style={s.eduDate}>{edu.dateRangeText || ''}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Skills & Certifications Side-by-Side or Stacked */}
                {(data.skills.length > 0 || (data.certifications && data.certifications.length > 0)) && (
                    <View style={s.section} wrap={false}>
                        <Text style={s.sectionTitle}>Skills & Certifications</Text>

                        {data.skills.map((group) => (
                            <View key={group.id} style={s.skillRow}>
                                <Text style={s.skillCategory}>{group.category || 'Skills'}:</Text>
                                <Text style={s.skillItems}>{group.items.join(', ')}</Text>
                            </View>
                        ))}

                        {data.certifications && data.certifications.length > 0 && (
                            <View style={[s.skillRow, { marginTop: 4 }]}>
                                <Text style={s.skillCategory}>Certifications:</Text>
                                <Text style={s.skillItems}>
                                    {data.certifications.map(c => c.name).join(', ')}
                                </Text>
                            </View>
                        )}

                        {data.languages.length > 0 && (
                            <View style={[s.skillRow, { marginTop: 4 }]}>
                                <Text style={s.skillCategory}>Languages:</Text>
                                <Text style={s.skillItems}>
                                    {data.languages.map(l => `${l.language} (${l.proficiency})`).join(', ')}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </Page>
        </Document>
    );
}
