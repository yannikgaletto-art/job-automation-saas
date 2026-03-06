/**
 * useVoiceRecorder Hook
 * Feature-Silo: coaching
 * 
 * Handles microphone recording with:
 * - Safari/Chrome MIME type detection
 * - 60-second max recording limit
 * - Tab-switch / visibility cleanup
 * - DSGVO consent check (localStorage-based)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type RecordingState = 'idle' | 'recording' | 'transcribing';

const CONSENT_KEY = 'pathly_voice_consent';
const MAX_RECORDING_MS = 60_000; // 1 minute hard limit

interface UseVoiceRecorderOptions {
    onTranscription: (text: string) => void;
    onError: (message: string) => void;
}

interface UseVoiceRecorderReturn {
    state: RecordingState;
    elapsedSeconds: number;
    isMicAvailable: boolean;
    hasConsent: boolean;
    startRecording: () => void;
    stopRecording: () => void;
    grantConsent: () => void;
    denyConsent: () => void;
    needsConsent: boolean;
}

/**
 * Detect the best supported audio MIME type for this browser.
 * Safari doesn't support webm → use mp4/aac fallback.
 */
function getSupportedMimeType(): string {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
    ];
    for (const type of types) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return 'audio/webm'; // fallback
}

function getFileExtension(mimeType: string): string {
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
}

export function useVoiceRecorder({
    onTranscription,
    onError,
}: UseVoiceRecorderOptions): UseVoiceRecorderReturn {
    const [state, setState] = useState<RecordingState>('idle');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [isMicAvailable, setIsMicAvailable] = useState(true);
    const [hasConsent, setHasConsent] = useState(false);
    const [needsConsent, setNeedsConsent] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number>(0);
    const streamRef = useRef<MediaStream | null>(null);
    const mimeTypeRef = useRef<string>('audio/webm');

    // Check consent on mount
    useEffect(() => {
        const consent = localStorage.getItem(CONSENT_KEY);
        setHasConsent(consent === 'true');
    }, []);

    // Check mic availability on mount
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setIsMicAvailable(false);
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupRecording();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Tab visibility change — stop recording if user switches tabs
    useEffect(() => {
        function handleVisibilityChange() {
            if (document.hidden && state === 'recording') {
                stopRecording();
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    function cleanupRecording() {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
                mediaRecorderRef.current.stop();
            } catch { /* ignore */ }
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        chunksRef.current = [];
    }

    function grantConsent() {
        localStorage.setItem(CONSENT_KEY, 'true');
        setHasConsent(true);
        setNeedsConsent(false);
    }

    function denyConsent() {
        localStorage.setItem(CONSENT_KEY, 'false');
        setHasConsent(false);
        setNeedsConsent(false);
    }

    const startRecording = useCallback(async () => {
        // Check consent first
        if (!hasConsent) {
            setNeedsConsent(true);
            return;
        }

        if (!isMicAvailable) {
            onError('Kein Mikrofon verfügbar. Bitte überprüfe deine Browser-Einstellungen.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                },
            });
            streamRef.current = stream;

            const mimeType = getSupportedMimeType();
            mimeTypeRef.current = mimeType;

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                handleRecordingComplete();
            };

            recorder.onerror = () => {
                cleanupRecording();
                setState('idle');
                setElapsedSeconds(0);
                onError('Aufnahme wurde unterbrochen. Bitte versuche es erneut.');
            };

            recorder.start(1000); // Collect data every 1s
            startTimeRef.current = Date.now();
            setState('recording');
            setElapsedSeconds(0);

            // Timer for UI + auto-stop at 60s
            timerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                setElapsedSeconds(elapsed);

                if (elapsed >= 60) {
                    stopRecording();
                }
            }, 1000);

        } catch (err) {
            console.error('[Voice] getUserMedia error:', err);
            setIsMicAvailable(false);
            onError('Mikrofon-Zugriff verweigert. Bitte erlaube den Zugriff in deinen Browser-Einstellungen.');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasConsent, isMicAvailable, onError]);

    const stopRecording = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        // Stop all tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    async function handleRecordingComplete() {
        const chunks = chunksRef.current;
        if (chunks.length === 0) {
            setState('idle');
            setElapsedSeconds(0);
            onError('Keine Audio-Daten aufgenommen.');
            return;
        }

        setState('transcribing');
        setElapsedSeconds(0);

        const audioBlob = new Blob(chunks, { type: mimeTypeRef.current });
        chunksRef.current = [];

        // Check minimum size (very short recordings produce bad results)
        if (audioBlob.size < 1000) {
            setState('idle');
            onError('Aufnahme zu kurz. Bitte sprich mindestens 1 Sekunde.');
            return;
        }

        try {
            const ext = getFileExtension(mimeTypeRef.current);
            const formData = new FormData();
            formData.append('audio', audioBlob, `recording.${ext}`);

            const res = await fetch('/api/coaching/transcribe', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Transkription fehlgeschlagen');
            }

            onTranscription(data.text);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Transkription fehlgeschlagen';
            onError(msg);
        } finally {
            setState('idle');
        }
    }

    return {
        state,
        elapsedSeconds,
        isMicAvailable,
        hasConsent,
        startRecording,
        stopRecording,
        grantConsent,
        denyConsent,
        needsConsent,
    };
}
