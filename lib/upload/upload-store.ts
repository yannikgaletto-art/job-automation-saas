import { create } from 'zustand';
import type { CvStructuredData } from '@/types/cv';
import {
    getStagesForFile,
    computeStageProgress,
    computeFinishDurationMs,
    type ProgressStage,
} from '@/lib/upload/upload-stages';

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

            // Adaptive stages: simulation length scales with file size so small
            // CVs don't crawl through 51s of fake stages and large CVs don't
            // hit the 90% cap before the server is done.
            const stages: ProgressStage[] = getStagesForFile(file.size);

            const responseBody = await new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const startTime = Date.now();

                let simInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const { pct, statusKey } = computeStageProgress(elapsed, stages);
                    set({ progress: pct, statusKey });
                }, 200);

                const stopSim = () => {
                    if (simInterval) { clearInterval(simInterval); simInterval = null; }
                };

                xhr.onload = () => {
                    stopSim();
                    if (xhr.status >= 200 && xhr.status < 300) {
                        // Ramp current → 100 with duration scaled by remaining distance.
                        const elapsedAtResp = Date.now() - startTime;
                        const startPct = computeStageProgress(elapsedAtResp, stages).pct;
                        const finishMs = computeFinishDurationMs(startPct);
                        const animStart = Date.now();
                        const finishInterval = setInterval(() => {
                            const ratio = Math.min(1, (Date.now() - animStart) / finishMs);
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
