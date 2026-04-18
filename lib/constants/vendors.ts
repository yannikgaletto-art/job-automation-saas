/**
 * Auftragsverarbeiter-Verzeichnis (Vendor Registry)
 *
 * Single Source of Truth für alle in der Security-Page angezeigten Drittanbieter.
 * Abgeleitet aus: GDPR/RoPA.md (Art. 30 DSGVO)
 *
 * Bei neuem Vendor: NUR diese Datei + GDPR/RoPA.md aktualisieren.
 * Die Security-Page und docs/SICHERHEITSARCHITEKTUR.md lesen hieraus.
 *
 * Note: purposeKey maps to i18n key "security.vendor_purpose_{purposeKey}" in all locale files.
 */

export interface Vendor {
  name: string;
  /** i18n key suffix — full key: security.vendor_purpose_{purposeKey} */
  purposeKey: string;
  location: 'eu' | 'us' | 'us_eu';
  /** Auftragsverarbeitungsvertrag vorhanden */
  avv: boolean;
  /** Standard Contractual Clauses (für Drittlandtransfer) */
  scc: boolean;
  /** Zero Data Retention — Daten werden nicht zum Modell-Training genutzt */
  zdr: boolean;
}

export interface VendorCategory {
  id: string;
  vendors: Vendor[];
}

export const VENDOR_CATEGORIES: VendorCategory[] = [
  {
    id: 'infra',
    vendors: [
      { name: 'Supabase', purposeKey: 'db_auth_storage', location: 'eu', avv: true, scc: false, zdr: false },
      { name: 'Vercel', purposeKey: 'hosting_cdn', location: 'us_eu', avv: true, scc: true, zdr: false },
      { name: 'Upstash', purposeKey: 'rate_limiting', location: 'eu', avv: true, scc: false, zdr: false },
    ],
  },
  {
    id: 'ai',
    vendors: [
      { name: 'Anthropic (Claude)', purposeKey: 'ai_text', location: 'us', avv: true, scc: true, zdr: true },
      { name: 'OpenAI (Whisper)', purposeKey: 'audio_transcription', location: 'us', avv: true, scc: true, zdr: true },
      { name: 'Azure (Microsoft)', purposeKey: 'document_extraction', location: 'eu', avv: true, scc: false, zdr: false },
      { name: 'Perplexity', purposeKey: 'company_research', location: 'us', avv: true, scc: true, zdr: false },
      { name: 'Helicone', purposeKey: 'ai_observability', location: 'us', avv: true, scc: true, zdr: false },
    ],
  },
  {
    id: 'analytics',
    vendors: [
      { name: 'PostHog', purposeKey: 'product_analytics', location: 'eu', avv: true, scc: false, zdr: false },
      { name: 'Sentry', purposeKey: 'error_monitoring', location: 'eu', avv: true, scc: false, zdr: false },
    ],
  },
  {
    id: 'business',
    vendors: [
      { name: 'Stripe', purposeKey: 'payments', location: 'us_eu', avv: true, scc: true, zdr: false },
      { name: 'Inngest', purposeKey: 'background_jobs', location: 'us', avv: true, scc: true, zdr: false },
      { name: 'SerpAPI', purposeKey: 'job_search', location: 'us', avv: true, scc: true, zdr: false },
      { name: 'Jina', purposeKey: 'web_scraping', location: 'us', avv: true, scc: true, zdr: false },
      { name: 'Firecrawl', purposeKey: 'web_scraping_fallback', location: 'us', avv: true, scc: true, zdr: false },
    ],
  },
];

export const VENDOR_TOTAL = VENDOR_CATEGORIES.reduce((sum, cat) => sum + cat.vendors.length, 0);
