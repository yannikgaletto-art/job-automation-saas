---
Version: 1.0.0
Last Updated: 2026-04-21
Status: AKTIV — FINALER STRESSTEST VOR PRODUCTION RELEASE
Konsolidiert aus: DIRECTOR_QUALITY_TESTING.md, DEPLOYMENT_CHECKLIST.md, SICHERHEITS_DEV_TEST.md
---

# 🚀 FINAL STRESSTEST — Pathly V2.0

> **Zweck:** Dreifacher End-to-End Stresstest aller 14 Features vor Production Release.
> Jedes Feature wird in 3 Dimensionen getestet: **Code → Infrastruktur → User Flow**.
> **Null Toleranz:** Kein Feature darf übersprungen werden.

---

## PRE-FLIGHT CHECKS (vor dem Test beginnen)

### Umgebung
```
Browser: Chrome ✅ (NICHT Safari — separate Cookie-Stores)
Port: 3000 ✅
Inngest Dev: Running (npx inngest-cli@latest dev)
Git HEAD: ___________
Node: v20+ ✅
```

### Automated Gate (MUSS 0 Errors liefern)
```bash
# 1. TypeScript — Zero Errors
npx tsc --noEmit

# 2. Locale JSON Validation
node -e "['de','en','es'].forEach(l => { JSON.parse(require('fs').readFileSync('locales/'+l+'.json','utf8')); console.log('✅ '+l+'.json valid') })"

# 3. Build — Clean
npm run build

# 4. Environment Count
echo "=== .env.example ==="
grep -c "^[A-Z]" .env.example
echo "=== .env.local ==="
grep -c "^[A-Z]" .env.local
# .env.local MUSS >= .env.example sein
```

---

## LAYER 1: CODE AUDIT

### 1.1 Auth Guards — Vollständig?
```bash
# Alle API Routes OHNE getUser (erlaubt: health, stripe/webhook, inngest, waitlist/subscribe)
grep -rL "getUser" app/api/*/route.ts app/api/*/*/route.ts 2>/dev/null
```
**Erwartung:** Nur `health`, `stripe/webhook`, `inngest`, `waitlist/subscribe`, `feedback/transcribe` (uses separate auth).

### 1.2 Rate Limiting — 12+ Routes geschützt
```bash
grep -rl "checkUpstashLimit" app/api/ | wc -l
```
**Erwartung:** ≥ 12

### 1.3 Credit Gate — Alle AI-Routes
```bash
grep -rl "withCreditGate\|debit_credits\|checkCredits" app/api/ lib/ | grep -v node_modules | sort -u
```
**Erwartung:** Cover Letter, CV Match, CV Optimize, Coaching, Video Script routes.

### 1.4 Admin Access — Nur 2 Emails
```bash
cat lib/admin.ts
```
**Erwartung:** Genau `galettoyannik7@gmail.com` und `yannik.galetto@gmail.com`.

### 1.5 PII Sanitization
```bash
grep -rl "sanitizeForAI" lib/services/ | sort
```
**Erwartung:** coaching-service.ts, job-related services.

### 1.6 Model Router — Nur 4.6 Modelle
```bash
grep -r "claude-3-5\|claude-4-5\|claude-3\b" lib/ app/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
```
**Erwartung:** 0 Treffer (keine verbotenen Model-Versionen).

---

## LAYER 2: INFRASTRUKTUR AUDIT

### 2.1 Security Headers (nach Deploy)
```bash
curl -sI https://app.path-ly.eu | grep -E "^(X-Frame|Strict-Transport|Content-Security|X-Content|Referrer|Permissions)"
```
**Erwartung:** Alle 6 Header vorhanden.

### 2.2 CSP — Alle Domains erlaubt
Verifiziere in `next.config.js` dass `connect-src` enthält:
- [x] `https://*.supabase.co` + `wss://*.supabase.co`
- [x] `https://api.stripe.com`
- [x] `https://api.anthropic.com`
- [x] `https://api.openai.com`
- [x] `https://api.mistral.ai`
- [x] `https://api.perplexity.ai`
- [x] `https://serpapi.com`
- [x] `https://r.jina.ai`
- [x] `https://api.firecrawl.dev`
- [x] `https://*.sentry.io` + `https://*.ingest.sentry.io`
- [x] `https://*.inngest.com`
- [x] `https://eu.i.posthog.com` + `https://eu.posthog.com`
- [x] `https://us-assets.i.posthog.com` (PostHog static assets)

