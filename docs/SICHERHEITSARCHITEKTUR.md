---
Version: 1.0.0
Last Updated: 2026-02-26
Status: ACTIVE — PFLICHTLEKTÜRE für ALLE Agenten
---

# 🔐 SICHERHEITSARCHITEKTUR — Pathly V2.0

> **GOLDEN RULE:** "Kein User-Datenverlust. Kein Onboarding-Loop. Kein CV-Fehler. Keine falschen Success-Responses."
> Jeder Agent MUSS dieses Dokument vollständig gelesen haben, bevor er Code schreibt.

**Zweck dieses Dokuments:**
- Definiert verbindliche Contracts für kritische Systemteile
- Verhindert die 12 bekannten Produktionsfehler (Onboarding-Loop, Datenverlust, CV-not-found, etc.)
- Stellt sicher, dass Onboarding + Settings + Job Queue + Cover Letter als kohärentes System funktionieren
- Etabliert Double-Assurance: Kein API-Call darf `success: true` zurückgeben, ohne dass DB-Wahrheit verifiziert wurde

---

## 1. ONBOARDING SAFETY CONTRACT

### Invarianten (dürfen NIE verletzt werden):
- `router.push('/dashboard')` darf **ausschließlich** nach verifiziertem `{ success: true }` von `/api/onboarding/complete` aufgerufen werden
- Die API-Route `/api/onboarding/complete` MUSS nach dem `upsert` einen **Read-Back** machen (select → validieren), bevor sie `success: true` sendet
- Das Onboarding MUSS beim Mount prüfen: `onboarding_completed === true`? → Sofort `router.replace('/dashboard')` (kein Loop möglich)
- Confetti darf NUR beim allerersten Mount ohne Onboarding-Flag feuern (kein `step`-Dependency)
- Wenn der API-Call fehlschlägt: UI bleibt auf Step 6, zeigt Fehler, ermöglicht erneutes Versuchen — **kein Redirect**

### Double-Assurance Muster (PFLICHT für onboarding/complete):
```typescript
// ✅ KORREKT — Write → Read-Back → Validate → Success
const { error: upsertError } = await supabaseAdmin
  .from('user_settings')
  .upsert({ user_id: user.id, onboarding_completed: true, ... }, { onConflict: 'user_id' });

if (upsertError) {
  return NextResponse.json({ error: upsertError.message }, { status: 500 });
}

// READ-BACK: Verifikation, dass das Flag wirklich gesetzt ist
const { data: verify } = await supabaseAdmin
  .from('user_settings')
  .select('onboarding_completed')
  .eq('user_id', user.id)
  .single();

if (!verify?.onboarding_completed) {
  console.error('❌ [onboarding/complete] Read-back failed — flag not set');
  return NextResponse.json({ error: 'Verification failed', success: false }, { status: 500 });
}

return NextResponse.json({ success: true }); // Nur hier
```

### Frontend Muster (PFLICHT für onboarding/page.tsx):
```typescript
// ✅ KORREKT
const handleComplete = async () => {
  if (!allConsentsGiven || completing) return;
  setCompleting(true);
  try {
    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 6 }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
      setCompleting(false);
      return; // ← KEIN router.push bei Fehler
    }
    router.push('/dashboard'); // Nur bei verifiziertem success: true
  } catch (err) {
    console.error('❌ [Onboarding] Fatal:', err);
    setError('Netzwerkfehler. Bitte versuche es erneut.');
    setCompleting(false);
  }
};
```

### Mount-Guard (PFLICHT für onboarding/page.tsx):
```typescript
// Beim allerersten Render: prüfe ob bereits completed
useEffect(() => {
  const checkStatus = async () => {
    const res = await fetch('/api/onboarding/status');
    const data = await res.json();
    if (data.completed) router.replace('/dashboard');
  };
  checkStatus();
}, []); // Keine Dependencies — nur einmal beim Mount
```

Erstelle `/api/onboarding/status/route.ts`:
- Auth check → select `onboarding_completed` from `user_settings` where `user_id`
- Gibt `{ completed: boolean }` zurück

