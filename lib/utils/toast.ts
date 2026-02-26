/**
 * showSafeToast — Deduplicated toast notifications.
 *
 * Contract (SICHERHEITSARCHITEKTUR.md Section 4):
 * - Each toast appears at most ONCE per 5-second window for a given dedupKey.
 * - Prevents duplicate toasts when the same event fires rapidly (e.g. job added twice).
 *
 * Usage:
 *   showSafeToast('Job hinzugefügt', `job_added:${jobId}`);
 *   showSafeToast('Extraktion fehlgeschlagen', `extract_error:${jobId}`, 'error');
 */

import { toast } from 'sonner';

const activeToasts = new Set<string>();

export function showSafeToast(
    message: string,
    dedupKey: string,
    type: 'success' | 'error' | 'info' = 'success',
    description?: string,
): void {
    if (activeToasts.has(dedupKey)) return; // ← Deduplicated: same key already active

    activeToasts.add(dedupKey);

    if (type === 'error') {
        toast.error(message, description ? { description } : undefined);
    } else if (type === 'info') {
        toast.info(message, description ? { description } : undefined);
    } else {
        toast.success(message, description ? { description } : undefined);
    }

    // Allow same key again after 5 seconds
    setTimeout(() => activeToasts.delete(dedupKey), 5_000);
}
