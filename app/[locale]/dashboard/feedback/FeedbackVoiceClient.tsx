"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Mic, MicOff, Send, Check, Loader2, Gift } from 'lucide-react';

type FormState = 'idle' | 'submitting' | 'done' | 'error';
type RecordingState = 'idle' | 'recording' | 'transcribing';

// Organic drift for the pills (horizontal only, no checkmarks)
const DRIFT = [0, 28, 8, 20];
const ROT   = [-0.8, 1.5, -1.2, 0.6];

// Max recording duration: 5 minutes (300 000 ms)
const MAX_RECORDING_MS = 5 * 60 * 1000;

export function FeedbackVoiceClient() {
    const t = useTranslations('feedback_voice');
    const tBilling = useTranslations('billing');
    const locale = useLocale();
    const searchParams = useSearchParams();
    const isCreditMode = searchParams.get('credits') === 'true';

    const [formState, setFormState]         = useState<FormState>('idle');
    const [feedback, setFeedback]           = useState('');
    const [userName, setUserName]           = useState('');
    const [errorMsg, setErrorMsg]           = useState('');
    const [recordingState, setRecordingState] = useState<RecordingState>('idle');
    const [creditsGranted, setCreditsGranted] = useState(false);
    const [creditError, setCreditError]     = useState('');

    const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
    const audioChunksRef    = useRef<Blob[]>([]);
    const textareaRef       = useRef<HTMLTextAreaElement>(null);
    const autoStopTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Capture handleSubmit in a ref so the auto-stop timer closure always sees
    // the latest feedback value without needing it in the dependency array.
    const handleSubmitRef = useRef<(() => void) | null>(null);

    const isValid    = feedback.trim().length > 10;
    // Expanded = more than one visible line (~52px = single line incl padding)
    const isExpanded = (textareaRef.current?.scrollHeight ?? 0) > 58 || feedback.includes('\n');

    // Auto-resize textarea on every feedback change
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [feedback]);

    // Pre-fill name silently from auth session — first name only
    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            const fullName = data?.user?.user_metadata?.full_name || '';
            const firstName = fullName.split(' ')[0] || data?.user?.email?.split('@')[0] || '';
            setUserName(firstName);
        });
    }, []);

    const questions = [
        t('question_1'),
        t('question_2'),
        t('question_3'),
        // t('question_4'), // TODO: später einblenden (Wunschpaket 10€-Frage)
    ];

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (formState === 'submitting') return;
        // Allow submit even if text came from voice (might be exactly 10 chars)
        if (feedback.trim().length < 5) return;

        setFormState('submitting');
        setErrorMsg('');

        try {
            const res = await fetch('/api/feedback/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    feedback: feedback.trim(),
                    name: userName.trim() || null,
                    locale,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                setErrorMsg(res.status === 429 ? t('error_rate_limit') : (data.error || t('error_generic')));
                setFormState('error');
                return;
            }

            // ── Credit Grant (if navigated from paywall modal) ───────────
            if (isCreditMode) {
                try {
                    const creditRes = await fetch('/api/feedback/credit-grant', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            rating: 5, // Voice feedback = high engagement = 5 stars
                            tags: ['voice_feedback'],
                            message: feedback.trim().slice(0, 500),
                            locale,
                        }),
                    });
                    const creditData = await creditRes.json();
                    if (creditRes.ok && creditData.success) {
                        setCreditsGranted(true);
                    } else if (creditRes.status === 409) {
                        setCreditError(tBilling('feedback_already_claimed'));
                    }
                    // Non-blocking: if credit grant fails, feedback was still saved
                } catch {
                    console.warn('[FeedbackVoice] Credit grant failed (non-blocking)');
                }
            }

            // 🎉 Confetti
            import('canvas-confetti').then(({ default: confetti }) => {
                confetti({ particleCount: 70, angle: 60,  spread: 55, origin: { x: 0, y: 0.8 }, colors: ['#012e7a', '#A8C4E6', '#00B870'] });
                setTimeout(() => confetti({ particleCount: 70, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: ['#012e7a', '#A8C4E6', '#00B870'] }), 250);
            });

            setTimeout(() => setFormState('done'), 1000);

        } catch {
            setErrorMsg(t('error_generic'));
            setFormState('error');
        }
    }, [feedback, userName, locale, formState, t, isCreditMode, tBilling]);

    // Keep the ref current so the auto-stop timer always sees the latest version
    useEffect(() => {
        handleSubmitRef.current = () => handleSubmit();
    }, [handleSubmit]);

    // ── Voice Recording ─────────────────────────────────────────────────────
    const stopRecording = useCallback(() => {
        if (autoStopTimerRef.current) {
            clearTimeout(autoStopTimerRef.current);
            autoStopTimerRef.current = null;
        }
        mediaRecorderRef.current?.stop();
    }, []);

    const handleMicClick = useCallback(async () => {
        if (recordingState === 'recording') {
            stopRecording();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current   = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                setRecordingState('transcribing');

                try {
                    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                    const formData  = new FormData();
                    formData.append('file', audioBlob, 'audio.webm');
                    formData.append('model', 'whisper-1');
                    const lang = locale === 'de' ? 'de' : locale === 'es' ? 'es' : 'en';
                    formData.append('language', lang);

                    const res = await fetch('/api/feedback/transcribe', {
                        method: 'POST',
                        body: formData,
                    });

                    if (res.ok) {
                        const { text } = await res.json();
                        if (text?.trim()) {
                            setFeedback(prev => prev ? `${prev} ${text.trim()}` : text.trim());
                            // Text lands in the input field — user reviews and sends manually
                            setTimeout(() => textareaRef.current?.focus(), 100);
                        }
                    }
                } catch (err) {
                    console.error('[voice] Transcription failed:', err);
                } finally {
                    setRecordingState('idle');
                }
            };

            recorder.start();
            setRecordingState('recording');

            // Auto-stop after MAX_RECORDING_MS (5 min)
            autoStopTimerRef.current = setTimeout(() => {
                autoStopTimerRef.current = null; // signal: timer-triggered stop
                mediaRecorderRef.current?.stop();
            }, MAX_RECORDING_MS);

        } catch (err) {
            console.error('[voice] Mic access denied:', err);
            setRecordingState('idle');
        }
    }, [recordingState, locale, stopRecording]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // Single Enter = submit (like a modern chat)
            e.preventDefault();
            handleSubmit();
        }
        // Shift+Enter = natural newline (textarea default, no override needed)
    };

    // Cleanup timer on unmount
    useEffect(() => () => {
        if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    }, []);

    // ── Success ──────────────────────────────────────────────────────────────
    if (formState === 'done') {
        return (
            <div className="min-h-[calc(100vh-4rem)] bg-[#FAFAF8] flex items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                    className="text-center"
                >
                    <div className="w-16 h-16 bg-[#00B870]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check className="w-8 h-8 text-[#00B870]" strokeWidth={3} />
                    </div>
                    <p className="text-[1.5rem] font-semibold text-[#1C1917] max-w-[36ch] leading-snug">
                        {t.rich('success_message', {
                            name: userName || 'dir',
                        })}
                    </p>
                    {/* Credits banner */}
                    {isCreditMode && creditsGranted && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="mt-4 inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium"
                        >
                            <Gift className="w-4 h-4" />
                            {tBilling('feedback_success_title')}
                        </motion.div>
                    )}
                    {isCreditMode && creditError && (
                        <p className="mt-3 text-sm text-amber-600">{creditError}</p>
                    )}
                </motion.div>
            </div>
        );
    }

    // ── Main ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-[calc(100vh-4rem)] bg-[#FAFAF8] flex justify-center pt-12 md:pt-20 px-6">
            <div className="max-w-2xl w-full flex flex-col">

                {/* ── Credit Mode Banner ── */}
                {isCreditMode && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="mb-6 flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3"
                    >
                        <Gift className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                        <p className="text-sm text-emerald-800">
                            {tBilling('feedback_cta_desc')}
                        </p>
                    </motion.div>
                )}

                {/* ── Header ── */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="mb-10"
                >
                    <h1 className="text-[2.1rem] md:text-[2.6rem] font-bold text-[#1C1917] tracking-tight leading-tight">
                        {t('title')}
                    </h1>
                </motion.div>

                {/* ── Falling Pills — Bild 1 style, no checkmarks (Feedback 1) ── */}
                <div
                    className="flex flex-col gap-[14px] pb-10 overflow-x-visible relative"
                    style={{
                        WebkitMaskImage: 'linear-gradient(to right, black 60%, transparent 100%)',
                        maskImage: 'linear-gradient(to right, black 60%, transparent 100%)',
                    }}
                >
                    {questions.map((q, i) => (
                        <motion.div
                            key={`${locale}-${i}`}
                            initial={{ opacity: 0, y: -70, rotate: ROT[i] - 4 }}
                            animate={{ opacity: 1, y: 0, rotate: ROT[i] }}
                            transition={{
                                type: 'spring',
                                stiffness: 320,
                                damping: 26,
                                mass: 0.75,
                                delay: i * 0.11,
                            }}
                            className="self-start flex items-center bg-white rounded-2xl px-5 py-3 border border-[#E7E7E5] max-w-[26rem]"
                            style={{
                                marginLeft: `${DRIFT[i]}px`,
                                boxShadow: '0 3px 12px -2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)',
                            }}
                        >
                            {/* No icon, no dash — clean pill (Feedback 1 + 4) */}
                            <span className="text-[14.5px] font-semibold text-[#37352F] tracking-tight leading-snug">
                                {q}
                            </span>
                        </motion.div>
                    ))}
                </div>

                {/* ── Trennstrich ── */}
                <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.9, delay: 0.65, ease: 'easeOut' }}
                    className="w-full h-px bg-[#E0DDD8] origin-left"
                />

                {/* ── Input Area — Pill → Card morph ── */}
                <motion.form
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.85, ease: 'easeOut' }}
                    onSubmit={handleSubmit}
                    className="w-full pt-7 pb-10"
                >
                    {/* Morphing container: pill when collapsed, card when expanded */}
                    <motion.div
                        layout
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className={`relative w-full border transition-colors duration-300 ${
                            formState === 'error'
                                ? 'border-[#E8490F]/30 bg-[#FFF9F7]'
                                : 'border-[#E7E7E5] bg-[#F3F4F6] focus-within:bg-white focus-within:border-[#C8C4BF]'
                        } ${
                            isExpanded
                                ? 'rounded-2xl px-5 pt-4 pb-4 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)]'
                                : 'rounded-full pl-6 pr-3 py-[11px]'
                        }`}
                    >
                        {/* Collapsed row: textarea + inline buttons */}
                        {!isExpanded ? (
                            <div className="flex items-center gap-2">
                                <textarea
                                    ref={textareaRef}
                                    rows={1}
                                    value={feedback}
                                    onChange={(e) => {
                                        setFeedback(e.target.value);
                                        if (formState === 'error') setFormState('idle');
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder={t('placeholder')}
                                    style={{ resize: 'none', overflow: 'hidden' }}
                                    className="flex-1 bg-transparent outline-none text-[15px] text-[#1C1917] placeholder:text-[#B0A99E] leading-[1.5] py-[6px]"
                                    disabled={formState === 'submitting'}
                                    autoComplete="off"
                                />
                                {/* Inline mic */}
                                <div className="relative shrink-0 flex items-center justify-center">
                                    {recordingState === 'recording' && (
                                        <span className="absolute inset-0 rounded-full animate-[voice-pulse_1.5s_ease-in-out_infinite] bg-[#012e7a]/40" />
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleMicClick}
                                        disabled={formState === 'submitting'}
                                        className={`relative z-10 w-[44px] h-[44px] rounded-full flex items-center justify-center border transition-all duration-200 focus:outline-none ${
                                            recordingState === 'recording'
                                                ? 'bg-[#012e7a] border-[#012e7a]'
                                                : recordingState === 'transcribing'
                                                    ? 'bg-[#F3F4F6] border-[#E7E7E5] cursor-wait'
                                                    : 'bg-transparent border-transparent hover:bg-[#E8E8E8]'
                                        }`}
                                        title={recordingState === 'recording' ? 'Aufnahme stoppen' : 'Sprachnotiz aufnehmen'}
                                    >
                                        {recordingState === 'transcribing' ? (
                                            <Loader2 className="w-4 h-4 text-[#73726E] animate-spin" />
                                        ) : recordingState === 'recording' ? (
                                            <MicOff className="w-4 h-4 text-white" />
                                        ) : (
                                            <Mic className="w-4 h-4 text-[#73726E]" />
                                        )}
                                    </button>
                                </div>
                                {/* Inline send */}
                                <button
                                    type="submit"
                                    disabled={!isValid || formState === 'submitting'}
                                    className={`w-[44px] h-[44px] rounded-full flex items-center justify-center shrink-0 transition-all duration-300 focus:outline-none ${
                                        isValid
                                            ? 'bg-[#012e7a] hover:bg-[#023a97] shadow-sm cursor-pointer'
                                            : 'bg-[#E5E7EB] cursor-not-allowed'
                                    }`}
                                >
                                    {formState === 'submitting' ? (
                                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                                    ) : (
                                        <Send
                                            className={`w-4 h-4 ${isValid ? 'text-white' : 'text-[#A8A29E]'}`}
                                            style={{
                                                transform: isValid ? 'translate(1px, -1px)' : 'none',
                                                transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                            }}
                                        />
                                    )}
                                </button>
                            </div>
                        ) : (
                            /* ── Expanded card layout ── */
                            <>
                                <textarea
                                    ref={textareaRef}
                                    rows={1}
                                    value={feedback}
                                    onChange={(e) => {
                                        setFeedback(e.target.value);
                                        if (formState === 'error') setFormState('idle');
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder={t('placeholder')}
                                    style={{ resize: 'none', overflow: 'hidden', minHeight: '80px' }}
                                    className="w-full bg-transparent outline-none text-[15px] text-[#1C1917] placeholder:text-[#B0A99E] leading-[1.6] pb-12"
                                    disabled={formState === 'submitting'}
                                    autoComplete="off"
                                />
                                {/* Hint + Buttons pinned bottom-right */}
                                <div className="absolute bottom-3 left-5 right-3 flex items-center justify-between">
                                    <span className="text-[11px] text-[#C4BFB9] select-none">
                                        Enter ↵ senden · Shift+Enter neue Zeile
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {/* Mic */}
                                        <div className="relative shrink-0 flex items-center justify-center">
                                            {recordingState === 'recording' && (
                                                <span className="absolute inset-0 rounded-full animate-[voice-pulse_1.5s_ease-in-out_infinite] bg-[#012e7a]/40" />
                                            )}
                                            <button
                                                type="button"
                                                onClick={handleMicClick}
                                                disabled={formState === 'submitting'}
                                                className={`relative z-10 w-[40px] h-[40px] rounded-full flex items-center justify-center border transition-all duration-200 focus:outline-none ${
                                                    recordingState === 'recording'
                                                        ? 'bg-[#012e7a] border-[#012e7a]'
                                                        : recordingState === 'transcribing'
                                                            ? 'bg-[#F3F4F6] border-[#E7E7E5] cursor-wait'
                                                            : 'bg-[#F3F4F6] border-[#E7E7E5] hover:bg-[#E8E8E8]'
                                                }`}
                                                title={recordingState === 'recording' ? 'Aufnahme stoppen' : 'Sprachnotiz aufnehmen'}
                                            >
                                                {recordingState === 'transcribing' ? (
                                                    <Loader2 className="w-4 h-4 text-[#73726E] animate-spin" />
                                                ) : recordingState === 'recording' ? (
                                                    <MicOff className="w-4 h-4 text-white" />
                                                ) : (
                                                    <Mic className="w-4 h-4 text-[#73726E]" />
                                                )}
                                            </button>
                                        </div>
                                        {/* Send */}
                                        <button
                                            type="submit"
                                            disabled={!isValid || formState === 'submitting'}
                                            className={`w-[40px] h-[40px] rounded-full flex items-center justify-center shrink-0 transition-all duration-300 focus:outline-none ${
                                                isValid
                                                    ? 'bg-[#012e7a] hover:bg-[#023a97] shadow-sm cursor-pointer'
                                                    : 'bg-[#E5E7EB] cursor-not-allowed'
                                            }`}
                                        >
                                            {formState === 'submitting' ? (
                                                <Loader2 className="w-4 h-4 text-white animate-spin" />
                                            ) : (
                                                <Send
                                                    className={`w-4 h-4 ${isValid ? 'text-white' : 'text-[#A8A29E]'}`}
                                                    style={{
                                                        transform: isValid ? 'translate(1px, -1px)' : 'none',
                                                        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                    }}
                                                />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                </motion.form>

                {/* Error Banner */}
                <AnimatePresence>
                    {formState === 'error' && errorMsg && (
                        <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-[#E8490F] text-[13px] text-center font-medium pb-4"
                        >
                            {errorMsg}
                        </motion.p>
                    )}
                </AnimatePresence>

            </div>
        </div>
    );
}