---

## 2. DOCUMENT STORAGE SAFETY CONTRACT

### Pflichtfelder bei jedem Dokument-Insert (KEIN Insert ohne diese Felder):
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `user_id` | UUID NOT NULL | Immer gesetzt, nie null |
| `document_type` | `'cv'` &#124; `'cover_letter'` | Exakter String — keine Abweichungen |
| `original_filename` | TEXT | Echter Name wie hochgeladen ("Exxeta Anschreiben.pdf") |
| `storage_path` | TEXT | `{user_id}/{document_type}/{uuid}.pdf` |
| `created_at` | TIMESTAMP | ISO String |

### Single Source of Truth: EIN Upload-Service für alles
- Onboarding-Upload (`/api/documents/upload`) und Settings-Upload nutzen **identisch dieselbe Route und denselben Service**
- KEIN doppelter Upload-Code an zwei Stellen
- Der Onboarding-Flow ruft `/api/documents/upload` auf — genau wie Settings
- Dies stellt sicher: Was im Onboarding hochgeladen wird, erscheint automatisch in Settings

### CV-Lookup (VERBINDLICHE Query-Struktur):
```typescript
// ✅ IMMER SO — niemals abweichen
const { data: cvDoc } = await supabase
  .from('documents')
  .select('*')
  .eq('user_id', userId)
  .eq('document_type', 'cv')          // Exakter String 'cv'
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (!cvDoc) {
  console.error('❌ CV_SAFETY: CV not found for user:', userId);
  return NextResponse.json({
    error: 'CV nicht gefunden. Bitte lade deinen Lebenslauf in den Settings hoch.',
    code: 'CV_NOT_FOUND'
  }, { status: 404 });
}
```

### Upload-Validierung (PFLICHT vor jedem Insert):
```typescript
if (!userId) throw new Error('CV_SAFETY: user_id missing');
if (!['cv', 'cover_letter'].includes(documentType)) {
  throw new Error(`CV_SAFETY: Invalid document_type: ${documentType}`);
}
if (!originalFilename) throw new Error('CV_SAFETY: original_filename missing');
```

### Double-Assurance für Upload:
```typescript
// 1) Storage Upload
const { data: storageData, error: storageError } = await supabase.storage
  .from('documents')
  .upload(storagePath, fileBuffer, { contentType: 'application/pdf' });

if (storageError) throw storageError;

// 2) DB Insert
const { data: doc, error: dbError } = await supabase
  .from('documents')
  .insert({ user_id, document_type, original_filename, storage_path: storagePath, created_at: new Date().toISOString() })
  .select()
  .single();

if (dbError) {
  // Rollback: Storage löschen wenn DB fehlschlägt
  await supabase.storage.from('documents').remove([storagePath]);
  throw dbError;
}

// 3) Read-Back Verifikation
const { data: verify } = await supabase
  .from('documents')
  .select('id, document_type')
  .eq('id', doc.id)
  .single();

if (!verify) throw new Error('CV_SAFETY: Upload verification failed — document not found after insert');
```

---

## 3. SESSION & DATA PERSISTENCE CONTRACT

### Invariante: ALLE User-Daten-Queries sind user-scoped
- Jede Abfrage/Mutation auf folgende Tabellen **braucht zwingend** `.eq('user_id', userId)`:
  - `job_queue`, `documents`, `application_history`, `generation_logs`, `company_research`
  - `user_settings`, `user_values`, `saved_job_searches`
  - `tasks`, `pomodoro_sessions`, `mood_checkins`, `daily_energy`, `daily_briefings`
  - `coaching_sessions`, `job_certificates`, `validation_logs`
  - `community_posts`, `community_comments`, `community_upvotes` (user_id für Write)
  - `volunteering_bookmarks`, `volunteering_votes` (user_id für Write)\n  - `video_approaches`, `video_scripts` (user_id für Write)\n  - `script_block_templates` (user_id für Write, NULL für system read)
