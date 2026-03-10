import React from 'react';
import { View, StyleSheet } from '@react-pdf/renderer';

const s = StyleSheet.create({
    container: {
        flexDirection: 'row',
    },
    dotFilled: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#0F172A',
        marginRight: 2,
    },
    dotEmpty: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#E2E8F0',
        marginRight: 2,
    },
});

export function ProficiencyDots({ level = 3 }: { level?: number }) {
    return (
        <View style={s.container}>
            {[1, 2, 3, 4, 5].map(i => (
                <View key={i} style={i <= level ? s.dotFilled : s.dotEmpty} />
            ))}
        </View>
    );
}
