// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse');
import mammoth from 'mammoth';

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
        if (mimeType === 'application/pdf') {
            const data = await pdf(buffer);
            return data.text;
        }
        else if (
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimeType === 'application/docx'
        ) {
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        }
        else if (mimeType === 'text/plain') {
            return buffer.toString('utf-8');
        }
        else {
            throw new Error(`Unsupported file type: ${mimeType}`);
        }
    } catch (error) {
        console.error(`Error extracting text from ${mimeType}:`, error);
        throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
