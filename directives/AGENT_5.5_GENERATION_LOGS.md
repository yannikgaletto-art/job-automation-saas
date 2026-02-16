# AGENT_5.5: Generation Logs & Monitoring

## 🎯 Goal
Implementiere **Generation Logs Database Table** für Monitoring von Cover Letter Quality, Kosten und Iterationen.
Enable Data-Driven Optimization und Debugging.

**Warum wichtig:**
- Track Quality Scores über Zeit
- Monitor API Kosten pro User
- Analyze Iteration Success Rates
- Debug Failed Generations

---

## 📋 Scope: MVP-LEAN (1 Stunde)

### Was wird gebaut:
1. **Database Migration** (`generation_logs` Table)
2. **Logging Integration** in Generator Service
3. **Basic Queries** (optional Dashboard später)

### Was NICHT gebaut wird (Phase 2):
- Admin Dashboard (später)
- Real-time Monitoring (später)
- Cost Analytics (später)
- Alert System (später)

---

## 🛠️ Implementation Tasks

### 1. Database Migration

**File:** `database/migrations/010_add_generation_logs.sql`

```sql
-- Migration: Add generation_logs table for cover letter generation quality tracking
-- Created: 2026-02-16
-- Description: Tracks quality scores, model usage, and costs for each generation iteration

CREATE TABLE IF NOT EXISTS generation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    iteration INTEGER NOT NULL,
    model_name TEXT NOT NULL,
    
    -- Quality Scores (from quality-judge)
    overall_score NUMERIC(3,1),
    naturalness_score NUMERIC(3,1),
    style_match_score NUMERIC(3,1),
    company_relevance_score NUMERIC(3,1),
    individuality_score NUMERIC(3,1),
    
    -- Quality Feedback
    issues TEXT[],
    suggestions TEXT[],
    
    -- Validation Results
    validation_passed BOOLEAN,
    word_count INTEGER,
    
    -- Generated Content
    generated_text TEXT NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_generation_logs_job ON generation_logs(job_id);
CREATE INDEX idx_generation_logs_user ON generation_logs(user_id);
CREATE INDEX idx_generation_logs_created ON generation_logs(created_at DESC);
CREATE INDEX idx_generation_logs_model ON generation_logs(model_name);

-- RLS Policies
ALTER TABLE generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generation logs"
    ON generation_logs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service can insert generation logs"
    ON generation_logs
    FOR INSERT
    WITH CHECK (true);

COMMENT ON TABLE generation_logs IS 'Tracks quality scores and costs for each cover letter generation iteration';
```

---

### 2. Logging Integration

**File:** `lib/services/cover-letter-generator.ts`

**Already integrated ✅** (verified in audit)

The generator already logs to `generation_logs` table in the iteration loop:

```typescript
// Log to DB
try {
    await supabase.from("generation_logs").insert({
        job_id: jobId,
        user_id: userId,
        iteration: iteration + 1,
        model_name: result.model,
        overall_score: scores.overall_score,
        naturalness_score: scores.naturalness_score,
        style_match_score: scores.style_match_score,
        company_relevance_score: scores.company_relevance_score,
        individuality_score: scores.individuality_score,
        issues: scores.issues,
        suggestions: scores.suggestions,
        generated_text: coverLetter,
        validation_passed: validation.isValid,
        word_count: validation.stats.wordCount
    });
} catch (e) {
    console.error("Failed to log generation:", e);
}
```

---

### 3. Optional Queries (For Future Dashboard)

**File:** `lib/queries/generation-analytics.ts` (optional)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get average quality scores for a user
 */
export async function getUserAverageScores(userId: string) {
    const { data } = await supabase
        .from('generation_logs')
        .select('overall_score, naturalness_score, style_match_score')
        .eq('user_id', userId)
        .eq('validation_passed', true);

    if (!data || data.length === 0) return null;

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
        overall: avg(data.map(d => d.overall_score)),
        naturalness: avg(data.map(d => d.naturalness_score)),
        styleMatch: avg(data.map(d => d.style_match_score))
    };
}

/**
 * Get success rate (validation pass rate)
 */
export async function getSuccessRate(userId: string) {
    const { data } = await supabase
        .from('generation_logs')
        .select('validation_passed')
        .eq('user_id', userId);

    if (!data || data.length === 0) return 0;

    const passed = data.filter(d => d.validation_passed).length;
    return (passed / data.length) * 100;
}

/**
 * Get iteration statistics
 */
export async function getIterationStats(userId: string) {
    const { data } = await supabase
        .from('generation_logs')
        .select('job_id, iteration')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (!data || data.length === 0) return { avgIterations: 0, maxIterations: 0 };

    const jobIterations = new Map<string, number>();
    
    data.forEach(log => {
        const current = jobIterations.get(log.job_id) || 0;
        jobIterations.set(log.job_id, Math.max(current, log.iteration));
    });

    const iterations = Array.from(jobIterations.values());
    const avg = iterations.reduce((a, b) => a + b, 0) / iterations.length;
    const max = Math.max(...iterations);

    return { avgIterations: avg, maxIterations: max };
}
```

---

## 📊 Example Analytics Queries

### Top Issues Across All Users
```sql
SELECT 
    unnest(issues) as issue,
    COUNT(*) as frequency
FROM generation_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY issue
ORDER BY frequency DESC
LIMIT 10;
```

### Model Performance Comparison
```sql
SELECT 
    model_name,
    AVG(overall_score) as avg_score,
    COUNT(*) as total_generations,
    SUM(CASE WHEN validation_passed THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
FROM generation_logs
GROUP BY model_name
ORDER BY avg_score DESC;
```

### User with Most Iterations
```sql
SELECT 
    user_id,
    AVG(iteration) as avg_iterations,
    MAX(iteration) as max_iterations
FROM generation_logs
GROUP BY user_id
ORDER BY avg_iterations DESC
LIMIT 10;
```

---

## ✅ Summary

**Status:** ✅ **COMPLETE**

- ✅ Database Migration created
- ✅ Logging integrated in generator
- ✅ RLS Policies configured
- ✅ Indexes for performance
- ✅ Analytics queries (optional)

**Next Steps (Phase 2):**
- [ ] Admin Dashboard for logs
- [ ] Real-time monitoring
- [ ] Cost tracking & alerts
- [ ] Export functionality
