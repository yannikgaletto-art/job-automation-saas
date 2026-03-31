import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';

const s = StyleSheet.create({
    tag: {
        backgroundColor: '#F1F5F9',
        color: '#0F172A',
        fontSize: 7.5,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        fontWeight: 600,
        marginRight: 4,
        marginBottom: 4,
    },
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
});

export function SkillTag({ text }: { text: string }) {
    return <Text style={s.tag}>{text}</Text>;
}

/**
 * ATS-safe skill rendering: comma-separated plaintext.
 * Replaced pill-based rendering (2026-03-30) for Valley Template ATS compliance.
 * Old pill rendering: each skill in its own styled <Text> box with background/border-radius.
 * New: all skills as "Python, Make, Bubble" in a single <Text> element.
 */
export function SkillTagGroup({ items }: { items: string[] }) {
    return (
        <Text style={{ fontSize: 9, color: '#0F172A', lineHeight: 1.5 }}>
            {items.join(', ')}
        </Text>
    );
}
