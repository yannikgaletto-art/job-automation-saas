export const maxDuration = 300; // Vercel Pro — Inngest functions can take 30-60s+ (Claude AI calls)

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { generateCertificates } from '@/lib/inngest/certificates-pipeline';
import { extractJob } from '@/lib/inngest/extract-job-pipeline';
import { analyzeCVMatch } from '@/lib/inngest/cv-match-pipeline';
import { volunteeringScraper } from '@/lib/inngest/volunteering-scraper';
import { generateCoachingReport } from '@/lib/inngest/coaching-report-pipeline';
import { videoDeleteScheduled, videoCleanupCron } from '@/lib/inngest/video-cleanup';
import { polishCoverLetter } from '@/lib/inngest/cover-letter-polish';

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        generateCertificates,
        extractJob,
        analyzeCVMatch,
        volunteeringScraper,
        generateCoachingReport,
        videoDeleteScheduled,
        videoCleanupCron,
        polishCoverLetter,
    ]
});
