export type ChangeType = 'add' | 'modify' | 'remove';

export interface CvStructuredData {
    version: string; // e.g. "1.0" for future schema migrations
    personalInfo: {
        name?: string;
        email?: string;
        phone?: string;
        location?: string;
        linkedin?: string;
        website?: string;        // V2: Portfolio/GitHub
        summary?: string;
        targetRole?: string;     // V2: Header role display
    };
    experience: Array<{
        id: string;        // UUID for stable diffing
        company?: string;
        role?: string;
        dateRangeText?: string;
        location?: string;
        summary?: string;
        description: Array<{ id: string; text: string }>; // Bullet points with IDs
    }>;
    education: Array<{
        id: string;        // UUID for stable diffing
        institution?: string;
        degree?: string;
        dateRangeText?: string;
        description?: string;
        grade?: string;    // V2: Optional GPA/Note
    }>;
    skills: Array<{
        id: string;        // UUID for stable diffing
        category?: string;
        items: string[];
        displayMode?: 'tags' | 'comma' | 'bars'; // V2: Template rendering hint
    }>;
    languages: Array<{
        id: string;        // UUID for stable diffing
        language?: string;
        proficiency?: string;
        level?: 1 | 2 | 3 | 4 | 5; // V2: 1=Grundkenntnisse, 5=Muttersprache
    }>;
    certifications?: Array<{
        id: string;
        name?: string;
        issuer?: string;
        dateText?: string;
        credentialUrl?: string;  // V2: Clickable verification link
        expiryDate?: string;     // V2: "Gültig bis 2027"
    }>;
}

import { z } from 'zod';

export const changeTypeSchema = z.enum(['add', 'modify', 'remove']);

export const cvStructuredDataSchema = z.object({
    version: z.string().optional(),
    personalInfo: z.object({
        name: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        location: z.string().nullish(),
        linkedin: z.string().nullish(),
        website: z.string().nullish(),
        summary: z.string().nullish(),
        targetRole: z.string().nullish(),
    }),
    experience: z.array(z.object({
        id: z.string(),
        company: z.string().nullish(),
        role: z.string().nullish(),
        dateRangeText: z.string().nullish(),
        location: z.string().nullish(),
        summary: z.string().nullish(),
        description: z.array(z.object({ id: z.string(), text: z.string() })),
    })),
    education: z.array(z.object({
        id: z.string(),
        institution: z.string().nullish(),
        degree: z.string().nullish(),
        dateRangeText: z.string().nullish(),
        description: z.string().nullish(),
        grade: z.string().nullish(),
    })),
    skills: z.array(z.object({
        id: z.string(),
        category: z.string().nullish(),
        items: z.array(z.string()),
        displayMode: z.enum(['tags', 'comma', 'bars']).nullish(),
    })),
    languages: z.array(z.object({
        id: z.string(),
        language: z.string().nullish(),
        proficiency: z.string().nullish(),
        level: z.number().min(1).max(5).nullish(),
    })),
    certifications: z.array(z.object({
        id: z.string(),
        name: z.string().nullish(),
        issuer: z.string().nullish(),
        dateText: z.string().nullish(),
        credentialUrl: z.string().nullish(),
        expiryDate: z.string().nullish(),
    })).nullish(),
});

export const cvChangeSchema = z.object({
    id: z.string(),
    target: z.object({
        section: z.string(), // Accept any section string — AI may produce 'certifications', 'certificates', 'summary', etc.
        entityId: z.string().nullish(),
        field: z.string().nullish(),
        bulletId: z.string().nullish(),
    }),
    type: changeTypeSchema,
    before: z.any().transform(v => v == null ? undefined : String(v)).optional(), // Coerce to string — AI sometimes returns null or arrays
    after: z.any().transform(v => v == null ? undefined : String(v)).optional(),
    reason: z.string().nullish().default('KI-Optimierung'),
    requirementRef: z.object({
        requirement: z.string().nullish()
    }).nullish()
});

export const cvOptimizationProposalSchema = z.object({
    optimized: cvStructuredDataSchema,
    changes: z.array(cvChangeSchema)
});

export interface CvChange {
    id: string;
    target: {
        section: 'experience' | 'education' | 'skills' | 'languages' | 'personalInfo';
        entityId?: string; // Target specific array item by ID
        field?: string;    // E.g., 'description'
        bulletId?: string; // For targeting a specific bullet point in 'description' array
    };
    type: ChangeType;
    before?: string;
    after?: string;
    reason: string;
    requirementRef?: {
        requirement: string; // The requirement string or ID from CV Match
    };
}

export interface CvOptimizationProposal {
    optimized: CvStructuredData;
    changes: CvChange[];
}

export interface UserDecisions {
    choices: Record<string, 'accepted' | 'rejected' | 'edited'>;
    appliedChanges: CvChange[]; // Audit list of exactly what was accepted/edited
}
