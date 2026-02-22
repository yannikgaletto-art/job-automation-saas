import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { registerPdfFonts } from '@/lib/utils/pdf-fonts';
import { CvStructuredData } from '@/types/cv';

registerPdfFonts();

const SIDEBAR_W = 190; // fixed pixel width — no percentage bugs
const PAGE_W = 595;   // A4 width in points

const SIDEBAR_BG = '#111827';
const SIDEBAR_TEXT = '#F3F4F6';
const SIDEBAR_MUTED = '#9CA3AF';

const ACCENT = '#2563EB';
const DARK = '#1F2937';
const MUTED = '#6B7280';
const DIVIDER = '#E5E7EB';

const s = StyleSheet.create({
    page: {
        fontFamily: 'Inter',
        fontSize: 9,
        backgroundColor: '#FFFFFF',
    },

    // ---- LEFT SIDEBAR (absolutely positioned) ----
    sidebar: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: SIDEBAR_W,
        backgroundColor: SIDEBAR_BG,
        paddingHorizontal: 20,
        paddingTop: 40,
        paddingBottom: 40,
    },
    sidebarName: {
        fontSize: 18,
        fontWeight: 700,
        color: SIDEBAR_TEXT,
        lineHeight: 1.2,
        marginBottom: 12,
    },
    contactItem: {
        fontSize: 8,
        color: SIDEBAR_MUTED,
        marginBottom: 4,
        lineHeight: 1.4,
    },
    sidebarSection: {
        marginTop: 18,
    },
    sidebarTitle: {
        fontSize: 8.5,
        fontWeight: 700,
        color: SIDEBAR_TEXT,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
        paddingBottom: 4,
        marginBottom: 10,
    },
    skillCat: {
        fontSize: 8,
        fontWeight: 600,
        color: SIDEBAR_TEXT,
        marginTop: 6,
        marginBottom: 2,
    },
    skillItem: {
        fontSize: 8,
        color: SIDEBAR_MUTED,
        marginBottom: 1,
        lineHeight: 1.3,
    },
    langRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    langName: {
        fontSize: 8,
        fontWeight: 600,
        color: SIDEBAR_TEXT,
    },
    langLevel: {
        fontSize: 8,
        color: SIDEBAR_MUTED,
    },

    // ---- RIGHT MAIN (margin-offset to avoid sidebar) ----
    main: {
        marginLeft: SIDEBAR_W,
        paddingLeft: 28,
        paddingRight: 28,
        paddingTop: 40,
        paddingBottom: 40,
        // explicit width so the PDF engine knows the boundary
        width: PAGE_W - SIDEBAR_W,
    },
    sectionContainer: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: 700,
        color: ACCENT,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 10,
    },
    profileText: {
        fontSize: 9.5,
        color: MUTED,
        lineHeight: 1.6,
        textAlign: 'justify',
    },
    // Experience
    expBlock: {
        marginBottom: 12,
    },
    expRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    expRole: {
        fontSize: 10.5,
        fontWeight: 700,
        color: DARK,
    },
    expDate: {
        fontSize: 8.5,
        color: ACCENT,
        fontWeight: 600,
    },
    expCompany: {
        fontSize: 9,
        fontWeight: 600,
        color: MUTED,
        marginBottom: 5,
    },
    bulletRow: {
        flexDirection: 'row',
        marginBottom: 3,
    },
    bulletDot: {
        width: 11,
        fontSize: 9,
        color: ACCENT,
        fontWeight: 700,
    },
    bulletText: {
        flex: 1,
        fontSize: 9,
        color: DARK,
        lineHeight: 1.5,
    },
    // Education
    eduBlock: {
        marginBottom: 10,
    },
    eduRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    eduDegree: {
        fontSize: 10,
        fontWeight: 700,
        color: DARK,
    },
    eduDate: {
        fontSize: 8.5,
        color: MUTED,
    },
    eduInstitution: {
        fontSize: 9,
        color: MUTED,
        marginBottom: 3,
    },
    eduDesc: {
        fontSize: 9,
        color: MUTED,
        lineHeight: 1.4,
    },
    divider: {
        borderBottomWidth: 1,
        borderBottomColor: DIVIDER,
        marginVertical: 10,
    },
});