- RLS MUSS für alle diese Tabellen aktiviert sein (✅ geprüft am 2026-03-09)
- Service Role Key: NUR serverseitig, nie im Frontend

### Korrekte Query-Signatur (Beispiel Job Queue):
```typescript
// ✅ KORREKT — immer user-scoped
const { data: jobs } = await supabase
  .from('job_queue')
  .select('*')
  .eq('user_id', user.id)           // ← PFLICHT
  .order('created_at', { ascending: false });

// ❌ FALSCH — fehlt user_id Filter
const { data: jobs } = await supabase.from('job_queue').select('*');
```

### Re-Login Persistenz:
- Job Queue, Analytics, Application History, Dokumente sind alle dauerhaft in Supabase gespeichert
- Sie verschwinden nach Re-Login NUR wenn der user_id-Filter fehlt oder Session nicht korrekt ausgelesen wird
- Immer `supabase.auth.getUser()` serverseitig nutzen, NICHT `getSession()` für Auth-Checks

---

## 4. NOTIFICATION DEDUPLICATION CONTRACT

### Invariante: Maximal 1 Notification pro Event
- Jede Toast-Notification hat einen `dedup_key` in der Form `${type}:${jobId}`
- Gleiche Kombination aus type + jobId darf innerhalb von 5 Sekunden **nicht** zweimal erscheinen

### Implementierungsmuster:
```typescript
const activeToasts = new Set<string>();

export function showSafeToast(message: string, dedupKey: string, type?: 'success' | 'error' | 'info') {
  if (activeToasts.has(dedupKey)) return; // ← Dedupliziert
  activeToasts.add(dedupKey);
  toast[type ?? 'success'](message);
  setTimeout(() => activeToasts.delete(dedupKey), 5000);
}

// Aufruf:
showSafeToast('Job zur Queue hinzugefügt ✅', `job_added:${jobId}`);
showSafeToast('Steckbrief bestätigt ✅', `steckbrief_confirmed:${jobId}`);
```

---

## 5. CHECK-IN MODAL CONTRACT

### Invariante: Einmal pro Login-Session
- Check-in darf NICHT bei jedem Page-Reload erscheinen
- Erscheint nur beim ersten Dashboard-Aufruf nach einem frischen Login
- Wird in `sessionStorage` getracked (nicht localStorage, damit es nach Browser-Close resettet)

### Implementierungsmuster:
```typescript
const CHECKIN_KEY = `pathly_checkin_${userId}_${new Date().toDateString()}`;

useEffect(() => {
  if (!userId) return;
  const alreadyShown = sessionStorage.getItem(CHECKIN_KEY);
  if (!alreadyShown) {
    // Prüfe ob frischer Login (last_sign_in_at ist < 60 Sekunden alt)
    const lastSignIn = new Date(session.user.last_sign_in_at ?? 0);
    const isRecentLogin = Date.now() - lastSignIn.getTime() < 60_000;
    if (isRecentLogin) {
      setShowCheckin(true);
      sessionStorage.setItem(CHECKIN_KEY, 'true');
    }
  }
}, [userId]);
```

---

## 6. UPLOAD PERFORMANCE CONTRACT

### Invariante: Upload ist zweigeteilt — schnell + asynchron
- **Phase 1 (synchron, < 3s):** Datei → Supabase Storage + DB-Insert (Metadaten)
- **Phase 2 (asynchron):** Inngest Event `'documents/process'` für Text-Extraktion / AI-Analyse
- Frontend zeigt immer einen Fortschrittsbalken

### Upload Progress (XMLHttpRequest statt fetch für echten Progress):
```typescript
const uploadWithProgress = (formData: FormData, onProgress: (pct: number) => void) => {
  return new Promise<{ success: boolean }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 80); // 0-80% für Upload
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      onProgress(100);
      resolve({ success: xhr.status >= 200 && xhr.status < 300 });
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.open('POST', '/api/documents/upload');
    xhr.send(formData);
  });
};
```

