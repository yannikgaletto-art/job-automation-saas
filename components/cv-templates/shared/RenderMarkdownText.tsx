import React from 'react';
import { Text } from '@react-pdf/renderer';

/**
 * Parses simple **bold** markdown markers in text and renders
 * them as fontWeight: 700 in @react-pdf Text nodes.
 *
 * AI-driven: The CV optimizer marks 3-5 impactful phrases with **asterisks**.
 * This component just parses them. No regex keyword matching needed.
 *
 * Graceful fallback: if no ** markers exist, renders as plain text.
 */
export function RenderMarkdownText({ text, style }: { text: string; style?: any }) {
    if (!text) return <Text style={style}>{''}</Text>;

    // Split on **bold** markers, keeping the delimiters
    const parts = text.split(/(\*\*[^*]+\*\*)/g);

    if (parts.length === 1) {
        // No bold markers found — plain text
        return <Text style={style}>{text}</Text>;
    }

    return (
        <Text style={style}>
            {parts.map((part, i) =>
                part.startsWith('**') && part.endsWith('**')
                    ? <Text key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</Text>
                    : part
            )}
        </Text>
    );
}
