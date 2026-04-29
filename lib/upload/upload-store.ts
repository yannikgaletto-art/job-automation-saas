import { create } from 'zustand';
import type { CvStructuredData } from '@/types/cv';

export type UploadStatus = 'idle' | 'uploading' | 'pending_review' | 'error';
export type UploadType = 'cv' | 'cover_letter';

interface UploadState {
    status: UploadStatus;
    progress: number;
    statusKey: string;            // i18n key, e.g. 'status_extracting'
    type: UploadType | null;
    fileName: string | null;
    documentId: string | null;
    parsedData: CvStructuredData | null;
    errorMessage: string | null;
    reviewRequested: boolean;     // true → CvEditConfirmDialog should mount

    startUpload: (file: File, type: UploadType, opts: {
        onSuccess?: (payload: { documentId: string | null; parsedData: CvStructuredData | null; type: UploadType }) => void;
        onClUploaded?: () => void;
    }) => Promise<void>;
    requestReview: () => void;
    closeReview: () => void;
    dismissError: () => void;
    reset: () => void;
}

// Mirrors active-cv-card.tsx — kept here so the store owns the simulation.
const SIMULATION_STAGES: { atSec: number; pct: number; statusKey: string }[] = [
    { atSec: 0, pct: 0, statusKey: 'status_uploading' },
    { atSec: 1, pct: 10, statusKey: 'status_uploading' },
    { atSec: 9, pct: 20, statusKey: 'status_analyzing' },
    { atSec: 21, pct: 40, statusKey: 'status_extracting' },
    { atSec: 41, pct: 60, statusKey: 'status_saving' },
    { atSec: 51, pct: 90, statusKey: 'status_formulating' },
];

export function computeSimulatedProgress(elapsedMs: number): { pct: number; statusKey: string } {
    const sec = elapsedMs / 1000;
    for (let i = 0; i < SIMULATION_STAGES.length - 1; i++) {
        const a = SIMULATION_STAGES[i];
        const b = SIMULATION_STAGES[i + 1];
        if (sec < b.atSec) {
            const ratio = (sec - a.atSec) / (b.atSec - a.atSec);
            return {
                pct: Math.round(a.pct + ratio * (b.pct - a.pct)),
                statusKey: b.statusKey,
            };
        }
    }
    const last = SIMULATION_STAGES[SIMULATION_STAGES.length - 1];
    return { pct: last.pct, statusKey: last.statusKey };
}

const INITIAL: Pick<UploadState, 'status' | 'progress' | 'statusKey' | 'type' | 'fileName' | 'documentId' | 'parsedData' | 'errorMessage' | 'reviewRequested'> = {
    status: 'idle',
    progress: 0,
    statusKey: '',
    type: null,
    fileName: null,
    documentId: null,
    parsedData: null,
    errorMessage: null,
    reviewRequested: false,
};

export const useUploadStore = create<UploadState>((set, get) => ({
    ...INITIAL,

    startUpload: async (file, type, opts) => {
        if (get().status === 'uploading') return; // single-flight
        set({
            ...INITIAL,
            status: 'uploading',
            type,
            fileName: file.name,
            statusKey: 'status_uploading',
        });

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('type', type);

            const responseBody = await new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const startTime = Date.now();

                let simInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const { pct, statusKey } = computeSimulatedProgress(elapsed);
                    set({ progress: pct, statusKey });
                }, 200);

                const stopSim = () => {
                    if (simInterval) { clearInterval(simInterval); simInterval = null; }
                };

                xhr.onload = () => {
                    stopSim();
                    if (xhr.status >= 200 && xhr.status < 300) {
                        // Smooth ramp from current pct → 100 over 5s, then resolve.
                        const elapsedAtResp = Date.now() - startTime;
                        const startPct = computeSimulatedProgress(elapsedAtResp).pct;
                        const animStart = Date.now();
                        const finishInterval = setInterval(() => {
                            const ratio = Math.min(1, (Date.now() - animStart) / 5000);
                            set({ progress: Math.round(startPct + ratio * (100 - startPct)) });
                            if (ratio >= 1) {
                                clearInterval(finishInterval);
                                set({ statusKey: 'status_done' });
                                resolve(xhr.responseText);
                            }
                        }, 100);
                    } else {
                        try {
                            const body = JSON.parse(xhr.responseText);
                            reject(new Error(body.error || 'Upload fehlgeschlagen'));
                        } catch {
                            reject(new Error('Upload fehlgeschlagen'));
                        }
                    }
                };

                xhr.onerror = () => { stopSim(); reject(new Error('Netzwerkfehler beim Upload')); };
                xhr.open('POST', '/api/documents/upload');
                xhr.send(fd);
            });

            // Parse server response
            if (type === 'cv') {
                let documentId: string | null = null;
                let parsedData: CvStructuredData | null = null;
                try {
                    const parsed = JSON.parse(responseBody);
                    documentId = (parsed?.data?.document_ids?.cv as string | null | undefined) ?? null;
                    parsedData = (parsed?.data?.cv_parsed as CvStructuredData | null | undefined) ?? null;
                } catch {
                    /* ignore parse failure — fall through to "uploaded but no review data" */
                }

                if (documentId && parsedData) {
                    set({
                        status: 'pending_review',
                        progress: 100,
                        documentId,
                        parsedData,
                    });
                } else {
                    set({ ...INITIAL });
                }
                opts.onSuccess?.({ documentId, parsedData, type });
            } else {
                // Cover letter — no review step
                set({ ...INITIAL });
                opts.onClUploaded?.();
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
            set({ status: 'error', errorMessage: errMsg, progress: 0 });
            console.error('[upload-store] failed:', errMsg);
        }
    },

    requestReview: () => set({ reviewRequested: true }),
    closeReview: () => set({ ...INITIAL }),
    dismissError: () => set({ ...INITIAL }),
    reset: () => set({ ...INITIAL }),
}));
