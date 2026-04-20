"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import { Video, Mic, Square, Upload, RefreshCw, AlertTriangle, CheckCircle2, Trash2, ExternalLink, Eye } from 'lucide-react';
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
    const t = useTranslations('video_letter');
    const locale = useLocale();
    const [state, setState] = useState<VideoState>('loading');
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showPrivacyConsent, setShowPrivacyConsent] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [viewCount, setViewCount] = useState(0);
    const [firstViewedAt, setFirstViewedAt] = useState<string | null>(null);

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
                    setAccessToken(data.accessToken || null);
                    setViewCount(data.viewCount ?? 0);
                    setFirstViewedAt(data.firstViewedAt ?? null);
                    setState('done');
                } else if (data.status === 'prompts_ready' || data.hasScript) {
                    // QR token created or script already exists — skip consent, go straight to script studio
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


    // Synchronous callback — data comes via VideoScriptStudio props, no extra API call needed
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
                setError(t('record_camera_unsupported'));
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
                setError(t('record_camera_denied'));
            } else {
                setError(t('record_camera_failed'));
            }
        }
    }, [t]);

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
            // Step 1: Get signed URL — send mimeType so server can store correct extension
            const urlRes = await fetch('/api/video/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, action: 'get-signed-url', mimeType: recordedBlob.type }),
            });
            const urlData = await urlRes.json();
            if (!urlRes.ok || !urlData.success) {
                throw new Error(urlData.error || t('error_generic'));
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
                throw new Error(t('error_generic'));
            }

            setUploadProgress(80);

            // Step 3: Confirm upload — send mimeType again so confirm also derives correct path
            const confirmRes = await fetch('/api/video/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, action: 'confirm-upload', mimeType: recordedBlob.type }),
            });
            const confirmData = await confirmRes.json();
            if (!confirmRes.ok || !confirmData.success) {
                throw new Error(confirmData.error || t('error_generic'));
            }

            setUploadProgress(100);
            setExpiresAt(confirmData.expiresAt);
            setAccessToken(confirmData.accessToken || null);
            setViewCount(0);
            setFirstViewedAt(null);
            setState('done');

        } catch (err) {
            setError(err instanceof Error ? err.message : t('error_generic'));
            setState('preview'); // Go back to preview so user can retry
        }
    };

    // Re-record
    const handleReRecord = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setRecordedBlob(null);
        setPreviewUrl(null);
        setShowDeleteConfirm(false);
        setState('record');
    };

    // Delete video
    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch('/api/video/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || t('error_generic'));
                setIsDeleting(false);
                return;
            }
            // Reset UI — go back to script studio (script is preserved)
            setExpiresAt(null);
            setRecordedBlob(null);
            setPreviewUrl(null);
            setShowDeleteConfirm(false);
            setState('script-studio');
        } catch {
            setError(t('error_generic'));
        } finally {
            setIsDeleting(false);
        }
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
                <h3 className="text-xl font-semibold text-[#37352F] mb-2">{t('consent_title')}</h3>
                <p className="text-slate-500 text-sm max-w-md mb-6 leading-relaxed">
                    {t.rich('consent_description', {
                        strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                </p>
                <button
                    onClick={handleConsent}
                    className="px-6 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-sm font-medium rounded-lg transition"
                >
                    {t('consent_cta')}
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
                            <Mic className="w-5 h-5" /> {t('record_start')}
                        </button>
                    ) : (
                        <button
                            onClick={stopRecording}
                            className="px-6 py-3 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-lg transition flex items-center gap-2"
                        >
                            <Square className="w-5 h-5" /> {t('record_stop')}
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
                <h3 className="text-lg font-semibold text-gray-900 text-center">{t('preview_title')}</h3>

                <div className="bg-black rounded-xl overflow-hidden aspect-video">
                    <video
                        ref={previewRef}
                        src={previewUrl || undefined}
                        controls
                        playsInline
                        className="w-full h-full"
                    />
                </div>

                {/* Privacy consent inline card */}
                {showPrivacyConsent && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3"
                    >
                        <h4 className="text-sm font-semibold text-[#012e7a] flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            {t('upload_privacy_title')}
                        </h4>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('upload_privacy_body')}</p>
                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    setShowPrivacyConsent(false);
                                    // Log upload consent to consent_history (DSGVO Art. 7)
                                    try {
                                        const supabase = createClient();
                                        const { data: { user } } = await supabase.auth.getUser();
                                        if (user) {
                                            await supabase.from('consent_history').insert({
                                                user_id: user.id,
                                                document_type: 'ai_processing',
                                                document_version: 'video_upload_v1',
                                                consent_given: true,
                                            });
                                        }
                                    } catch (err) {
                                        console.error('[Step5Video] Upload consent logging failed:', err);
                                    }
                                    handleUpload();
                                }}
                                className="px-4 py-2 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-sm font-medium rounded-lg transition flex items-center gap-1.5"
                            >
                                <Upload className="w-3.5 h-3.5" /> {t('upload_privacy_confirm')}
                            </button>
                            <button
                                onClick={() => setShowPrivacyConsent(false)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                            >
                                {t('upload_privacy_cancel')}
                            </button>
                        </div>
                    </motion.div>
                )}

                <div className="flex justify-center gap-4">
                    <button
                        onClick={handleReRecord}
                        className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> {t('preview_re_record')}
                    </button>
                    <button
                        onClick={() => setShowPrivacyConsent(true)}
                        className="px-5 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white font-medium rounded-lg transition flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" /> {t('preview_upload')}
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
                    <p className="text-sm font-medium text-gray-900 mb-1">{t('upload_title')}</p>
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
            ? new Date(expiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
            : null;
        const previewHref = accessToken ? `/v/${accessToken}` : null;
        const fullPreviewUrl = accessToken ? `https://app.path-ly.eu/v/${accessToken}` : null;

        const firstViewDate = firstViewedAt
            ? new Date(firstViewedAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
            : null;
        const firstViewTime = firstViewedAt
            ? new Date(firstViewedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
            : null;

        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 bg-white border border-gray-200 rounded-xl max-w-md mx-auto space-y-5"
            >
                {/* Success header — left-aligned, no icon */}
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-gray-900">{t('done_title')}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                        {t('done_description')}
                    </p>
                </div>

                {/* Monitoring panel */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('done_monitor_label')}</p>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-slate-400" />
                            <div>
                                <p className="text-xl font-bold text-slate-800 leading-none">{viewCount}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{viewCount === 1 ? t('done_monitor_view_singular') : t('done_monitor_view_plural')}</p>
                            </div>
                        </div>
                        {firstViewDate && firstViewTime && (
                            <div>
                                <p className="text-xs font-medium text-slate-600">
                                    {t('done_monitor_first_view', { date: firstViewDate })}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {t('done_monitor_first_view_time', { time: firstViewTime })}
                                </p>
                            </div>
                        )}
                        {viewCount === 0 && (
                            <p className="text-xs text-slate-400">{t('done_monitor_not_viewed')}</p>
                        )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-200 pt-2.5">
                        {t('done_monitor_privacy')}
                    </p>
                </div>

                {/* Preview link box */}
                {previewHref && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('done_preview_label')}</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-1.5 truncate">
                                {fullPreviewUrl}
                            </code>
                            <a
                                href={previewHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-xs font-medium rounded-lg transition shrink-0"
                            >
                                <ExternalLink className="w-3 h-3" />
                                {t('done_preview_link')}
                            </a>
                        </div>
                        <p className="text-xs text-slate-400">
                            {t('done_preview_hint')}
                        </p>
                    </div>
                )}

                {/* 14-day deletion notice */}
                {expiryFormatted && (
                    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                        <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-amber-700">
                            <span className="font-semibold">{t('done_auto_delete_label')}</span> {t('done_expiry', { date: expiryFormatted })}. {t('done_auto_delete_suffix')}
                        </p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={handleReRecord}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition flex items-center gap-1.5"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> {t('done_new_recording')}
                    </button>
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg transition flex items-center gap-1.5"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> {t('done_delete_btn')}
                    </button>
                </div>

                {/* Inline Delete Confirmation */}
                {showDeleteConfirm && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left space-y-3"
                    >
                        <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4" />
                            {t('done_delete_confirm_title')}
                        </h4>
                        <p className="text-xs text-amber-700 leading-relaxed">
                            {t('done_delete_confirm_body')}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {isDeleting ? <LoadingSpinner className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                                {t('done_delete_confirm_yes')}
                            </button>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                            >
                                {t('done_delete_confirm_cancel')}
                            </button>
                        </div>
                    </motion.div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}
            </motion.div>
        );
    }


    // Error fallback
    return (
        <div className="p-8 bg-red-50 border border-red-200 rounded-xl max-w-sm mx-auto text-center space-y-4">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-sm text-red-700">{error || t('error_unknown')}</p>
            <button
                onClick={() => setState('consent')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm"
            >
                {t('error_retry')}
            </button>
        </div>
    );
}
