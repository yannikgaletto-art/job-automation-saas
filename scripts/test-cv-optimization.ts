import { optimizeCV } from '../lib/services/cv-optimizer';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function testOptimization() {
    console.log('🚀 Starting CV Optimization Test...');

    if (!process.env.ANTHROPIC_API_KEY) {
        console.error('❌ ANTHROPIC_API_KEY not found in environment');
        // Don't exit, maybe we can run with mock if service handles it, but service needs key.
        // Let's print usage warning.
        console.warn('⚠️  Warning: API Key missing. Service might fail if not using mock.');
    }

    const dummyCV = `
MAX MUSTERMANN
Berlin, Germany | max@example.com | +49 123 456789

EXPERIENCE
Software Engineer | TechCorp GmbH | 2020 - Present
- Developed web applications using React and Node.js
- Fixed bugs and improved performance
- Collaborated with design team

Junior Developer | Startup Inc | 2018 - 2020
- Built landing pages
- Learned JavaScript and Python

SKILLS
JavaScript, React, Node.js, HTML, CSS, Python
    `;

    const dummyJob = {
        title: 'Senior Frontend Engineer',
        requirements: [
            '5+ years of experience with React',
            'Experience with TypeScript and Next.js',
            'Strong knowledge of web performance optimization',
            'Experience with Tailwind CSS'
        ],
        description: `
We are looking for a Senior Frontend Engineer to join our team.
You will be responsible for building high-performance web applications.
Requirements:
- Deep understanding of React ecosystem
- Experience with modern build tools
- Ability to write clean, maintainable code
        `
    };

    try {
        console.log('⏳ Optimizing CV...');
        const result = await optimizeCV({
            userId: 'test-user-id',
            cvText: dummyCV,
            jobTitle: dummyJob.title,
            jobRequirements: dummyJob.requirements,
            jobDescription: dummyJob.description
        });

        console.log('\n✅ Optimization Complete!');
        console.log('----------------------------------------');
        console.log(`ATS Score: ${result.atsScore}/100`);
        console.log(`Keywords Added: ${result.changesLog.added_keywords.join(', ')}`);
        console.log(`Bullets Reordered: ${result.changesLog.reordered_bullets}`);
        console.log(`Quantifications: ${result.changesLog.quantifications_added}`);
        console.log('----------------------------------------');
        console.log('\nOptimized CV Preview (First 500 chars):');
        console.log(result.optimizedCV.substring(0, 500) + '...');

    } catch (error) {
        console.error('❌ Error during optimization:', error);
    }
}

testOptimization();
