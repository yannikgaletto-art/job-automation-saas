import React from 'react';
import { View, Text, Link, StyleSheet } from '@react-pdf/renderer';

const truncate = (str: string, max: number) =>
    str.length > max ? str.slice(0, max - 1) + '…' : str;

const DARK = '#0F172A';
const GRAY = '#6B7280';

const s = StyleSheet.create({
    grid: {
        flexDirection: 'row',
    },
    column: {
        flex: 1,
    },
    columnLeft: {
        flex: 1,
        paddingRight: 8,
    },
    columnRight: {
        flex: 1,
        paddingLeft: 8,
    },
    item: {
        marginBottom: 6,
    },
    name: {
        fontSize: 8.5,
        fontWeight: 700,
        color: DARK,
    },
    detail: {
        fontSize: 7.5,
        color: GRAY,
    },
    link: {
        fontSize: 7,
        color: '#2563EB',
        marginTop: 1,
    },
});

interface CertEntry {
    id: string;
    name?: string;
    issuer?: string;
    dateText?: string;
    credentialUrl?: string;
}

function CertItem({ cert }: { cert: CertEntry }) {
    return (
        <View style={s.item}>
            <Text style={s.name}>{truncate(cert.name || '', 80)}</Text>
            <Text style={s.detail}>
                {[cert.issuer, cert.dateText].filter(Boolean).join(' · ')}
            </Text>
            {cert.credentialUrl && (
                <Link src={cert.credentialUrl} style={s.link}>
                    Verify →
                </Link>
            )}
        </View>
    );
}

/**
 * Renders certifications in a 2-column grid when > 3 certs,
 * single column otherwise. Optimizes vertical space.
 */
export function CertGrid({ certs, maxColumns = 2 }: { certs: CertEntry[]; maxColumns?: 1 | 2 }) {
    if (certs.length <= 3 || maxColumns === 1) {
        return (
            <View>
                {certs.map(cert => <CertItem key={cert.id} cert={cert} />)}
            </View>
        );
    }

    const left = certs.filter((_, i) => i % 2 === 0);
    const right = certs.filter((_, i) => i % 2 === 1);

    return (
        <View style={s.grid}>
            <View style={s.columnLeft}>
                {left.map(cert => <CertItem key={cert.id} cert={cert} />)}
            </View>
            <View style={s.columnRight}>
                {right.map(cert => <CertItem key={cert.id} cert={cert} />)}
            </View>
        </View>
    );
}
