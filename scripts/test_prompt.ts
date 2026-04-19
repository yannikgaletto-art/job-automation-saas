import { buildSystemPrompt } from '../lib/services/cover-letter-prompt-builder';
import type { CoverLetterSetupContext } from '../types/cover-letter-setup';

export const mockProfile = {
    cv_structured_data: { experience: ["Ingrano", "Fraunhofer", "MIZ"] }
};

export const mockJob = {
    job_title: "Innovation Manager",
    company_name: "JobTeaser",
    requirements: ["Netzwerkausbau", "Kommunikation", "Projektmanagement"]
};

export const mockCompany = {
    company_values: ["Innovation", "Junge Talente"],
    tech_stack: []
};

export const ctx: CoverLetterSetupContext = {
    jobId: 'mock-job',
    companyName: 'JobTeaser',
    selectedHook: {
        id: '1',
        type: 'vision',
        label: 'Vision',
        content: 'JobTeaser sieht die neue Generation als Zukunft der Unternehmen und will jungen Talenten Raum geben.',
        sourceName: 'Website',
        sourceUrl: '',
        sourceAge: '',
        relevanceScore: 0.9
    },
    selectedQuote: {
        quote: "The best way to predict the future is to create it.",
        author: "Peter Drucker",
        source: "General",
        matchedValue: "Innovation",
        relevanceScore: 0.9
    },
    cvStations: [
        {
            stationIndex: 1,
            company: "Ingrano Solutions",
            role: "Innovation & Process Manager",
            period: "2020 - 2022",
            keyBullet: "Baute ein Netzwerk auf, das Startups mit etablierten Unternehmen verband",
            matchedRequirement: "Netzwerkausbau",
            intent: "Zeigen, dass ich 2 Welten zusammenbringen kann"
        }
    ],
    tone: {
        preset: 'storytelling',
        toneSource: 'preset',
        targetLanguage: 'de',
        hasStyleSample: false,
        styleWarningAcknowledged: true,
        formality: 'du'
    },
    completedAt: 'now',
    introFocus: 'quote'
};

const prompt = buildSystemPrompt(
    mockProfile as any,
    mockJob as any,
    mockCompany as any,
    null,
    ctx,
    [], // feedback
    0 // lastWordCount
);

console.log("=================== GENERATED PROMPT ===================");
console.log(prompt);
console.log("========================================================");
