"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Video, Mic, Square, Upload, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { createClient } from '@/lib/supabase/client';
import { VideoScriptStudio } from './video-script-studio';
import { ScriptPreview } from './script-studio/script-preview';

interface Step5VideoProps {
    jobId: string;
    onScriptFound?: () => void;
}

type VideoState = 'loading' | 'consent' | 'script-studio' | 'record' | 'preview' | 'uploading' | 'done' | 'error';


export function Step5Video({ jobId, onScriptFound }: Step5VideoProps) {
    const [state, setState] = useState<VideoState>('loading');
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Script data for overlay during recording
    const [scriptBlocks, setScriptBlocks] = useState<{ id: string; title: string; content: string; durationSeconds: number; isRequired: boolean; templateId: string | null; sortOrder: number }[]>([]);
    const [scriptMode, setScriptMode] = useState<'teleprompter' | 'bullets'>('bullets');
    const [scriptWpm, setScriptWpm] = useState(130);

    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const previewRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Load initial status
    useEffect(() => {
        const loadStatus = async () => {
            try {
                const res = await fetch(`/api/video/status?jobId=${jobId}`);
                const data = await res.json();

                if (data.status === 'uploaded') {
                    setExpiresAt(data.expiresAt);
                    setState('done');
                } else if (data.status === 'prompts_ready' || data.hasScript) {
                    // Fix 9: Has video_approaches prompts OR video_scripts entry → skip consent
                    setState('script-studio');
                } else {
                    // No entry — show consent then script studio
                    setState('consent');
                }
            } catch {
                setState('consent');
            }
        };
        loadStatus();
    }, [jobId]);

    // Consent handler — log consent then proceed to talking points
    const handleConsent = async () => {
        // Log consent to consent_history (DSGVO)
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('consent_history').insert({
                    user_id: user.id,
                    document_type: 'ai_processing',  // Uses existing enum value
                    document_version: 'video_v1',     // Disambiguates from other ai_processing consents
                    consent_given: true,
                });
            }
        } catch (err) {
            console.error('[Step5Video] Consent logging failed:', err);
        }
        setState('script-studio');
    };

    // handleGenerate removed — generation is now handled by VideoScriptStudio

    // Fix 2: Synchronous callback — no extra API call, data comes via props
    const handleScriptReady = useCallback((scriptData: { blocks: { id: string; title: string; content: string; durationSeconds: number; isRequired: boolean; templateId: string | null; sortOrder: number }[]; mode: string; wpmSpeed: number }) => {
        setScriptBlocks(scriptData.blocks);
        setScriptMode(scriptData.mode as 'teleprompter' | 'bullets');
        setScriptWpm(scriptData.wpmSpeed);
        setState('record');
    }, []);

    // Start recording
    const startRecording = useCallback(async () => {
        setError(null);
        try {
            // Check browser support
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setError('Dein Browser unterstützt keine Videoaufnahme. Bitte verwende Chrome oder Firefox.');
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
            });
            streamRef.current = stream;

            // Show live preview
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }

            // Determine MIME type (Safari: mp4, Chrome: webm)
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : MediaRecorder.isTypeSupported('video/webm')
                    ? 'video/webm'
                    : 'video/mp4';

            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 1_500_000, // V3: Bitrate cap 1.5 Mbps
            });

            chunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                setRecordedBlob(blob);
                const url = URL.createObjectURL(blob);
                setPreviewUrl(url);
                setState('preview');
            };

            recorder.start(1000); // Collect data every second
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            setRecordingTime(0);

            // 60s timer
            let elapsed = 0;
            timerRef.current = setInterval(() => {
                elapsed += 1;
                setRecordingTime(elapsed);
                if (elapsed >= 60) {
                    stopRecording();
                }
            }, 1000);

        } catch (err) {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                setError('Kamera-Zugriff wurde verweigert. Bitte erlaube den Zugriff in deinen Browser-Einstellungen.');
            } else {
                setError('Kamera konnte nicht gestartet werden.');
            }
        }
    }, []);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        setIsRecording(false);
    }, []);

    // Upload video
    const handleUpload = async () => {
        if (!recordedBlob) return;
        setState('uploading');
        setError(null);
        setUploadProgress(0);

        try {
            // Step 1: Get signed URL
            const urlRes = await fetch('/api/video/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, action: 'get-signed-url' }),
            });
            const urlData = await urlRes.json();
            if (!urlRes.ok || !urlData.success) {
                throw new Error(urlData.error || 'Signed URL konnte nicht erstellt werden');
            }

            // Step 2: Upload blob directly to Supabase Storage via signed URL
            setUploadProgress(30);
            const uploadRes = await fetch(urlData.signedUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': recordedBlob.type,
                    'x-upsert': 'true',
                },
                body: recordedBlob,
            });

            if (!uploadRes.ok) {
                throw new Error('Upload an Supabase Storage fehlgeschlagen');
            }

            setUploadProgress(80);

            // Step 3: Confirm upload
            const confirmRes = await fetch('/api/video/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, action: 'confirm-upload' }),
            });
            const confirmData = await confirmRes.json();
            if (!confirmRes.ok || !confirmData.success) {
                throw new Error(confirmData.error || 'Upload-Bestätigung fehlgeschlagen');
            }

            setUploadProgress(100);
            setExpiresAt(confirmData.expiresAt);
            setState('done');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
            setState('preview'); // Go back to preview so user can retry
        }
    };

    // Re-record
    const handleReRecord = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setRecordedBlob(null);
        setPreviewUrl(null);
        setState('record');
    };

    // Cleanup
    useEffect(() => {
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            if (timerRef.current) clearInterval(timerRef.current);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // --- RENDER ---

    if (state === 'loading') {
        return (
            <div className="p-12 flex justify-center">
                <LoadingSpinner className="w-8 h-8 text-[#012e7a]" />
            </div>
        );
    }

    if (state === 'consent') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-6 py-12 flex flex-col items-center justify-center text-center bg-[#FAFAF9] rounded-b-xl border-t border-slate-200"
            >
                <h3 className="text-xl font-semibold text-[#37352F] mb-2">Video-Vorstellung</h3>
                <p className="text-slate-500 text-sm max-w-md mb-6 leading-relaxed">
                    Wir erstellen die <strong>Talking Points</strong>, damit du weißt was du in deinem <strong>1-Minuten-Video</strong> sagen sollst.
                    Das Video ist <strong>14 Tage</strong> verfügbar und wird danach automatisch gelöscht.
                </p>
                <button
                    onClick={handleConsent}
                    className="px-6 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-sm font-medium rounded-lg transition"
                >
                    Los geht&apos;s
                </button>
            </motion.div>
        );
    }

    if (state === 'script-studio') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <VideoScriptStudio
                    jobId={jobId}
                    onReady={handleScriptReady}
                    onScriptFound={onScriptFound}
                />
            </motion.div>
        );
    }

    if (state === 'record') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 bg-white border border-gray-200 rounded-xl max-w-2xl mx-auto space-y-5"
            >
                {/* Fix 3: Camera View with Script Overlay positioned OVER the video */}
                <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                    <video
                        ref={videoRef}
                        muted
                        playsInline
                        className="w-full h-full object-cover mirror"
                        style={{ transform: 'scaleX(-1)' }}
                    />

                    {/* Script Overlay — transparent, over camera feed */}
                    {scriptBlocks.length > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 rounded-b-xl pointer-events-auto z-10">
                            <ScriptPreview
                                blocks={scriptBlocks}
                                mode={scriptMode}
                                wpmSpeed={scriptWpm}
                                onWpmChange={setScriptWpm}
                                isOverlay={true}
                            />
                        </div>
                    )}

                    {isRecording && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded-full text-xs font-semibold animate-pulse z-20">
                            <div className="w-2 h-2 bg-white rounded-full" />
                            {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')} / 1:00
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex justify-center gap-4">
                    {!isRecording ? (
                        <button
                            onClick={startRecording}
                            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition flex items-center gap-2"
                        >
                            <Mic className="w-5 h-5" /> Aufnahme starten
                        </button>
                    ) : (
                        <button
                            onClick={stopRecording}
                            className="px-6 py-3 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-lg transition flex items-center gap-2"
                        >
                            <Square className="w-5 h-5" /> Aufnahme stoppen
                        </button>
                    )}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}
            </motion.div>
        );
    }

    if (state === 'preview') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 bg-white border border-gray-200 rounded-xl max-w-2xl mx-auto space-y-5"
            >
                <h3 className="text-lg font-semibold text-gray-900 text-center">Vorschau</h3>

                <div className="bg-black rounded-xl overflow-hidden aspect-video">
                    <video
                        ref={previewRef}
                        src={previewUrl || undefined}
                        controls
                        playsInline
                        className="w-full h-full"
                    />
                </div>

                <div className="flex justify-center gap-4">
                    <button
                        onClick={handleReRecord}
                        className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> Erneut aufnehmen
                    </button>
                    <button
                        onClick={handleUpload}
                        className="px-5 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white font-medium rounded-lg transition flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" /> Hochladen
                    </button>
                </div>
            </motion.div>
        );
    }

    if (state === 'uploading') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-12 bg-white border border-gray-200 rounded-xl max-w-sm mx-auto text-center space-y-5"
            >
                <LoadingSpinner className="w-10 h-10 text-[#012e7a] mx-auto" />
                <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Video wird hochgeladen…</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                        <motion.div
                            className="bg-[#012e7a] h-2 rounded-full"
                            initial={{ width: '0%' }}
                            animate={{ width: `${uploadProgress}%` }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{uploadProgress}%</p>
                </div>
            </motion.div>
        );
    }

    if (state === 'done') {
        const expiryFormatted = expiresAt
            ? new Date(expiresAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
            : null;

        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 bg-white border border-gray-200 rounded-xl max-w-sm mx-auto text-center space-y-5"
            >
                <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Video hochgeladen!</h3>
                    <p className="text-sm text-gray-500">
                        Dein Video ist über den QR-Code auf deinem Lebenslauf abrufbar.
                    </p>
                    {expiryFormatted && (
                        <p className="text-xs text-gray-400 mt-2">
                            Verfügbar bis {expiryFormatted}
                        </p>
                    )}
                </div>
                <button
                    onClick={handleReRecord}
                    className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition flex items-center gap-2 mx-auto"
                >
                    <RefreshCw className="w-4 h-4" /> Neues Video aufnehmen
                </button>
            </motion.div>
        );
    }

    // Error fallback
    return (
        <div className="p-8 bg-red-50 border border-red-200 rounded-xl max-w-sm mx-auto text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-sm text-red-700">{error || 'Ein unbekannter Fehler ist aufgetreten.'}</p>
            <button
                onClick={() => setState('consent')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm"
            >
                Erneut versuchen
            </button>
        </div>
    );
}
