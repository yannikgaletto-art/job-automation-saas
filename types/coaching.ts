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

/** Base dossier shared by all rounds */
export interface CoachingDossierBase {
    strengths: string[];
    gaps: string[];
    companyContext: string;
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

export interface FeedbackReport {
    overallScore: number;
    dimensions: FeedbackDimension[];
    summary: string;
    strengths: string[];
    improvements: string[];
    topicSuggestions: string[];
}

export interface FeedbackDimension {
    name: string;
    score: number;
    feedback: string;
}
