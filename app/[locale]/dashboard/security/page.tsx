"use client";

import { useState, useEffect } from 'react';
import {
  Download, FileText, Trash2, CheckCircle2,
  Loader2, X, ChevronDown, ChevronUp, ShieldCheck,
  LockKeyhole, Globe, Bot, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/motion/button';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { VENDOR_CATEGORIES, type VendorCategory, type Vendor } from '@/lib/constants/vendors';

// ─── Types ──────────────────────────────────────────────────────
interface ConsentRecord {
  document_type: string;
  document_version: string;
  consent_given: boolean;
  consented_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────
function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale === 'de' ? 'de-DE' : locale === 'es' ? 'es-ES' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ─── Compliance Status Pill ─────────────────────────────────────
function StatusPill({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-[#E7E7E5] rounded-full px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <Icon className="h-3.5 w-3.5 text-[#73726E]" />
      <span className="text-xs font-medium text-[#37352F] whitespace-nowrap">{label}</span>
    </div>
  );
}

// ─── Compliance Card ────────────────────────────────────────────
function ComplianceCard({ title, badge, borderColor, items }: {
  title: string;
  badge: string;
  borderColor: string;
  items: { title: string; subtitle: string; detail: string }[];
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className={`bg-white rounded-lg border border-[#E7E7E5] border-l-4 p-6`} style={{ borderLeftColor: borderColor }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#37352F]">{title}</h2>
        <span className="text-xs font-medium text-[#73726E] bg-[#F7F7F5] px-2 py-1 rounded">{badge}</span>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index}>
            <button
              className="flex items-start gap-3 w-full text-left group"
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
            >
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-[#37352F] text-sm flex items-center gap-1">
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

// ─── Vendor Accordion ───────────────────────────────────────────
function VendorAccordion({ categories, t }: {
  categories: VendorCategory[];
  t: ReturnType<typeof useTranslations>;
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categoryLabels: Record<string, string> = {
    infra: t('vendor_category_infra'),
    ai: t('vendor_category_ai'),
    analytics: t('vendor_category_analytics'),
    business: t('vendor_category_business'),
  };

  function getLocationLabel(v: Vendor): string {
    if (v.location === 'eu') return t('transfer_eu');
    if (v.location === 'us' && v.zdr) return t('transfer_us_zdr');
    if (v.location === 'us') return t('transfer_us_scc');
    return t('transfer_mixed');
  }

  function summarizeCategory(cat: VendorCategory): string {
    const euCount = cat.vendors.filter(v => v.location === 'eu').length;
    const mixedCount = cat.vendors.filter(v => v.location === 'us_eu').length;
    const usCount = cat.vendors.filter(v => v.location === 'us').length;
    const parts: string[] = [];
    if (euCount > 0) parts.push(`${euCount} EU`);
    if (mixedCount > 0) parts.push(`${mixedCount} EU/US`);
    if (usCount > 0) parts.push(`${usCount} US/SCC`);
    return parts.join(' + ');
  }

  return (
    <div className="divide-y divide-[#E7E7E5]">
      {categories.map(cat => (
        <div key={cat.id}>
          <button
            className="flex items-center justify-between w-full py-3 px-1 text-left hover:bg-[#F7F7F5] rounded transition-colors"
            onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-[#37352F]">{categoryLabels[cat.id]}</span>
              <span className="text-xs text-[#73726E]">{summarizeCategory(cat)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{t('avv_active')}</span>
              {activeCategory === cat.id ? (
                <ChevronUp className="h-4 w-4 text-[#73726E]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#73726E]" />
              )}
            </div>
          </button>
          <AnimatePresence>
            {activeCategory === cat.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pb-3 pl-4">
                  {cat.vendors.map((vendor, vi) => (
                    <div key={vi} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-medium text-[#37352F]">{vendor.name}</span>
                        <span className="text-[#73726E] ml-2">— {t(`vendor_purpose_${vendor.purposeKey}`)}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          vendor.location === 'eu'
                            ? 'text-green-700 bg-green-50'
                            : vendor.location === 'us_eu'
                            ? 'text-blue-700 bg-blue-50'
                            : 'text-amber-700 bg-amber-50'
                        }`}>
                          {getLocationLabel(vendor)}
                        </span>
                        {vendor.zdr && (
                          <span className="text-xs text-[#012e7a] bg-[#012e7a]/10 px-1.5 py-0.5 rounded">ZDR</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function SecurityPage() {
  const t = useTranslations('security');
  const locale = useLocale();

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
      window.location.href = '/api/security/export';
    } catch (err) {
      console.error('❌ Export failed:', err);
    } finally {
      setTimeout(() => setExporting(false), 2000);
    }
  }

  // Deduplicate: keep latest per document_type
  const latestConsents = Object.values(
    consents.reduce<Record<string, ConsentRecord>>((acc, c) => {
      if (!acc[c.document_type] || new Date(c.consented_at) > new Date(acc[c.document_type].consented_at)) {
        acc[c.document_type] = c;
      }
      return acc;
    }, {})
  );

  // ─── DSGVO items ────────────────────────────────────────────
  const dsgvoItems = [
    {
      title: t('dsgvo_item_encryption_title'),
      subtitle: t('dsgvo_item_encryption_sub'),
      detail: t('dsgvo_item_encryption_detail'),
    },
    {
      title: t('dsgvo_item_pii_title'),
      subtitle: t('dsgvo_item_pii_sub'),
      detail: t('dsgvo_item_pii_detail'),
    },
    {
      title: t('dsgvo_item_erasure_title'),
      subtitle: t('dsgvo_item_erasure_sub'),
      detail: t('dsgvo_item_erasure_detail'),
    },
    {
      title: t('dsgvo_item_tls_title'),
      subtitle: t('dsgvo_item_tls_sub'),
      detail: t('dsgvo_item_tls_detail'),
    },
    {
      title: t('dsgvo_item_rls_title'),
      subtitle: t('dsgvo_item_rls_sub'),
      detail: t('dsgvo_item_rls_detail'),
    },
  ];

  // ─── NIS2 items ─────────────────────────────────────────────
  const nis2Items = [
    {
      title: t('nis2_item_incident_title'),
      subtitle: t('nis2_item_incident_sub'),
      detail: t('nis2_item_incident_detail'),
    },
    {
      title: t('nis2_item_audit_title'),
      subtitle: t('nis2_item_audit_sub'),
      detail: t('nis2_item_audit_detail'),
    },
    {
      title: t('nis2_item_supply_title'),
      subtitle: t('nis2_item_supply_sub'),
      detail: t('nis2_item_supply_detail'),
    },
  ];

  // Consent type labels (all 6 document_types from DB)
  // Uses a static lookup to avoid try/catch on translation function
  const CONSENT_TYPE_KEYS: Record<string, string> = {
    privacy_policy: 'consent_type_privacy_policy',
    terms_of_service: 'consent_type_terms_of_service',
    ai_processing: 'consent_type_ai_processing',
    cookies: 'consent_type_cookies',
    coaching_ai: 'consent_type_coaching_ai',
    cv_special_categories: 'consent_type_cv_special_categories',
  };
  const consentTypeLabel = (type: string): string => {
    const key = CONSENT_TYPE_KEYS[type];
    return key ? t(key) : type;
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">


      {/* ─── 2. Compliance Status Bar ──────────────────────── */}
      <div className="grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-3">
        <StatusPill icon={LockKeyhole} label={t('status_dsgvo')} />
        <StatusPill icon={ShieldCheck} label={t('status_nis2')} />
        <StatusPill icon={Bot} label={t('status_ai_act')} />
        <StatusPill icon={Globe} label={t('status_scc')} />
        <StatusPill icon={LockKeyhole} label="AES-256 + TLS 1.3" />
      </div>

      {/* ─── 3. DSGVO + NIS2 Cards ────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        <ComplianceCard
          title={t('dsgvo_title')}
          badge={t('dsgvo_badge')}
          borderColor="#012e7a"
          items={dsgvoItems}
        />
        <ComplianceCard
          title={t('nis2_title')}
          badge={t('nis2_badge')}
          borderColor="#0066FF"
          items={nis2Items}
        />
      </div>

      {/* ─── 4. Vendor Transparency ───────────────────────── */}
      <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-[#37352F]">{t('vendors_title')}</h2>
        </div>
        <p className="text-xs text-[#73726E] mb-4">{t('vendors_subtitle')}</p>
        <VendorAccordion categories={VENDOR_CATEGORIES} t={t} />
      </div>

      {/* ─── 5. Data Rights + Consent History ─────────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Data Rights */}
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-[#37352F] mb-4">{t('rights_title')}</h2>
          <div className="space-y-3 flex-1">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3"
              onClick={() => window.open('/legal/privacy-policy', '_blank')}
            >
              <FileText className="h-4 w-4 mr-2" />
              <div className="text-left">
                <span className="block font-medium">{t('rights_privacy_cta')}</span>
                <span className="text-xs text-[#73726E]">{t('rights_privacy_sub')}</span>
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
              <div className="text-left flex-1">
                <span className="block font-medium">{exporting ? t('rights_export_loading') : t('rights_export_cta')}</span>
                <span className="text-xs text-[#73726E]">{t('rights_export_sub')}</span>
              </div>
              <span className="text-[10px] font-medium text-[#012e7a] bg-[#012e7a]/10 px-1.5 py-0.5 rounded ml-2">Art. 20</span>
            </Button>

            {/* Separator before destructive action */}
            <hr className="border-[#E7E7E5] my-1" />

            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              <div className="text-left">
                <span className="block font-medium">{t('rights_delete_cta')}</span>
                <span className="text-xs opacity-80">{t('rights_delete_sub')}</span>
              </div>
            </Button>
            <p className="text-xs text-[#73726E] pl-1">{t('rights_delete_notice')}</p>
          </div>
        </div>

        {/* Consent History — Table Layout */}
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
          <h2 className="text-lg font-semibold text-[#37352F] mb-4">{t('consent_title')}</h2>

          {loadingConsents ? (
            <div className="space-y-0 divide-y divide-[#E7E7E5]">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 bg-[#E7E7E5] rounded animate-pulse" />
                    <div className="h-3 w-20 bg-[#E7E7E5] rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-20 bg-[#E7E7E5] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : latestConsents.length > 0 ? (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 pb-2 border-b border-[#E7E7E5] text-xs text-[#73726E] font-medium">
                <span>{t('consent_type_col')}</span>
                <span className="text-right">{t('consent_date_col')}</span>
                <span className="text-right w-20">{t('consent_status_col')}</span>
              </div>
              {/* Table rows */}
              <div className="divide-y divide-[#E7E7E5]">
                {latestConsents.map((consent) => (
                  <div key={consent.document_type} className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center py-2.5">
                    <div>
                      <span className="block text-sm font-medium text-[#37352F]">
                        {consentTypeLabel(consent.document_type)}
                      </span>
                      <span className="text-xs text-[#73726E]">{consent.document_version}</span>
                    </div>
                    <span className="text-xs text-[#73726E] text-right">
                      {consent.consented_at ? formatDate(consent.consented_at, locale) : '—'}
                    </span>
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded text-right w-20 text-center">
                      {t('consent_accepted')}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#73726E] py-4 text-center">{t('consent_empty')}</p>
          )}

          {/* Footer links */}
          <div className="mt-4 pt-3 border-t border-[#E7E7E5] space-y-1">
            <p className="text-xs text-[#73726E]">
              {t('consent_revoke_hint')}{' '}
              <a href={`/${locale}/dashboard/settings`} className="text-[#012e7a] hover:underline">
                {t('consent_revoke_link')}
              </a>
            </p>
            <p className="text-xs text-[#73726E]">{t('consent_art15_hint')}</p>
          </div>
        </div>
      </div>

      {/* ─── Delete Account Modal ─────────────────────────── */}
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
                <h3 className="text-lg font-semibold text-[#37352F]">{t('delete_modal_title')}</h3>
                <button
                  onClick={() => { if (!deleting) { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(null); } }}
                  className="text-[#73726E] hover:text-[#37352F]"
                  disabled={deleting}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
                <p className="text-sm text-red-800 font-medium mb-1">⚠️ {t('delete_modal_warning_title')}</p>
                <p className="text-xs text-red-700">{t('delete_modal_warning_body')}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-800">{t('delete_modal_retention_notice')}</p>
              </div>

              <p className="text-sm text-[#73726E] mb-3">
                {t('delete_modal_confirm_label', { keyword: t('delete_modal_confirm_keyword') })}
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={t('delete_modal_confirm_keyword')}
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
                  {t('delete_modal_cancel')}
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white border-none disabled:opacity-40"
                  disabled={deleteConfirm !== t('delete_modal_confirm_keyword') || deleting}
                  onClick={async () => {
                    setDeleting(true);
                    setDeleteError(null);
                    try {
                      const res = await fetch('/api/account/delete', { method: 'DELETE' });
                      const data = await res.json();
                      if (!res.ok || !data.success) {
                        setDeleteError(data.error || t('delete_modal_error_fallback'));
                        setDeleting(false);
                        return;
                      }
                      const supabase = createClient();
                      await supabase.auth.signOut();
                      window.location.href = '/login';
                    } catch {
                      setDeleteError(t('delete_modal_error_network'));
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t('delete_modal_deleting')}</>
                  ) : (
                    t('delete_modal_confirm_cta')
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Footer ──────────────────────────────────────── */}
      <div className="text-center text-sm text-[#73726E] pt-4">
        {t('faq_link')}{' '}
        <a href="/legal/privacy-policy" className="text-[#012e7a] hover:underline inline-flex items-center gap-1">
          {t('privacy_policy_link')}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