### 2.3 Stripe Webhook
- [ ] URL: `https://app.path-ly.eu/api/stripe/webhook`
- [ ] Events konfiguriert: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] `STRIPE_WEBHOOK_SECRET` auf Vercel gesetzt
- [ ] Idempotenz: `processed_stripe_events` Tabelle existiert

### 2.4 Inngest
- [ ] App URL: `https://app.path-ly.eu/api/inngest`
- [ ] `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` auf Vercel
- [ ] Functions registriert im Inngest Dashboard

### 2.5 PostHog
- [ ] Reverse Proxy aktiv (`/ingest/*` → `eu.i.posthog.com`)
- [ ] Authorized URLs in PostHog Dashboard: `https://app.path-ly.eu`
- [ ] Web Vitals aktiviert (`capture_performance: true`)
- [ ] Events sichtbar im PostHog Dashboard

### 2.6 Sentry
- [ ] PII stripped (`beforeSend` in `sentry.client.config.ts`)
- [ ] EU Ingest konfiguriert
- [ ] Session Replay disabled (DSGVO)

### 2.7 Health Check (nach Deploy)
```bash
curl -s https://app.path-ly.eu/api/health | jq .
```
**Erwartung:** `{ "status": "ok", "checks": { "database": "connected" } }`

---

## LAYER 3: FEATURE-DURCHLAUF (14 Features)

> Jedes Feature wird End-to-End durchgetestet. Kein Überspringen erlaubt.

### Feature 1: Onboarding Flow
- [ ] Neuer User → Onboarding Sequence startet
- [ ] Notion-style Goal Toggle funktioniert
- [ ] SlideToActionButton animiert korrekt
- [ ] `onboarding_completed = true` nach Abschluss
- [ ] Redirect zu Dashboard nach Onboarding

### Feature 2: Job Ingest
- [ ] URL eingeben → Firecrawl scrape → Claude Haiku Extract
- [ ] Job erscheint in Queue mit Status `pending`
- [ ] Steckbrief Daten vollständig (Titel, Firma, Ort, Skills)
- [ ] Inngest `job/extract` Event wird getriggert

### Feature 3: Guided Tours (Job Queue)
- [ ] 8-Step Tour läuft komplett durch (Add Job → Chrome Extension → ... → Video Letter)
- [ ] Spotlight-Elemente werden korrekt hervorgehoben
- [ ] Tour-State wird in localStorage persistiert
- [ ] Tour kann übersprungen und zurückgesetzt werden

### Feature 4: CV Match Analysis
- [ ] CV Upload → Azure Document Intelligence Extraction
- [ ] Match Score wird berechnet und angezeigt
- [ ] Gap Analysis mit Coaching-orientierter Sprache
- [ ] Credits werden korrekt abgezogen + Refund bei Fehler

### Feature 5: CV Optimization
- [ ] Valley/Tech Template wählbar
- [ ] Optimierte Sections werden generiert
- [ ] PDF Preview funktioniert
- [ ] QR Code wird generiert (mit Consent)

### Feature 6: Cover Letter Generation
- [ ] Default Preset = "Storytelling" ✅
- [ ] Company Research (Perplexity) läuft im Hintergrund
- [ ] Writing Style wird berücksichtigt
- [ ] Copy-Button zeigt "Kopiert ✓" Feedback (2s, blau)
- [ ] Inngest Polish Pipeline wird getriggert
- [ ] Credits werden korrekt abgezogen

### Feature 7: Video Script Studio
- [ ] Keyword Categorization (Claude Haiku)
- [ ] Block Generation funktioniert
- [ ] Templates (System + User) laden korrekt

### Feature 8: Coaching
- [ ] 3-Round Mock Interview startet
- [ ] Voice Recording → Whisper Transcription
- [ ] Gap Analysis mit PREP/3-2-1/CCC Frameworks
- [ ] Coaching Report wird async generiert (Inngest)
- [ ] "In Tagesziele speichern" Button funktioniert
- [ ] "Coaching Dashboard" Navigations-Button funktioniert
- [ ] Analyse-Stichpunkte in schwarzer Schrift (nicht grau)

