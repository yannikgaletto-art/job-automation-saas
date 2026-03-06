'use client';

/**
 * DocumentsRequiredDialog — Shared popup for features that require CV/cover letter.
 * Shows when a user tries to use a feature that needs documents they haven't uploaded yet.
 * Navigates to Settings with a `returnTo` parameter so user is redirected back after upload.
 */

import { useRouter, usePathname } from 'next/navigation';
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

const MESSAGES: Record<string, { title: string; description: string }> = {
    cv: {
        title: 'Lebenslauf benötigt',
        description:
            'Um diese Funktion nutzen zu können, brauchen wir deinen Lebenslauf. Das Hochladen dauert nur 30 Sekunden.',
    },
    cover_letter: {
        title: 'Anschreiben benötigt',
        description:
            'Um personalisierte Anschreiben zu erstellen, brauchen wir ein Beispiel-Anschreiben von dir.',
    },
    both: {
        title: 'Dokumente benötigt',
        description:
            'Bitte lade deinen Lebenslauf und ein Anschreiben hoch, damit wir dir optimal helfen können.',
    },
};

export function DocumentsRequiredDialog({
    open,
    onClose,
    type = 'cv',
}: DocumentsRequiredDialogProps) {
    const router = useRouter();
    const pathname = usePathname();
    const msg = MESSAGES[type] || MESSAGES.cv;

    const handleNavigateToSettings = () => {
        onClose();
        // QA Integration: returnTo parameter so Settings can redirect back after upload
        const returnTo = encodeURIComponent(pathname);
        router.push(`/dashboard/settings?returnTo=${returnTo}`);
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
                        In den Settings hochladen
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 text-sm text-[#9B9A97] hover:text-[#37352F] transition-colors cursor-pointer"
                    >
                        Später
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
