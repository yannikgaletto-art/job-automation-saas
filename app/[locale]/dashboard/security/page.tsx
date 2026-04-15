"use client";

import { useState, useEffect } from 'react';
import { Shield, Lock, Download, FileText, Trash2, CheckCircle2, AlertTriangle, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/motion/badge';
import { Button } from '@/components/motion/button';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

interface ConsentRecord {
  document_type: string;
  document_version: string;
  consent_given: boolean;
  consented_at: string;
}

const CONSENT_LABELS: Record<string, string> = {
  privacy_policy: 'Datenschutzerklärung',
  terms_of_service: 'Nutzungsbedingungen',
  ai_processing: 'KI-Verarbeitung',
  cookies: 'Cookie-Einwilligung',
  coaching_ai: 'Coaching KI',
  cv_special_categories: 'CV Besondere Kategorien (Art. 9)',
};

const CONSENT_VERSIONS: Record<string, string> = {
  privacy_policy: 'Version 1.0',
  terms_of_service: 'Version 1.0',
  ai_processing: 'Clause 4.2',
  cookies: 'Essential only',
};

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 30) return `vor ${Math.floor(diffDays / 7)} Woche${Math.floor(diffDays / 7) > 1 ? 'n' : ''}`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const COMPLIANCE_ITEMS = {
  dsgvo: [
    {
      title: 'Datenverschlüsselung',
      subtitle: 'Alle Daten werden mit AES-256 verschlüsselt gespeichert — wie in einem digitalen Tresor.',
      detail: 'Deine Daten liegen verschlüsselt auf Supabase-Servern in Frankfurt (eu-central-1). Selbst bei einem Servereinbruch wären die Daten ohne den Schlüssel nicht lesbar.',
    },
    {
      title: 'PII-Pseudonymisierung',
      subtitle: 'Dein Name wird von deinen Daten getrennt, bevor die KI sie verarbeitet.',
      detail: 'Personenbezogene Daten (Name, Adresse, Kontaktdaten) werden vor der KI-Verarbeitung durch Platzhalter ersetzt. Die KI sieht nur den Inhalt, nicht deine Identität.',
    },
    {
      title: 'Recht auf Löschung',
      subtitle: 'Du kannst jederzeit die vollständige Löschung aller deiner Daten beantragen.',
      detail: 'Gemäß DSGVO Art. 17 kannst du die Löschung beantragen. Alle Daten (CV, Anschreiben, Job-Queue, Bewerbungs-Historie) werden innerhalb von 30 Tagen unwiderruflich gelöscht.',
    },
  ],
  nis2: [
    {
      title: 'Vorfallmeldung',
      subtitle: 'Sicherheitsvorfälle werden innerhalb von 24 Stunden gemeldet und dokumentiert.',
      detail: 'Sollte es zu einem Datenleck oder Sicherheitsvorfall kommen, wirst du innerhalb von 24 Stunden informiert. Der Vorfall wird dokumentiert und an die zuständige Behörde gemeldet.',
    },
    {
      title: 'Audit-Protokolle',
      subtitle: 'Alle sicherheitsrelevanten Aktionen werden protokolliert — für deine Transparenz.',
      detail: 'Jede KI-Dokumentgenerierung wird mit Modellname, Zeitstempel und Token-Verbrauch in der Tabelle generation_logs gespeichert. Du kannst diese Daten jederzeit exportieren.',
    },
    {
      title: 'Lieferkettensicherheit',
      subtitle: 'Drittanbieter (z.B. KI-Modelle) werden regelmäßig auf Sicherheit geprüft.',
      detail: 'Unsere KI-Partner (Anthropic Claude, OpenAI) sind vertraglich verpflichtet, deine Daten nicht zum Modell-Training zu verwenden. Alle API-Aufrufe laufen über verschlüsselte Verbindungen (TLS 1.3).',
    },
  ],
};

