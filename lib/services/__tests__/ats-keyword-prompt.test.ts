import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

const PIPELINE_FILES = [
    'app/api/jobs/ingest/route.ts',
    'app/api/jobs/import/route.ts',
    'app/api/jobs/extract/route.ts',
    'lib/inngest/extract-job-pipeline.ts',
    'lib/services/job-search-pipeline.ts',
];

const CLEAN_WRITE_FILES = [
    ...PIPELINE_FILES,
    'app/api/jobs/confirm/route.ts',
];

function read(relativePath: string): string {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf-8');
}

describe('ATS keyword prompt and write-path regression guard', () => {
    it.each(PIPELINE_FILES)('%s uses the central prompt builder', (file) => {
        expect(read(file)).toContain('buildAtsKeywordPrompt');
    });

    it.each(CLEAN_WRITE_FILES)('%s uses the central keyword cleaner', (file) => {
        expect(read(file)).toContain('cleanAtsKeywords');
    });

    it.each(PIPELINE_FILES)('%s does not reintroduce leaky INCLUDE examples', (file) => {
        const content = read(file);
        expect(content).not.toMatch(/INCLUDE:.{0,240}ISO 26262/is);
        expect(content).not.toMatch(/INCLUDE:.{0,240}DSGVO/is);
        expect(content).not.toMatch(/INCLUDE:.{0,240}PCI DSS/is);
        expect(content).not.toMatch(/Eigennamen.{0,240}ISO/is);
    });

    it.each(PIPELINE_FILES)('%s does not define ad-hoc ATS keyword rules inline', (file) => {
        const content = read(file);
        expect(content).not.toMatch(/MAXIMUM 15 ATS keywords\. ONLY:/);
        expect(content).not.toMatch(/max 12 ATS Keywords/);
        expect(content).not.toMatch(/"ats_keywords": \["string"\]/);
    });

    it('Job Search harvester keeps Steckbrief bullets and benefits in the canonical format', () => {
        const content = read('lib/services/job-search-pipeline.ts');

        expect(content).toContain('Jeder Punkt beginnt mit **Schlüsselphrase**');
        expect(content).toContain('Extrahiere nur die 5-6 wichtigsten Benefits');
        expect(content).toContain('Maximal 6 Wörter pro Benefit');
    });
});
