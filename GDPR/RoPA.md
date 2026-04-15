# Verarbeitungsverzeichnis (Record of Processing Activities — RoPA)

**Verantwortlicher:** Pathly / Yannik Galetto  
**Kontakt:** contact@path-ly.eu  
**Datenschutzbeauftragter:** Nicht bestellt (< 20 MA regelmäßig mit Verarbeitung befasst)  
**Letzte Aktualisierung:** 2026-04-15  
**Version:** 1.0  

---

## Rechtsgrundlage

Dieses Verzeichnis wird gemäß **Art. 30 DSGVO** geführt.

---

## Verarbeitungstätigkeiten

### 1. Benutzerregistrierung & Authentifizierung

| Feld | Wert |
|------|------|
| **Zweck** | Account-Erstellung, Login, Session-Management |
| **Betroffene** | Registrierte Nutzer |
| **Datenkategorien** | E-Mail, Passwort (bcrypt-gehasht), Name |
| **Rechtsgrundlage** | Art. 6(1)(b) — Vertragserfüllung |
| **Empfänger** | Supabase Auth (EU, Frankfurt) |
| **Drittlandtransfer** | Nein |
| **Löschfrist** | Bei Account-Löschung oder 12 Monate Inaktivität |
| **TOM** | TLS 1.3, AES-256, RLS, bcrypt |

---

### 2. Lebenslauf-Verarbeitung (CV Upload, Parse, Match, Optimize)

| Feld | Wert |
|------|------|
| **Zweck** | CV-Extraktion, ATS-Matching, KI-Optimierung |
| **Betroffene** | Registrierte Nutzer |
| **Datenkategorien** | CV-Inhalt (Berufserfahrung, Ausbildung, Skills), ggf. Foto (Art. 9) |
| **Rechtsgrundlage** | Art. 6(1)(a) — Einwilligung (Onboarding Consent) |
| **Art. 9 Einwilligung** | Separate opt-in Checkbox (`cv_special_categories`) für besondere Kategorien |
| **Empfänger** | Azure Document Intelligence (EU, West Europe), Anthropic Claude (US, ZDR) |
| **Drittlandtransfer** | Ja — Anthropic (US), SCC + ZDR |
| **PII-Schutz** | Vor jedem KI-Call: Name, E-Mail, Telefon, Adresse → Platzhalter |
| **Löschfrist** | Bei Account-Löschung oder 12 Monate Inaktivität |
| **TOM** | PII-Sanitizer, AES-256 at rest, TLS 1.3 in transit |

---

### 3. Anschreiben-Generierung (Cover Letter)

| Feld | Wert |
|------|------|
| **Zweck** | KI-gestützte Erstellung personalisierter Bewerbungsschreiben |
| **Betroffene** | Registrierte Nutzer |
| **Datenkategorien** | CV-Daten (pseudonymisiert), Stellenbeschreibung, Schreibstil-Präferenzen |
| **Rechtsgrundlage** | Art. 6(1)(a) — Einwilligung |
| **Empfänger** | Anthropic Claude Sonnet (US, ZDR) |
| **Drittlandtransfer** | Ja — Anthropic (US), SCC + ZDR |
| **Löschfrist** | Bei Account-Löschung oder 12 Monate Inaktivität |
| **TOM** | PII-Sanitizer, Human-in-the-Loop (Nutzer prüft vor Versand) |

---

### 4. Interview Coaching

| Feld | Wert |
|------|------|
| **Zweck** | KI-gestütztes Vorstellungsgespräch-Training |
| **Betroffene** | Registrierte Nutzer |
| **Datenkategorien** | Coaching-Nachrichten (pseudonymisiert), Audio-Transkripte |
| **Rechtsgrundlage** | Art. 6(1)(a) — Einwilligung |
| **Empfänger** | Anthropic Claude (US, ZDR), OpenAI Whisper (US, ZDR) |
| **Drittlandtransfer** | Ja — Anthropic + OpenAI (US), SCC + ZDR |
| **Löschfrist** | Chat anonymisiert nach 90 Tagen, Session gelöscht nach 180 Tagen |
| **TOM** | PII-Sanitizer, Coaching-spezifische Pseudonymisierung |

