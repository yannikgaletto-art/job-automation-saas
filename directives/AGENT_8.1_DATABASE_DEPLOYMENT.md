# 🤖 AGENT PROMPT: PHASE 8.1 — DATABASE DEPLOYMENT (MVP Critical)

## MISSION
Deploy the complete Pathly V2.0 database schema to production Supabase instance. This is the **most critical MVP task** — without the database, the entire application is non-functional.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`database/schema.sql`** — **CRITICAL: The complete schema to deploy**
   - 448 lines of PostgreSQL DDL
   - 10 tables, 5 triggers, 4 functions, 2 cron jobs
   - Must be executed in order (dependencies exist)

2. **`docs/ARCHITECTURE.md`** — System Architecture
   - Understand data flow between tables
   - RLS policies ensure security

3. **`CLAUDE.md`** — "Reduce Complexity!"
   - Deploy schema as-is, don't optimize prematurely
   - Verify once, trust the schema

4. **`docs/MASTER_PLAN.md`** — Phase 8 details
   - Understand what's critical vs optional

5. **Supabase Documentation**
   - SQL Editor: https://supabase.com/docs/guides/database/sql-editor
   - Extensions: https://supabase.com/docs/guides/database/extensions
   - RLS Policies: https://supabase.com/docs/guides/auth/row-level-security

6. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before deploying:
- Read the ENTIRE `schema.sql` file (448 lines)
- Understand table dependencies (auth.users → user_profiles → documents)
- Verify all extensions are available in Supabase
- Check for any environment-specific changes needed

### 2. 🧹 Reduce Complexity
- **MVP first** — Deploy complete schema, skip optimizations
- **No custom changes** — Use schema.sql exactly as written
- **Trust the schema** — It's been validated in development
- **One deployment** — Don't split into multiple runs

### 3. 📁 Proper Filing
- Create deployment log → `database/deployment-log.md`
- Document any errors encountered
- Record Supabase project ID and region

### 4. 🎖️ Senior Engineer Autonomy
- Handle extension errors gracefully (pg_cron may need enabling)
- Verify RLS policies are active
- Test basic CRUD operations after deployment
- Create admin user test queries

### 5. 🧪 Interoperability Testing
After deployment, verify:
- [ ] All tables created successfully
- [ ] All indexes created
- [ ] All RLS policies active
- [ ] All triggers functional
- [ ] Extensions enabled
- [ ] Seed data inserted (form_selectors)

### 6. ⚡ Efficiency
- Use Supabase SQL Editor (fastest for DDL)
- Run entire schema.sql in one transaction
- Rollback on any error (built into psql)

### 7. 📝 Additional Standards
- **Idempotent** — Schema uses `IF NOT EXISTS` everywhere
- **Logging** — Document success/failure with timestamps
- **Backup** — Supabase has automatic backups, but note timestamp
- **Version** — Record schema version (3.0) in deployment log

---

## CURRENT STATE

### ✅ Already Exists
- `database/schema.sql` — Complete schema (Version 3.0)
- Supabase project created (via web console)
- Environment variables in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

### ⚠️ Verification Needed
- Is Supabase project URL correct in `.env.local`?
- Do we have admin access to Supabase Dashboard?
- Is `pg_cron` extension available? (Depends on Supabase plan)

### ❌ Missing (Your Task)
- Schema not deployed to production Supabase
- Tables don't exist yet
- RLS policies not active
- Seed data not inserted

---

## YOUR TASK

### 8.1.1: Pre-Deployment Checklist
**Goal:** Verify all prerequisites before running schema.

**Implementation:**
1. **Verify Supabase Access:**
   - Open Supabase Dashboard: https://app.supabase.com
   - Navigate to your project
   - Go to SQL Editor
   - Confirm you can run queries

