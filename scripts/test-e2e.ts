import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { PDFDocument } from 'pdf-lib';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_ID = '7c684ea2-ea61-459e-8b57-fd9cc4ffb500';
const JOB_ID = '17061fce-70b2-46d4-9970-f614306797e2';
const API_BASE = 'http://localhost:3001/api';
const HEADERS = { 'cookie': `sb-access-token=dummy` }; // Dev bypass

async function createDummyPdf(msg: string, name: string) {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage()
    page.drawText(msg, {
        x: 50,
        y: 700,
        size: 14,
    })
    const pdfBytes = await pdfDoc.save()
    fs.writeFileSync(`scripts/${name}`, pdfBytes)
    return `scripts/${name}`
}

async function runTests() {
    console.log("=== STARTING END-TO-END TESTS ===");

    // --- 1. Null-Safety ---
    console.log("\\n--- 1. Null-Safety (Resetting DB) ---");
    await supabaseAdmin.from('user_profiles').update({ cv_structured_data: null }).eq('id', USER_ID);

    // --- 2. Upload & Parse ---
    console.log("\\n--- 2. Uploading PDF and verifying Parse Trigger ---");
    const pdfPath = await createDummyPdf('Max Mustermann\\nmax@example.com\\nSoftware Engineer from 2020-2023 at TechCorp.\\nSkills: React, Node, AI', 'dummy-cv.pdf');
    const clPath = await createDummyPdf('Sehr geehrte Damen und Herren,\\nhiermit bewerbe ich mich.', 'dummy-cl.pdf');

    const form = new FormData();
    form.append('cv', fs.createReadStream(pdfPath), 'dummy-cv.pdf');
    form.append('coverLetter_0', fs.createReadStream(clPath), 'dummy-cl.pdf');

    const uploadRes = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST', body: form as any, headers: HEADERS
    });
    const uploadData = await uploadRes.json() as any;
    if (!uploadRes.ok) throw new Error("Upload failed: " + JSON.stringify(uploadData));
    console.log("✅ Upload + Parse triggers completed:", uploadData.success);

    // Wait for DB to settle
    await new Promise(r => setTimeout(r, 6000));
    const { data: profilePost } = await supabaseAdmin.from('user_profiles').select('cv_structured_data, preferred_cv_template').eq('id', USER_ID).single();
    if (!profilePost?.cv_structured_data) throw new Error("Parse trigger failed to save to DB");
    console.log("✅ cv_structured_data populated successfully:", profilePost.cv_structured_data.experience?.length || 0, "experience entries");

    // --- 3. Template Selection ---
    console.log("\\n--- 3. Verifying Template Selection ---");
    const templateRes = await fetch(`${API_BASE}/onboarding/template`, {
        method: 'POST', body: JSON.stringify({ template_id: 'notion_modern', user_id: USER_ID }), headers: { ...HEADERS, 'Content-Type': 'application/json' }
    });
    const templateData = await templateRes.json() as any;
    if (!templateRes.ok) throw new Error("Template assignment failed: " + JSON.stringify(templateData));
    console.log("✅ Template endpoint succeeded.");

    // --- 4. Optimizer Generation ---
    console.log("\\n--- 4. Optimizer & Diff Test ---");
    const cvMatchResult = {
        score: 85,
        requirementRows: [
            { requirement: "Python Backend-Services", importance: 9, status: "missing", explanation: "Missing AI Python" }
        ]
    };
    const optRes = await fetch(`${API_BASE}/cv/optimize`, {
        method: 'POST', body: JSON.stringify({
            job_id: JOB_ID, user_id: USER_ID, template_id: 'notion_modern',
            cv_structured_data: profilePost.cv_structured_data,
            cv_match_result: cvMatchResult
        }), headers: { ...HEADERS, 'Content-Type': 'application/json' }
    });
    const optData = await optRes.json() as any;
    if (!optRes.ok) throw new Error("Optimize failed: " + JSON.stringify(optData));
    if (!optData.proposal?.changes) throw new Error("Optimizer returned no changes");
    console.log("✅ Optimizer succeeded. Changes:", optData.proposal.changes.length);

    // --- 5. Save Decisions (Mock Server Action via DB update) ---
    console.log("\\n--- 5. Saving User Decisions ---");
    const mockDecisions = {
        choices: { [optData.proposal.changes[0].id]: 'accepted' },
        appliedChanges: [optData.proposal.changes[0]]
    };
    await supabaseAdmin.from('job_queue').update({ cv_optimization_user_decisions: mockDecisions }).eq('id', JOB_ID);
    console.log("✅ Decisions persisted");

    // --- 6. Preview & DOCX Download ---
    console.log("\\n--- 6. Verifying DOCX Download ---");
    const docxRes = await fetch(`${API_BASE}/cv/generate`, {
        method: 'POST', body: JSON.stringify({ cv_structured_data: profilePost.cv_structured_data }),
        headers: { ...HEADERS, 'Content-Type': 'application/json' }
    });
    if (!docxRes.ok) throw new Error("DOCX Generation failed: " + docxRes.status);
    const buffer = await docxRes.buffer();
    fs.writeFileSync('scripts/test-output.docx', buffer);
    console.log("✅ DOCX generated and saved successfully (" + buffer.length + " bytes)");

    // --- 7. Cover Letter Integration ---
    console.log("\\n--- 7. Verifying Cover Letter Integration ---");
    const clRes = await fetch(`${API_BASE}/cover-letter/generate`, {
        method: 'POST', body: JSON.stringify({ userId: USER_ID, jobId: JOB_ID }),
        headers: { ...HEADERS, 'Content-Type': 'application/json' }
    });
    const clData = await clRes.json() as any;
    if (!clRes.ok) throw new Error("Cover Letter failed: " + JSON.stringify(clData));
    console.log("✅ Cover Letter generated successfully:", clData.cover_letter?.substring(0, 100) + '...');

    console.log("\\n=== ALL E2E TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch(e => console.error(e));
