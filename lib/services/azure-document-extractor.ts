/**
 * azure-document-extractor.ts
 *
 * Azure Document Intelligence — Primary CV text extractor.
 * Uses the prebuilt-read model (layout-aware OCR) for all PDF/DOCX uploads.
 *
 * DSGVO: Data processed exclusively in EU (West Europe).
 * Endpoint: https://pathly.cognitiveservices.azure.com/
 * API: Document Intelligence REST API v2024-11-30
 *
 * Fallback: If Azure is unavailable or returns < MIN_CHARS, caller falls back to Claude.
 */

const AZURE_ENDPOINT = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT!;
const AZURE_KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY!;
const API_VERSION = '2024-11-30';
const MIN_CHARS = 200; // Minimum text length to consider extraction successful
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000; // 60s max wait

/**
 * Extracts plain text from a document buffer using Azure Document Intelligence.
 *
 * @param buffer - Raw file bytes (PDF or DOCX)
 * @param mimeType - MIME type of the document
 * @returns Extracted text string, or null if Azure is unavailable or extraction fails
 */
export async function extractTextWithAzure(
    buffer: Buffer,
    mimeType: string
): Promise<string | null> {
    if (!AZURE_ENDPOINT || !AZURE_KEY) {
        console.warn('⚠️ [Azure] Credentials not configured — skipping Azure extraction');
        return null;
    }

    try {
        console.log(`🔵 [Azure] Starting document analysis (${buffer.length} bytes, ${mimeType})`);

        // Step 1: Submit the document for analysis
        const analyzeUrl = `${AZURE_ENDPOINT.replace(/\/$/, '')}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${API_VERSION}`;

        const submitRes = await fetch(analyzeUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_KEY,
                'Content-Type': mimeType,
            },
            body: new Uint8Array(buffer),
        });

        if (!submitRes.ok) {
            const errText = await submitRes.text();
            console.error(`❌ [Azure] Submit failed (${submitRes.status}): ${errText}`);
            return null;
        }

        // Operation URL is returned in the Operation-Location header
        const operationUrl = submitRes.headers.get('Operation-Location');
        if (!operationUrl) {
            console.error('❌ [Azure] No Operation-Location header in response');
            return null;
        }

        console.log(`🔵 [Azure] Analysis submitted. Polling result...`);

        // Step 2: Poll until complete or timeout
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
            await sleep(POLL_INTERVAL_MS);

            const pollRes = await fetch(operationUrl, {
                headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY },
            });

            if (!pollRes.ok) {
                console.error(`❌ [Azure] Polling failed (${pollRes.status})`);
                return null;
            }

            const result = await pollRes.json();

            if (result.status === 'succeeded') {
                const text = extractTextFromResult(result);
                if (!text || text.length < MIN_CHARS) {
                    console.warn(`⚠️ [Azure] Extraction succeeded but text too short (${text?.length ?? 0} chars) — will fallback`);
                    return null;
                }
                console.log(`✅ [Azure] Text extracted: ${text.length} chars (EU, DSGVO-konform)`);
                return text;
            }

            if (result.status === 'failed') {
                console.error('❌ [Azure] Analysis failed:', result.error?.message || 'Unknown error');
                return null;
            }

            // status === 'running' or 'notStarted' — continue polling
            console.log(`🔵 [Azure] Status: ${result.status} — waiting...`);
        }

        console.error('❌ [Azure] Timeout after 60s — falling back to Claude');
        return null;

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [Azure] Unexpected error: ${msg}`);
        return null;
    }
}

/**
 * Extracts concatenated text content from the Azure Document Intelligence response.
 * Preserves paragraph structure for better LLM consumption.
 */
function extractTextFromResult(result: AzureAnalyzeResult): string {
    const pages = result.analyzeResult?.pages ?? [];
    const paragraphs = result.analyzeResult?.paragraphs ?? [];

    // Prefer paragraphs (semantic structure) over raw lines
    if (paragraphs.length > 0) {
        return paragraphs
            .map((p: AzureParagraph) => p.content?.trim())
            .filter(Boolean)
            .join('\n\n');
    }

    // Fallback: concatenate all lines from all pages
    return pages
        .flatMap((page: AzurePage) => page.lines ?? [])
        .map((line: AzureLine) => line.content?.trim())
        .filter(Boolean)
        .join('\n');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Azure API Types (minimal) ───────────────────────────────────────────────

interface AzureAnalyzeResult {
    status: 'notStarted' | 'running' | 'succeeded' | 'failed';
    error?: { message: string };
    analyzeResult?: {
        pages?: AzurePage[];
        paragraphs?: AzureParagraph[];
    };
}

interface AzurePage {
    lines?: AzureLine[];
}

interface AzureLine {
    content?: string;
}

interface AzureParagraph {
    content?: string;
}
