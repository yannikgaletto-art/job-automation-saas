/**
 * Coaching Feature Types
 * Feature-Silo: coaching
 */

// ============================================================================
// COACHING DOSSIER (Gap Analysis Output — schema varies by round)
// ============================================================================

/** Deep Dive: Probing areas with main question + follow-ups */
export interface ProbingArea {
    mainQuestion: string;
    followUps: string[];
}

/** Role research output — generated on-demand via "Analysieren" button */
export interface AboutRole {
    dailyBusiness: string[];
    cases: string[];
    methodology: string[];
}

/** Base dossier shared by all rounds */
export interface CoachingDossierBase {
    strengths: string[];
    gaps: string[];
    companyContext: string;
    /** On-demand: role research (populated after user clicks "Analysieren") */
    aboutRole?: AboutRole;
    /** On-demand: user story bullet points from CV/cover letter analysis */
    myStory?: string[];
}

/** Kennenlernen dossier — 5 broad questions */
export interface KennenlernenDossier extends CoachingDossierBase {
    interviewQuestions: string[];
}

/** Deep Dive dossier — probing areas with follow-ups */
export interface DeepDiveDossier extends CoachingDossierBase {
    probingAreas: ProbingArea[];
}

/** Case Study dossier — a single scenario with hidden data */
export interface CaseStudyDossier extends CoachingDossierBase {
    caseScenario: string;
    hiddenData: string[];
    expectedApproach: string;
}

/** Union type for all dossier shapes */
export type CoachingDossier = KennenlernenDossier | DeepDiveDossier | CaseStudyDossier;

/** Type guard helpers */
export function isKennenlernenDossier(d: CoachingDossier): d is KennenlernenDossier {
    return 'interviewQuestions' in d;
}
export function isDeepDiveDossier(d: CoachingDossier): d is DeepDiveDossier {
    return 'probingAreas' in d;
}
export function isCaseStudyDossier(d: CoachingDossier): d is CaseStudyDossier {
    return 'caseScenario' in d;
}

// ============================================================================
// COACHING SESSION (DB Row)
// ============================================================================

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface CoachingSession {
    id: string;
    user_id: string;
    job_id: string;
    session_status: SessionStatus;
    conversation_history: ChatMessage[];
    coaching_dossier: CoachingDossier | null;
    feedback_report: string | null;
    coaching_score: number | null;
    turn_count: number;
    duration_seconds: number | null;
    tokens_used: number;
    cost_cents: number;
    prompt_version: string;
    created_at: string;
    completed_at: string | null;
}

// ============================================================================
// CHAT MESSAGE
// ============================================================================

export interface ChatMessage {
    role: 'coach' | 'user';
    content: string;
    timestamp: string;
    turnNumber?: number;
}

// ============================================================================
// API REQUEST / RESPONSE TYPES
// ============================================================================

export interface CreateSessionRequest {
    jobId: string;
}

export interface CreateSessionResponse {
    sessionId: string;
    dossier: CoachingDossier;
    firstQuestion: string;
    maxQuestions: number;
}

export interface SendMessageRequest {
    message: string;
}

export interface SendMessageResponse {
    aiMessage: string;
    turnNumber: number;
    isComplete: boolean;
    tokensUsed: number;
}

export interface CompleteSessionResponse {
    success: boolean;
    message: string;
}

// ============================================================================
// FEEDBACK REPORT
// ============================================================================

/** Structured topic suggestion with YouTube search query */
export interface TopicSuggestion {
    topic: string;
    searchQuery: string;
    youtubeTitle: string;
    /** 2-3 short context lines explaining WHY this topic matters */
    context?: string[];
    /** Category: 'rolle' = role-specific, 'interview' = interview technique */
    category?: 'rolle' | 'interview';
}

export interface FeedbackReport {
    overallScore: number;
    topStrength: string;
    recommendation: string;
    /** Honest recruiter-style feedback (new fields, optional for backwards compat) */
    whatWorked?: string;
    whatWasMissing?: string;
    recruiterAdvice?: string;
    dimensions: FeedbackDimension[];
    summary: string;
    strengths: string[];
    improvements: FeedbackImprovement[];
    /** New format: TopicSuggestion[]; Old format: string[] (backwards compat) */
    topicSuggestions: (TopicSuggestion | string)[];
}

export type DimensionLevel = 'green' | 'yellow' | 'red';

export interface FeedbackDimension {
    name: string;
    score: number;
    level: DimensionLevel;
    tag: string;
    observation: string;
    reason: string;
    suggestion: string;
    quote?: string;
    feedback: string;
}

export interface FeedbackImprovement {
    title: string;
    bad: string;
    good: string;
}
