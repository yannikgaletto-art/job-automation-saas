# Pathly Browser Extension — Feature Specification

**Status:** Ready for Development
**Version:** 1.0
**Framework:** Plasmo (Manifest V3)
**Priority:** 🔴 Highest — Eliminates größte Friction im gesamten User Flow

---

## Goal

Eine Chrome/Edge-Extension (Manifest V3, Plasmo-Framework), die Pathly **direkt in die Job-Plattformen des Users** verlängert: 1-Klick Job-Import, On-Page Match-Overlay und automatisches Status-Sync — ohne dass der User seinen Workflow verlässt.

---

## Strategische Entscheidung: Warum Plasmo?

Es gibt drei mögliche Frameworks:

| Option | DX | MV3-kompatibel | React/TS | Hot Reload | Entscheidung |
|---|---|---|---|---|---|
| **Plasmo** | ⭐⭐⭐⭐⭐ | ✅ Auto | ✅ First-class | ✅ | ✅ **Gewählt** |
| WXT | ⭐⭐⭐⭐ | ✅ Auto | ✅ | ✅ | 🟡 Alternative |
| Plain MV3 | ⭐⭐ | Manuell | Manuell | ❌ | ❌ Zu viel Overhead |

**Begründung:** Pathly ist bereits in React/Next.js/TypeScript gebaut. Plasmo verwendet dieselbe Component-Sprache, kompiliert automatisch zu MV3 und hat ein eingebautes `@plasmohq/storage` für Cross-Context-State. Nutzung von Glasp, Superflows, Merlin — alle auf Plasmo.

---

## Browser-Strategie (Phasen)

| Phase | Browser | Marktanteil DE | Zusatzaufwand | Timing |
|---|---|---|---|---|
| Phase 1 | Chrome | ~62% | Basis | Jetzt |
| Phase 1 | Edge | ~14% | **0h** (Chrome-kompatibel) | Jetzt gratis |
| Phase 2 | Firefox | ~7% | ~2–3 Tage | nach Launch |
| Phase 2 | Safari | ~17% | ~1–2 Wochen (macOS Xcode) | nach Launch |
| Phase 2 | Brave/Arc | ~2% | **0h** (Chromium-kompatibel) | Jetzt gratis |

**Phase 1 deckt ~78% aller Desktop-Browser mit einer einzigen Codebase ab.**

---

## Inputs

| Input | Typ | Quelle | Pflicht |
|---|---|---|---|
| `job_url` | `string` | Aktuelle Browser-Tab-URL | ✅ |
| `page_dom` | `Document` | Content Script (aktueller Tab) | ✅ |
| `auth_token` | `string` | `chrome.storage.local` (Supabase JWT) | ✅ |
| `user_cv_data` | `object` | Pathly API `/api/user/cv-summary` | Für Overlay |
| `pathly_job_list` | `array` | Pathly API `/api/jobs` | Für Status-Sync |

---

## Tools / Dependencies

| Package | Zweck | Kosten |
|---|---|---|
| `plasmo` | Extension-Framework (MV3) | Open Source |
| `@plasmohq/storage` | Cross-Context State (Popup ↔ SW ↔ Content) | Open Source |
| `@plasmohq/messaging` | Message Passing zwischen Contexts | Open Source |
| `react` + `typescript` | Popup + Overlay UI (bereits in Pathly) | Open Source |
| `tailwindcss` | Styling (identisch zu Pathly Dashboard) | Open Source |
| Pathly API | Job Import, User Data, Status Update | Intern |
| Supabase Auth | PKCE Token Flow für Extension-Auth | Free Tier ok |

---

## Architektur — Die 3 Contexts

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER                              │
│                                                         │
│  ┌──────────────────┐    ┌────────────────────────┐    │
│  │  CONTENT SCRIPT  │    │   POPUP (React App)    │    │
│  │  (läuft IN der   │    │   400×560px            │    │
│  │   Job-Seite)     │    │   - Auth Status        │    │
│  │                  │    │   - Job erkannt: Card  │    │
│  │  1. DOM parsen   │◄──►│   - "Add to Pathly"   │    │
│  │  2. Job erkennen │    │   - Recent Imports     │    │
│  │  3. Overlay      │    └──────────┬─────────────┘    │
│  │     rendern      │               │                   │
│  └────────┬─────────┘               │                   │
│           │                         │                   │
│           └──────────┬──────────────┘                   │
│                      ▼                                   │
│         ┌────────────────────────┐                      │
│         │  BACKGROUND SERVICE   │                      │
│         │  WORKER               │                      │
│         │  - Auth Token halten  │                      │
│         │  - API Calls          │                      │
│         │  - Status-Sync Cron   │                      │
│         └────────────┬──────────┘                      │
│                      │                                   │
└──────────────────────┼───────────────────────────────── ┘
                       │ HTTPS
                       ▼
              ┌─────────────────┐
              │   PATHLY API    │
              │  /api/jobs      │
              │  /api/user      │
              │  /api/auth/ext  │
              └─────────────────┘
