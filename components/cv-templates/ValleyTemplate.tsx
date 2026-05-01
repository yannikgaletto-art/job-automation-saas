import React from 'react';
import { Document, Page, View, Text, Link, Image, StyleSheet } from '@react-pdf/renderer';
import { CvStructuredData } from '@/types/cv';
import { SkillTagGroup } from './shared/SkillTag';
// ProficiencyDots removed from Valley (2026-03-30 ATS fix) — still used by TechTemplate
import { CertGrid } from './shared/CertGrid';
import { RenderMarkdownText } from './shared/RenderMarkdownText';
import { truncateDescription, normalizeDateRangeText } from '@/lib/utils/cv-template-helpers';
import { CvTemplateLabels } from '@/lib/utils/cv-template-labels';
import { LayoutMode } from '@/types/cv-opt-settings';

/**
 * ValleyTemplate — FAANG-optimized, single-column, black & white CV.
 * V4: Hard 2-page guardrails, bidirectional layoutMode (compact/default).
 *
 * HARD CAPS (always enforced, regardless of AI output):
 * - Experience bullets: max 3 per entry (matches AI prompt constraint)
 * - Certifications: max 6 total (matches AI prompt constraint)
 * These prevent 3-page overflow even when QR code adds header height.
 */

const DARK = '#000000';
const MUTED = '#444444';
const DIVIDER = '#CCCCCC';

/** Max bullets per experience entry — HARD CAP, matches AI prompt rule */
const MAX_BULLETS_DEFAULT = 3;
const MAX_BULLETS_COMPACT = 3;

/**
 * Build styles dynamically based on layoutMode.
 * compact = tighter spacing to fit more on page 1.
 * default = standard spacing.
 */
function buildStyles(mode: LayoutMode) {
    const isCompact = mode === 'compact';

    return StyleSheet.create({
        page: {
            fontFamily: 'Helvetica',
            fontSize: 9,
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 48,
            paddingTop: isCompact ? 28 : 36,
            paddingBottom: isCompact ? 28 : 36,
            color: DARK,
            lineHeight: 1.3,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isCompact ? 10 : 16,
        },
        headerName: { fontSize: 22, fontWeight: 700, color: DARK, letterSpacing: 0.5 },
        headerContact: { alignItems: 'flex-end' },
        contactLine: { fontSize: 8.5, color: MUTED, marginBottom: 2.5, textAlign: 'right' as const },
        sectionContainer: { marginBottom: isCompact ? 8 : 12 },
        sectionTitle: {
            fontSize: 10.5, fontWeight: 700, color: DARK, textTransform: 'uppercase' as const,
            letterSpacing: 2, paddingBottom: isCompact ? 3 : 4, borderBottomWidth: 0.75,
            borderBottomColor: DIVIDER, marginBottom: isCompact ? 5 : 8,
        },
        expBlock: { marginBottom: isCompact ? 6 : 10 },
        expTopRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const, marginBottom: 1.5 },
        expRole: { fontSize: 10, fontWeight: 700, color: DARK, flex: 1, paddingRight: 8 },
        expDate: { fontSize: 8.5, color: '#888888', fontWeight: 'normal' as const, flexShrink: 0 },
        expCompany: { fontSize: 9, color: MUTED, marginBottom: isCompact ? 2 : 4 },
        // Bullet: paddingRight reserves space for the date column so text doesn't run edge-to-edge
        bulletRow: { flexDirection: 'row' as const, marginBottom: 2, paddingLeft: 2, paddingRight: 80 },
        bulletDot: { width: 10, fontSize: 9, color: DARK },
        bulletText: { flex: 1, fontSize: 9, color: DARK, lineHeight: 1.4 },
        eduBlock: { marginBottom: isCompact ? 5 : 8 },
        eduTopRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const, marginBottom: 1.5 },
        eduDegree: { fontSize: 10, fontWeight: 700, color: DARK, flex: 1, paddingRight: 8 },
        eduDate: { fontSize: 8.5, color: '#888888', fontWeight: 'normal' as const, flexShrink: 0 },
        eduInstitution: { fontSize: 9, color: MUTED, marginBottom: isCompact ? 2 : 3 },
        eduSubRow: { flexDirection: 'row' as const, marginBottom: 1.5, paddingLeft: 0 },
        eduSubLabel: { fontSize: 8.5, fontWeight: 700, color: DARK },
        eduSubText: { fontSize: 8.5, color: MUTED, flex: 1, lineHeight: 1.4 },
        eduSubItem: { fontSize: 8.5, color: MUTED, lineHeight: 1.4, paddingLeft: 8 },
        skillCategoryLabel: {
            fontSize: 8.5, fontWeight: 700, color: DARK, textTransform: 'uppercase' as const,
            letterSpacing: 0, marginBottom: 2,
        },
    });
}

const RenderBullet = ({ text }: { text: string }) => {
    const idx = text.indexOf(':');
    if (idx !== -1 && idx < 40) {
        return (
            <Text style={{ flex: 1, fontSize: 9, color: DARK, lineHeight: 1.4 }}>
                <Text style={{ fontWeight: 700 }}>{text.slice(0, idx + 1)}</Text>
                {text.slice(idx + 1)}
            </Text>
        );
    }
    return <Text style={{ flex: 1, fontSize: 9, color: DARK, lineHeight: 1.4 }}>{text}</Text>;
};


