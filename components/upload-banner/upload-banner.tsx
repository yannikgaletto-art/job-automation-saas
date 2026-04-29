"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { ShieldCheck, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useUploadStore } from '@/lib/upload/upload-store';

/**
 * Sticky top-banner that surfaces an in-flight upload regardless of which
 * tab the user is on. At 100% it converts into a "Bitte prüfen" call-to-
 * action that opens the CV confirm dialog (rendered globally in the layout).
 */
export function UploadBanner() {
    const status = useUploadStore((s) => s.status);
    const progress = useUploadStore((s) => s.progress);
    const statusKey = useUploadStore((s) => s.statusKey);
    const fileName = useUploadStore((s) => s.fileName);
    const errorMessage = useUploadStore((s) => s.errorMessage);
    const reviewRequested = useUploadStore((s) => s.reviewRequested);
    const requestReview = useUploadStore((s) => s.requestReview);
    const dismissError = useUploadStore((s) => s.dismissError);
    const closeReview = useUploadStore((s) => s.closeReview);

    const t = useTranslations('upload');
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();

    // Hide the banner once the dialog is open — the CTA is redundant and the
    // floating top-strip looks visually disconnected from the dialog container.
    const visible = status !== 'idle' && !(status === 'pending_review' && reviewRequested);

    const handleReviewClick = () => {
        // If user isn't on the profile tab, navigate there first so the
        // confirm dialog renders alongside the rest of the profile context.
        if (!pathname.includes('/profil')) {
            router.push(`/${locale}/dashboard/profil`);
        }
        requestReview();
    };

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    key="upload-banner"
                    initial={{ y: -80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -80, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    className="fixed top-0 inset-x-0 z-[60] flex justify-center pt-3 px-3 pointer-events-none pl-64"
                >
                    <div className="pointer-events-auto w-full max-w-5xl">
                        {status === 'uploading' && (
                            <div className="bg-white border border-[#E7E7E5] rounded-xl shadow-lg px-4 py-3 ring-1 ring-[#012e7a]/10">
                                <div className="flex items-center gap-3 text-xs">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-3 mb-1.5">
                                            <span className="text-[#37352F] font-medium truncate">
                                                {fileName || t('status_uploading')}
                                            </span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {progress >= 20 && progress < 100 && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 font-medium">
                                                        <ShieldCheck className="w-3 h-3" />
                                                        EU
                                                    </span>
                                                )}
                                                <span className="font-mono text-[#73726E]">{progress}%</span>
                                            </div>
                                        </div>
                                        <div className="text-[#73726E] mb-1.5">
                                            {statusKey ? t(statusKey) : t('status_uploading')}
                                        </div>
                                        <div className="w-full bg-[#F7F7F5] rounded-full h-1.5">
                                            <div
                                                className="bg-[#012e7a] h-1.5 rounded-full transition-all duration-300"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {status === 'pending_review' && (
                            <div className="bg-white border border-[#012e7a]/30 rounded-xl shadow-lg px-4 py-3 ring-1 ring-[#012e7a]/10 flex items-center gap-3">
                                <div className="p-1.5 bg-[#F0F7FF] rounded-lg shrink-0">
                                    <CheckCircle2 className="w-5 h-5 text-[#012e7a]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#37352F] leading-tight">
                                        {t('banner_pending_title')}
                                    </p>
                                    <p className="text-xs text-[#73726E] mt-0.5 truncate">
                                        {fileName}
                                    </p>
                                </div>
                                <button
                                    onClick={handleReviewClick}
                                    className="px-3 py-1.5 text-xs font-medium bg-[#012e7a] text-white rounded-lg hover:bg-[#011f5e] transition-colors shrink-0"
                                >
                                    {t('banner_review_button')}
                                </button>
                                <button
                                    onClick={closeReview}
                                    className="text-[#A8A29E] hover:text-[#37352F] transition-colors p-1 shrink-0"
                                    title={t('banner_dismiss')}
                                    aria-label={t('banner_dismiss')}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="bg-white border border-red-300 rounded-xl shadow-lg px-4 py-3 ring-1 ring-red-100 flex items-center gap-3">
                                <div className="p-1.5 bg-red-50 rounded-lg shrink-0">
                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#37352F] leading-tight">
                                        {t('banner_error_title')}
                                    </p>
                                    <p className="text-xs text-[#73726E] mt-0.5 truncate">
                                        {errorMessage ?? t('banner_error_generic')}
                                    </p>
                                </div>
                                <button
                                    onClick={dismissError}
                                    className="text-[#A8A29E] hover:text-[#37352F] transition-colors p-1 shrink-0"
                                    title={t('banner_dismiss')}
                                    aria-label={t('banner_dismiss')}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
