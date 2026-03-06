import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { discoverJobs, researchCompany, generateCoverLetter } from '@/lib/inngest/functions';
import { generateCertificates } from '@/lib/inngest/certificates-pipeline';
import { extractJob } from '@/lib/inngest/extract-job-pipeline';
import { analyzeCVMatch } from '@/lib/inngest/cv-match-pipeline';
import { volunteeringScraper } from '@/lib/inngest/volunteering-scraper';
import { generateCoachingReport } from '@/lib/inngest/coaching-report-pipeline';

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        discoverJobs,
        researchCompany,
        generateCoverLetter,
        generateCertificates,
        extractJob,
        analyzeCVMatch,
        volunteeringScraper,
        generateCoachingReport,
    ]
});
