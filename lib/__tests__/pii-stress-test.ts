/**
 * PII Sanitizer Stress Test — Edge Cases
 * 
 * Tests the NAME_REGEX against the hardest real-world CV name patterns.
 * Run: npx tsx lib/__tests__/pii-stress-test.ts
 */

// Import the actual sanitizer
import { sanitizeForAI } from '../services/pii-sanitizer';

interface TestCase {
  label: string;
  input: string;
  expectMasked: string[]; // PII that SHOULD be masked
  expectSurvive: string[]; // Non-PII that should NOT be masked
}

const testCases: TestCase[] = [
  // ── Standard Names (should work) ──
  {
    label: '1. Standard DE name',
    input: 'Max Mustermann\nmax.mustermann@email.de\n+49 170 1234567\nSenior Manager bei Firma GmbH',
    expectMasked: ['Max Mustermann', 'max.mustermann@email.de', '+49 170 1234567'],
    expectSurvive: ['Senior Manager', 'Firma GmbH'],
  },
  {
    label: '2. Hyphenated name',
    input: 'Anna-Lena Schmidt-Fischer\nanna@test.de\nSoftware Engineer',
    expectMasked: ['Anna-Lena Schmidt-Fischer', 'anna@test.de'],
    expectSurvive: ['Software Engineer'],
  },
  {
    label: '3. Accented name (Spanish)',
    input: 'José García López\njose@gmail.com\nDesarrollador',
    expectMasked: ['José García', 'jose@gmail.com'],
    expectSurvive: ['Desarrollador'],
  },

  // ── CAPS Names (the hard cases) ──
  {
    label: '4. CAPS name (DE classic)',
    input: 'MAX MUSTERMANN\nmax@email.de\n+49 170 1234567\nBERUFSERFAHRUNG\nSenior Manager',
    expectMasked: ['MAX MUSTERMANN', 'max@email.de'],
    expectSurvive: ['BERUFSERFAHRUNG', 'Senior Manager'],
  },
  {
    label: '5. CAPS name reversed (Last First)',
    input: 'MUSTERMANN, MAX\nmax@email.de',
    expectMasked: ['max@email.de'],
    expectSurvive: [],
  },
  {
    label: '6. CAPS hyphenated',
    input: 'ANNA-LENA SCHMIDT-FISCHER\nanna@test.de',
    expectMasked: ['anna@test.de'],
    expectSurvive: [],
  },

  // ── Titles ──
  {
    label: '7. Dr. prefix',
    input: 'Dr. Max Mustermann\nmax@uni.de\nForschungsleiter',
    expectMasked: ['max@uni.de'],
    expectSurvive: ['Forschungsleiter'],
  },
  {
    label: '8. Prof. Dr. prefix',
    input: 'Prof. Dr. Anna Schmidt\nanna@uni.de',
    expectMasked: ['anna@uni.de'],
    expectSurvive: [],
  },

  // ── Connectors (von, van, de) ──
  {
    label: '9. German "von" name',
    input: 'Anna von Berg\nanna@test.de\nProjektleiterin',
    expectMasked: ['anna@test.de'],
    expectSurvive: ['Projektleiterin'],
  },
  {
    label: '10. Dutch "van der" name',
    input: 'Peter van der Berg\npeter@test.nl',
    expectMasked: ['peter@test.nl'],
    expectSurvive: [],
  },

  // ── Edge Cases ──
  {
    label: '11. Single name (mononym)',
    input: 'Madonna\nmadonna@test.com\nKünstlerin',
    expectMasked: ['madonna@test.com'],
    expectSurvive: ['Künstlerin'],
  },
  {
    label: '12. Three-word name',
    input: 'Maria Isabel García\nmaria@test.es',
    expectMasked: ['maria@test.es'],
    expectSurvive: [],
  },
  {
    label: '13. Name looks like tech term',
    input: 'Christian React\nchristian@test.de',
    expectMasked: ['christian@test.de'],
    expectSurvive: [],
  },
  {
    label: '14. FALSE POSITIVE: Section headers should survive',
    input: 'Max Mustermann\nBERUFSERFAHRUNG\nPERSONAL INFORMATION\nWORK EXPERIENCE\nMachine Learning Engineer',
    expectMasked: ['Max Mustermann'],
    expectSurvive: ['BERUFSERFAHRUNG', 'PERSONAL INFORMATION', 'WORK EXPERIENCE', 'Machine Learning'],
  },
  {
    label: '15. Phone without country code',
    input: 'Max Mustermann\n0170 1234 5678\nmax@test.de',
    expectMasked: ['Max Mustermann', '0170 1234 5678', 'max@test.de'],
    expectSurvive: [],
  },
  {
    label: '16. Real-world mixed: name in header, tech in body',
    input: 'Yannik Galetto\nyannik@pathly.de\n+49 176 12345678\n\nINNOVATION MANAGER\n\nBERUFSERFAHRUNG\nSenior Consultant bei The Boston Consulting Group\nMachine Learning, Artificial Intelligence, Data Science',
    expectMasked: ['Yannik Galetto', 'yannik@pathly.de', '+49 176 12345678'],
    expectSurvive: ['INNOVATION MANAGER', 'BERUFSERFAHRUNG', 'Machine Learning', 'Artificial Intelligence', 'Boston Consulting Group'],
  },
];

// ── Run Tests ──
console.log('═══════════════════════════════════════════════════');
console.log('  PII SANITIZER STRESS TEST');
console.log('═══════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const tc of testCases) {
  const { sanitized, warningFlags, tokenMap } = sanitizeForAI(tc.input);
  
  let caseOk = true;
  const issues: string[] = [];

  // Check that expected PII was masked
  for (const pii of tc.expectMasked) {
    if (sanitized.includes(pii)) {
      issues.push(`  ❌ NOT MASKED: "${pii}" still visible in output`);
      caseOk = false;
    }
  }

  // Check that non-PII survived
  for (const safe of tc.expectSurvive) {
    if (!sanitized.includes(safe)) {
      issues.push(`  ❌ FALSE POSITIVE: "${safe}" was incorrectly masked`);
      caseOk = false;
    }
  }

  if (caseOk) {
    console.log(`✅ ${tc.label}`);
    passed++;
  } else {
    console.log(`❌ ${tc.label}`);
    issues.forEach(i => console.log(i));
    console.log(`   Sanitized: ${sanitized.slice(0, 120)}...`);
    failed++;
    failures.push(tc.label);
  }
}

console.log('\n═══════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed}/${passed + failed} passed (${Math.round(passed / (passed + failed) * 100)}%)`);
if (failures.length > 0) {
  console.log(`  FAILED: ${failures.join(', ')}`);
}
console.log('═══════════════════════════════════════════════════');

// Exit with error code if any failed
process.exit(failed > 0 ? 1 : 0);
