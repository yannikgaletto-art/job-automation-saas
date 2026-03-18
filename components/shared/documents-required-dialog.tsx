'use client';

/**
 * DocumentsRequiredDialog — Shared popup for features that require CV/cover letter.
 * Shows when a user tries to use a feature that needs documents they haven't uploaded yet.
 * Navigates to Settings with a `returnTo` parameter so user is redirected back after upload.
 *
 * i18n: Uses useTranslations('documents_required').
 */

import { useRouter, usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { FileText, Upload } from 'lucide-react';

interface DocumentsRequiredDialogProps {
    open: boolean;
    onClose: () => void;
    /** Which document type is missing */
    type?: 'cv' | 'cover_letter' | 'both';
}

export function DocumentsRequiredDialog({
    open,
    onClose,
    type = 'cv',
}: DocumentsRequiredDialogProps) {
    const router = useRouter();
    const pathname = usePathname();
    const locale = useLocale();
    const t = useTranslations('documents_required');

    const messages: Record<string, { title: string; description: string }> = {
        cv: { title: t('cv_title'), description: t('cv_desc') },
        cover_letter: { title: t('cover_letter_title'), description: t('cover_letter_desc') },
        both: { title: t('both_title'), description: t('both_desc') },
    };

    const msg = messages[type] || messages.cv;

    const handleNavigateToSettings = () => {
        onClose();
        // QA Integration: returnTo parameter so Settings can redirect back after upload
        const returnTo = encodeURIComponent(pathname);
        router.push(`/${locale}/dashboard/settings?returnTo=${returnTo}`);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-[420px] bg-[#FAFAF9] border-[#E7E7E5]">
                <DialogHeader>
                    <div className="flex items-center justify-center mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                            <FileText className="w-7 h-7 text-amber-500" />
                        </div>
                    </div>
                    <DialogTitle className="text-center text-lg font-semibold text-[#37352F]">
                        {msg.title}
                    </DialogTitle>
                    <DialogDescription className="text-center text-sm text-[#9B9A97] mt-2 leading-relaxed">
                        {msg.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2 mt-4">
                    <button
                        onClick={handleNavigateToSettings}
                        className="w-full py-3 bg-[#002e7a] text-white border-none rounded-xl text-sm font-semibold cursor-pointer tracking-tight hover:bg-[#001d4f] transition-colors flex items-center justify-center gap-2"
                    >
                        <Upload className="w-4 h-4" />
                        {t('upload_btn')}
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 text-sm text-[#9B9A97] hover:text-[#37352F] transition-colors cursor-pointer"
                    >
                        {t('later_btn')}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
