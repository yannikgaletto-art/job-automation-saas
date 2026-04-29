"use client";

import { useEffect } from 'react';
import { useUploadStore } from '@/lib/upload/upload-store';
import { CvEditConfirmDialog } from '@/components/profil/cv-edit-confirm-dialog';
import { usePathname } from 'next/navigation';

/**
 * Global mount point for the CV review dialog.
 *
 * The dialog appears in two scenarios:
 *   1. The upload finished while the user was on the profile tab → auto-open.
 *   2. The upload finished elsewhere → user clicks "Bitte prüfen" in the
 *      banner → `requestReview()` flips the flag → dialog mounts here.
 *
 * Living globally means the dialog survives tab switches: if the user is on
 * /dashboard/job-search when the upload finishes, the banner is the prompt
 * and the dialog mounts on whatever page they navigate to.
 */
export function GlobalCvConfirmBridge() {
    const status = useUploadStore((s) => s.status);
    const reviewRequested = useUploadStore((s) => s.reviewRequested);
    const documentId = useUploadStore((s) => s.documentId);
    const parsedData = useUploadStore((s) => s.parsedData);
    const requestReview = useUploadStore((s) => s.requestReview);
    const closeReview = useUploadStore((s) => s.closeReview);
    const pathname = usePathname();

    // Auto-open on profile tab (preserves the pre-banner UX). When the user is
    // already on /profil at the moment the upload completes, opening the dialog
    // immediately matches what they expect.
    useEffect(() => {
        if (status === 'pending_review' && !reviewRequested && pathname.includes('/profil')) {
            requestReview();
        }
    }, [status, reviewRequested, pathname, requestReview]);

    if (status !== 'pending_review' || !reviewRequested || !documentId || !parsedData) {
        return null;
    }

    return (
        <CvEditConfirmDialog
            cvDocumentId={documentId}
            parsedData={parsedData}
            onClose={closeReview}
            onSaved={closeReview}
        />
    );
}