```

---

## Die 3 Core Features

### Feature 1: 1-Klick Job Import (MVP)

User ist auf einer Job-Seite → Pathly erkennt es → 1 Klick → Job in Queue.

```
LinkedIn-Job öffnen
       ↓
Content Script erkennt Job-Daten (Titel, Firma, URL)
       ↓
Popup Badge zeigt: "Job erkannt"
       ↓
User klickt Extension-Icon
       ↓
Popup zeigt: "Senior PM · Enpal · Berlin — In Pathly speichern?"
       ↓
User klickt "Add to Pathly" (1 Klick)
       ↓
Background Worker → POST /api/jobs/import
       ↓
Firecrawl scrapt Job-Details (im Hintergrund)
       ↓
✅ Toast: "Job gespeichert! CV Match läuft..."
```

### Feature 2: On-Page Match Overlay (Phase 2)

Direkt auf der Job-Seite ein nicht-störendes Overlay: Match-Prozentsatz + fehlende Keywords, ohne Pathly zu öffnen.

```
┌─────────────────────────────────┐
│  🔵 Pathly                      │
│  CV Match: 74%                  │
│  ✅ Next.js  ✅ TypeScript       │
│  ⚠️  AWS fehlt  ⚠️ GraphQL fehlt│
│  [ In Queue speichern ]         │
└─────────────────────────────────┘
         (unten rechts, kollabierbar)
```

### Feature 3: Status Auto-Sync (Phase 3)

Wenn User auf Karriereseite auf "Bewerben" / "Apply" klickt → Extension erkennt es → Status in Pathly automatisch auf `applied` updaten (nach User-Bestätigung).

---

## Unterstützte Plattformen & DOM-Selektoren

### Platform Support Matrix

| Plattform | Marktanteil DE | Phase | Selector-Stabilität |
|---|---|---|---|
| LinkedIn Jobs | ~45% | 1 | 🟡 Mittel (ändert sich) |
| StepStone | ~20% | 1 | 🟢 Stabil |
| Indeed.de | ~12% | 1 | 🟢 Stabil |
| Xing | ~8% | 2 | 🟢 Stabil |
| Glassdoor | ~5% | 2 | 🟡 Mittel |
| Greenhouse/Lever | ~5% | 2 | 🟢 Sehr stabil |
| Generic Career Pages | ~5% | 3 | 🔴 Niedrig (URL-Heuristik) |

### DOM-Parser pro Plattform

```typescript
// lib/extension/parsers/index.ts

export interface ParsedJob {
  title: string
  company: string
  location: string | null
  url: string
  description: string | null
  platform: string
  raw_html?: string
}

// ── LinkedIn ─────────────────────────────────────────────
export function parseLinkedIn(doc: Document, url: string): ParsedJob | null {
  // LinkedIn ändert Selektoren regelmäßig → mehrere Fallbacks
  const title =
    doc.querySelector('h1.t-24')?.textContent?.trim() ||
    doc.querySelector('h1[class*="job-title"]')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim()

  const company =
    doc.querySelector('a.topcard__org-name-link')?.textContent?.trim() ||
    doc.querySelector('[class*="company-name"]')?.textContent?.trim()

  const location =
    doc.querySelector('span.topcard__flavor--bullet')?.textContent?.trim() ||
    doc.querySelector('[class*="job-insight"]')?.textContent?.trim()

  const description =
    doc.querySelector('#job-details')?.textContent?.trim() ||
    doc.querySelector('[class*="description"]')?.textContent?.trim()

  if (!title || !company) return null

  return { title, company, location: location || null, url, description: description || null, platform: 'linkedin' }
}

// ── StepStone ─────────────────────────────────────────────
export function parseStepStone(doc: Document, url: string): ParsedJob | null {
  const title = doc.querySelector('[data-at="job-title"]')?.textContent?.trim()
  const company = doc.querySelector('[data-at="job-company-name"]')?.textContent?.trim()
  const location = doc.querySelector('[data-at="job-location"]')?.textContent?.trim()
  const description = doc.querySelector('[data-at="job-description"]')?.textContent?.trim()

  if (!title || !company) return null
  return { title, company, location: location || null, url, description: description || null, platform: 'stepstone' }
}

// ── Indeed ────────────────────────────────────────────────
export function parseIndeed(doc: Document, url: string): ParsedJob | null {
  const title = doc.querySelector('h1[class*="jobTitle"]')?.textContent?.trim()
  const company = doc.querySelector('[data-company-name]')?.textContent?.trim() ||
    doc.querySelector('[class*="companyName"]')?.textContent?.trim()
  const location = doc.querySelector('[class*="companyLocation"]')?.textContent?.trim()
  const description = doc.querySelector('#jobDescriptionText')?.textContent?.trim()

  if (!title || !company) return null
  return { title, company, location: location || null, url, description: description || null, platform: 'indeed' }
}

