/**
 * azure-document-extractor.ts
 *
 * Azure Document Intelligence — Primary CV text extractor.
 * Uses the prebuilt-layout model (layout + semantic structure aware OCR)
 * for all PDF/DOCX uploads.
 *
 * DSGVO: Data processed exclusively in EU (West Europe).
 * Endpoint: https://pathly.cognitiveservices.azure.com/
 * API: Document Intelligence REST API v2024-11-30
 *
 * Why prebuilt-layout instead of prebuilt-read:
 *   - Recognizes tables, section headings, and key-value pairs
 *   - Returns paragraph roles (sectionHeading, pageHeader, etc.)
 *   - Correctly handles multi-column CV layouts (bounding-box aware ordering)
 *   - Returns tables[] for Europass / table-structured CVs
 *   - Same price, same EU region, better semantic structure
 *
 * Supported CV layouts:
 *   ✅ Single-column: classic linear CV
 *   ✅ Two-column: dates left, content right (most designer CVs)
 *   ✅ Table-structured: Europass, XING-export, Word-table CVs
 *   ✅ Scanned PDFs: OCR fallback via Azure, then local fallback
 *   ✅ DOCX: Native DOCX support via Azure API
 *
 * Fallback chain:
 *   Azure prebuilt-layout → null → caller falls back to local pdf-parse
 */

const AZURE_ENDPOINT = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT!;
const AZURE_KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY!;
const API_VERSION = '2024-11-30';
const MIN_CHARS = 200; // Minimum text length to consider extraction successful
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000; // 60s max wait