### Feature 9: Stripe Billing
- [ ] Pricing Page zeigt alle 3 Plans
- [ ] Checkout → Stripe → Credits werden gutgeschrieben
- [ ] Webhook verarbeitet Events idempotent
- [ ] Credit-Anzeige korrekt (Quota nicht aufgebläht)
- [ ] Upgrade/Downgrade Flow funktioniert

### Feature 10: Mood Check-in V2
- [ ] Tag/Nacht-Symbole adaptiv
- [ ] Progressive Reduction (5× Skip → auto-hide)
- [ ] Settings-Card in Einstellungen
- [ ] i18n (de/en/es)

### Feature 11: Avatar Picker
- [ ] Tier-Avatar auswählbar in Sidebar
- [ ] Pathly Brand Colors
- [ ] Persistiert in `user_profiles.avatar_animal`

### Feature 12: Fokus/Pomodoro
- [ ] Tasks erstellen mit 25/50 Min Auswahl
- [ ] Kalender-Anzeige passt sich an Minutenzahl an
- [ ] Löschen (Mülleimer) funktioniert bei aktiven und fertigen Tasks
- [ ] Fortschrittsbalken in Pathly Dunkelblau
- [ ] "Weiter", "Fertig", "Löschen", "Fortschritt" Buttons

### Feature 13: Feedback (Anonymisiert)
- [ ] Feedback-Formular senden → im Admin als "Anonym" sichtbar
- [ ] Resend Email enthält KEINE persönlichen Daten
- [ ] Voice Recording → Transcription → Text im Input
- [ ] Credit-Grant bei Feedback über Paywall-Modal

### Feature 14: Admin Dashboard
- [ ] Nur für 2 Admin-Emails zugänglich
- [ ] Platform Pulse: DAU, Sentry, AI-Kosten, Pipeline
- [ ] Analytics: PostHog Events + DAU Chart
- [ ] AI & Kosten: Helicone/DB-Fallback Badge sichtbar
- [ ] Wachstum & Feedback: Alle Feedback-Einträge als "Anonym"
- [ ] User & Warteliste: CRUD Operationen

---

## LAYER 4: SICHERHEIT & DSGVO

### 4.1 RLS Verifikation
```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
    'job_queue', 'application_history', 'generation_logs', 'documents',
    'user_credits', 'credit_events', 'coaching_sessions', 'video_scripts',
    'community_posts', 'user_feedback', 'user_profiles', 'user_settings',
    'referrals', 'company_research'
)
ORDER BY tablename;
```
**Erwartung:** Mindestens 1 Policy pro Tabelle.

### 4.2 DSGVO Sub-Processors
| Sub-Processor | Status | Datentyp |
|---|---|---|
| Supabase | ✅ | Auth, DB (EU Frankfurt) |
| Anthropic | ✅ | AI (PII pseudonymisiert) |
| OpenAI | ✅ | Whisper Transkription |
| Perplexity | ✅ | Company Research |
| SerpAPI | ✅ | Job Search |
| Vercel | ✅ | Hosting (EU Region) |
| Azure DI | ✅ | CV Extraktion (EU) |
| Jina AI | ✅ | HTML Scraping |
| PostHog | ✅ | Analytics (EU, no cookies) |
| Stripe | ✅ | Zahlungsabwicklung |
| Inngest | ✅ | Background Jobs (nur IDs) |
| Upstash | ✅ | Rate Limiting (EU) |
| Sentry | ✅ | Error Monitoring (PII stripped) |
| Resend | ✅ | Email (anonymisiert) |

### 4.3 Data Retention
- [ ] Coaching: 90d conversation_history → `'[]'`, 180d DELETE
- [ ] SerpAPI Raw: 30d → NULL
- [ ] Firecrawl Markdown: 14d → NULL
- [ ] Generation Logs: `generated_text` auf NULL

### 4.4 PII in AI-Calls
- [ ] `sanitizeForAI()` aktiv auf Coaching, Job Ingest, Job Extract
- [ ] Cover Letter/CV Optimize: `personalInfo` wird vor AI-Call gelöscht
- [ ] Sentry: `beforeSend` löscht email/IP/username
- [ ] PostHog: `maskAllInputs: true`, EU endpoint, localStorage