// ── Xing ──────────────────────────────────────────────────
export function parseXing(doc: Document, url: string): ParsedJob | null {
  const title = doc.querySelector('[data-testid="job-title"]')?.textContent?.trim()
  const company = doc.querySelector('[data-testid="company-name"]')?.textContent?.trim()
  const location = doc.querySelector('[data-testid="job-location"]')?.textContent?.trim()

  if (!title || !company) return null
  return { title, company, location: location || null, url, description: null, platform: 'xing' }
}

// ── Router ────────────────────────────────────────────────
export function detectAndParse(url: string, doc: Document): ParsedJob | null {
  if (url.includes('linkedin.com/jobs')) return parseLinkedIn(doc, url)
  if (url.includes('stepstone.de')) return parseStepStone(doc, url)
  if (url.includes('indeed.com') || url.includes('indeed.de')) return parseIndeed(doc, url)
  if (url.includes('xing.com/jobs')) return parseXing(doc, url)
  if (url.includes('glassdoor.')) return parseGlassdoor(doc, url)
  if (url.includes('greenhouse.io') || url.includes('lever.co')) return parseATS(doc, url)
  return null // Unbekannte Plattform
}
```

---

## Manifest V3 Konfiguration

```json
// manifest.json (Plasmo generiert das automatisch aus package.json)
{
  "manifest_version": 3,
  "name": "Pathly — Job Copilot",
  "version": "1.0.0",
  "description": "1-Klick Job Import von LinkedIn, StepStone, Indeed & mehr direkt in deinen Pathly Workflow.",

  "permissions": [
    "storage",
    "activeTab"
  ],

  "host_permissions": [
    "https://www.linkedin.com/jobs/*",
    "https://www.stepstone.de/*",
    "https://de.indeed.com/*",
    "https://www.indeed.com/*",
    "https://www.xing.com/jobs/*",
    "https://www.glassdoor.de/*",
    "https://*.greenhouse.io/*",
    "https://*.lever.co/*",
    "https://pathly.app/*"
  ],

  "background": {
    "service_worker": "background.ts",
    "type": "module"
  },

  "action": {
    "default_popup": "popup.tsx",
    "default_icon": {
      "16": "assets/icon16.png",
      "48": "assets/icon48.png",
      "128": "assets/icon128.png"
    }
  },

  "content_scripts": [
    {
      "matches": [
        "https://www.linkedin.com/jobs/*",
        "https://www.stepstone.de/*",
        "https://de.indeed.com/*",
        "https://www.indeed.com/*",
        "https://www.xing.com/jobs/*"
      ],
      "js": ["content.ts"],
      "run_at": "document_idle"
    }
  ],

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

**Warum NUR `activeTab` und `storage`?**
Das sind die minimal-invasivsten Permissions. `activeTab` gewährt Zugriff auf den aktuellen Tab **nur wenn der User das Extension-Icon klickt** — kein permanenter Zugriff. Dies ist entscheidend für die Chrome Web Store Genehmigung und Nutzervertrauen.

---

## Auth Flow (Supabase PKCE für Extensions)

Das größte technische Problem bei Extensions: Wie bekommt die Extension den Supabase Auth-Token des eingeloggten Users, ohne unsicher zu sein?

**Gewählte Strategie: Extension-Native PKCE mit Tab-Callback**

```
User klickt "Mit Pathly verbinden" im Popup
       ↓
Background Worker öffnet:
https://pathly.app/auth/extension?pkce=true
       ↓
User ist bereits auf pathly.app eingeloggt
(oder loggt sich jetzt ein)
       ↓
Pathly schreibt Token in URL-Fragment:
https://pathly.app/auth/extension/callback#token=eyJ...
       ↓
Background Worker fängt Tab-URL-Änderung ab
       ↓
Token wird in chrome.storage.local gespeichert
(AES-256-verschlüsselt, niemals in chrome.storage.sync!)
       ↓
Tab schließt sich automatisch
       ↓
✅ Extension ist authentifiziert
```

```typescript
// background.ts
import { Storage } from '@plasmohq/storage'

const storage = new Storage({ area: 'local' })

// Auth Initiation
export async function initiateAuth() {
  const authUrl = 'https://pathly.app/auth/extension'
  const tab = await chrome.tabs.create({ url: authUrl })

  // Warte auf Callback
  chrome.tabs.onUpdated.addListener(async function listener(tabId, changeInfo, tab) {
    if (tabId !== tab.id) return
    if (!changeInfo.url?.includes('/auth/extension/callback')) return

    // Token aus URL-Fragment extrahieren
    const url = new URL(changeInfo.url)
    const token = url.hash.replace('#token=', '')

    if (token) {
      // Token sicher speichern (nur lokal, niemals sync!)
      await storage.set('pathly_auth_token', token)
      await storage.set('pathly_auth_expires', Date.now() + 3600 * 1000) // 1h

      // Tab schließen
      chrome.tabs.remove(tabId)
      chrome.tabs.onUpdated.removeListener(listener)
    }
  })
}

// Token Refresh (automatisch vor Ablauf)
export async function getValidToken(): Promise<string | null> {
  const token = await storage.get('pathly_auth_token')
  const expires = await storage.get('pathly_auth_expires')

  if (!token) return null

  // Refresh wenn < 5 Minuten verbleiben
  if (Date.now() > (expires as number) - 5 * 60 * 1000) {
    return await refreshToken(token as string)
  }

  return token as string
}
```

---

## Content Script

```typescript
// content.ts (läuft in der Job-Seite selbst)
import type { PlasmoCSConfig } from 'plasmo'
import { sendToBackground } from '@plasmohq/messaging'
import { detectAndParse } from './lib/extension/parsers'

export const config: PlasmoCSConfig = {
  matches: [
    'https://www.linkedin.com/jobs/*',
    'https://www.stepstone.de/*',
    'https://de.indeed.com/*',
    'https://www.indeed.com/*',
    'https://www.xing.com/jobs/*'
  ],
  run_at: 'document_idle'
}

// 1. Job auf aktueller Seite parsen
const parsedJob = detectAndParse(window.location.href, document)

if (parsedJob) {
  // 2. Background Worker informieren (für Popup Badge)
  sendToBackground({
    name: 'job-detected',
    body: parsedJob
  })

  // 3. Badge-Zahl auf Extension-Icon setzen
  chrome.action?.setBadgeText({ text: '1' })
  chrome.action?.setBadgeBackgroundColor({ color: '#2563EB' }) // Pathly Blau
}

// SPA-Navigation auf LinkedIn abfangen (React-Router)
let lastUrl = location.href
new MutationObserver(() => {
  const url = location.href
  if (url !== lastUrl) {
    lastUrl = url
    // Re-parse bei URL-Wechsel
    setTimeout(() => {
      const newJob = detectAndParse(url, document)
      if (newJob) {
        sendToBackground({ name: 'job-detected', body: newJob })
      } else {
        sendToBackground({ name: 'job-cleared', body: null })
      }
    }, 1500) // Warte auf DOM-Render
  }
}).observe(document, { subtree: true, childList: true })
```

---

## Popup UI

```tsx
// popup.tsx
import { useEffect, useState } from 'react'
import { Storage } from '@plasmohq/storage'
import { sendToBackground } from '@plasmohq/messaging'

const storage = new Storage({ area: 'local' })

type State = 'loading' | 'unauthenticated' | 'no-job' | 'job-detected' | 'importing' | 'imported'

export default function PathlyPopup() {
  const [state, setState] = useState<State>('loading')
  const [detectedJob, setDetectedJob] = useState<ParsedJob | null>(null)
  const [recentImports, setRecentImports] = useState<ParsedJob[]>([])

  useEffect(() => {
    async function init() {
      const token = await storage.get('pathly_auth_token')
      if (!token) return setState('unauthenticated')

      const job = await storage.get('current_detected_job')
      if (job) {
        setDetectedJob(job as ParsedJob)
        setState('job-detected')
      } else {
        setState('no-job')
      }

      const recent = await storage.get('recent_imports')
      if (recent) setRecentImports(recent as ParsedJob[])
    }
    init()
  }, [])

  const handleImport = async () => {
    if (!detectedJob) return
    setState('importing')

    const result = await sendToBackground({
      name: 'import-job',
      body: detectedJob
    })

    if (result.success) {
      setState('imported')
      // Recent Imports aktualisieren
      const newRecent = [detectedJob, ...recentImports].slice(0, 5)
      setRecentImports(newRecent)
      await storage.set('recent_imports', newRecent)
    } else {
      setState('job-detected') // Zurück zu Detected
    }
  }

  // ── Views ─────────────────────────────────────────────────

  if (state === 'loading') return <LoadingView />
  if (state === 'unauthenticated') return <AuthView />

  return (
    <div style={{ width: 380, padding: 16, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <img src="assets/icon48.png" width={24} />
        <span style={{ fontWeight: 700, color: '#1e293b' }}>Pathly</span>
        <span style={{ marginLeft: 'auto', color: '#22c55e', fontSize: 12 }}>● Verbunden</span>
      </div>

      {/* Job Detected State */}
      {state === 'job-detected' && detectedJob && (
        <div style={{ background: '#eff6ff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginBottom: 4 }}>JOB ERKANNT</p>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{detectedJob.title}</p>
          <p style={{ color: '#64748b', fontSize: 13 }}>{detectedJob.company} · {detectedJob.location}</p>
          <button
            onClick={handleImport}
            style={{
              marginTop: 12, width: '100%', padding: '10px 0',
              background: '#2563EB', color: 'white', border: 'none',
              borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14
            }}
          >
            + In Pathly Queue speichern
          </button>
        </div>
      )}

      {/* Importing State */}
      {state === 'importing' && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ color: '#64748b' }}>⏳ Wird importiert...</p>
        </div>
      )}

      {/* Success State */}
      {state === 'imported' && (
        <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: '#16a34a', fontWeight: 700 }}>✅ Gespeichert!</p>
          <p style={{ color: '#64748b', fontSize: 13 }}>CV Match wird im Hintergrund berechnet.</p>
          <a
            href="https://pathly.app/dashboard"
            target="_blank"
            style={{ display: 'block', marginTop: 8, color: '#2563EB', fontSize: 13 }}
          >
            In Pathly öffnen →
          </a>
        </div>
      )}

      {/* No Job State */}
      {state === 'no-job' && (
        <p style={{ color: '#94a3b8', fontSize: 13, padding: '8px 0' }}>
          Öffne eine Stellenanzeige auf LinkedIn, StepStone oder Indeed.
        </p>
      )}

      {/* Recent Imports */}
      {recentImports.length > 0 && (
        <div>
          <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>ZULETZT IMPORTIERT</p>
          {recentImports.slice(0, 3).map((job, i) => (
            <div key={i} style={{ padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{job.title}</p>
              <p style={{ fontSize: 12, color: '#94a3b8' }}>{job.company}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Background Service Worker

```typescript
// background.ts
import { onMessage } from '@plasmohq/messaging'
import { Storage } from '@plasmohq/storage'
import { getValidToken } from './lib/extension/auth'

const storage = new Storage({ area: 'local' })

// ── Message Handler: Job erkannt (vom Content Script) ─────
onMessage('job-detected', async (req) => {
  await storage.set('current_detected_job', req.body)
})

onMessage('job-cleared', async () => {
  await storage.remove('current_detected_job')
  await chrome.action.setBadgeText({ text: '' })
})

// ── Message Handler: Import (vom Popup) ───────────────────
onMessage('import-job', async (req) => {
  const job = req.body
  const token = await getValidToken()

  if (!token) {
    return { success: false, error: 'not_authenticated' }
  }

  try {
    const response = await fetch('https://pathly.app/api/jobs/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        platform: job.platform,
        source: 'extension'
        // Keine rohen DOM-Daten senden — nur strukturierte Felder!
        // raw_html wird NICHT mitgesendet (DSGVO-Minimierung)
      })
    })

    if (!response.ok) {
      const err = await response.json()
      return { success: false, error: err.message }
    }

    const data = await response.json()
    await storage.remove('current_detected_job')
    await chrome.action.setBadgeText({ text: '' })

    return { success: true, jobId: data.id }
  } catch (error) {
    return { success: false, error: 'network_error' }
  }
})

