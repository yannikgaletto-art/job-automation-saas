import mammoth from 'mammoth';

async function extractPdfText(buffer: Buffer): Promise<string> {
    // Use dynamic import to ensure Next.js/Turbopack doesn't bundle it as a client-side module
    const PDFParser = (await import('pdf2json')).default;

    return new Promise((resolve, reject) => {
        const parser = new PDFParser(null, true);

        parser.on('pdfParser_dataReady', (pdfData: any) => {
            try {
                // pdf2json stores text in pages → fills → texts
                const text = pdfData.Pages?.map((page: any) =>
                    page.Texts?.map((t: any) =>
                        decodeURIComponent(t.R?.map((r: any) => r.T).join('') ?? '')
                    ).join(' ')
                ).join('\n') ?? '';
                resolve(text);
            } catch (e) {
                reject(new Error('Failed to parse PDF content'));
            }
        });

        parser.on('pdfParser_dataError', (err: any) => {
            reject(new Error(`PDF parse error: ${err?.parserError ?? 'unknown'}`));
        });

        parser.parseBuffer(buffer);
    });
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
        if (mimeType === 'application/pdf') {
            return await extractPdfText(buffer);
        } else if (
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimeType === 'application/docx'
        ) {
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        } else if (mimeType === 'text/plain') {
            return buffer.toString('utf-8');
        } else {
            throw new Error(`Unsupported file type: ${mimeType}`);
        }
    } catch (error) {
        console.error(`Error extracting text from ${mimeType}:`, error);
        throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
