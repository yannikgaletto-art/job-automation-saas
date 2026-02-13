# Pathly V2.0 - DEVELOPER OPERATING MANUAL

**Status:** MANDATORY FOR ALL AI AGENTS
**Version:** 2.1
**Last Updated:** 2026-02-13

---

## 🎯 RULE #0: REDUCE COMPLEXITY

**Principle:** MVP over Perfection. Ship fast, iterate later.

**What this means:**
- If a feature has 3 implementation paths → Pick the simplest that works
- If data migration is complex → Start with manual seed data
- If perfect accuracy requires 10 API calls → Use 2 calls with 80% accuracy
- If edge cases block progress → Handle them in Phase 2

**Decision Framework:**
1. **Does this block the prototype launch?** → Simplify or skip
2. **Does this add <10% value but 50% complexity?** → Cut it
3. **Can users work around this limitation?** → Ship without it
4. **Can we add this in 2 weeks after launch?** → Defer it

**Examples:**
- ✅ **Use master CV (no optimization)** → Ship faster, add CV optimization in Phase 2
- ✅ **Single cover letter generation (no QA loop)** → Add Quality Judge iteration later
- ✅ **Cache company research for 7 days** → Perfect balance (simple + effective)
- ✅ **Support 3 job platforms first** → Add more platforms after launch
- ❌ **Build multi-variant cover letter system** → Overkill for MVP
- ❌ **Perfect ATS form field detection** → Start with 2 platforms, expand later
- ❌ **Complex user preference engine** → Use simple profile fields first

**Motto:** 
> "One track to the goal beats 100 switches that prevent launch."

**Quality Guard:** 
This does NOT mean shipping broken features. It means:
- ✅ **Ship 3 features that work** > 10 features half-done
- ✅ **80% solution that launches** > 100% solution that never ships
- ✅ **Simple & reliable** > Complex & buggy

**When in doubt:** Ask yourself:
> "Would Stripe launch with this complexity?"

If no → Simplify.

---

[... rest of CLAUDE.md remains the same ...]