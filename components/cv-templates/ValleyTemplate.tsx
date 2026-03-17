import React from 'react';
import { Document, Page, View, Text, Link, Image, StyleSheet } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';
import { SkillTagGroup } from './shared/SkillTag';
import { ProficiencyDots } from './shared/ProficiencyDots';
import { CertGrid } from './shared/CertGrid';
import { RenderMarkdownText } from './shared/RenderMarkdownText';
import { truncateDescription, inferLanguageLevel } from '@/lib/utils/cv-template-helpers';

/**
 * ValleyTemplate — FAANG-optimized, single-column, black & white CV.
 * V2: Skill-Tags, Language Dots, 2-column CertGrid, Education truncation, Orphan prevention.
 */

const DARK = '#000000';
const MUTED = '#444444';
const DIVIDER = '#CCCCCC';

const s = StyleSheet.create({
    page: {
        fontFamily: 'Helvetica',
        fontSize: 9,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 48,
        paddingTop: 36,
        paddingBottom: 36,
        color: DARK,
        lineHeight: 1.3,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1.5,
        borderBottomColor: DARK,
    },
    headerName: { fontSize: 22, fontWeight: 700, color: DARK, letterSpacing: 0.5 },
    headerContact: { alignItems: 'flex-end' },
    contactLine: { fontSize: 8.5, color: MUTED, marginBottom: 2.5, textAlign: 'right' },
    sectionContainer: { marginBottom: 12 },
    sectionTitle: {
        fontSize: 10.5, fontWeight: 700, color: DARK, textTransform: 'uppercase',
        letterSpacing: 2, paddingBottom: 4, borderBottomWidth: 0.75,
        borderBottomColor: DIVIDER, marginBottom: 8,
    },
    expBlock: { marginBottom: 10 },
    expTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1.5 },
    expRole: { fontSize: 10, fontWeight: 700, color: DARK, flex: 1, paddingRight: 8 },
    expDate: { fontSize: 8.5, color: '#888888', fontWeight: 'normal', flexShrink: 0 },
    expCompany: { fontSize: 9, color: MUTED, marginBottom: 4 },
    // Bullet: paddingRight reserves space for the date column so text doesn't run edge-to-edge
    bulletRow: { flexDirection: 'row', marginBottom: 2, paddingLeft: 2, paddingRight: 80 },
    bulletDot: { width: 10, fontSize: 9, color: DARK },
    bulletText: { flex: 1, fontSize: 9, color: DARK, lineHeight: 1.4 },
    eduBlock: { marginBottom: 8 },
    eduTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1.5 },
    eduDegree: { fontSize: 10, fontWeight: 700, color: DARK, flex: 1, paddingRight: 8 },
    eduDate: { fontSize: 8.5, color: '#888888', fontWeight: 'normal', flexShrink: 0 },
    eduInstitution: { fontSize: 9, color: MUTED, marginBottom: 3 },
    eduSubRow: { flexDirection: 'row', marginBottom: 1.5, paddingLeft: 0 },
    eduSubLabel: { fontSize: 8.5, fontWeight: 700, color: DARK },
    eduSubText: { fontSize: 8.5, color: MUTED, flex: 1, lineHeight: 1.4 },
    eduSubItem: { fontSize: 8.5, color: MUTED, lineHeight: 1.4, paddingLeft: 8 },
    skillGroupBlock: { marginBottom: 6 },
    skillCategoryLabel: { fontSize: 9, fontWeight: 700, color: DARK, marginBottom: 3 },
    langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    langLeft: { flexDirection: 'row', alignItems: 'center' },
    langName: { fontSize: 9, fontWeight: 700, color: DARK, marginRight: 8 },
    langLevel: { fontSize: 8, color: MUTED },
    dualColumn: { flexDirection: 'row', marginBottom: 16 },
    dualColumnLeft: { flex: 1, paddingRight: 12 },
    dualColumnRight: { flex: 1, paddingLeft: 12 },
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

const SkillsSection = ({ skills }: { skills: CvStructuredData['skills'] }) => (
    <>
        <Text style={s.sectionTitle}>Kenntnisse</Text>
        {skills.map((g) => (
            <View key={g.id} style={s.skillGroupBlock}>
                {g.category && <Text style={s.skillCategoryLabel}>{g.category}</Text>}
                <SkillTagGroup items={g.items} />
            </View>
        ))}
    </>
);

const LanguagesSection = ({ languages }: { languages: CvStructuredData['languages'] }) => (
    <>
        <Text style={s.sectionTitle}>Sprachen</Text>
        {languages.map((l) => (
            <View key={l.id} style={s.langRow}>
                <View style={s.langLeft}>
                    <Text style={s.langName}>{l.language || ''}</Text>
                    <ProficiencyDots level={l.level ?? inferLanguageLevel(l.proficiency)} />
                </View>
                <Text style={s.langLevel}>{l.proficiency || ''}</Text>
            </View>
        ))}
    </>
);