### Status-Texte für UI:
- 0–30%: "Datei wird hochgeladen..."
- 30–80%: "Wird gespeichert..."
- 80–100%: "Fertig ✅ — Analyse läuft im Hintergrund"

---

## 7. COVER LETTER DOUBLE-ASSURANCE CONTRACT

### Invariante: Cover Letter Generierung ist doppelt gesichert
- **Schritt 1:** Generierung via Claude (generate text)
- **Schritt 2:** Text nicht leer + Mindestlänge (> 200 Zeichen) + keine Placeholder (`{{`, `}}`)
- **Schritt 3:** Speichern in `documents` Tabelle (document_type: 'cover_letter') + Supabase Storage (PDF optional)
- **Schritt 4:** Read-Back: Document existiert, gehört dem User, Inhalt nicht leer
- **Schritt 5:** NUR dann `job_queue.status` auf `cover_letter_done` / `ready_for_review` setzen
- Bei jedem Fehlschlag in Schritt 2-4: Status bleibt `processing`, User bekommt klare Fehlermeldung

### Validation nach Generierung:
```typescript
function validateCoverLetterContent(text: string): { valid: boolean; reason?: string } {
  if (!text || text.length < 200) return { valid: false, reason: 'Text zu kurz' };
  if (text.includes('{{') || text.includes('}}')) return { valid: false, reason: 'Unresolved placeholders' };
  if (text.toLowerCase().includes('hiermit bewerbe ich mich')) return { valid: false, reason: 'Verbotene Clichés' };
  return { valid: true };
}
```

---

## 8. API SECURITY CONTRACT

### Invariante: Alle User-Routen haben Auth Guard
- JEDE API-Route die User-Daten liest oder schreibt braucht:
```typescript
const supabase = await createClient(); // @/lib/supabase/server
const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```
- Admin-Routen (`/api/admin/*`) brauchen zusätzlich Admin-Role-Check
- Service Role Key darf NIEMALS im Frontend erscheinen
- Error-Responses dürfen KEINE internen Stack Traces oder DB-Details leaken

---

## 9. STEPPER / STATUS MAPPING CONTRACT

### Kanonisches Status → Progress-Mapping (verbindlich):
| DB Status | Stepper % | Tab aktiv |
|-----------|-----------|-----------|
| `pending` | 0% | Steckbrief |
| `processing` | 10% | Steckbrief |
| `steckbrief_confirmed` | 30% | CV Match |
| `cv_match_done` | 30% | CV Match |
| `cv_matched` | 30% | CV Match |
| `cv_optimized` | 60% | CV Opt. |
| `cover_letter_done` | 100% | Cover Letter |
| `ready_for_review` | 100% | Cover Letter |
| `ready_to_apply` | 100% | Cover Letter |
| `submitted` | 100% | — (Beworben) |
| `rejected` | 100% | — (Abgelehnt) |
| `archived` | 100% | — (Archiviert) |

---

## 10. LINK VALIDATION CONTRACT (Company Research)

### Invariante: Nur valide URLs werden im Frontend angezeigt
Nach jeder Perplexity Company Research Antwort:
```typescript
async function validateUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok; // Status 200-299
  } catch {
    return false;
  }
}

// Alle URLs parallel validieren
const validatedItems = await Promise.all(
  researchItems.map(async (item) => ({
    ...item,
    url_valid: item.source_url ? await validateUrl(item.source_url) : false,
  }))
);

// Nur valide URLs weitergeben
const safeItems = validatedItems.filter(item => item.url_valid);
```

---

## 11. QUOTE QUALITY CONTRACT (Company Research)

### Invariante: Quotes müssen zum Unternehmenskontext passen
Zitate werden per **Claude One-Shot** (1 API-Call) generiert. Claude wählt Vordenker + Zitate
basierend auf Unternehmenswerten, Vision und Branche. Kein Perplexity-Verify mehr nötig.