---

## TRIPLE STRESSTEST PROTOKOLL

```
═══════════════════════════════════════════════════════════
  PATHLY V2.0 — FINAL STRESSTEST
═══════════════════════════════════════════════════════════

Datum:          ___________
Tester:         ___________
Browser:        Chrome ✅
Port:           3000 ✅
Inngest Dev:    Running ✅
Git HEAD:       ___________
tsc:            0 errors ✅
Build:          Success ✅
Locales:        Valid ✅

── LAYER 1: CODE AUDIT ──────────────────────────────────
Auth Guards:         ___/___  (Routes ohne Guard = erlaubt?)
Rate Limiters:       ___/12
Credit Gates:        ___/5
Admin Whitelist:     2 Emails ✅/❌
PII Sanitizer:       aktiv ✅/❌
Model Router:        nur 4.6 ✅/❌

── LAYER 2: INFRASTRUKTUR ───────────────────────────────
Security Headers:    ___/6
CSP Domains:         ___/14
Stripe Webhook:      ✅/❌
Inngest Functions:   ✅/❌
PostHog Proxy:       ✅/❌
PostHog Web Vitals:  ✅/❌
Sentry PII-Strip:    ✅/❌
Health Check:        ✅/❌

── LAYER 3: FEATURES ────────────────────────────────────
 1. Onboarding:      ✅/❌
 2. Job Ingest:      ✅/❌
 3. Guided Tours:    ✅/❌
 4. CV Match:        ✅/❌
 5. CV Optimize:     ✅/❌
 6. Cover Letter:    ✅/❌
 7. Video Script:    ✅/❌
 8. Coaching:        ✅/❌
 9. Stripe Billing:  ✅/❌
10. Mood Check-in:   ✅/❌
11. Avatar Picker:   ✅/❌
12. Fokus/Pomodoro:  ✅/❌
13. Feedback:        ✅/❌
14. Admin Dashboard: ✅/❌

── LAYER 4: SICHERHEIT & DSGVO ──────────────────────────
RLS Policies:        ✅/❌
Sub-Processors:      14/14
Data Retention:      ✅/❌
PII in AI:           ✅/❌

═══════════════════════════════════════════════════════════
  ERGEBNIS
═══════════════════════════════════════════════════════════

Critical Bugs (🔴):  ___
Medium Bugs (🟡):    ___
Low Bugs (🟢):       ___

Freigabe: JA / NEIN

Unterschrift: ___________
Datum:        ___________
═══════════════════════════════════════════════════════════
```

---

## BEKANNTE FALLEN (aus bisherigen Tests)

| # | Problem | Ursache | Fix |
|---|---------|---------|-----|
| 1 | Dashboard → Onboarding Loop | Defekte Safari-Session | Chrome nutzen, Cookies löschen |
| 2 | Port 3001 statt 3000 | Port belegt | `pkill -f "next dev"` → neu starten |
| 3 | Rate Limiting deaktiviert | `UPSTASH_REDIS_REST_URL` statt `UPSTASH_REDIS_URL` | Variable umbenennen |
| 4 | PostHog blockiert | CSP `connect-src` fehlt | `next.config.js` updaten |
| 5 | `NEXT_PUBLIC_*` als Sensitive auf Vercel | Variable nicht im Client | Sensitive-Flag entfernen |
| 6 | Cover Letter timeout | `maxDuration` fehlt | Vercel Pro + `maxDuration = 60` |
| 7 | Helicone zeigt 0ms Latenz | Proxy Key statt Query API Key | `HELICONE_QUERY_API_KEY` setzen |
| 8 | Feedback zeigt Namen | Name aus Auth-Session | API: `name: null` enforced |
| 9 | CI Build Fehler | Fehlende `eslint.config.mjs` | Datei mit `next/core-web-vitals` erstellen |
| 10 | Referral FK Constraint | `referred_user_id NOT NULL + ON DELETE SET NULL` | Migration: `DROP NOT NULL` |

---

> Dieses Dokument wird nach jedem Stresstest um neue Learnings erweitert.
> Es ersetzt NICHT die Einzeldokumente, sondern konsolidiert sie für den finalen Release-Gate.