// ── Status Sync Alarm (Phase 3) ───────────────────────────
// Alle 4 Stunden: Offene Jobs gegen Pathly-Status abgleichen
chrome.alarms.create('status-sync', { periodInMinutes: 240 })
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'status-sync') return

  const token = await getValidToken()
  if (!token) return

  // Jobs holen die auf 'applied' stehen aber noch nicht bestätigt sind
  const response = await fetch('https://pathly.app/api/jobs?status=pending_sync', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  // ... Status-Sync Logik
})
```

---

## 🚨 Compliance & Legal Risk Register

Dies ist der kritischste Teil der Spec. Jedes Risiko ist mit einer konkreten technischen Lösung verknüpft.

### RISIKO 1: LinkedIn Terms of Service Verletzung
**Schweregrad:** 🔴 Hoch (zivilrechtlich)

**Problem:** LinkedIn's User Agreement §8.2 verbietet explizit: *"crawlers, browser plugins and add-ons [...] to scrape the Services."*

**Rechtliche Einschätzung:** Das Lesen des DOMs einer Seite, die der User bereits selbst öffnet und auf die er explizit klickt, fällt in eine rechtliche Grauzone. Das hiQ Labs v. LinkedIn-Urteil (9th Circuit, 2022) hat festgestellt, dass öffentlich zugängliche Daten nicht per se geschützt sind. ABER LinkedIn kann trotzdem zivilrechtlich nach ToS vorgehen.

**Lösung — 3 Schutzebenen:**
1. **Kein automatisches Scraping**: Die Extension scrapt niemals eigenständig. Sie liest ausschließlich, was der User bereits selbst auf dem Screen sieht — auf expliziten Klick.
2. **Kein Bulk-Zugriff**: Keine Iteration durch Listen, kein automatisches Öffnen von Job-Links. Nur die aktuell geöffnete URL.
3. **Rate Limiting in der Extension**: Maximal 1 Import alle 3 Sekunden im Code hart limitiert.
4. **Legal Disclaimer im Popup**: *"Pathly liest nur die aktuell von dir geöffnete Seite. Pathly scrapt LinkedIn nicht automatisch."*
5. **Kein LinkedIn-Trademark-Missbrauch**: Extension-Name ist "Pathly", nicht "Pathly for LinkedIn".

---

### RISIKO 2: Chrome Web Store Policy Ablehnung
**Schweregrad:** 🔴 Hoch (Launch-blockierend)

**Problem:** Google lehnt Extensions ab, die:
- Zu breite Permissions anfordern (`<all_urls>` statt spezifische Hosts)
- Remote Code ausführen (kein `eval()`, kein `innerHTML` mit externem Content)
- Keine klare Privacy Policy haben
- Daten sammeln ohne expliziten User-Consent

**Lösung:**
```json
// ✅ Richtig: Spezifische host_permissions
"host_permissions": [
  "https://www.linkedin.com/jobs/*",
  "https://www.stepstone.de/*"
  // Nur explizit benötigte Domains
]

