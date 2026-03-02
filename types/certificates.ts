/**
 * Types for Weiterbildung & Zertifizierung feature (AGENT_7.1 + 7.2)
 */

export type CertificateProviderType = 'reputation' | 'specialist' | 'value';
export type CertificateStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface CertificateRecommendation {
    id: string;               // unique slug e.g. "tuev-ki-manager"
    title: string;             // "KI-Manager (AI Transformation Institute)"
    provider: string;          // "TÜV Rheinland"
    providerType: CertificateProviderType; // Kanban column
    hasAZAV: boolean;          // AZAV-Förderung (Bildungsgutschein) möglich
    priceEstimate: string;     // "ab 890 €" or "kostenlos mit Bildungsgutschein"
    durationEstimate: string;  // "2 Tage" | "4 Wochen online"
    reputationScore: 1 | 2 | 3; // 3 = Top-Reputation (TÜV, BSI, DQS, SGS)
    url: string;               // Direct link to certificate page — PFLICHT
    urlValid: boolean;         // Set after HEAD-check (Contract §10)
    reasonForMatch: string;    // 1 sentence: why does this match the role?
}

export interface JobCertificatesRow {
    id: string;
    job_id: string;
    user_id: string;
    recommendations: CertificateRecommendation[] | null;
    summary_text: string | null;
    status: CertificateStatus;
    created_at: string;
    updated_at: string;
}

export interface CertificateGenerateRequest {
    jobId: string;
}

export interface CertificateGenerateResponse {
    success: boolean;
    certificateId: string;
}

export interface CertificateGetResponse {
    status: CertificateStatus;
    recommendations: CertificateRecommendation[] | null;
    summary_text: string | null;
}