function ComplianceCard({ title, icon, items }: {
  title: string;
  icon: React.ReactNode;
  items: typeof COMPLIANCE_ITEMS.dsgvo;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl font-semibold text-[#37352F]">{title}</h2>
        </div>
        <Badge variant="success">✓ Konform</Badge>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.title}>
            <button
              className="flex items-start gap-3 w-full text-left group"
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
            >
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-[#37352F] flex items-center gap-1">
                  {item.title}
                  {expandedIndex === index ? (
                    <ChevronUp className="h-3.5 w-3.5 text-[#73726E]" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[#73726E] opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
                <div className="text-sm text-[#73726E]">{item.subtitle}</div>
              </div>
            </button>
            <AnimatePresence>
              {expandedIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="ml-8 mt-2 text-sm text-[#73726E] bg-[#F5F5F4] rounded-lg p-3">
                    {item.detail}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SecurityPage() {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loadingConsents, setLoadingConsents] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConsents() {
      try {
        const res = await fetch('/api/security/consent-history');
        if (res.ok) {
          const data = await res.json();
          setConsents(data.consents || []);
        }
      } catch (err) {
        console.error('❌ Failed to load consent history:', err);
      } finally {
        setLoadingConsents(false);
      }
    }
    fetchConsents();
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      // Direct navigation forces browser to use Content-Disposition filename
      window.location.href = '/api/security/export';
    } catch (err) {
      console.error('❌ Export failed:', err);
    } finally {
      // Reset after a short delay (download starts in background)
      setTimeout(() => setExporting(false), 2000);
    }
  }

  // Deduplicate consents: keep only the latest per document_type
  const latestConsents = Object.values(
    consents.reduce<Record<string, ConsentRecord>>((acc, c) => {
      if (!acc[c.document_type] || new Date(c.consented_at) > new Date(acc[c.document_type].consented_at)) {
        acc[c.document_type] = c;
      }
      return acc;
    }, {})
  );

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-[#37352F] flex items-center gap-3">
          <Shield className="w-8 h-8 text-[#012e7a]" />
          Datensicherheit & Datenschutz
        </h1>
        <p className="text-[#73726E] mt-1">DSGVO- & NIS2-konforme Datenverwaltung. Dein Datenschutz hat höchste Priorität.</p>
      </div>

      {/* Compliance Status Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        <ComplianceCard
          title="DSGVO-Konformität"
          icon={<Lock className="w-5 h-5 text-[#37352F]" />}
          items={COMPLIANCE_ITEMS.dsgvo}
        />
        <ComplianceCard
          title="NIS2-Richtlinie"
          icon={<AlertTriangle className="w-5 h-5 text-[#37352F]" />}
          items={COMPLIANCE_ITEMS.nis2}
        />
      </div>

      {/* Data Rights & Consent */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Your Data Rights */}
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-6 flex flex-col">
          <h2 className="text-xl font-semibold text-[#37352F] mb-4">Deine Datenschutzrechte</h2>
          <div className="space-y-3 flex-1">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3"
              onClick={() => window.open('/legal/privacy-policy', '_blank')}
            >
              <FileText className="h-4 w-4 mr-2" />
              <div className="text-left">
                <span className="block font-medium">Datenschutzerklärung ansehen</span>
                <span className="text-xs text-[#73726E]">Vollständige Datenschutzerklärung (v1.0)</span>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              <div className="text-left">
                <span className="block font-medium">{exporting ? 'Wird exportiert...' : 'Meine Daten exportieren'}</span>
                <span className="text-xs text-[#73726E]">Download aller gespeicherten Daten (JSON)</span>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              <div className="text-left">
                <span className="block font-medium">Account löschen</span>
                <span className="text-xs opacity-80">Dauerhafte Löschung aller Daten</span>
              </div>
            </Button>
          </div>
        </div>

        {/* Consent History */}
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
          <h2 className="text-xl font-semibold text-[#37352F] mb-4">Einwilligungshistorie</h2>
          <div className="space-y-0 divide-y divide-[#E7E7E5]">
            {loadingConsents ? (
              // Skeleton loading
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 bg-[#E7E7E5] rounded animate-pulse" />
                    <div className="h-3 w-20 bg-[#E7E7E5] rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-20 bg-[#E7E7E5] rounded animate-pulse" />
                </div>
              ))
            ) : latestConsents.length > 0 ? (
              latestConsents.map((consent) => (
                <div key={consent.document_type} className="flex items-center justify-between py-3">
                  <div>
                    <span className="block text-[#37352F] font-medium">
                      {CONSENT_LABELS[consent.document_type] || consent.document_type}
                    </span>
                    <span className="text-xs text-[#73726E]">
                      {CONSENT_VERSIONS[consent.document_type] || consent.document_version}
                      {consent.consented_at && (
                        <> · {getRelativeTime(consent.consented_at)}</>
                      )}
                    </span>
                  </div>
                  <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded">
                    Akzeptiert
                  </span>
                </div>
              ))
            ) : (
              // Fallback: show static labels if no DB records
              ['privacy_policy', 'terms_of_service', 'ai_processing', 'cookies'].map((type) => (
                <div key={type} className="flex items-center justify-between py-3">
                  <div>
                    <span className="block text-[#37352F] font-medium">{CONSENT_LABELS[type]}</span>
                    <span className="text-xs text-[#73726E]">{CONSENT_VERSIONS[type]}</span>
                  </div>
                  <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded">
                    Akzeptiert
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Delete Account Modal — Self-Service (DSGVO Art. 17) */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => { if (!deleting) setShowDeleteModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#37352F]">Account dauerhaft löschen</h3>
                <button
                  onClick={() => { if (!deleting) { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(null); } }}
                  className="text-[#73726E] hover:text-[#37352F]"
                  disabled={deleting}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800 font-medium mb-1">⚠️ Diese Aktion kann nicht rückgängig gemacht werden</p>
                <p className="text-xs text-red-700">
                  Alle deine Daten werden unwiderruflich gelöscht: Lebenslauf, Anschreiben, Job Queue,
                  Bewerbungshistorie, Coaching Sessions und Stripe-Abonnement.
                </p>
              </div>

              <p className="text-sm text-[#73726E] mb-3">
                Tippe <strong className="text-[#37352F]">LÖSCHEN</strong> ein, um die Löschung zu bestätigen:
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="LÖSCHEN"
                disabled={deleting}
                className="w-full px-3 py-2 border border-[#E7E7E5] rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 disabled:opacity-50"
                autoComplete="off"
              />

              {deleteError && (
                <p className="text-sm text-red-600 mb-3">{deleteError}</p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(null); }}
                  disabled={deleting}
                >
                  Abbrechen
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white border-none disabled:opacity-40"
                  disabled={deleteConfirm !== 'LÖSCHEN' || deleting}
                  onClick={async () => {
                    setDeleting(true);
                    setDeleteError(null);
                    try {
                      const res = await fetch('/api/account/delete', { method: 'DELETE' });
                      const data = await res.json();
                      if (!res.ok || !data.success) {
                        setDeleteError(data.error || 'Löschung fehlgeschlagen. Bitte kontaktiere contact@path-ly.eu');
                        setDeleting(false);
                        return;
                      }
                      // Success: sign out and redirect
                      const supabase = createClient();
                      await supabase.auth.signOut();
                      window.location.href = '/login';
                    } catch {
                      setDeleteError('Netzwerkfehler. Bitte versuche es erneut.');
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Wird gelöscht…</>
                  ) : (
                    'Account löschen'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center text-sm text-[#73726E] pt-4">
        Fragen zur Datensicherheit?{' '}
        <a href="/legal/privacy-policy" className="text-[#012e7a] hover:underline">
          Datenschutzerklärung lesen
        </a>
      </div>
    </div>
  );
}
