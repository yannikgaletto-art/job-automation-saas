---
Version: 1.1.0
Last Updated: 2026-04-13
Status: AKTIV — PFLICHTLEKTÜRE vor jedem Vercel Deploy
---

# 🚀 DEPLOYMENT CHECKLIST — Pathly V2.0 (Vercel)

> **Zweck:** Verbindliches Prüfprotokoll vor jedem Production-Deployment.
> Deckt Env-Vars, Security, DSGVO und Runtime-Konfiguration ab.

---

## 1. VERCEL ENVIRONMENT VARIABLES

### Korrekte Konfiguration

| Variable | Environments | Sensitive? | Wert-Quelle |
|----------|-------------|-----------|-------------|
| **Supabase** | | | |
| `NEXT_PUBLIC_SUPABASE_URL` | Prod, Preview, Dev | ❌ Nein | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod, Preview, Dev | ❌ Nein | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod, Preview | ✅ Ja | Supabase Dashboard → Settings → API |
| **App Config** | | | |
| `NEXT_PUBLIC_APP_URL` | Prod | ❌ Nein | `https://app.path-ly.eu` |
| `NODE_ENV` | *(auto)* | — | Vercel setzt automatisch `production` |
| **AI Provider** | | | |
| `ANTHROPIC_API_KEY` | Prod, Preview | ✅ Ja | Anthropic Console |
| `MISTRAL_API_KEY` | Prod, Preview | ✅ Ja | Mistral Console (kein Dev nötig, .env.local reicht) |
| `OPENAI_API_KEY` | Prod, Preview | ✅ Ja | OpenAI Dashboard |
| `PERPLEXITY_API_KEY` | Prod, Preview | ✅ Ja | Perplexity Dashboard |
| **Scraping** | | | |
| `SERPAPI_KEY` | Prod, Preview | ✅ Ja | SerpAPI Dashboard |
| `JINA_READER_API_KEY` | Prod, Preview | ✅ Ja | Jina Dashboard |
| `FIRECRAWL_API_KEY` | Prod | ✅ Ja | Firecrawl Dashboard |
| **Security** | | | |
| `ENCRYPTION_KEY` | Prod | ✅ Ja | Lokal generiert (Fernet Key) |
| `ADMIN_SECRET` | Prod only | ✅ Ja | `openssl rand -hex 32` |
| **Stripe** | | | |
| `STRIPE_SECRET_KEY` | Prod | ✅ Ja | Stripe Dashboard → API Keys (LIVE) |
| `STRIPE_WEBHOOK_SECRET` | Prod | ✅ Ja | Stripe Dashboard → Webhooks (LIVE) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Prod, Preview | ❌ Nein | Stripe Dashboard → API Keys (LIVE) |
| `STRIPE_*_PRICE` (5 server) | Prod | ✅ Ja | Stripe Dashboard → Products |
| `NEXT_PUBLIC_STRIPE_*_PRICE` (5 client) | Prod, Preview | ❌ Nein | Stripe Dashboard → Products |
| **Inngest** | | | |
| `INNGEST_EVENT_KEY` | Prod, Preview | ✅ Ja | Inngest Dashboard |
| `INNGEST_SIGNING_KEY` | Prod, Preview | ✅ Ja | Inngest Dashboard |
| **Rate Limiting** | | | |
| `UPSTASH_REDIS_URL` | Prod, Preview | ✅ Ja | Upstash Console (⚠️ NICHT `_REST_URL`!) |
| `UPSTASH_REDIS_TOKEN` | Prod, Preview | ✅ Ja | Upstash Console (⚠️ NICHT `_REST_TOKEN`!) |
| **Azure** | | | |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Prod | ✅ Ja | Azure Portal |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Prod | ✅ Ja | Azure Portal |
| **Analytics** | | | |
| `NEXT_PUBLIC_POSTHOG_KEY` | Prod, Preview | ❌ Nein | PostHog Dashboard (⚠️ NICHT Sensitive!) |
| `NEXT_PUBLIC_POSTHOG_HOST` | Prod, Preview | ❌ Nein | `https://eu.i.posthog.com` (⚠️ NICHT Sensitive!) |
| **Error Monitoring** | | | |
| `NEXT_PUBLIC_SENTRY_DSN` | Prod, Preview, Dev | ❌ Nein | Sentry Dashboard |
| `SENTRY_AUTH_TOKEN` | Prod | ✅ Ja | Sentry Dashboard → Auth Tokens |
| **Email** | | | |
| `RESEND_API_KEY` | Prod | ✅ Ja | Resend Dashboard |
| **AI Observability** | | | |
| `HELICONE_API_KEY` | ⏸️ NICHT konfigurieren | — | Warten auf DPA (Art. 46 DSGVO) |

### ⚠️ Häufige Fehler (Vercel)

| Fehler | Konsequenz | Fix |
|--------|-----------|-----|
| `UPSTASH_REDIS_REST_URL` statt `UPSTASH_REDIS_URL` | Rate Limiting **deaktiviert** — alle Requests passieren ungebremst | Variable umbenennen: `UPSTASH_REDIS_URL` (ohne `_REST`) |
| `NEXT_PUBLIC_*` als "Sensitive" markiert | Variable wird **nicht** im Client-Bundle exponiert → Feature kaputt | "Sensitive" entfernen für alle `NEXT_PUBLIC_*` Vars |
| `EXT_PUBLIC_APP_URL` statt `NEXT_PUBLIC_APP_URL` | Server Actions CSRF-Check schlägt fehl, allowedOrigins leer | Korrekt: `NEXT_PUBLIC_APP_URL` |
| Stripe Test-Keys (`sk_test_*`) in Production | Zahlungen werden im Testmodus verarbeitet, kein Geld fließt | Prod = Live-Keys, Preview = Test-Keys |