const RenderBullet = ({ text }: { text: string }) => {
    const idx = text.indexOf(':');
    if (idx !== -1 && idx < 40) {
        return (
            <Text style={s.bulletText}>
                <Text style={{ fontWeight: 700 }}>{text.slice(0, idx + 1)}</Text>
                {text.slice(idx + 1)}
            </Text>
        );
    }
    return <Text style={s.bulletText}>{text}</Text>;
};

export function ModernTemplate({ data }: { data: CvStructuredData }) {
    const pi = data.personalInfo;

    return (
        <Document>
            <Page size="A4" style={s.page}>

                {/* ===== SIDEBAR — absolutely positioned ===== */}
                <View style={s.sidebar} fixed>
                    <Text style={s.sidebarName}>{pi.name || ''}</Text>

                    {pi.location && <Text style={s.contactItem}>{pi.location}</Text>}
                    {pi.email && <Text style={s.contactItem}>{pi.email}</Text>}
                    {pi.phone && <Text style={s.contactItem}>{pi.phone}</Text>}
                    {pi.linkedin && <Text style={s.contactItem}>{pi.linkedin}</Text>}

                    {data.skills.length > 0 && (
                        <View style={s.sidebarSection}>
                            <Text style={s.sidebarTitle}>Skills</Text>
                            {data.skills.map((g) => (
                                <View key={g.id}>
                                    {g.category && <Text style={s.skillCat}>{g.category}</Text>}
                                    {g.items.map((item, i) => (
                                        <Text key={i} style={s.skillItem}>{item}</Text>
                                    ))}
                                </View>
                            ))}
                        </View>
                    )}

                    {data.languages.length > 0 && (
                        <View style={s.sidebarSection}>
                            <Text style={s.sidebarTitle}>Languages</Text>
                            {data.languages.map((l) => (
                                <View key={l.id} style={s.langRow}>
                                    <Text style={s.langName}>{l.language || ''}</Text>
                                    <Text style={s.langLevel}>{l.proficiency || ''}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* ===== MAIN CONTENT — margin pushes past sidebar ===== */}
                <View style={s.main}>
                    {pi.summary && (
                        <View style={s.sectionContainer}>
                            <Text style={s.sectionTitle}>Profile</Text>
                            <Text style={s.profileText}>{pi.summary}</Text>
                        </View>
                    )}

                    {data.experience.length > 0 && (
                        <View style={s.sectionContainer}>
                            <Text style={s.sectionTitle}>Experience</Text>
                            {data.experience.map((exp, i) => (
                                <View key={exp.id} style={s.expBlock} wrap={false}>
                                    <View style={s.expRow}>
                                        <Text style={s.expRole}>{exp.role || ''}</Text>
                                        <Text style={s.expDate}>{exp.dateRangeText || ''}</Text>
                                    </View>
                                    {exp.company && (
                                        <Text style={s.expCompany}>
                                            {exp.company}{exp.location ? ` • ${exp.location}` : ''}
                                        </Text>
                                    )}
                                    {exp.description?.map((b) => (
                                        <View key={b.id} style={s.bulletRow}>
                                            <Text style={s.bulletDot}>•</Text>
                                            <RenderBullet text={b.text} />
                                        </View>
                                    ))}
                                    {i < data.experience.length - 1 && <View style={s.divider} />}
                                </View>
                            ))}
                        </View>
                    )}

                    {data.education.length > 0 && (
                        <View style={s.sectionContainer}>
                            <Text style={s.sectionTitle}>Education</Text>
                            {data.education.map((edu) => (
                                <View key={edu.id} style={s.eduBlock} wrap={false}>
                                    <View style={s.eduRow}>
                                        <Text style={s.eduDegree}>{edu.degree || ''}</Text>
                                        <Text style={s.eduDate}>{edu.dateRangeText || ''}</Text>
                                    </View>
                                    {edu.institution && (
                                        <Text style={s.eduInstitution}>{edu.institution}</Text>
                                    )}
                                    {edu.description && (
                                        <Text style={s.eduDesc}>{edu.description}</Text>
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
