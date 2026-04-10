# AGENT_11.4_EXTENSION_FIXES.md

## Objective
Behebung der kritischen Fehler in der Extension-Pipeline, die im Dreifachen Stresstest (DOM Parsing → Auth/API → Inngest) identifiziert wurden.

## Blocker Fix-Plan

1. **Inngest Pipeline (BLOCKER 6 & 7):**
   - **Problem:** Extension sendet oft kleine oder leere Descriptions. `extract-job-pipeline.ts` wirft dann einen Fehler und der Job bleibt ewig ohne Analyse hängen. Da `sync_extracted_at` fehlt, greift der Inngest-Skip nicht.
   - **Lösung:** Inngest-Pipeline anpassen, sodass Jobs von der Extension (mit kurzer/leerer Description) eine URL-Extraktion via Firecrawl ausführen, falls keine ausreichende Description vorliegt.

2. **Auth Flow (BLOCKER 5 & 4):**
   - **Problem:** `isAuthenticated()` im Popup prüft nur die Existenz des Tokens, nicht den Ablauf (`expiresAt`).
   - **Lösung:** `isAuthenticated()` muss `Date.now() < expiresAt` validieren.
   - **Problem:** Hardcoded Auth Callback Link verweist auf `/de/login`.
   - **Lösung:** Den Link (in `app/auth/extension/callback/page.tsx`) unabhängig vom Locale oder dynamisch mit `window.location.search`/`NextRequest` machen.

3. **DOM Parsing (BLOCKER 1 & 2):**
   - **Problem:** `extractText` in StepStone und Indeed hat kein `try/catch`. Ein Fehlerhafter Selektor crasht das Content-Script.
   - **Lösung:** `try/catch` um jeden Selektor-Aufruf in StepStone und Indeed (wie in `linkedin.ts`) hinzufügen.
   - **Problem:** Xing-Plattform wird von API unterstützt, aber Content Script wird nicht injiziert.
   - **Lösung:** Entweder API um "xing" bereinigen oder `matches` in `PlasmoCSConfig` anpassen.

4. **API CORS (BLOCKER 3):**
   - **Problem:** `POST /api/jobs/import` hat keine CORS-Headers (OPTIONS Preflight fehlt).
   - **Lösung:** CORS-Middleware oder Route Handler für OPTIONS in `import/route.ts` implementieren.

## Warnings Fix-Plan

1. `currentJob` im RAM halten ist gefährlich bei Worker Eviction -> in `storage.session` auslagern.
2. Credit-Gate auf `/api/jobs/import` nachrüsten (falls nicht gewollt kostenlos).
3. Hardcoded deutsche Texte (`Erneut versuchen`, `Verbinde…`) in `en.json` und `es.json` auslagern.
4. Product-Domain muss bei Extension Release korrekt konfiguriert werden.