---

### 5. Jobsuche & Stellenanzeigen-Analyse

| Feld | Wert |
|------|------|
| **Zweck** | Stellensuche, Job-Parsing, Steckbrief-Erstellung |
| **Betroffene** | Registrierte Nutzer |
| **Datenkategorien** | Suchbegriffe, Stellenanzeigen-Texte (öffentlich), Firmennamen |
| **Rechtsgrundlage** | Art. 6(1)(b) — Vertragserfüllung |
| **Empfänger** | SerpAPI (US), Jina/Firecrawl (US), Claude Haiku (US, ZDR) |
| **Drittlandtransfer** | Ja — keine PII übertragen |
| **Löschfrist** | Bei Account-Löschung oder 12 Monate Inaktivität |
| **TOM** | Keine PII in Suchanfragen, Rate Limiting |

---

### 6. Unternehmensrecherche (Company Research)

| Feld | Wert |
|------|------|
| **Zweck** | KI-gestützte Unternehmensanalyse für Bewerbungsvorbereitung |
| **Betroffene** | Registrierte Nutzer (indirekt) |
| **Datenkategorien** | Firmennamen, öffentlich verfügbare Unternehmensdaten |
| **Rechtsgrundlage** | Art. 6(1)(b) — Vertragserfüllung |
| **Empfänger** | Perplexity Sonar Pro (US) |
| **Drittlandtransfer** | Ja — keine PII übertragen |
| **Löschfrist** | Cache: 7 Tage TTL; Nutzerdaten: 12 Monate Inaktivität |
| **TOM** | Keine PII-Übermittlung |

---

### 7. Zahlungsabwicklung (Stripe Billing)

| Feld | Wert |
|------|------|
| **Zweck** | Abonnementverwaltung, Zahlungsabwicklung |
| **Betroffene** | Zahlende Nutzer |
| **Datenkategorien** | E-Mail, Zahlungsmethode, Rechnungsdetails |
| **Rechtsgrundlage** | Art. 6(1)(b) — Vertragserfüllung |
| **Empfänger** | Stripe Inc. (US/EU), via SCC |
| **Drittlandtransfer** | Ja — Stripe (US/EU), SCC |
| **Löschfrist** | Bei Account-Löschung (Stripe Customer wird gelöscht) |
| **TOM** | PCI DSS Level 1, TLS 1.2+ |

---

### 8. Einwilligungsverwaltung (Consent Management)

| Feld | Wert |
|------|------|
| **Zweck** | Nachweis erteilter Einwilligungen (DSGVO Art. 7) |
| **Betroffene** | Alle registrierten Nutzer |
| **Datenkategorien** | Consent-Typ, Version, Zeitstempel, IP-Adresse, User-Agent |
| **Rechtsgrundlage** | Art. 6(1)(c) — Rechtliche Verpflichtung |
| **Empfänger** | Supabase (EU, Frankfurt) |
| **Drittlandtransfer** | Nein |
| **Löschfrist** | 3 Jahre nach Account-Löschung (Beweissicherung) |
| **TOM** | RLS, AES-256, Audit Trail |

---

### 9. Produktanalyse (PostHog)

| Feld | Wert |
|------|------|
| **Zweck** | Anonymisierte Produktnutzungsanalyse |
| **Betroffene** | Alle Nutzer |
| **Datenkategorien** | Seitenaufrufe, Feature-Events (maskierte Inputs) |
| **Rechtsgrundlage** | Art. 6(1)(f) — Berechtigtes Interesse |
| **Empfänger** | PostHog (EU) |
| **Drittlandtransfer** | Nein (EU-hosted) |
| **Löschfrist** | Standardmäßige PostHog-Retention |
| **TOM** | localStorage (keine Cookies), maskAllInputs: true, keine PII |

