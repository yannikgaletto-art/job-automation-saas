export type ChangeType = 'add' | 'modify' | 'remove';

export interface CvStructuredData {
    version: string; // e.g. "1.0" for future schema migrations
    personalInfo: {
        name?: string;
        email?: string;
        phone?: string;
        location?: string;
        linkedin?: string;
        summary?: string;
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
    }>;
    skills: Array<{
        id: string;        // UUID for stable diffing
        category?: string;
        items: string[];
    }>;
    languages: Array<{
        id: string;        // UUID for stable diffing
        language?: string;
        proficiency?: string;
    }>;
    certifications?: Array<{
        id: string;
        name?: string;
        issuer?: string;
        dateText?: string;
    }>;
}

import { z } from 'zod';

export const changeTypeSchema = z.enum(['add', 'modify', 'remove']);

export const cvStructuredDataSchema = z.object({
    version: z.string(),
    personalInfo: z.object({
        name: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        location: z.string().nullish(),
        linkedin: z.string().nullish(),
        summary: z.string().nullish(),
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
    })),
    skills: z.array(z.object({
        id: z.string(),
        category: z.string().nullish(),
        items: z.array(z.string()),
    })),
    languages: z.array(z.object({
        id: z.string(),
        language: z.string().nullish(),
        proficiency: z.string().nullish(),
    })),
    certifications: z.array(z.object({
        id: z.string(),
        name: z.string().nullish(),
        issuer: z.string().nullish(),
        dateText: z.string().nullish(),
    })).nullish(),
});

export const cvChangeSchema = z.object({
    id: z.string(),
    target: z.object({
        section: z.enum(['experience', 'education', 'skills', 'languages', 'personalInfo']),
        entityId: z.string().nullish(),
        field: z.string().nullish(),
        bulletId: z.string().nullish(),
    }),
    type: changeTypeSchema,
    before: z.string().nullish(),
    after: z.string().nullish(),
    reason: z.string(),
    requirementRef: z.object({
        requirement: z.string()
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
