# i18n Protocol — Pathly V2.0

**Status:** AKTIV — Tier 1 vollständig (inkl. Cover Letter Wizard). Tier 2 (JobSwipeView, CV-Templates) offen.
**Version:** 1.4 (Mood Check-in V2 Namespace + latin-ext bestätigt)
**Erstellt:** 2026-03-17
**Letzte Änderung:** 2026-03-21
**Sprachen:** Deutsch (de), Englisch (en), Spanisch (es)

---

> [!IMPORTANT]
> **Reduce Complexity!**
> Dieses Protokoll definiert die verbindlichen Architektur-Entscheidungen für Internationalisierung.
> Jeder Agent, der UI-Strings, AI-Prompts oder API-Responses berührt, MUSS dieses Dokument kennen.

---

## 1. ARCHITEKTUR-ENTSCHEIDUNGEN

| Entscheidung | Festlegung |
|---|---|
| **Library** | `next-intl` (App Router native, TypeScript-sicher) |
| **Routing-Strategie** | URL-Prefix: `/de/dashboard`, `/en/dashboard`, `/es/dashboard` |
| **Supported Locales** | `['de', 'en', 'es']` |
| **Default Locale** | `de` (DACH Hauptmarkt) |
| **Fallback Locale** | `en` (wenn Key in Zielsprache fehlt) |
| **Locale-Detection** | 1. `user_settings.language` → 2. Cookie `NEXT_LOCALE` → 3. `Accept-Language` Header → 4. Default `de` |
| **Locale Prefix** | `always` — jede Route hat ein Prefix. `/dashboard` → Redirect zu `/de/dashboard` |
| **API-Routes** | Kein Locale-Prefix. API liest Locale aus `user_settings.language` per DB-Lookup |

---

## 2. KEY-NAMING-CONVENTION

**Format:** `feature.component.element`

**Beispiele:**
```
common.button.save
common.button.cancel
common.button.generate
dashboard.greeting.welcome        → "Willkommen zurück, {name}"
dashboard.cv.button.optimize
onboarding.step1.title
onboarding.progress.step          → "Schritt {current} von {total}"
coaching.chat.placeholder
cover_letter.wizard.tone.formal
auth.login.email_label
auth.login.error.invalid
errors.cv.not_found
errors.network.timeout
```

**Regeln:**
- Alle Keys in `snake_case`
- Namespace = Feature-Name (entspricht Feature-Silos aus `FEATURE_COMPAT_MATRIX.md`)
- `common.*` für feature-übergreifende Strings (Buttons, Labels, Loading)
- `errors.*` für API Error-Keys
- Plurale: ICU-Format `{count, plural, one {# Bewerbung} other {# Bewerbungen}}`
- Interpolation: `{variableName}` — z.B. `"Hallo, {name}"`

---

## 3. TRANSLATION-FILES

**Speicherort:** `/locales/de.json`, `/locales/en.json`, `/locales/es.json`

**Workflow:**
1. **DE** — Yannik schreibt (Primärsprache)
2. **EN** — Yannik schreibt
3. **ES** — DeepL + nativer Review

**Struktur:** Alle drei Files MÜSSEN identische Key-Hierarchie haben.

---

## 4. DATENBANK

**Tabelle `user_settings`:**
- `language TEXT DEFAULT 'de' CHECK (language IN ('de', 'en', 'es'))`
- Bestehende RLS-Policy `own_settings` deckt das Feld automatisch ab

**Tabelle `coaching_sessions`:**
- `language TEXT DEFAULT 'de' CHECK (language IN ('de', 'en', 'es'))`
- Locale wird beim Session-Start eingefroren (nicht dynamisch pro Turn)

---

## 5. KI-PROMPT-SPRACHSTEUERUNG

**Pflicht für jeden AI-Service-Call:**
- `locale`-Parameter an alle AI-Services übergeben
- System-Prompt enthält: `"Antworte ausschließlich auf ${languageName}."`
- Kulturelle Anpassungen: DE=Sie-Form, EN=direct/you, ES=usted-Form

**Inngest Background-Jobs:**
- `locale` MUSS in jedes Inngest Event-Payload
- Pipeline liest `locale` aus Event, nicht aus DB (Performance)
- Fallback wenn `locale` fehlt: `'de'`

**Qualitätskriterien:**
- `QUALITY_CV_COVER_LETTER.md` MUSS um EN/ES-Qualitätsregeln erweitert werden, BEVOR KI-Prompts implementiert werden

---

## 5b. SERVER- VS. CLIENT-COMPONENT-HOOK (PFLICHT)

`next-intl` hat **zwei verschiedene APIs** je nach Component-Typ. Falscher Hook = Laufzeitfehler.

| Component-Typ | Korrekter Hook | Falsch |
|---|---|---|
| `"use client"` | `useTranslations('namespace')` | `getTranslations()` |
| Server Component (kein `"use client"`) | `await getTranslations('namespace')` | `useTranslations()` |
| Server-side in `layout.tsx` | `await getTranslations(...)` | `useTranslations()` |