**Pipeline (2 Stages):**
1. **Claude Sonnet 4.5** → 3 Vordenker + Zitat + Kontext-Brücke + Konfidenz-Score
2. **Regelcheck** → min. 8 Wörter, max. 30 Wörter, kein Anonymous, kein Spam, confidence: 'high'

**Sprachsteuerung:** Frontend sendet `language: 'de' | 'en'`. Claude generiert Zitate in der
passenden Sprache. Bei `'de'` werden ä/ö/ü korrekt verwendet.

**Anti-Halluzination:**
- Claude gibt `confidence: 'low'` zurück bei Unsicherheit → Zitat wird verworfen
- Zitate < 5 Wörter innerhalb Anführungszeichen werden verworfen
- Verbotene Autoren: Elon Musk, Jeff Bezos, Mark Zuckerberg (zu polarisierend)

**Fehlerverhalten:** Bei Claude-API-Fehler → leere Liste → Frontend zeigt `quoteError`.

---

## 12. TESTING GATES (Pflicht vor jedem Commit)

### Gate A: Onboarding Loop (KRITISCH)
- [ ] Schritt 6 → "Loslegen" → landet auf /dashboard (kein Rücksprung)
- [ ] /dashboard neu laden → bleibt auf /dashboard
- [ ] /onboarding direkt aufrufen wenn completed → redirect zu /dashboard

### Gate B: Persistenz nach Re-Login
- [ ] Job in Queue anlegen → Logout → Login → Job Queue zeigt Job
- [ ] CV in Settings hochladen → Logout → Login → CV noch vorhanden
- [ ] Application History → Logout → Login → History unverändert

### Gate C: CV Safety
- [ ] CV hochladen → CV Match starten → KEIN "CV not found" Fehler
- [ ] Settings zeigt originalen Dateinamen (nicht gehashten Storage-Pfad)

### Gate D: TypeScript
- [ ] `npx tsc --noEmit` passes (kein neuer TypeScript-Fehler)

### Gate E: Notifications
- [ ] Job hinzufügen → genau 1 Notification, nicht mehrere

### Gate F: Check-in
- [ ] Nach Login → Check-in erscheint (wenn <60s nach Login)
- [ ] Dashboard neu laden → Check-in erscheint NICHT nochmal

---

## 13. VERBOTENE ANTI-PATTERNS

Diese Patterns dürfen NIEMALS verwendet werden:

```typescript
// ❌ VERBOTEN: router.push ohne success-Verifikation
await fetch('/api/onboarding/complete', { method: 'POST', ... });
router.push('/dashboard'); // Kann trotz Fehler ausgeführt werden

// ❌ VERBOTEN: success:true ohne Read-Back
await supabase.from('user_settings').upsert({...});
return NextResponse.json({ success: true }); // Was wenn upsert still failed?

// ❌ VERBOTEN: Document Insert ohne user_id
await supabase.from('documents').insert({ document_type: 'cv', ... }); // Fehlendes user_id!

// ❌ VERBOTEN: Ungescreente toast() Aufrufe
toast('Job hinzugefügt'); // Kann mehrfach für dasselbe Event aufgerufen werden

// ❌ VERBOTEN: query ohne user_id Filter
const { data } = await supabase.from('job_queue').select('*'); // Gibt ALLE User-Daten zurück!

// ❌ VERBOTEN: Cover Letter Status setzen ohne Content-Validation
await supabase.from('job_queue').update({ status: 'cover_letter_done' })...; // Ohne zu prüfen ob CL wirklich gut ist
```

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

**Batch 1 (Onboarding + Persistenz + CV)** läuft ALLEIN — kein anderer Agent parallel, da middleware.ts, onboarding/page.tsx und documents/upload kritische shared Dateien sind.

**Batch 2 (Check-in + Notifications + Upload-Speed)** kann erst nach vollständigem Abschluss und Verifikation von Batch 1 starten.

**Batch 3 (PDF Download + Stepper + CV-Format + Links + Quotes)** kann erst nach Batch 2 starten.

---

## 12. JOB SEARCH — UI STATE CONTRACT