---

### 10. Fehlerüberwachung (Sentry)

| Feld | Wert |
|------|------|
| **Zweck** | Fehlererfassung, Stabilitätsmonitoring |
| **Betroffene** | Alle Nutzer |
| **Datenkategorien** | Fehlermeldungen, Stack Traces |
| **Rechtsgrundlage** | Art. 6(1)(f) — Berechtigtes Interesse |
| **Empfänger** | Sentry (EU Ingest) |
| **Drittlandtransfer** | Nein (EU Ingest) |
| **Löschfrist** | Sentry-Standard (90 Tage) |
| **TOM** | PII-Stripping via `beforeSend`, Session Replay deaktiviert |

---

### 11. Datenexport & Löschung (DSGVO Self-Service)

| Feld | Wert |
|------|------|
| **Zweck** | Umsetzung Art. 17 (Löschung) und Art. 20 (Datenportabilität) |
| **Betroffene** | Alle registrierten Nutzer |
| **Datenkategorien** | Alle nutzerbezogenen Daten |
| **Rechtsgrundlage** | Art. 6(1)(c) — Rechtliche Verpflichtung |
| **Empfänger** | Nutzer selbst (Export als JSON) |
| **Drittlandtransfer** | Nein |
| **Löschfrist** | Sofort (Self-Delete) oder 12 Monate Inaktivität (automatisch) |
| **TOM** | Rate Limiting, Confirmation-Gate (Typ "LÖSCHEN"), Stripe-Cleanup |

---

## Technisch-Organisatorische Maßnahmen (TOM) — Übersicht

| Maßnahme | Implementation |
|----------|---------------|
| **Verschlüsselung (at rest)** | AES-256 (Supabase/AWS) |
| **Verschlüsselung (in transit)** | TLS 1.3 |
| **Zugriffskontrolle** | Row Level Security (RLS) — jeder Nutzer sieht nur eigene Daten |
| **Pseudonymisierung** | PII-Sanitizer vor jedem KI-Call (Name, E-Mail, Telefon, Adresse → Platzhalter) |
| **Admin-Zugang** | getSupabaseAdmin() Singleton, Whitelist-basiert |
| **Ratelimiting** | Upstash Redis, 14 Endpunkte geschützt |
| **Audit Trail** | consent_history, credit_events, generation_logs |
| **Automatische Löschung** | pg_cron weekly cleanup (12 Monate Inaktivität) |
| **Datenminimierung** | Scoped Export (nur Art. 20-relevante Daten) |
| **KI-Transparenz** | AiGeneratedBadge Komponente (EU AI Act Art. 50) |

---

## Auftragsverarbeiter-Verzeichnis

| Anbieter | Zweck | Standort | AVV/DPA | SCC |
|----------|-------|----------|---------|-----|
| Supabase | DB, Auth, Storage | EU (Frankfurt) | ✅ | N/A |
| Anthropic | KI-Textgenerierung | US | ✅ (API TOS, ZDR) | ✅ |
| OpenAI | Whisper Transkription | US | ✅ (API TOS, ZDR) | ✅ |
| Azure (Microsoft) | Document Intelligence | EU (West Europe) | ✅ | N/A |
| Perplexity | Unternehmensrecherche | US | ✅ (API TOS) | ✅ |
| SerpAPI | Jobsuche | US | ✅ | ✅ |
| Stripe | Zahlung | US/EU | ✅ | ✅ |
| Vercel | Hosting, CDN | EU/US | ✅ | ✅ |
| Jina | Web Scraping | US | ✅ | ✅ |
| Firecrawl | Web Scraping (Fallback) | US | ✅ | ✅ |
| PostHog | Analytics | EU | ✅ | N/A |
| Sentry | Error Monitoring | EU (Ingest) | ✅ | N/A |
| Upstash | Rate Limiting | EU | ✅ | N/A |
| Inngest | Background Jobs | US | ✅ | ✅ |
| Helicone | AI Observability | US | ✅ | ✅ |
