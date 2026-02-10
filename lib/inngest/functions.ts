import { inngest } from './client';

export const discoverJobs = inngest.createFunction(
    {
        id: 'discover-jobs',
        name: 'Daily Job Discovery',
        rateLimit: {
            key: 'event.data.userId',
            limit: 10,
            period: '1h'
        }
    },
    { event: 'job/discover' },
    async ({ event, step }) => {
        console.log(`Discovering jobs for user: ${event.data.userId}`);
        // Implementation folgt später
    }
);

export const researchCompany = inngest.createFunction(
    {
        id: 'research-company',
        name: 'Company Research',
        rateLimit: {
            limit: 20,
            period: '1m',
            key: 'global'
        }
    },
    { event: 'company/research' },
    async ({ event }) => {
        console.log(`Researching: ${event.data.companyName}`);
        // Implementation folgt später
    }
);

export const generateCoverLetter = inngest.createFunction(
    {
        id: 'generate-cover-letter',
        name: 'Generate Cover Letter',
        rateLimit: {
            limit: 100,
            period: '1m',
            key: 'global'
        }
    },
    { event: 'cover-letter/generate' },
    async ({ event }) => {
        console.log(`Generating cover letter for job: ${event.data.jobId}`);
        // Implementation folgt später
    }
);