2. **Check Required Extensions:**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT * FROM pg_available_extensions 
   WHERE name IN ('uuid-ossp', 'pg_cron', 'pg_trgm', 'vector');
   ```
   **Expected:** All 4 extensions available
   **Note:** `pg_cron` may require Pro plan. If unavailable, we'll skip cron jobs for MVP.

3. **Check Existing Schema:**
   ```sql
   -- Check if any tables already exist
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```
   **Expected:** Empty or minimal tables (no conflicts)

**Acceptance Criteria:**
- ✅ Supabase Dashboard accessible
- ✅ SQL Editor functional
- ✅ Extensions available (at least uuid-ossp, pg_trgm)
- ✅ No conflicting tables

---

### 8.1.2: Deploy Schema via Supabase SQL Editor
**Goal:** Execute complete schema.sql in production.

**Implementation:**

**Step 1: Open SQL Editor**
1. Go to Supabase Dashboard → SQL Editor
2. Click "New query"
3. Copy ENTIRE contents of `database/schema.sql`
4. Paste into editor

**Step 2: Handle Extensions (CRITICAL)**

If `pg_cron` is NOT available (common on free tier):
1. **Comment out these lines:**
   ```sql
   -- Line 9: CREATE EXTENSION IF NOT EXISTS "pg_cron";
   
   -- Lines 250-255: Auto-cleanup cron job
   -- SELECT cron.schedule('cleanup-research', '0 2 * * *', 'SELECT cleanup_expired_research()');
   
   -- Lines 410-415: Reset daily counts cron job
   -- SELECT cron.schedule('reset-daily', '0 0 * * *', 'SELECT reset_daily_counts()');
   ```

2. **Alternative:** Add manual cleanup note to deployment log

If `vector` extension is NOT available:
1. **Comment out this line:**
   ```sql
   -- Line 103: writing_style_embedding VECTOR(1536),
   ```
2. **Note:** This only affects Phase 5 (Cover Letter Style Matching)

**Step 3: Run Schema**
1. Click "Run" (or Ctrl/Cmd + Enter)
2. Wait for execution (may take 10-30 seconds)
3. Check for any errors in output panel

**Step 4: Verify Success**
```sql
-- Check all tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Expected Output (10 tables):**
```
application_history
auto_search_configs
company_research
consent_history
documents
form_selectors
generation_logs
job_queue
search_trigger_queue
user_profiles
```

**Acceptance Criteria:**
- ✅ All 10 tables created
- ✅ No errors in SQL Editor output
- ✅ Seed data inserted (form_selectors has 17 rows)
- ✅ Schema version 3.0 recorded

---

### 8.1.3: Verify Extensions
**Goal:** Confirm all enabled extensions.

**Implementation:**
```sql
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'pg_trgm', 'pg_cron', 'vector');
```

**Expected Output:**
```
uuid-ossp | 1.1
pg_trgm   | 1.6
-- pg_cron and vector may be missing (OK for MVP)
```

**Acceptance Criteria:**
- ✅ `uuid-ossp` enabled (REQUIRED)
- ✅ `pg_trgm` enabled (REQUIRED for fuzzy search)
- ⚠️ `pg_cron` optional (can run cleanup manually)
- ⚠️ `vector` optional (Phase 5 feature)

---

### 8.1.4: Verify RLS Policies
**Goal:** Confirm Row Level Security is active.

**Implementation:**
```sql
-- Check RLS is enabled on tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true;
```

**Expected Output (6 tables with RLS):**
```
user_profiles
documents
auto_search_configs
job_queue
application_history
generation_logs
```

**Check Specific Policies:**
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Acceptance Criteria:**
- ✅ RLS enabled on 6 tables
- ✅ At least 6 policies active
- ✅ All policies use `auth.uid()` for user isolation

---

### 8.1.5: Verify Triggers
**Goal:** Confirm triggers are functional.

**Implementation:**
```sql
-- List all triggers
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table;
```

**Expected Output (3 triggers):**
```
trigger_user_profiles_updated_at | user_profiles       | BEFORE | UPDATE
trigger_prevent_double_apply     | application_history | BEFORE | INSERT
```

