import React from 'react';
import { Document, Page, View, Text, Link, StyleSheet } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';

/**
 * ValleyTemplate — FAANG-optimized, single-column, black & white CV.
 *
 * Design spec (AGENT_4.3):
 * - NO summary block
 * - 2-column header: Name (left, 22pt bold) | Contact (right, 8.5pt)
 * - Section headers: bold, uppercase, borderBottom
 * - Strictly single-column layout (no sidebar)
 * - Bullet points: Bold label + normal text
 * - Pure black/white only
 * - Skills: category bold + comma-separated items per line
 * - Certs: bullet-prefixed, one per line
 */

const DARK = '#000000';
const MUTED = '#444444';
const DIVIDER = '#CCCCCC';

const s = StyleSheet.create({
    page: {
        fontFamily: 'Helvetica',
        fontSize: 9,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 40,
        paddingTop: 36,
        paddingBottom: 36,
        color: DARK,
        lineHeight: 1.3,
    },

    // ---- HEADER ----
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1.5,
        borderBottomColor: DARK,
    },
    headerName: {
        fontSize: 22,
        fontWeight: 700,
        color: DARK,
        letterSpacing: 0.5,
    },
    headerContact: {
        alignItems: 'flex-end',
    },
    contactLine: {
        fontSize: 8.5,
        color: MUTED,
        marginBottom: 2.5,
        textAlign: 'right',
    },

    // ---- SECTIONS ----
    sectionContainer: {
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 10.5,
        fontWeight: 700,
        color: DARK,
        textTransform: 'uppercase',
        letterSpacing: 2,
        paddingBottom: 4,
        borderBottomWidth: 0.75,
        borderBottomColor: DIVIDER,
        marginBottom: 8,
    },

    // ---- EXPERIENCE ----
    expBlock: {
        marginBottom: 8,
    },
    expTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 1.5,
    },
    expRole: {
        fontSize: 10,
        fontWeight: 700,
        color: DARK,
        flex: 1,
        paddingRight: 8,
    },
    expDate: {
        fontSize: 8.5,
        color: '#888888',
        fontWeight: 'normal',
        flexShrink: 0,
    },
    expCompany: {
        fontSize: 9,
        color: MUTED,
        marginBottom: 4,
    },
    bulletRow: {
        flexDirection: 'row',
        marginBottom: 3,
        paddingLeft: 2,
    },
    bulletDot: {
        width: 10,
        fontSize: 9,
        color: DARK,
    },
    bulletText: {
        flex: 1,
        fontSize: 9,
        color: DARK,
        lineHeight: 1.5,
    },

    // ---- EDUCATION ----
    eduBlock: {
        marginBottom: 6,
    },
    eduTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 1.5,
    },
    eduDegree: {
        fontSize: 10,
        fontWeight: 700,
        color: DARK,
        flex: 1,
        paddingRight: 8,
    },
    eduDate: {
        fontSize: 8.5,
        color: '#888888',
        fontWeight: 'normal',
        flexShrink: 0,
    },
    eduInstitution: {
        fontSize: 9,
        color: MUTED,
        marginBottom: 2,
    },
    eduDesc: {
        fontSize: 9,
        color: MUTED,
        lineHeight: 1.4,
    },

    // ---- SKILLS (structured: category bold + comma-list) ----
    skillRow: {
        flexDirection: 'row',
        marginBottom: 3,
    },
    skillCategory: {
        fontSize: 9,
        fontWeight: 700,
        color: DARK,
        width: 120,
    },
    skillItems: {
        fontSize: 9,
        color: MUTED,
        flex: 1,
        lineHeight: 1.4,
    },

    // ---- LANGUAGES ----
    langRow: {
        flexDirection: 'row',
        marginBottom: 3,
    },
    langName: {
        fontSize: 9,
        fontWeight: 700,
        color: DARK,
        width: 120,
    },
    langLevel: {
        fontSize: 9,
        color: MUTED,
    },

    // ---- CERTIFICATIONS (structured: bullet per line) ----
    certRow: {
        flexDirection: 'row',
        marginBottom: 3,
        paddingLeft: 2,
    },
    certBullet: {
        width: 10,
        fontSize: 9,
        color: DARK,
    },
    certText: {
        flex: 1,
        fontSize: 9,
        color: DARK,
    },
    certDetail: {
        fontSize: 8.5,
        color: MUTED,
    },
});

