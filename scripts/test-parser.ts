
function extractMetadata(lines: string[], key: string): string {
    const line = lines.find((l) => l.startsWith(key + ':'));
    return line ? line.split(':')[1].trim() : '';
}

function parseResponse(content: string) {
    const lines = content.split('\n');
    let cvMetadataStartIndex = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith('ADDED_KEYWORDS:')) {
            cvMetadataStartIndex = i;
            break;
        }
    }

    let cvMarkdown = content;
    let addedKeywords = '';
    let reorderedBullets = 0;
    let quantifications = 0;
    let atsScore = 0;

    if (cvMetadataStartIndex !== -1) {
        cvMarkdown = lines.slice(0, cvMetadataStartIndex).join('\n').trim();
        const metadataLines = lines.slice(cvMetadataStartIndex);

        addedKeywords = extractMetadata(metadataLines, 'ADDED_KEYWORDS');
        reorderedBullets = parseInt(extractMetadata(metadataLines, 'REORDERED_BULLETS')) || 0;
        quantifications = parseInt(extractMetadata(metadataLines, 'QUANTIFICATIONS')) || 0;
        atsScore = parseInt(extractMetadata(metadataLines, 'ATS_SCORE')) || 0;
    }

    return {
        optimizedCV: cvMarkdown,
        changesLog: {
            added_keywords: addedKeywords ? addedKeywords.split(',').map(s => s.trim()).filter(Boolean) : [],
            reordered_bullets: reorderedBullets,
            quantifications_added: quantifications,
        },
        atsScore,
    };
}

const mockResponse = `# Optimized CV

**John Doe**
Start Software Engineer

## Experience
- Developed **React** applications...
- Optimized performance...

ADDED_KEYWORDS: React, TypeScript, Performance
REORDERED_BULLETS: 3
QUANTIFICATIONS: 2
ATS_SCORE: 85`;

console.log('Testing Parser...');
const result = parseResponse(mockResponse);

console.log('CV Length:', result.optimizedCV.length);
console.log('Keywords:', result.changesLog.added_keywords);
console.log('Reordered:', result.changesLog.reordered_bullets);
console.log('Score:', result.atsScore);

if (
    result.changesLog.added_keywords.includes('React') &&
    result.changesLog.reordered_bullets === 3 &&
    result.atsScore === 85 &&
    !result.optimizedCV.includes('ADDED_KEYWORDS')
) {
    console.log('✅ Parser Test PASSED');
} else {
    console.error('❌ Parser Test FAILED');
    process.exit(1);
}
