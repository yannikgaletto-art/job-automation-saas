import { complete } from '@/lib/ai/model-router';

export interface CVOptimizationRequest {
    cvText: string;
    jobTitle: string;
    jobRequirements: string[];
    jobDescription: string;
}

export interface CVOptimizationResult {
    optimizedCV: string;
    changesLog: {
        added_keywords: string[];
        reordered_bullets: number;
        quantifications_added: number;
    };
    atsScore: number; // 0-100
}

export async function optimizeCV(
    request: CVOptimizationRequest
): Promise<CVOptimizationResult> {
    const prompt = `You are a professional CV optimizer. Your task is to optimize this CV for the given job.

**CRITICAL RULES:**
1. ✅ KEEP ALL FACTS TRUTHFUL - NO hallucinations
2. ✅ Reorder bullet points (most relevant first)
3. ✅ Add missing keywords from job description (if truthful)
4. ✅ Quantify achievements where possible (if data exists)
5. ✅ Keep total length under 2 pages
6. ❌ NEVER invent experience, projects, or skills
7. ❌ NEVER change dates or company names
8. ❌ NEVER add achievements that didn't happen

**ORIGINAL CV:**
${request.cvText}

**JOB TITLE:**
${request.jobTitle}

**JOB REQUIREMENTS:**
${request.jobRequirements.join('\n')}

**JOB DESCRIPTION:**
${request.jobDescription}

**YOUR TASK:**
- Analyze which experiences/skills are most relevant
- Reorder bullet points (relevant first)
- Highlight matching keywords (bold in Markdown)
- Add section headers if missing
- Ensure ATS-friendly format

**OUTPUT FORMAT:**
Return optimized CV in Markdown format.
Then on separate lines at the very end:
ADDED_KEYWORDS: comma-separated list
REORDERED_BULLETS: count
QUANTIFICATIONS: count
ATS_SCORE: 0-100`;

    const result = await complete({
        taskType: 'optimize_cv',
        prompt,
        temperature: 0.2, // Low temperature for factual accuracy
        maxTokens: 4000,
    });

    // Parse response
    const content = result.text;

    // Split content from metadata (searching from the end)
    const lines = content.split('\n');
    let cvMetadataStartIndex = -1;

    // Look for metadata markers from the bottom up
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

function extractMetadata(lines: string[], key: string): string {
    const line = lines.find((l) => l.startsWith(key + ':'));
    return line ? line.split(':')[1].trim() : '';
}