---

## 2. PRE-DEPLOY CHECKS

### 2.1 TypeScript
```bash
npx tsc --noEmit
# Erwartung: 0 Errors
```

### 2.2 Build
```bash
npm run build
# Erwartung: Build erfolgreich, keine Warnings die Functionality beeinträchtigen
```

### 2.3 Security Headers (nach Deploy)
```bash
curl -sI https://app.path-ly.eu | grep -E "^(X-Frame|Strict-Transport|Content-Security|X-Content|Referrer|Permissions)"
```
Erwartung: Alle 6 Security-Header vorhanden.

### 2.4 CSP-Validierung
Verifiziere dass `connect-src` enthält:
- `https://eu.i.posthog.com` (PostHog Analytics)
- `https://eu.posthog.com` (PostHog Fallback)
- `https://*.supabase.co` (Database)
- `https://api.stripe.com` (Payments)
- `https://*.sentry.io` (Error Monitoring)
- `https://*.inngest.com` (Background Jobs)

### 2.5 Stripe Webhook
1. Vercel-URL in Stripe Dashboard als Webhook konfigurieren: `https://app.path-ly.eu/api/stripe/webhook`
2. Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
3. Webhook Secret in Vercel als `STRIPE_WEBHOOK_SECRET` hinterlegen

### 2.6 Inngest
1. Inngest Dashboard: App URL auf `https://app.path-ly.eu/api/inngest` setzen
2. Event Key + Signing Key in Vercel konfigurieren

### 2.7 Health Check (nach Deploy)
```bash
curl -s https://app.path-ly.eu/api/health | jq .
# Erwartung: { "status": "ok", "checks": { "database": "connected" } }
```

---

## 3. DSGVO-PFLICHTEN VOR GO-LIVE

### 3.1 Privacy Policy — Sub-Processors (Art. 13)
Alle aktiven Sub-Processors MÜSSEN in der Privacy Policy gelistet sein:

| Sub-Processor | Status | Datentyp |
|---------------|--------|----------|
| Supabase | ✅ Gelistet | Auth, DB |
| Anthropic | ✅ Gelistet | AI (PII pseudonymisiert) |
| OpenAI | ✅ Gelistet | Whisper Transkription |
| Perplexity | ✅ Gelistet | Company Research |
| SerpAPI | ✅ Gelistet | Job Search |
| Vercel | ✅ Gelistet | Hosting |
| Azure DI | ✅ Gelistet | CV Extraktion |
| Jina AI | ✅ Gelistet | HTML Scraping |
| Mistral | ✅ Gelistet | Job-Daten Extraktion |
| PostHog | ✅ Gelistet | Product Analytics |
| Stripe | ✅ Gelistet | Zahlungsabwicklung |
| Inngest | ✅ Gelistet | Background Jobs (nur IDs) |
| Upstash | ✅ Gelistet | Rate Limiting (nur IDs) |
| Sentry | ✅ Gelistet | Error Monitoring (PII gestrippt) |

### 3.2 Drittlandtransfer (Art. 46)
Für jeden US-basierten Sub-Processor: SCCs + DPA benötigt.

| Provider | Sitz | Transfer-Basis | DPA |
|----------|------|---------------|-----|
| Anthropic | USA | EU-SCCs (angefordert) | ⬜ Pending |
| OpenAI | USA | Standard ToS | ⬜ Pending |
| Perplexity | USA | EU-SCCs (angefordert) | ⬜ Pending |
| SerpAPI | USA | EU-SCCs (angefordert) | ⬜ Pending |
| Stripe | USA/IE | EU-SCCs + DPA verfügbar | ⬜ Anfordern |
| Sentry | USA | EU-Ingest (de.sentry.io) | ⬜ Pending |
| **Mistral** | **Frankreich 🇫🇷** | **Kein Drittland** | ✅ EU-native |
| **PostHog** | **EU 🇪🇺** | **Kein Drittland** | ✅ DPA verfügbar |
| **Upstash** | **EU (wählbar)** | **Kein Drittland** | ✅ EU-Region |
| Vercel | USA/EU | EU-Region (FRA) | ✅ Inkludiert |
| Azure | EU | Enterprise Agreement | ✅ Inkludiert |

---

## 4. POST-DEPLOY VALIDIERUNG

```
Datum: ___________
Deployer: ___________
Vercel URL: ___________
Git Commit: ___________

[ ] Health Check: /api/health → status: "ok"
[ ] Login funktioniert (Cookie + Redirect)
[ ] Dashboard lädt (Onboarding-Gate ok)
[ ] Rate Limiting aktiv (Upstash connected)
[ ] Stripe Webhook erreichbar (Stripe Dashboard → Test Event senden)
[ ] Inngest Functions registriert (Inngest Dashboard prüfen)
[ ] PostHog Events sichtbar (PostHog Dashboard nach Login prüfen)
[ ] Sentry Error Test (console.error → Sentry Event erscheint)
[ ] Security Headers vorhanden (curl -sI)
[ ] CSP blockiert nichts (Browser Console: keine CSP-Violations)

Freigabe: JA / NEIN
```

---

> Dieses Dokument wird nach jedem Deployment um neue Learnings erweitert.
