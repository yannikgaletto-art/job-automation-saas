/**
 * Re-Consent Banner
 *
 * DSGVO Art. 13/14: Non-blocking information update for existing users
 * when consent scope changes (v1.0 → v2.0).
 *
 * Shows a dismissable banner for users who onboarded with consent v1.0.
 * Since the Art. 9 consent is opt-IN (not a requirement change),
 * a non-blocking banner is legally sufficient — the PII sanitizer
 * already protects special category data by default.
 *
 * Dismiss state stored in localStorage (no DB write needed).
 * i18n: Uses next-intl for all text (de/en/es).
 */

'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, Info } from 'lucide-react';

const DISMISS_KEY = 'pathly_reconsent_v2_dismissed';

export function ReConsentBanner() {
    const [visible, setVisible] = useState(false);
    const t = useTranslations('reconsent_banner');

    useEffect(() => {
        // Check if already dismissed
        const dismissed = localStorage.getItem(DISMISS_KEY);
        if (dismissed) return;

        // Check if user has old consent version
        async function checkConsent() {
            try {
                const res = await fetch('/api/consent/record');
                if (!res.ok) return;

                const data = await res.json();
                const aiConsent = (data.consents || []).find(
                    (c: { document_type: string }) => c.document_type === 'ai_processing'
                );

                // Show banner if user has v1.0 consent (or no consent record)
                if (!aiConsent || aiConsent.document_version === 'v1.0') {
                    setVisible(true);
                }
            } catch {
                // Non-blocking — silently fail
            }
        }

        checkConsent();
    }, []);

    function handleDismiss() {
        localStorage.setItem(DISMISS_KEY, new Date().toISOString());
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900">
                    {t('title')}
                </p>
                <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                    {t('body')}{' '}
                    <a
                        href="/legal/privacy-policy"
                        className="underline hover:text-blue-900"
                    >
                        {t('link')}
                    </a>
                </p>
            </div>
            <button
                onClick={handleDismiss}
                className="text-blue-400 hover:text-blue-600 transition-colors flex-shrink-0"
                aria-label={t('dismiss_label')}
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