// Y-coordinate tolerance for "same row" detection in multi-column layouts.
// Azure polygon coordinates are in inches on the page.
// 0.15 inches ≈ typical line height — safe for matching columns on the same line
// without mixing adjacent rows (which could be as close as 0.18 inches apart).
// Reverted to original tested value (was working before 2026-04-05 changes).
const SAME_ROW_Y_TOLERANCE_INCHES = 0.15;

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

        // Step 1: Submit the document for analysis using prebuilt-layout
        // prebuilt-layout gives us semantic paragraph roles + table structure
        const analyzeUrl = `${AZURE_ENDPOINT.replace(/\/$/, '')}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=${API_VERSION}`;

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

        console.log(`🔵 [Azure] Analysis submitted (prebuilt-layout). Polling result...`);

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
                console.log(`✅ [Azure] Text extracted (prebuilt-layout): ${text.length} chars (EU, DSGVO-konform)`);
                return text;
            }

            if (result.status === 'failed') {
                console.error('❌ [Azure] Analysis failed:', result.error?.message || 'Unknown error');
                return null;
            }

            // status === 'running' or 'notStarted' — continue polling
            console.log(`🔵 [Azure] Status: ${result.status} — waiting...`);
        }

        console.error('❌ [Azure] Timeout after 60s — falling back');
        return null;

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [Azure] Unexpected error: ${msg}`);
        return null;
    }
}

/**
 * Extracts text from prebuilt-layout result with full structure-aware ordering.
 *
 * Handles all common CV layout types:
 *
 * LAYOUT A — Single-column (classic):
 *   Paragraphs are in natural top-to-bottom order. Y-sort works perfectly.
 *
 * LAYOUT B — Two-column (designer CV: dates left, content right):
 *   Paragraphs have Y-coordinates. Date-column entries and content-column
 *   entries on the SAME LINE have nearly identical Y-values. We sort by Y
 *   then by X within the same row to linearize: Date → Company → Role → Bullets.
 *
 * LAYOUT C — Table-structured (Europass, Word-table, XING-export):
 *   Azure returns these as tables[]. We merge table cells row-by-row,
 *   column-by-column into readable text blocks. WITHOUT this, entire
 *   experience sections would be silently lost.
 *
 * LAYOUT D — Scanned PDF (image-based):
 *   Azure OCR gives bounding boxes but they may be approximate. We apply
 *   the same Y-sort strategy. Scanned CVs often lack a header role, so
 *   we're defensive about empty roles.
 */
function extractTextFromResult(result: AzureAnalyzeResult): string {
    const paragraphs = result.analyzeResult?.paragraphs ?? [];
    const pages = result.analyzeResult?.pages ?? [];
    const tables = result.analyzeResult?.tables ?? [];

    // Build a set of content strings that are in tables — used to de-duplicate
    // paragraphs that Azure sometimes also emits for table cell content
    const tableContentSet = new Set<string>();
    for (const table of tables) {
        for (const cell of table.cells ?? []) {
            if (cell.content?.trim()) tableContentSet.add(cell.content.trim());
        }
    }

    const textParts: string[] = [];

    // --- Build a unified, page-ordered list of "blocks" ---
    // Each block has a page number and a Y-position for sorting

    interface TextBlock {
        pageNumber: number;
        y: number;  // top of block in inches (page-relative)
        x: number;  // left of block in inches (for same-row X-sort)
        text: string;
        isHeading: boolean;
    }

    const blocks: TextBlock[] = [];

    // 1. Add paragraphs
    for (const p of paragraphs) {
        const content = p.content?.trim();
        if (!content) continue;

        // Skip page headers/footers — never CV content
        if (p.role === 'pageHeader' || p.role === 'pageFooter' || p.role === 'footnote') continue;

        // Skip content that is already represented in a table — prevents duplicate text
        if (tableContentSet.has(content)) continue;

        const region = p.boundingRegions?.[0];
        const pageNumber = region?.pageNumber ?? 1;
        // polygon[1] = top-left Y, polygon[0] = top-left X (inches)
        // Guard: if no bounding region, assign Y = Infinity so it sorts to the end
        // (do NOT default to 0, which would incorrectly put it at the top)
        const y = region?.polygon?.[1] ?? Infinity;
        const x = region?.polygon?.[0] ?? 0;

        const isHeading = p.role === 'sectionHeading' || p.role === 'title';

        blocks.push({ pageNumber, y, x, text: content, isHeading });
    }

    // 2. Add table content — reconstruct row-by-row (LAYOUT C: Europass, table CVs)
    for (const table of tables) {
        const cells = table.cells ?? [];
        if (cells.length === 0) continue;

        // Get the table's position on the page
        const tableRegion = table.boundingRegions?.[0];
        const tablePageNum = tableRegion?.pageNumber ?? 1;
        const tableY = tableRegion?.polygon?.[1] ?? Infinity;

        // Group cells by row
        const rowMap = new Map<number, AzureTableCell[]>();
        for (const cell of cells) {
            if (!rowMap.has(cell.rowIndex)) rowMap.set(cell.rowIndex, []);
            rowMap.get(cell.rowIndex)!.push(cell);
        }

        // Build a text block per table row: columns joined with " | "
        const rowTexts: string[] = [];
        const sortedRows = [...rowMap.keys()].sort((a, b) => a - b);
        for (const rowIdx of sortedRows) {
            const rowCells = rowMap.get(rowIdx)!.sort((a, b) => a.columnIndex - b.columnIndex);
            const rowText = rowCells
                .map(c => c.content?.trim())
                .filter(Boolean)
                .join(' | ');
            if (rowText) rowTexts.push(rowText);
        }

        if (rowTexts.length > 0) {
            blocks.push({
                pageNumber: tablePageNum,
                y: tableY,
                x: 0,
                text: rowTexts.join('\n'),
                isHeading: false,
            });
        }
    }

    if (blocks.length > 0) {
        // Sort blocks: page ascending → Y ascending → X ascending
        blocks.sort((a, b) => {
            if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
            // Same-row tolerance: if Y difference < threshold, sort by X (left column first)
            if (Math.abs(a.y - b.y) < SAME_ROW_Y_TOLERANCE_INCHES) return a.x - b.x;
            return a.y - b.y;
        });

        // Track current page to insert separators
        let currentPage = -1;
        const lastPage = Math.max(...blocks.map(b => b.pageNumber));

        for (const block of blocks) {
            if (block.pageNumber !== currentPage) {
                if (currentPage !== -1 && currentPage < lastPage) {
                    textParts.push('\n---\n'); // page separator
                }
                currentPage = block.pageNumber;
            }

            if (block.isHeading) {
                textParts.push(`\n## ${block.text}\n`);
            } else {
                // Detect aggregated date-column blocks: these occur when a designer CV's
                // left date-column is returned as one paragraph by Azure (all start/end dates
                // for every station concatenated in a single text node).
                // We split them into individual date-pair lines so the CV parser can
                // match them to the station content that follows in text order.
                const splitText = splitAggregatedDateColumn(block.text);
                textParts.push(splitText ?? block.text);
            }
        }

        return textParts.join('\n');
    }

    // Fallback: concatenate all lines from all pages (raw reading order)
    // Used for scanned PDFs where Azure returns no paragraphs/tables at all
    console.warn('⚠️ [Azure] No paragraphs or tables found — falling back to raw lines');
    return pages
        .flatMap((page: AzurePage) => page.lines ?? [])
        .map((line: AzureLine) => line.content?.trim())
        .filter(Boolean)
        .join('\n');
}