**Acceptance Criteria:**
- ✅ `trigger_user_profiles_updated_at` exists
- ✅ `trigger_prevent_double_apply` exists
- ✅ No errors when triggers fire

---

### 8.1.6: Verify Seed Data
**Goal:** Confirm form selectors are inserted.

**Implementation:**
```sql
SELECT platform_name, COUNT(*) as selector_count
FROM form_selectors
GROUP BY platform_name
ORDER BY platform_name;
```

**Expected Output:**
```
greenhouse | 6
lever      | 5
linkedin   | 2
workday    | 5
```

**Total:** 18 selectors

**Acceptance Criteria:**
- ✅ At least 15 selectors inserted
- ✅ All 4 platforms represented
- ✅ No duplicate selectors

---

### 8.1.7: Create Deployment Log
**Goal:** Document deployment for future reference.

**Implementation:**
```markdown
# Database Deployment Log

**Schema Version:** 3.0
**Deployed By:** [Your Name]
**Deployment Date:** 2026-02-16
**Supabase Project ID:** [xxxxx]
**Region:** [eu-central-1 or us-east-1]

## Deployment Steps
1. ✅ Pre-deployment checks passed
2. ✅ Schema.sql executed successfully
3. ✅ All tables created (10/10)
4. ✅ Extensions enabled (uuid-ossp, pg_trgm)
5. ⚠️ pg_cron skipped (not available on plan)
6. ✅ RLS policies active (6 tables)
7. ✅ Triggers functional (2/2)
8. ✅ Seed data inserted (18 selectors)

## Extensions Status
- ✅ uuid-ossp: Enabled
- ✅ pg_trgm: Enabled
- ❌ pg_cron: Not available (manual cleanup required)
- ❌ vector: Not available (Phase 5 feature skipped)

## Manual Cleanup Commands

Since pg_cron is not available, run these queries weekly:

```sql
-- Cleanup expired research (every Monday)
DELETE FROM company_research WHERE expires_at < NOW();

-- Reset daily counts (every day)
UPDATE auto_search_configs
SET daily_count = 0, last_reset_at = NOW()
WHERE DATE(last_reset_at) < CURRENT_DATE;
```

## Post-Deployment Tests
- ✅ Test user registration
- ✅ Test document upload
- ✅ Test job queue insert
- ✅ Test RLS isolation

## Issues Encountered
- None (or list any errors)

## Next Steps
- [ ] Update .env.local with production Supabase URL
- [ ] Test application against production DB
- [ ] Enable pg_cron via Supabase support ticket (if needed)
```

**Save to:** `database/deployment-log.md`

**Acceptance Criteria:**
- ✅ Log documents all deployment steps
- ✅ Includes Supabase project details
- ✅ Lists any skipped features (pg_cron)
- ✅ Provides manual cleanup commands

---

## VERIFICATION CHECKLIST

### Pre-Deployment
- [ ] Supabase Dashboard accessible
- [ ] SQL Editor functional
- [ ] `database/schema.sql` file reviewed
- [ ] Extensions availability checked

### Deployment
- [ ] Schema.sql executed in SQL Editor
- [ ] All 10 tables created
- [ ] Seed data inserted (18 form selectors)
- [ ] No errors in output

### Post-Deployment
- [ ] Extensions verified (uuid-ossp, pg_trgm)
- [ ] RLS policies active (6 tables)
- [ ] Triggers functional (2 triggers)
- [ ] Seed data verified (18 rows)
- [ ] Deployment log created

### Testing
- [ ] Test INSERT into `user_profiles` (should work for auth user)
- [ ] Test INSERT into `documents` (RLS should isolate by user_id)
- [ ] Test duplicate application (trigger should block)
- [ ] Test form_selectors query (seed data readable)

### Documentation
- [ ] `database/deployment-log.md` created
- [ ] `.env.local` updated (if needed)
- [ ] `docs/MASTER_PLAN.md` updated (Phase 8.1 checked off)

---

## SUCCESS CRITERIA

