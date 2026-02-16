
export interface QualityScores {
    naturalness_score: number;
    style_match_score: number;
    company_relevance_score: number;
    individuality_score: number;
    overall_score: number;
    issues: string[];
    suggestions: string[];
}
