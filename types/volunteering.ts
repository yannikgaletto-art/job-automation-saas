// ============================================================================
// Volunteering Feature — Types
// ============================================================================

export type VolunteeringCategory = 'social' | 'environment' | 'education' | 'health' | 'culture';
export type VolunteeringSource = 'vostel' | 'gute-tat' | 'stadtmission' | 'obdachlosenhilfe' | 'dsee' | 'manual';
export type CommitmentType = 'einmalig' | 'regelmaessig' | 'flexibel';
export type BookmarkStatus = 'saved' | 'contacted' | 'active' | 'completed';

export interface VolunteeringOpportunity {
    id: string;
    title: string;
    description: string | null;
    organization: string;
    category: VolunteeringCategory;
    city: string | null;
    url: string;
    source: VolunteeringSource;
    commitment_type: CommitmentType | null;
    skills_tags: string[];
    is_active: boolean;
    scraped_at: string;
    created_at: string;
}

export interface VolunteeringBookmark {
    id: string;
    user_id: string;
    opportunity_id: string;
    status: BookmarkStatus;
    hours_logged: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
    // Joined from opportunity
    opportunity?: VolunteeringOpportunity;
}

export interface VolunteeringVote {
    id: string;
    user_id: string;
    category_suggestion: string;
    created_at: string;
}

export interface VoteAggregation {
    category_suggestion: string;
    vote_count: number;
    user_voted: boolean;
}

/** Insert type for scraper upserts */
export interface OpportunityInsert {
    title: string;
    description?: string;
    organization: string;
    category: VolunteeringCategory;
    city?: string;
    url: string;
    source: VolunteeringSource;
    commitment_type?: CommitmentType;
    skills_tags?: string[];
}