**Beispiel Dashboard Layout** (`app/dashboard/layout.tsx` = Client Component):
- Alle `NavItem label="Today's Goals"` → müssen via `useTranslations('dashboard.nav')` übersetzt werden
- Layout-Dateien sind **prioritäre erste Targets**, da sie alle Seiten wrappen

---

## 6. DATUM-/ZAHLEN-FORMATIERUNG

| Locale | Datum | Zahl |
|---|---|---|
| `de` | 17.03.2026 | 1.234,56 |
| `en` | Mar 17, 2026 | 1,234.56 |
| `es` | 17 mar. 2026 | 1.234,56 |

**Wrapper:** `formatDate(date, locale)`, `formatNumber(n, locale)` — zentral, nicht inline.

---

## 6b. FONT-KONFIGURATION (BREAKING für Spanisch)

Aktuell: `app/layout.tsx` lädt `Inter({ subsets: ['latin'] })`.  
Das subset `latin` enthält **nicht** alle Spanisch-Sonderzeichen (ñ, á, é, í, ó, ú, ü).

**Pflicht-Änderung in Phase 1 Batch 1.1:** ✅ **UMGESETZT** (bestätigt in `app/layout.tsx`)
```
Inter({ subsets: ['latin', 'latin-ext'] })
```

Zusätzlich: `<html lang="en">` in `app/layout.tsx` ist hardcoded.  
Nach der Umstrukturierung zu `app/[locale]/layout.tsx` wird `lang={locale}` dynamisch gesetzt — das ist der korrekte Weg.

---

## 7. VERBOTENE ANTI-PATTERNS

```
❌ Hardcoded Strings im JSX: <button>Speichern</button>
✅ Korrekt: <button>{t('common.button.save')}</button>

❌ Locale im Frontend-State (Zustand): useLocaleStore()
✅ Korrekt: useLocale() von next-intl

❌ Inngest Event ohne locale: inngest.send({ data: { userId } })
✅ Korrekt: inngest.send({ data: { userId, locale } })

❌ API Error-Response mit Klartext: { error: "CV nicht gefunden" }
✅ Korrekt: { error: "cv.not_found" }

❌ Sprach-Wechsel ohne DB-Update: nur Cookie setzen
✅ Korrekt: PATCH /api/settings/profile + Cookie + router.replace

❌ map-Variable shadowing: TEMPLATES.map((t) => ...) wenn t = useTranslations()
✅ Korrekt: TEMPLATES.map((tmpl) => ...) — andere Variablennamen wählen

❌ t als Prop mit benutzerdefinierten Typen: t: (key: string) => string
✅ Korrekt: t: ReturnType<typeof useTranslations> — exakt der next-intl Typ
```

---

## 8. IMPLEMENTIERTE NAMESPACES (Tier 1 — 2026-03-17)

| Namespace | Datei | Keys | Status |
|---|---|---|---|
| `cv_optimizer` | `OptimizerWizard.tsx` | 35 | ✅ Vollständig |
| `diff_review` | `DiffReview.tsx` | 17 | ✅ Vollständig |
| `command_palette` | `command-palette.tsx` | 12 | ✅ Vollständig |
| `dashboard.nav` | `sidebar.tsx`, `layout.tsx` | ~30 | ✅ Vollständig (frühere Phase) |
| `dashboard.job_search` | `JobSwipeView.tsx` | ~15 | ⚠️ Offen — Tier 2 |
| `mood_checkin` | `useMoodCheckIn.tsx`, `MoodCheckInOverlay`, `CheckinSettingsCard` | ~15 | ✅ Vollständig (de/en/es) |
| `cv_templates` | `ValleyTemplate`, `TechTemplate` | ? | ⏳ Deferred — kein useTranslations in PDF-Render |

---

## 9. TIER-1 IMPLEMENTIERUNGS-PATTERNS (validiert)

### Arrays mit übersetzten Strings → immer `useMemo`
```tsx
// ❌ FALSCH: Array außerhalb der Komponente mit t() → t ist dort nicht verfügbar
const OPT_STEPS = [t('step_1'), ...]; // Fehler!

// ✅ KORREKT: useMemo inside Komponente
const OPT_STEPS = useMemo(() => [
    t('opt_step_1'),
    t('opt_step_2'),
], [t]);
```

### Konstante Listen mit Verhalten → `useMemo` inside Komponente
```tsx
// ❌ FALSCH: Globale Konstante mit t() Labels
const COMMANDS = [{ label: t('cmd_goals'), ... }]; // t nicht verfügbar

// ✅ KORREKT
const COMMANDS = useMemo(() => [
    { id: 'goals', label: t('cmd_goals'), href: '/dashboard' },
], [t]);
```

### `t` als Prop an Sub-Komponenten übergeben
```tsx
// Wenn Sub-Komponenten in derselben Datei definiert sind und t brauchen:
function ChildComponent({ t }: { t: ReturnType<typeof useTranslations> }) {
    return <span>{t('some_key')}</span>;
}
// Parent übergibt t direkt — kein Re-Import nötig
```

---

**Stand:** Tier 1 abgeschlossen. Tier 2 (JobSwipeView + CV-Templates) als separater Task.
**Nächster Schritt:** JobSwipeView.tsx (~15 Strings) — separater Scope.