### §12.1 Hinzufügen-Button Persistenz
Wenn ein User einen Job über "Hinzufügen" zur Queue hinzufügt, MUSS der Button-Zustand **im Parent-State** (`already_in_queue: true`) persistiert werden — **nicht nur** im lokalen Component-State.

**Warum:** Lokaler State geht bei Accordion-Collapse/Expand verloren. Der User könnte denselben Job erneut scrapen und unnötig API-Credits verbrauchen.

**Implementierung:**
- `AddToQueueButton` ruft `onJobAdded(apply_link)` nach erfolgreichem Add
- Der Parent (`SearchAccordion` → Root-Level `setSavedSearches`) setzt `already_in_queue: true` im `EnrichedJob`
- `AddToQueueButton` initialisiert `added` von `job.already_in_queue` (nicht `false`)

### §12.2 View Mode Toggle Positionierung
Der Liste/Swipe-Toggle wird **links-bündig** angezeigt (unter dem Suchbegriff), nicht rechts.

### §12.3 Job Verification Guard
Vor dem DB-Insert in `process/route.ts` MÜSSEN zwei Prüfungen bestehen:

1. **Expired Detection:** `deepScrapeJob` prüft gescrapten Content auf Expired-Phrasen (z.B. "this job has expired", "stelle ist nicht mehr verfügbar") BEVOR der 200-Char-Threshold greift. Bei Fund → Sentinel `'__EXPIRED__'` zurückgeben.

2. **Company Mismatch:** Nach dem Harvester: `serpApiJob.company_name` vs. `harvested.company_name` per einfachem `includes()` (kein Levenshtein). Wenn keiner den anderen enthält → Mismatch.

**Response-Kontrakt:** HTTP 200 mit `{ success: false, reason: 'expired' | 'mismatch', message: string }`. Kein DB-Insert.

**Frontend:** `AddToQueueButton` rendert amber Inline-Warning mit der `message` aus dem Backend.

### §12.4 Filter-Enriched Search Query (MANDATORY)
Wenn der User Werte-Filter auswählt (z.B. Nachhaltigkeit, Innovation, etc.), MUSS das aktive Filter-Keyword direkt in die SerpAPI-Query injiziert werden — **nicht nur als Post-Tagging**.

**Regel:** Filter dürfen NIEMALS nur UI-Dekoration oder nachträgliches Tagging sein. Sie MÜSSEN die tatsächliche Suche beeinflussen.

**Implementierung** (`query/route.ts`):
1. Vor dem SerpAPI-Call: erstes aktives Werte-Keyword an `serpApiQuery` anhängen
2. Duplikat-Check: Keyword nur anhängen wenn nicht bereits in der Query enthalten
3. Nur das erste Filter-Keyword anhängen um Over-Constraining zu vermeiden
4. Post-Tagging via `tagJobsWithFilters()` bleibt als zusätzliche Klassifizierung erhalten

**Beispiel:** User sucht "AI Consultant" + Filter "Nachhaltigkeit" → SerpAPI-Query = `"AI Consultant Nachhaltigkeit"`

### §12.5 Steckbrief-Preview-Pflicht (MANDATORY)
Kein Job aus Job Search darf direkt in die Queue ohne User-Bestätigung.

**Pipeline:** SerpAPI `google_jobs_listing` (Ground Truth) + Jina (Enrichment) → GPT-4o-mini Harvester → Claude Judge → `status: 'pending_review'` → Steckbrief-Preview-Modal → User bestätigt → `status: 'pending'`

**Regeln:**
1. SerpAPI-Description ist Ground Truth. Jina ist optional Enrichment.
2. `pending_review` Jobs erscheinen NICHT in der Job Queue und zählen NICHT gegen das 5-Job-Limit.
3. "Abbrechen" im Preview löscht den `pending_review`-Job (kein Zombie).
4. `confirm/route.ts` akzeptiert nur whitelisted Edits: `tasks`, `hard_requirements`, `ats_keywords`, `benefits`. Keine beliebigen Felder.
