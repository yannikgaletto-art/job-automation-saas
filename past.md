# Past — UI Änderungen

## [2026-02-25] UI Final Pass — Steckbrief, CV Match, Sidebar

Geänderte Dateien:
- `app/dashboard/components/job-row.tsx`
- `app/dashboard/components/cv-match/cv-match-tab.tsx`
- `components/motion/sidebar.tsx`
- `app/dashboard/components/sidebar.tsx` (unused backup, real sidebar is motion/sidebar.tsx)

### Was geändert wurde

**Job Row / Steckbrief:**
- Blauer Hintergrund (bg-[#d4e3fe]) → weißer Hintergrund (bg-white)
- Doppelter Titel (jobTitle + company innerhalb Steckbrief-Tab) entfernt
- Aufgaben + Qualifikationen jetzt in rounded-lg border cards (identisch zu SummaryBlock)
- AnimatedMatchScore-Badge aus kompakter Zeile entfernt (% nur noch im Stepper)
- ATSMindmap-Kreis entfernt → einfaches Pill-Grid (ATSKeywords)

**CV Match Tab:**
- Match Score Card + Score Breakdown Card haben jetzt identische Container-Styles (rounded-xl border bg-white p-5)
- Beide Cards in grid grid-cols-2 items-stretch → gleiche Höhe
- Anforderungs-Check als table-fixed mit colgroup 22%/36%/42%
- boldFirst()-Helper: erstes Keyword in Ist-Zustand + Empfehlung wird fett angezeigt
- 60-Zeichen-Truncation mit Wortgrenze

**Sidebar:**
- User-Info-Block (Initialen-Avatar, Name, Email) über Logout-Button
- Verwendet Supabase auth.getUser() via useEffect im Client-Component
- 💰 Emoji in CreditsCard → Lucide Coins-Icon

### Status: DONE
Keine weiteren UI-Iterationen für diese Features geplant.
TypeScript: 0 Fehler. Emojis: 0. Browser: ✓ verifiziert.