/** Renders bullet text with bold label if colon-separated */
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

export function ValleyTemplate({ data }: { data: CvStructuredData }) {
    const pi = data.personalInfo;

    return (
        <Document>
            <Page size="A4" style={s.page}>

                {/* ===== HEADER: Name left, Contact right ===== */}
                <View style={s.header}>
                    <Text style={s.headerName}>{pi.name || ''}</Text>
                    <View style={s.headerContact}>
                        {pi.location && <Text style={s.contactLine}>{pi.location}</Text>}
                        {pi.email && (
                            <Link src={`mailto:${pi.email}`} style={s.contactLine}>
                                {pi.email}
                            </Link>
                        )}
                        {pi.phone && <Text style={s.contactLine}>{pi.phone}</Text>}
                        {pi.linkedin && (
                            <Link src={pi.linkedin.startsWith('http') ? pi.linkedin : `https://${pi.linkedin}`} style={s.contactLine}>
                                {pi.linkedin}
                            </Link>
                        )}
                    </View>
                </View>

                {/* NO SUMMARY BLOCK — intentionally omitted per Valley spec */}

                {/* ===== EXPERIENCE ===== */}
                {data.experience.length > 0 && (
                    <View style={s.sectionContainer}>
                        <Text style={s.sectionTitle}>Berufserfahrung</Text>
                        {data.experience.map((exp) => (
                            <View key={exp.id} style={s.expBlock} wrap={false}>
                                <View style={s.expTopRow}>
                                    <Text style={s.expRole}>{exp.role || ''}</Text>
                                    <Text style={s.expDate}>{exp.dateRangeText || ''}</Text>
                                </View>
                                {exp.company && (
                                    <Text style={s.expCompany}>
                                        {exp.company}{exp.location ? ` \u2022 ${exp.location}` : ''}
                                    </Text>
                                )}
                                {exp.description?.map((b) => (
                                    <View key={b.id} style={s.bulletRow}>
                                        <Text style={s.bulletDot}>{'\u2022'}</Text>
                                        <RenderBullet text={b.text} />
                                    </View>
                                ))}
                            </View>
                        ))}
                    </View>
                )}

                {/* ===== EDUCATION ===== */}
                {data.education.length > 0 && (
                    <View style={s.sectionContainer}>
                        <Text style={s.sectionTitle}>Ausbildung</Text>
                        {data.education.map((edu) => (
                            <View key={edu.id} style={s.eduBlock} wrap={false}>
                                <View style={s.eduTopRow}>
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

                {/* ===== SKILLS (one row per category: bold label + comma list) ===== */}
                {data.skills.length > 0 && (
                    <View style={s.sectionContainer}>
                        <Text style={s.sectionTitle}>Kenntnisse</Text>
                        {data.skills.map((g) => (
                            <View key={g.id} style={s.skillRow}>
                                {g.category && <Text style={s.skillCategory}>{g.category}</Text>}
                                <Text style={s.skillItems}>{g.items.join(', ')}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ===== LANGUAGES ===== */}
                {data.languages.length > 0 && (
                    <View style={s.sectionContainer}>
                        <Text style={s.sectionTitle}>Sprachen</Text>
                        {data.languages.map((l) => (
                            <View key={l.id} style={s.langRow}>
                                <Text style={s.langName}>{l.language || ''}</Text>
                                <Text style={s.langLevel}>{l.proficiency || ''}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ===== CERTIFICATIONS (one bullet per cert) ===== */}
                {data.certifications && data.certifications.length > 0 && (
                    <View style={s.sectionContainer}>
                        <Text style={s.sectionTitle}>Zertifikate</Text>
                        {data.certifications.map((cert) => (
                            <View key={cert.id} style={s.certRow}>
                                <Text style={s.certBullet}>{'\u2022'}</Text>
                                <Text style={s.certText}>
                                    <Text style={{ fontWeight: 700 }}>{cert.name || ''}</Text>
                                    {(cert.issuer || cert.dateText) && (
                                        <Text style={s.certDetail}>
                                            {' — '}{[cert.issuer, cert.dateText].filter(Boolean).join(' \u2022 ')}
                                        </Text>
                                    )}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

            </Page>
        </Document>
    );
}