export function ValleyTemplate({ data, qrBase64 }: { data: CvStructuredData; qrBase64?: string }) {
    const pi = data.personalInfo;
    const hasSkills = data.skills.length > 0;
    const hasLanguages = data.languages.length > 0;
    const hasCerts = data.certifications && data.certifications.length > 0;

    return (
        <Document>
            <Page size="A4" style={s.page}>

                {/* ===== HEADER ===== */}
                <View style={s.header}>
                    <Text style={s.headerName}>{pi.name || ''}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* QR Code — Video Approach (page 1 only, left of contact) */}
                        {qrBase64 && (
                            <View style={{ alignItems: 'center', marginRight: 10 }}>
                                <Image src={qrBase64} style={{ width: 46, height: 46 }} />
                                <Text style={{ fontSize: 6.5, fontWeight: 700, color: DARK, marginTop: 3, textAlign: 'center' }}>Video Pitch</Text>
                                <Text style={{ fontSize: 5, color: MUTED, marginTop: 1, textAlign: 'center' }}>14 Tage verfügbar</Text>
                            </View>
                        )}
                        <View style={s.headerContact}>
                            {pi.location && <Text style={s.contactLine}>{pi.location}</Text>}
                            {pi.email && (
                                <Link src={`mailto:${pi.email}`} style={s.contactLine}>{pi.email}</Link>
                            )}
                            {pi.phone && <Text style={s.contactLine}>{pi.phone}</Text>}
                            {pi.linkedin && (
                                <Link src={pi.linkedin.startsWith('http') ? pi.linkedin : `https://${pi.linkedin}`} style={s.contactLine}>
                                    {pi.linkedin}
                                </Link>
                            )}
                            {pi.website && (
                                <Link src={pi.website.startsWith('http') ? pi.website : `https://${pi.website}`} style={s.contactLine}>
                                    {pi.website}
                                </Link>
                            )}
                        </View>
                    </View>
                </View>

                {/* ===== SUMMARY (V2: AI-driven bold via **markdown**) ===== */}
                {pi.summary && (
                    <View style={s.sectionContainer}>
                        <RenderMarkdownText
                            text={pi.summary}
                            style={{ fontSize: 9, color: MUTED, lineHeight: 1.5 }}
                        />
                    </View>
                )}

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
                                {exp.description?.slice(0, 3).map((b) => (
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
                        {data.education.map((edu) => {
                            // Split description into sub-items (split on '. ' or ', ')
                            const rawDesc = edu.description || '';
                            const subItems = rawDesc
                                .split(/\. (?=[A-ZÄÖÜ0-9])/g)
                                .map(s => s.replace(/\.$/, '').trim())
                                .filter(s => s.length > 2);
                            return (
                                <View key={edu.id} style={s.eduBlock} wrap={false}>
                                    <View style={s.eduTopRow}>
                                        <Text style={s.eduDegree}>{edu.degree || ''}</Text>
                                        <Text style={s.eduDate}>{edu.dateRangeText || ''}</Text>
                                    </View>
                                    {edu.institution && <Text style={s.eduInstitution}>{edu.institution}</Text>}
                                    {/* Grade as bold label */}
                                    {edu.grade && (
                                        <View style={s.eduSubRow}>
                                            <Text style={s.eduSubLabel}>Abschlussnote: </Text>
                                            <Text style={s.eduSubText}>{edu.grade}</Text>
                                        </View>
                                    )}
                                    {/* Description sub-items as dash list */}
                                    {subItems.map((item, i) => (
                                        <Text key={i} style={s.eduSubItem}>– {item}</Text>
                                    ))}
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* ===== SKILLS + LANGUAGES + CERTIFICATES (dual-column layout) ===== */}
                {/* Left column: Skills — Right column: Languages + Certificates underneath */}
                {(hasSkills || hasLanguages || hasCerts) && (
                    <View style={s.dualColumn} minPresenceAhead={40}>
                        {/* Left column: Skills */}
                        <View style={s.dualColumnLeft}>
                            {hasSkills && <SkillsSection skills={data.skills} />}
                        </View>
                        {/* Right column: Languages + Certificates */}
                        <View style={s.dualColumnRight}>
                            {hasLanguages && <LanguagesSection languages={data.languages} />}
                            {hasCerts && (
                                <View style={{ marginTop: hasLanguages ? 12 : 0 }}>
                                    <Text style={s.sectionTitle}>Zertifikate</Text>
                                    <CertGrid certs={data.certifications!} />
                                </View>
                            )}
                        </View>
                    </View>
                )}


            </Page>
        </Document>
    );
}