// ❌ Falsch (wird abgelehnt):
"host_permissions": ["<all_urls>"]
```
- Pflicht: Eigene Privacy Policy URL in Store-Eintrag
- Pflicht: Klarer "Single Purpose"-Beschreibungstext
- Kein `eval()`, kein `Function()` — Plasmo MV3 erzwingt das bereits
- Manifest `content_security_policy` ist bereits restriktiv konfiguriert (siehe oben)

---

### RISIKO 3: DSGVO / GDPR Datenschutz
**Schweregrad:** 🟠 Mittel–Hoch (Bußgeldrisiko bis 4% Jahresumsatz)

**Problem:** Die Extension liest Inhalt auf fremden Websites (LinkedIn etc.) und sendet Daten an Pathly-Server. Dies ist eine Datenverarbeitung im Sinne der DSGVO.

**Lösung — Privacy by Design für die Extension:**

| Datenpunkt | Was wir tun | Was wir NICHT tun |
|---|---|---|
| Job-Titel, Firma, URL | Senden an Pathly API | raw HTML senden |
| Auth Token | `chrome.storage.local` (on-device) | `chrome.storage.sync` (Cloud) |
| Browsing-History | Niemals speichern | Keine URL-Logs |
| Andere User-Profile | Niemals lesen | Keine Profil-Daten |
| Import-History | Nur `storage.local` | Kein Server-Tracking |

**Pflicht-Additions zur Pathly Privacy Policy:**
```
Abschnitt: Browser Extension
"Die Pathly Browser Extension liest ausschließlich strukturierte Daten
(Jobtitel, Unternehmensname, Standort, URL) von Stellenanzeigen, die
der Nutzer aktiv und bewusst geöffnet hat. Die Extension erfasst keine
Browserverlaufs-Daten, keine Daten von nicht-Job-Seiten und keine
personenbezogenen Daten Dritter. Authentifizierungs-Tokens werden
auschließlich lokal auf dem Gerät des Nutzers gespeichert und niemals
mit Drittanbieter-Diensten geteilt."
```

---

### RISIKO 4: Supabase Token in Extension Storage
**Schweregrad:** 🟠 Mittel

**Problem:** `chrome.storage.local` ist verschlüsselt, aber andere Extensions mit `storage`-Permission können theoretisch darauf zugreifen (sehr unwahrscheinlich, aber möglich).

**Lösung:**
- Token-Lebensdauer auf **1 Stunde** begrenzen (nicht die Standard-1-Woche von Supabase)
- Supabase auf der Server-Seite eine dedizierte `extension_session`-Rolle mit minimalen Scopes vergeben
- Token bei Logout aus `storage.local` explizit löschen: `storage.remove('pathly_auth_token')`
- **Niemals** den Supabase `service_role` Key in die Extension packen — ausschließlich User-JWT

---

### RISIKO 5: Auto-Fill Feature (Phase 3) — Rechtliches Risiko
**Schweregrad:** 🟠 Mittel

**Problem:** Das automatische Ausfüllen von Bewerbungsformularen auf Karriereseiten:
- Könnte als "automatisierte Bewerbung" gewertet werden (AGB-Verletzung bei manchen Plattformen)
- Daten könnten in falsche Felder gefüllt werden → Reputationsschaden für User
- Accessibility-Probleme bei nicht-standardisierten Formularen

**Lösung:**
- **Kein Auto-Submit unter keinen Umständen** — nur Auto-Fill
- Jedes ausgefüllte Feld muss der User sehen und bestätigen (Review-Screen)
- Explizite User-Aktion für jeden Form-Submit
- Feature klar labeln als "Form-Vorausfüllen" nicht "Automatische Bewerbung"
- Legal Disclaimer: *"Pathly füllt Felder vor. Du entscheidest, ob und was du absendest."*

---

### RISIKO 6: Plattform-Seitige Erkennung & Sperrung
**Schweregrad:** 🟡 Niedrig–Mittel

**Problem:** LinkedIn und andere Plattformen können Extensions erkennen und blockieren (z.B. durch `window.chrome`-Erkennung oder DOM-Mutation-Observer).

**Lösung:**
- Content Script ist **passiv** — es liest nur, es schreibt nichts in die LinkedIn-DOM
- Kein `fetch()` von LinkedIn-Seiten aus dem Content Script (kein zusätzlicher HTTP-Traffic)
- Kein Injizieren von sichtbaren DOM-Elementen IN die LinkedIn-Seite
- Das Overlay (Phase 2) wird als **Shadow DOM** gerendert, nicht direkt in den LinkedIn-DOM

```typescript
// ✅ Shadow DOM für Overlay — isoliert von Host-Seite
const host = document.createElement('div')
const shadow = host.attachShadow({ mode: 'closed' }) // 'closed' = nicht inspizierbar
document.body.appendChild(host)
// React in Shadow DOM rendern
const root = createRoot(shadow)
root.render(<MatchOverlay job={parsedJob} />)
```

---

### RISIKO 7: Minderjährigen-Schutz & Sensitive Data
**Schweregrad:** 🟡 Niedrig

**Problem:** Job-Beschreibungen können Gehaltsangaben, sensible Anforderungen (Behinderung, Gesundheit) enthalten. Diese Daten sollten nicht ungefiltert gespeichert werden.

**Lösung:**
- Job-Beschreibung (`description`) wird auf **max. 5.000 Zeichen** gekürzt vor dem API-Call
- Auf der API-Seite: Kein Speichern von `raw_html` — nur strukturierte Felder
- Die `description` wird nicht für Pathly-seitige Analytics verwendet, nur für CV-Match

---

## API-Endpunkt (Pathly Backend)

```typescript
// app/api/jobs/import/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })

  // Auth prüfen
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Input Validation
  const { url, title, company, location, platform, source } = body

  if (!url || !title || !company) {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
  }

  // URL muss eine gültige Job-URL sein
  const allowedDomains = ['linkedin.com', 'stepstone.de', 'indeed.com', 'xing.com', 'greenhouse.io', 'lever.co', 'glassdoor.']
  const isAllowedDomain = allowedDomains.some(d => url.includes(d))
  if (!isAllowedDomain) {
    return NextResponse.json({ error: 'unsupported_platform' }, { status: 400 })
  }

  // Duplikat-Check: Wurde diese URL bereits importiert?
  const { data: existing } = await supabase
    .from('jobs')
    .select('id')
    .eq('user_id', user.id)
    .eq('url', url)
    .single()

  if (existing) {
    return NextResponse.json({ success: true, id: existing.id, duplicate: true }, { status: 200 })
  }

  // Job in DB speichern
  const { data: job, error: insertError } = await supabase
    .from('jobs')
    .insert({
      user_id: user.id,
      url,
      title,
      company,
      location,
      platform,
      source: source || 'extension',
      status: 'new',
      match_score: null // wird async berechnet
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Firecrawl-Job async triggern (CV Match berechnen)
  // (Non-blocking: Response sofort zurückgeben)
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/${job.id}/analyze`, {
    method: 'POST',
    headers: { 'Authorization': req.headers.get('Authorization')! }
  }).catch(console.error) // Fire and forget

  return NextResponse.json({ success: true, id: job.id }, { status: 201 })
}
```

---

## Edge Cases

| Szenario | Lösung |
|---|---|---|
| User nicht eingeloggt in Pathly | Popup zeigt Auth-Screen statt Job-Card |
| Selbe URL zweimal importieren | API gibt `duplicate: true` zurück, Toast: "Bereits in Queue" |
| LinkedIn ändert DOM-Selektoren | Mehrere Fallback-Selektoren + automatischer Error-Report an Pathly |
| User klickt Extension auf Nicht-Job-Seite | Popup zeigt "Öffne eine Stellenanzeige" |
| Token abgelaufen während Import | Auto-Refresh → Retry → falls fails: Re-Auth-Prompt |
| Netzwerk offline | Popup zeigt Offline-Indicator, Import in lokalem Queue puffern |
| Job-Seite hat kein erkennbares Schema | `detectAndParse` gibt `null` → Popup zeigt manuelle Input-Felder |
| LinkedIn SPA navigiert (React Router) | MutationObserver fängt URL-Änderung ab, re-parst nach 1.5s |
| Extension auf Mobile (Android Chrome) | Extensions sind auf Android nicht unterstützt — aus Store-Beschreibung excluden |
| User deinstalliert Extension | `chrome.runtime.onSuspend` löscht alle lokalen Auth-Tokens |

---

## Error Handling

```typescript
// lib/extension/errors.ts

export enum ExtensionError {
  NOT_AUTHENTICATED = 'not_authenticated',
  PARSE_FAILED = 'parse_failed',
  IMPORT_FAILED = 'import_failed',
  NETWORK_ERROR = 'network_error',
  DUPLICATE = 'duplicate',
  UNSUPPORTED_PLATFORM = 'unsupported_platform'
}

export const ERROR_MESSAGES: Record<ExtensionError, string> = {
  [ExtensionError.NOT_AUTHENTICATED]: 'Bitte mit Pathly verbinden.',
  [ExtensionError.PARSE_FAILED]: 'Job konnte nicht erkannt werden. Plattform ggf. nicht unterstützt.',
  [ExtensionError.IMPORT_FAILED]: 'Import fehlgeschlagen. Bitte erneut versuchen.',
  [ExtensionError.NETWORK_ERROR]: 'Keine Verbindung zu Pathly. Bitte Internetverbindung prüfen.',
  [ExtensionError.DUPLICATE]: 'Job bereits in deiner Queue.',
  [ExtensionError.UNSUPPORTED_PLATFORM]: 'Diese Plattform wird noch nicht unterstützt.'
}
```

---

## Testing Protocol

### Phase 1: Unit Tests
```typescript
// tests/extension/parsers.test.ts
describe('LinkedIn Parser', () => {
  it('parst Jobtitel korrekt', () => {
    const html = '<h1 class="t-24">Senior Product Manager</h1>...'
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const result = parseLinkedIn(doc, 'https://linkedin.com/jobs/view/123')
    expect(result?.title).toBe('Senior Product Manager')
  })

  it('gibt null zurück wenn kein Titel gefunden', () => {
    const doc = new DOMParser().parseFromString('<html></html>', 'text/html')
    expect(parseLinkedIn(doc, 'https://linkedin.com/jobs/view/123')).toBeNull()
  })
})
```

### Phase 2: Manuelle Smoke Tests (vor Store-Submission)
```
✅ LinkedIn Job öffnen → Job im Popup erkannt
✅ StepStone Job öffnen → Job im Popup erkannt
✅ Indeed Job öffnen → Job im Popup erkannt
✅ Import-Button klicken → Job in Pathly Queue
✅ Selben Job nochmals importieren → "Bereits in Queue" Toast
✅ Nicht-Job-Seite öffnen → Popup zeigt Neutral-State
✅ Ohne Auth → Popup zeigt Auth-Screen
✅ LinkedIn SPA-Navigation (Job wechseln ohne Seite neu laden) → Popup updated
✅ Token abgelaufen → Auto-Refresh funktioniert
✅ Offline → Popup zeigt Offline-Indicator
```

### Phase 3: Chrome Web Store Pre-Submit Checklist
```
✅ Manifest V3 (kein MV2)
✅ Keine broad host_permissions (<all_urls>)
✅ Keine Remote Code Execution
✅ Privacy Policy URL vorhanden
✅ Screenshots für Store (1280×800 oder 640×400)
✅ Extension-Icon in 16, 48, 128px
✅ Single Purpose Beschreibung (< 132 Zeichen)
✅ Kein irreführender Name (kein "LinkedIn Extension" o.ä.)
✅ Datenschutz-Formular in Google Developer Console ausgefüllt
✅ Begründung für jede Permission angegeben
```

---

## Projektstruktur

```
extension/                    ← Root des Extension-Projekts
├── manifest.json             ← Plasmo generiert auto aus package.json
├── package.json
├── popup.tsx                 ← Popup UI (React)
├── content.ts                ← Content Script (läuft in Job-Seiten)
├── background.ts             ← Service Worker
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── lib/
    ├── parsers/
    │   ├── index.ts           ← Router + alle Parser
    │   ├── linkedin.ts
    │   ├── stepstone.ts
    │   ├── indeed.ts
    │   └── xing.ts
    ├── auth.ts                ← PKCE Flow + Token Management
    └── errors.ts              ← Error Enums + Messages
```

---

## Release Roadmap

| Phase | Features | Aufwand | Ziel |
|---|---|---|---|
| **MVP** | Job Import (LinkedIn, StepStone, Indeed) | ~1 Woche | Chrome Web Store Launch |
| **Phase 2** | On-Page Match Overlay, Xing + Glassdoor | ~3–4 Tage | Retention steigern |
| **Phase 3** | Status Auto-Sync, Auto-Fill (Preview) | ~1 Woche | Premium-Feature |
| **Phase 4** | Firefox + Safari Port | ~2 Wochen | Marktanteil maximieren |

---

## Outputs (Deliverables)

- ✅ Prodution-bereite Chrome Extension (MV3, Plasmo)
- ✅ Chrome Web Store Eintrag (geclearter Compliance-Status)
- ✅ Edge Add-on Store Eintrag (selbe Codebase, 0h Mehraufwand)
- ✅ Backend API Route `/api/jobs/import` mit Duplikat-Schutz
- ✅ Test-Suite (Unit + Smoke Tests)
- ✅ Datenschutzerklärung-Abschnitt für Extension

---

## Master Prompt Template Compliance

### ✅ Alle Pflicht-Sektionen enthalten:
1. **Goal**: Eine klare Sentence ✅
2. **Strategische Entscheidung**: Framework-Wahl mit Begründung ✅
3. **Inputs**: Vollständige Tabelle ✅
4. **Tools/Dependencies**: Mit Kosten-Angabe ✅
5. **Architektur**: ASCII-Diagramm + Erklärung ✅
6. **Process**: Schrittweise mit vollständigem Code ✅
7. **🚨 Compliance & Legal Risks**: 7 Risiken, alle mit Lösung ✅
8. **Edge Cases**: 10 Szenarien ✅
9. **Error Handling**: Typed Errors + User-facing Messages ✅
10. **Testing Protocol**: Unit + Smoke + Store Checklist ✅
11. **Outputs**: Deliverables klar definiert ✅

**Ready for Development. 🚀**
