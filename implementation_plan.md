# Quote Infrastructure Refinements

Based on the latest feedback, we will refine the hybrid quote architecture to be smarter and re-integrate the AI-based fallback for niche cases without sacrificing the speed and predictability of the curated database.

## 1. SQL Warning Explanation (Bild 1)
**Zu deiner Frage 1:** Ja, das ist absolut richtig und unbedenklich! 
Die Warnung *"Query has destructive operations"* taucht im Supabase-Dashboard auf, weil die Datei den Befehl `DROP POLICY IF EXISTS "quotes_read_approved" ON public.quotes;` enthält. "Drop" wird von Supabase pauschal als destruktiv markiert. Da wir die Policy im Skript aber direkt in der Zeile darunter neu erstellen (`CREATE POLICY...`), gehen hier keine Daten verloren. Du kannst bedenkenlos auf **"Run this query"** klicken.

---

## Proposed Changes

### 1. Smart Category Inference (Kontext statt Wort-für-Wort)

Die bisherige `inferCategory`-Funktion (die prüfte, ob "Video Editor" exakte Wörter aus den CSV-Kategorien enthält) greift zu kurz. Wir ersetzen den stupiden String-Match durch ein **kontextuelles, regelbasiertes Mapping** (ohne LLM-Latenz/Halluzination):
- **Stammwort-Analyse:** Wörter werden normalisiert (z. B. "Editor", "Video", "Creator" -> Kreativbranche).
- Wir ergänzen fehlende Schlüsselwörter wie `video`, `editor`, `creator`, `filmmaker` in der map für `Kreativbranche_Design_Medien_Kommunikation`.
- **Hybrid-Matching:** Wenn kein direkter Treffer erzielt wird, werten wir die Job-Requirements und Tech-Stack-Keywords aus, die uns im `QuoteContext` zur Verfügung stehen, um die Industrie präziser einzuordnen. 

#### [MODIFY] [quote-service.ts](file:///Users/yannik/.gemini/antigravity/Pathly_SaaS/lib/services/quote-service.ts)
- Update `CATEGORY_KEYWORDS` to include a much broader dictionary of modern job titles (including Video, Editor, Content, etc.).
- Rewrite `inferCategory(jobTitle: string, requirements?: string[])` to scan broader context arrays if the title is ambiguous.

### 2. Der Perplexity / AI-Fallback (Wie bisher)

Die universellen DB-Fallbacks (Simon Sinek etc.) sind gut für generische Business-Rollen, aber der User hat recht: Ein Perplexity/Haiku-basierter Research war spezifischer. Wir re-integrieren das AI-Fallback als "Netz mit doppeltem Boden".

**Der neue Flow im `quote-service.ts`:**
1. **Tier 1 (Instant):** Full-Text-Search in der kuratierten Supabase-DB (0.1 Sekunden).
2. **Tier 2 (Instant):** Context-Aware Category Fallback in der Supabase-DB (0.1 Sekunden).
3. **Tier 3 (AI Fallback, 2-4 Sekunden):** Wenn Tier 1 und Tier 2 absolut keinen Treffer landen (Result = 0):
   - Wir feuern on-demand einen Call an das Claude `company-enrichment` Setup, um 3 spezifische Zitate (inkl. echten Persönlichkeiten der Industrie) zu generieren.
   - Da dies nur für extreme Nischen-Jobs passiert, halten wir die Latenz im Durchschnitt unter 1 Sekunde für 90% der User, und nehmen die ~3 Sekunden Latenz für die 10% Nischen-User in Kauf (dafür mit maßgeschneiderten Perplexity/AI-Quotes).

#### [MODIFY] [quote-service.ts](file:///Users/yannik/.gemini/antigravity/Pathly_SaaS/lib/services/quote-service.ts)
- Implementierung der `generateAiQuoteFallback(ctx)` Funktion.
- Ersetzen der harten Universal-Kategorien-Logik durch einen asynchronen AI-Call (z.B. über die existierende `analyzeCompany` oder eine dedizierte Haiku-Prompt für Zitate).

#### [MODIFY] [company-enrichment.ts](file:///Users/yannik/.gemini/antigravity/Pathly_SaaS/lib/services/company-enrichment.ts) oder [quote-generator.ts]
- Wiedereinführung des AI-Quote-Generators für diesen spezifischen Fallback-Pfad. *(Hinweis: Ich reaktiviere den Code dafür gezielt, ohne Thementreue/Latenz der Gesamt-App zu gefährden).* 

---

## User Review Required

> [!IMPORTANT]
> **Für den Perplexity-Fallback:** 
> Der alte Service `quote-matcher.ts` benutzte Claude 3.5 Haiku, um Zitate zu *erfinden/generieren*, das war keine echte Perplexity-Suche (Perplexity feuert nur für `company_research` Intel Data). 
> **Frage an dich:** Soll das Fallback weiterhin über den schnellen Claude Haiku laufen (wie im alten `quote-matcher`), um Industrie-Zitate logisch zu erschließen, ODER möchtest du buchstäblich einen brandneuen Perplexity-Call starten, der das Internet nach realen Zitaten *(z. B. "Welches Zitat stammt vom KPMG CEO?")* durchsucht? (Claude Haiku ist deutlich schneller und reicht meistens völlig aus). 

Sobald du die Frage zum Fallback geklärt hast, genehmige den Plan, und ich baue die smarte Keyword-Erkennung und das Fallback ein!