/**
 * Detects blocks that contain ONLY date tokens (MM.YYYY / YYYY / "Heute" / "heute")
 * with whitespace between them — characteristic of designer CVs where Azure returns
 * the entire date column (all start+end dates for all stations) as one paragraph.
 *
 * When detected, splits into one date-pair per line so the downstream CV parser can
 * match pairs to stations by sequential order.
 *
 * Returns the reformatted string, or null if the block is NOT an aggregated date block.
 */
function splitAggregatedDateColumn(text: string): string | null {
    // Extract all date tokens: MM.YYYY, YYYY (4-digit years 1950-2099), or "Heute"/"heute"
    const DATE_TOKEN = /\b(\d{2}\.\d{4}|\b(?:19|20)\d{2}\b|[Hh]eute|[Pp]resent|[Aa]ctual)\b/g;
    const matches = [...text.matchAll(DATE_TOKEN)];
    if (matches.length < 4) return null; // Need at least 2 pairs

    // After removing date tokens and separators, very little should remain
    const residual = text
        .replace(DATE_TOKEN, '')
        .replace(/[\s\-–/,]+/g, '')
        .trim();

    // If there's significant non-date content, this is a normal mixed paragraph
    if (residual.length > 15) return null;

    // Group consecutive tokens into pairs (start – end) and put each pair on its own line
    const tokens = matches.map(m => m[0]);
    const lines: string[] = [];
    for (let i = 0; i < tokens.length; i += 2) {
        if (i + 1 < tokens.length) {
            lines.push(`${tokens[i]} - ${tokens[i + 1]}`);
        } else {
            lines.push(tokens[i]);
        }
    }
    return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Azure API Types (extended for prebuilt-layout) ──────────────────────────

interface AzureAnalyzeResult {
    status: 'notStarted' | 'running' | 'succeeded' | 'failed';
    error?: { message: string };
    analyzeResult?: {
        pages?: AzurePage[];
        paragraphs?: AzureParagraph[];
        tables?: AzureTable[];
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
    role?: 'sectionHeading' | 'title' | 'pageHeader' | 'pageFooter' | 'footnote' | string;
    boundingRegions?: AzureBoundingRegion[];
}

interface AzureBoundingRegion {
    pageNumber: number;
    polygon?: number[]; // [x1,y1, x2,y2, x3,y3, x4,y4] — 4 corners in inches
}

interface AzureTable {
    rowCount: number;
    columnCount: number;
    cells?: AzureTableCell[];
    boundingRegions?: AzureBoundingRegion[];
}

interface AzureTableCell {
    rowIndex: number;
    columnIndex: number;
    content?: string;
}
