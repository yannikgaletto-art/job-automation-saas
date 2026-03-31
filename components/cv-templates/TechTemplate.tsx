import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { registerPdfFonts } from '@/lib/utils/pdf-fonts';
import { CvStructuredData } from '@/types/cv';
import { CertGrid } from './shared/CertGrid';
import { RenderMarkdownText } from './shared/RenderMarkdownText';
import { inferLanguageLevel, normalizeDateRangeText } from '@/lib/utils/cv-template-helpers';
import { CvTemplateLabels } from '@/lib/utils/cv-template-labels';

registerPdfFonts();

const ACCENT = '#0E7490';
const DARK = '#0F172A';
const GRAY = '#475569';
const LIGHT = '#F1F5F9';

const s = StyleSheet.create({
    page: {
        fontFamily: 'Inter',
        fontSize: 9,
        color: DARK,
        paddingTop: 36,
        paddingBottom: 36,
        paddingHorizontal: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottomWidth: 2,
        borderBottomColor: DARK,
        paddingBottom: 16,
        marginBottom: 20,
    },
    headerLeft: {
        flex: 1,
        paddingRight: 8,
    },
    name: {
        fontSize: 28,
        fontWeight: 700,
        color: DARK,
        letterSpacing: -0.5,
    },
    roleTitle: {
        fontSize: 12,
        color: ACCENT,
        fontWeight: 600,
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    headerRight: {
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        flexShrink: 0,
    },
    contactTag: {
        backgroundColor: LIGHT,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        fontSize: 8,
        color: GRAY,
        fontWeight: 600,
        marginBottom: 4,
    },
    columns: {
        flexDirection: 'row',
    },
    mainCol: {
        flex: 2,
        paddingRight: 12,
    },
    sideCol: {
        flex: 1,
        paddingLeft: 12,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 700,
        color: DARK,
        marginBottom: 12,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: LIGHT,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // Experience
    expBlock: {
        marginBottom: 16,
    },
    expHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    expRole: {
        fontSize: 10,
        fontWeight: 700,
        color: DARK,
        flex: 1,
        paddingRight: 8,
    },
    expDateTag: {
        fontSize: 8,
        fontWeight: 600,
        color: ACCENT,
        backgroundColor: '#CFFAFE',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        flexShrink: 0,
    },
    expCompany: {
        fontSize: 9,
        color: GRAY,
        fontWeight: 600,
        marginBottom: 6,
    },
    bulletRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    bulletDot: {
        width: 14,
        color: ACCENT,
        fontSize: 9,
    },
    bulletText: {
        flex: 1,
        fontSize: 9,
        color: GRAY,
        lineHeight: 1.4,
    },
    // Sidebar items
    sideBlock: {
        marginBottom: 12,
    },
    sideLabel: {
        fontSize: 8,
        fontWeight: 700,
        color: DARK,
        marginBottom: 2,
    },
    sideText: {
        fontSize: 8,
        color: GRAY,
        lineHeight: 1.4,
    },

    // Language dots row
    langRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    langLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});

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

export function TechTemplate({ data, qrBase64, labels }: { data: CvStructuredData; qrBase64?: string; labels: CvTemplateLabels }) {
    const pi = data.personalInfo;

    return (
        <Document>
            <Page size="A4" style={s.page}>
                {/* Header */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <Text style={s.name}>{pi.name || ''}</Text>
                        <Text style={s.roleTitle}>{pi.targetRole || (pi.summary ? 'Software Engineer / Tech Lead' : '')}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* QR Code — Video Approach (page 1 only, left of contact) */}
                        {qrBase64 && (
                            <View style={{ alignItems: 'center', marginRight: 10 }}>
                                <Image src={qrBase64} style={{ width: 42, height: 42 }} />
                                <Text style={{ fontSize: 6.5, fontWeight: 700, color: DARK, marginTop: 3, textAlign: 'center' }}>{labels.qrLabel}</Text>
                                <Text style={{ fontSize: 5, color: GRAY, marginTop: 1, textAlign: 'center' }}>{labels.qrSubLabel}</Text>
                            </View>
                        )}
                        <View style={s.headerRight}>
                            {pi.email && <Text style={s.contactTag}>{pi.email}</Text>}
                            {pi.phone && <Text style={s.contactTag}>{pi.phone}</Text>}
                            {pi.linkedin && <Text style={s.contactTag}>{pi.linkedin}</Text>}
                            {pi.location && <Text style={s.contactTag}>{pi.location}</Text>}
                        </View>
                    </View>
                </View>

                {/* 2/3 and 1/3 Columns */}
                <View style={s.columns}>

                    {/* Main Column */}
                    <View style={s.mainCol}>
                        {pi.summary && (
                            <View style={{ marginBottom: 20 }}>
                                <Text style={s.sectionTitle}>{labels.summary}</Text>
                                <RenderMarkdownText text={pi.summary} style={{ fontSize: 9, color: GRAY, lineHeight: 1.5 }} />
                            </View>
                        )}

                        {data.experience.length > 0 && (
                            <View>
                                <Text style={s.sectionTitle}>{labels.experience}</Text>
                                {data.experience.map(exp => (
                                    <View key={exp.id} style={s.expBlock} wrap={false}>
                                        <View style={s.expHeader}>
                                            <Text style={s.expRole}>{exp.role || ''}</Text>
                                            <Text style={s.expDateTag}>{normalizeDateRangeText(exp.dateRangeText, labels.present)}</Text>
                                        </View>
                                        <Text style={s.expCompany}>{exp.company || ''} {exp.location ? `// ${exp.location}` : ''}</Text>

                                        {exp.description?.map(bullet => (
                                            <View key={bullet.id} style={s.bulletRow}>
                                                <Text style={s.bulletDot}>{'\u203A'}</Text>
                                                <RenderBullet text={bullet.text} />
                                            </View>
                                        ))}
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Sidebar Column */}
                    <View style={s.sideCol}>
                        {/* Skills — keep tags for tech template style */}
                        {data.skills.length > 0 && (
                            <View style={{ marginBottom: 20 }}>
                                <Text style={s.sectionTitle}>{labels.techStack}</Text>
                                {data.skills.map(group => (
                                    <View key={group.id} style={s.sideBlock}>
                                        <Text style={s.sideLabel}>{group.category || 'Core'}</Text>
                                        <Text style={s.sideText}>{group.items.join(', ')}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Education */}
                        {data.education.length > 0 && (
                            <View style={{ marginBottom: 20 }}>
                                <Text style={s.sectionTitle}>{labels.education}</Text>
                                {data.education.map(edu => (
                                    <View key={edu.id} style={s.sideBlock} wrap={false}>
                                        <Text style={s.sideLabel}>{edu.degree || ''}</Text>
                                        <Text style={s.sideText}>{edu.institution || ''}</Text>
                                        <Text style={[s.sideText, { color: ACCENT, marginTop: 2 }]}>{normalizeDateRangeText(edu.dateRangeText, labels.present)}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Certifications — V2: CertGrid */}
                        {data.certifications && data.certifications.length > 0 && (
                            <View style={{ marginBottom: 20 }} wrap={false} minPresenceAhead={40}>
                                <Text style={s.sectionTitle}>{labels.certificates}</Text>
                                <CertGrid certs={data.certifications} maxColumns={1} />
                            </View>
                        )}

                        {/* Languages — V2: with ProficiencyDots */}
                        {data.languages.length > 0 && (
                            <View>
                                <Text style={s.sectionTitle}>{labels.languages}</Text>
                                {data.languages.map(lang => (
                                    <View key={lang.id} style={s.langRow} wrap={false}>
                                        <View style={s.langLeft}>
                                            <Text style={[s.sideLabel, { marginBottom: 0, marginRight: 6 }]}>{lang.language || ''}</Text>
                                            {lang.proficiency ? <Text style={s.sideText}>– {lang.proficiency}</Text> : null}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                </View>


            </Page>
        </Document>
    );
}
