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

export function SkillTagGroup({ items }: { items: string[] }) {
    return (
        <View style={s.container}>
            {items.map((item, i) => (
                <SkillTag key={i} text={item} />
            ))}
        </View>
    );
}