export function ValleyTemplate({ data, qrBase64, labels, layoutMode = 'default' }: { data: CvStructuredData; qrBase64?: string; labels: CvTemplateLabels; layoutMode?: LayoutMode }) {
    const pi = data.personalInfo;
    const hasSkills = data.skills.length > 0;
    const hasLanguages = data.languages.length > 0;
    const hasCerts = data.certifications && data.certifications.length > 0;

    const s = buildStyles(layoutMode);

    const maxBullets = layoutMode === 'compact' ? MAX_BULLETS_COMPACT : MAX_BULLETS_DEFAULT;
    const cappedCerts = hasCerts ? data.certifications! : [];


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
                                <Text style={{ fontSize: 6.5, fontWeight: 700, color: DARK, marginTop: 3, textAlign: 'center' }}>{labels.qrLabel}</Text>
                                <Text style={{ fontSize: 5, color: MUTED, marginTop: 1, textAlign: 'center' }}>{labels.qrSubLabel}</Text>
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
                {/* Orphan-safe: title bound to first entry via wrap={false} \u2014 title never stands alone at page bottom */}
                {data.experience.length > 0 && (
                    <View style={s.sectionContainer}>
                        {data.experience.map((exp, idx) => (
                            <View key={exp.id} wrap={false}>
                                {idx === 0 && <Text style={s.sectionTitle}>{labels.experience}</Text>}
                                <View style={s.expBlock}>
                                    <View style={s.expTopRow}>
                                        <Text style={s.expRole}>{exp.role || ''}</Text>
                                        <Text style={s.expDate}>{normalizeDateRangeText(exp.dateRangeText, labels.present)}</Text>
                                    </View>
                                    {exp.company && (
                                        <Text style={s.expCompany}>
                                            {exp.company}{exp.location ? ` \u2022 ${exp.location}` : ''}
                                        </Text>
                                    )}
                                    {exp.description?.slice(0, maxBullets).map((b) => (
                                        <View key={b.id} style={s.bulletRow}>
                                            <Text style={s.bulletDot}>{'\u2022'}</Text>
                                            <RenderBullet text={b.text} />
                                        </View>
                                    ))}
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* ===== EDUCATION ===== */}
                {/* Orphan-safe: title bound to first entry via wrap={false} — fixes "AUSBILDUNG alone on page 1" bug */}
                {data.education.length > 0 && (
                    <View style={s.sectionContainer}>
                        {data.education.map((edu, idx) => {
                            const rawDesc = edu.description || '';
                            const subItems = rawDesc
                                .split(/\. (?=[A-ZÄÖÜ0-9])/g)
                                .map(s => s.replace(/\.$/, '').trim())
                                .filter(s => s.length > 2);
                            return (
                                <View key={edu.id} wrap={false}>
                                    {idx === 0 && <Text style={s.sectionTitle}>{labels.education}</Text>}
                                    <View style={s.eduBlock}>
                                        <View style={s.eduTopRow}>
                                            <Text style={s.eduDegree}>{edu.degree || ''}</Text>
                                            <Text style={s.eduDate}>{normalizeDateRangeText(edu.dateRangeText, labels.present)}</Text>
                                        </View>
                                        {edu.institution && <Text style={s.eduInstitution}>{edu.institution}</Text>}
                                        {edu.grade && (
                                            <View style={s.eduSubRow}>
                                                <Text style={s.eduSubLabel}>{labels.grade}: </Text>
                                                <Text style={s.eduSubText}>{edu.grade}</Text>
                                            </View>
                                        )}
                                        {subItems.map((item, i) => (
                                            <Text key={i} style={s.eduSubItem}>– {item}</Text>
                                        ))}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* ===== SKILLS \u2014 wrap={false}: compact section, title + grid stay together ===== */}
                {hasSkills && (
                    <View style={s.sectionContainer} wrap={false}>
                        <Text style={s.sectionTitle}>{labels.skills}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                            {data.skills.map((g) => (
                                <View key={g.id} style={{ width: data.skills.length >= 3 ? '33.33%' : '50%', paddingRight: 10, marginBottom: 6 }}>
                                    {g.category && <Text style={s.skillCategoryLabel}>{g.category}</Text>}
                                    <SkillTagGroup items={g.items} />
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ===== LANGUAGES \u2014 wrap={false}: compact section, title + grid stay together ===== */}
                {hasLanguages && (
                    <View style={s.sectionContainer} wrap={false}>
                        <Text style={s.sectionTitle}>{labels.languages}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                            {data.languages.map((l) => (
                                <View key={l.id} style={{ width: '50%', marginBottom: 4 }}>
                                    <Text style={{ fontSize: 9, color: DARK, lineHeight: 1.4 }}>
                                        <Text style={{ fontWeight: 700 }}>{l.language || ''}</Text>
                                        {l.proficiency ? ` \u2013 ${l.proficiency}` : ''}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ===== CERTIFICATES \u2014 wrap={false}: CertGrid kept with title (HARD CAP: 6) ===== */}
                {cappedCerts.length > 0 && (
                    <View style={s.sectionContainer} wrap={false}>
                        <Text style={s.sectionTitle}>{labels.certificates}</Text>
                        <CertGrid certs={cappedCerts} maxColumns={2} />
                    </View>
                )}


            </Page>
        </Document>
    );
}