✅ All 10 tables exist in production Supabase
✅ RLS policies active and functional
✅ Seed data inserted (form selectors)
✅ Extensions enabled (uuid-ossp, pg_trgm minimum)
✅ Deployment log documents process
✅ No breaking errors in application

---

## EXECUTION ORDER

1. Read all prerequisite documents
2. Complete Pre-Deployment Checklist (8.1.1)
3. Deploy Schema via SQL Editor (8.1.2)
4. Verify Extensions (8.1.3)
5. Verify RLS Policies (8.1.4)
6. Verify Triggers (8.1.5)
7. Verify Seed Data (8.1.6)
8. Create Deployment Log (8.1.7)
9. Test basic CRUD operations
10. Update `docs/MASTER_PLAN.md`

---

## ⚠️ PARALLELISATION HINT

❌ **Cannot run parallel with ANY other phase** — Database must exist first!
✅ **Blocking all other phases** — This is THE critical path
🔴 **MVP Priority: P0 (Critical)** — Without this, nothing works

---

## 🔗 DEPENDENCIES

- **Depends on:** Supabase project created
- **Required by:** ALL phases (1-12)
- **Blocks:** Everything (most critical task)

---

## 🚨 COMMON ISSUES & SOLUTIONS

### Issue 1: "pg_cron extension not available"
**Solution:** 
- Comment out `CREATE EXTENSION IF NOT EXISTS "pg_cron";`
- Comment out both `cron.schedule()` calls
- Document manual cleanup in deployment log
- Contact Supabase support to enable (Pro plan feature)

### Issue 2: "vector extension not available"
**Solution:**
- Comment out `writing_style_embedding VECTOR(1536)` line
- Phase 5 (Cover Letter Style) will need adjustment
- Not critical for MVP

### Issue 3: "Permission denied for schema public"
**Solution:**
- You're using wrong database credentials
- Use Service Role Key, not Anon Key
- Check Supabase Dashboard → Settings → API

### Issue 4: "Relation auth.users does not exist"
**Solution:**
- Supabase Auth is not enabled
- Go to Authentication → Enable Email provider
- Schema depends on `auth.users` table

### Issue 5: "Seed data not inserting"
**Solution:**
- Check for `ON CONFLICT DO NOTHING` clause
- May already exist from previous run (OK)
- Verify with `SELECT COUNT(*) FROM form_selectors;`

---

## 📞 POST-DEPLOYMENT TESTING

### Test 1: User Profile Creation
```sql
-- Insert test profile (replace with real user_id from auth.users)
INSERT INTO user_profiles (id, pii_encrypted, onboarding_completed)
VALUES (
    '[user-uuid-from-auth]',
    '\\x00', -- Dummy encrypted data
    false
);
```

### Test 2: RLS Isolation
```sql
-- Should return 0 rows if RLS working (no authenticated user in SQL Editor)
SELECT * FROM user_profiles;
```

### Test 3: Duplicate Prevention
```sql
-- Insert first application
INSERT INTO application_history (user_id, company_name, job_url, job_title)
VALUES ('[user-uuid]', 'Test Corp', 'https://test.com/job', 'Engineer');

-- Try duplicate (should FAIL with exception)
INSERT INTO application_history (user_id, company_name, job_url, job_title)
VALUES ('[user-uuid]', 'Test Corp', 'https://test.com/job', 'Engineer');
-- Expected: ERROR: Already applied to this job within 30 days
```

### Test 4: Form Selectors Query
```sql
-- Should return 6 rows
SELECT * FROM form_selectors WHERE platform_name = 'greenhouse';
```

---

## 🎯 FINAL DELIVERABLES

1. ✅ Production database with all tables
2. ✅ `database/deployment-log.md` file
3. ✅ Updated `docs/MASTER_PLAN.md` (Phase 8.1 checked)
4. ✅ Test queries documented
5. ✅ Manual cleanup commands documented (if pg_cron unavailable)

---

**Good luck! This is the most important deployment of the entire project.** 🚀
