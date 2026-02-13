# AGENT 1: JOB DISCOVERY DIRECTIVE

**Version:** 2.1  
**Last Updated:** 2026-02-13  
**Agent:** Job Discovery (Scraper Agent)  
**Architecture:** Platform-Intelligent Router  

---

## 🎯 RULE #0: REDUCE COMPLEXITY

**Principle:** MVP over Perfection. Ship fast, iterate later.

**Applied to Job Discovery:**
- ✅ **Start with 3 platforms** → LinkedIn, Greenhouse, StepStone (covers 70% of jobs)
- ✅ **Use existing Bright Data account** → Don't build custom LinkedIn scraper
- ✅ **Direct JSON APIs for ATS** → Free, 99% success, no anti-bot issues
- ✅ **Patchright for German boards** → One self-hosted tool beats managing 5 APIs
- ❌ **Build universal scraper** → Platform-specific is simpler & more reliable
- ❌ **Perfect error recovery** → Basic retry logic (3x) is enough for MVP
- ❌ **Support 20 platforms at launch** → Add more after validating core features

**Decision Framework:**
1. **Does Bright Data support this platform?** → Use their API (98% success)
2. **Does the ATS have a public JSON API?** → Use Direct API (99% success, $0)
3. **Is it a major German job board?** → Use Patchright (75-85% success)
4. **Everything else?** → Defer to Phase 2 (unless user demand is high)

**Motto:** "3 platforms that work beat 10 platforms that half-work."

---

[... rest of job_discovery.md remains the same ...]