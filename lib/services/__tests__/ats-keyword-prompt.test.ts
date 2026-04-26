/**
 * ATS-Keyword-Prompt Regression Tests
 *
 * These tests assert the structural integrity of the ATS-keyword extraction prompts
 * across the 4 pipeline files. They were written after a verified prompt-engineering bug
 * (2026-04-26): the LLM was hallucinating "DSGVO", "ISO 9001/26262/27001" into every
 * job output because those terms appeared as INCLUDE-style examples in the prompts.
 *
 * The tests do NOT validate live LLM output (impossible without a real API call).
 * They validate the prompt strings as plain text — guarding against regression where
 * a future agent re-introduces concrete ISO/compliance examples into INCLUDE lists.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

interface PipelineFile {
    name: string;
    relativePath: string;
}

const PIPELINE_FILES: PipelineFile[] = [
    { name: 'extract-job-pipeline (Inngest async)', relativePath: 'lib/inngest/extract-job-pipeline.ts' },
    { name: 'jobs/import (Browser Extension)', relativePath: 'app/api/jobs/import/route.ts' },
    { name: 'jobs/ingest (manual entry)', relativePath: 'app/api/jobs/ingest/route.ts' },
    { name: 'job-search-pipeline (Job Search Harvester)', relativePath: 'lib/services/job-search-pipeline.ts' },
];

function readPipelineFile(file: PipelineFile): string {
    return fs.readFileSync(path.join(REPO_ROOT, file.relativePath), 'utf-8');
}

describe('ATS-Keyword Prompt Regression Guard', () => {
    describe('No ISO/compliance examples in INCLUDE position', () => {
        // The historic bug pattern: "INCLUDE: ..., ISO 26262, ..." or "Eigennamen ... (ISO 9001/27001/26262)"
        // The LLM treats these as "must emit", not "examples of category".

        for (const file of PIPELINE_FILES) {
            test(`${file.name}: no "ISO 26262" listed alongside INCLUDE/Eigennamen examples`, () => {
                const content = readPipelineFile(file);
                // Search for the specific historical anti-patterns reported in the handover
                const violatingPatterns = [
                    /INCLUDE:.{0,200}ISO 26262/i,
                    /Eigennamen.{0,200}ISO\s*\d{4,5}/i,
                    /standards.{0,80}ISO 9001.{0,40}ISO 27001.{0,40}ISO 26262/i,
                ];
                for (const pattern of violatingPatterns) {
                    expect(content).not.toMatch(pattern);
                }
            });

            test(`${file.name}: no concrete ISO numbers in the buzzwords prompt block`, () => {
                const content = readPipelineFile(file);
                // Locate the buzzwords prompt block (heuristic: take a window around the keyword "buzzwords")
                const buzzwordsBlockMatches = content.match(/buzzwords[\s\S]{0,2500}/gi) ?? [];
                for (const block of buzzwordsBlockMatches) {
                    // Guard against ISO 9001 / 27001 / 26262 / PCI DSS appearing as concrete examples
                    expect(block).not.toMatch(/ISO 9001/);
                    expect(block).not.toMatch(/ISO 27001/);
                    expect(block).not.toMatch(/ISO 26262/);
                    expect(block).not.toMatch(/PCI DSS/);
                }
            });
        }

        test('job-search-pipeline: methods category does not list GDPR/ISO as plain examples', () => {
            const content = readPipelineFile(PIPELINE_FILES[3]);
            // The Methoden/Frameworks bullet must not contain ISO/GDPR examples (they leaked into output)
            const methodsBlock = content.match(/2\. Methoden\/Frameworks:[\s\S]{0,400}/);
            expect(methodsBlock).toBeTruthy();
            if (methodsBlock) {
                expect(methodsBlock[0]).not.toMatch(/"GDPR"/);
                expect(methodsBlock[0]).not.toMatch(/"ISO 9001"/);
                expect(methodsBlock[0]).not.toMatch(/"ISO 27001"/);
            }
        });
    });

    describe('HARD RULE present in every pipeline', () => {
        for (const file of PIPELINE_FILES) {
            test(`${file.name}: contains "HARD RULE" verbatim-anchor clause`, () => {
                const content = readPipelineFile(file);
                expect(content).toMatch(/HARD RULE/);
                // Must mention the verbatim/translation requirement
                expect(content).toMatch(/verbatim|wörtlich/i);
                // Must mention the JD as the source-of-truth
                expect(content).toMatch(/job description|Stellenanzeigen-Text|in the JD/i);
            });

            test(`${file.name}: contains "MUST NOT include" or equivalent prohibition`, () => {
                const content = readPipelineFile(file);
                expect(content).toMatch(/MUST NOT include|nicht aufnehmen|WEGLASSEN/i);
            });
        }
    });

    describe('Translation-rule preserved (cross-locale CV-Match consistency)', () => {
        // The GDPR ↔ DSGVO ↔ RGPD translation statement is a TRANSLATION rule, not an INCLUDE rule.
        // It must survive the refactor — removing it would break Spanish/English locale users.

        for (const file of PIPELINE_FILES) {
            test(`${file.name}: GDPR ↔ DSGVO translation rule preserved`, () => {
                const content = readPipelineFile(file);
                // At least one of these patterns must be present (variants across files)
                const hasTranslationRule =
                    /GDPR.{0,30}DSGVO.{0,30}RGPD/.test(content) ||
                    /GDPR\s*↔\s*DSGVO/.test(content) ||
                    /GDPR.{0,80}DSGVO/.test(content);
                expect(hasTranslationRule).toBe(true);
            });
        }
    });

    describe('Generic guidance (Project Management example) preserved', () => {
        // The "Project Management → Projektmanagement" translation example is the safe canonical case.
        // It must survive the refactor.

        for (const file of PIPELINE_FILES) {
            test(`${file.name}: Project Management translation example preserved`, () => {
                const content = readPipelineFile(file);
                expect(content).toMatch(/Project Management.{0,40}Projektmanagement/);
            });
        }
    });
});
