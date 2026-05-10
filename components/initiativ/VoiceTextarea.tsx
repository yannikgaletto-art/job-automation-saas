"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff } from 'lucide-react';

type RecordingState = 'idle' | 'recording' | 'transcribing';

type VoiceTextareaProps = {
    id: string;
    value: string;
    onChange: (next: string) => void;
    placeholder: string;
    rows?: number;
    maxLength?: number;
    locale: 'de' | 'en' | 'es';
    micLabelStart: string;
    micLabelStop: string;
    micLabelTranscribing: string;
    micErrorLabel: string;
    onTranscribeError?: (message: string) => void;
};

const MAX_RECORDING_MS = 60 * 1000;

export function VoiceTextarea({
    id,
    value,
    onChange,
    placeholder,
    rows = 4,
    maxLength = 900,
    locale,
    micLabelStart,
    micLabelStop,
    micLabelTranscribing,
    micErrorLabel,
    onTranscribeError,
}: VoiceTextareaProps) {
    const [recordingState, setRecordingState] = useState<RecordingState>('idle');
    const [localError, setLocalError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (recordingState === 'transcribing') return;

        setLocalError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                stream.getTracks().forEach((track) => track.stop());
                setRecordingState('transcribing');

                try {
                    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                    const formData = new FormData();
                    formData.append('file', audioBlob, 'audio.webm');
                    formData.append('model', 'whisper-1');
                    formData.append('language', locale);

                    const response = await fetch('/api/initiativ/transcribe', {
                        method: 'POST',
                        body: formData,
                    });

                    if (!response.ok) {
                        setLocalError(micErrorLabel);
                        onTranscribeError?.(micErrorLabel);
                        return;
                    }

                    const data = await response.json();
                    const text = typeof data?.text === 'string' ? data.text.trim() : '';
                    if (text) {
                        const next = value.trim() ? `${value.trim()} ${text}` : text;
                        onChange(maxLength > 0 ? next.slice(0, maxLength) : next);
                    }
                } catch {
                    setLocalError(micErrorLabel);
                    onTranscribeError?.(micErrorLabel);
                } finally {
                    setRecordingState('idle');
                }
            };

            recorder.start();
            setRecordingState('recording');

            autoStopTimerRef.current = setTimeout(() => {
                autoStopTimerRef.current = null;
                mediaRecorderRef.current?.stop();
            }, MAX_RECORDING_MS);
        } catch (err) {
            console.error('[initiativ-voice] mic access failed', err);
            setLocalError(micErrorLabel);
            onTranscribeError?.(micErrorLabel);
            setRecordingState('idle');
        }
    }, [locale, maxLength, micErrorLabel, onChange, onTranscribeError, recordingState, stopRecording, value]);

    useEffect(() => () => {
        if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
        }
    }, []);

    const isRecording = recordingState === 'recording';
    const isTranscribing = recordingState === 'transcribing';
    const borderClass = isRecording ? 'border-[#012e7a] focus-within:border-[#012e7a]' : 'border-[#E7E7E5] focus-within:border-[#012e7a]';

    return (
        <div className="space-y-2">
            <div className={`relative rounded-lg border bg-white transition-colors ${borderClass} focus-within:ring-2 focus-within:ring-[#012e7a]/20`}>
                <textarea
                    id={id}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    rows={rows}
                    maxLength={maxLength}
                    className="block w-full resize-none rounded-lg bg-transparent px-3 pb-10 pt-2 text-sm leading-6 text-[#37352F] placeholder-[#A8A29E] outline-none"
                />
                <div className="absolute bottom-2 right-2 flex items-center justify-center">
                    {isRecording && (
                        <span
                            aria-hidden="true"
                            className="absolute inset-0 rounded-full bg-[#012e7a]/40 animate-[voice-pulse_1.5s_ease-in-out_infinite]"
                        />
                    )}
                    <button
                        type="button"
                        onClick={handleMicClick}
                        disabled={isTranscribing}
                        title={isRecording ? micLabelStop : isTranscribing ? micLabelTranscribing : micLabelStart}
                        aria-label={isRecording ? micLabelStop : isTranscribing ? micLabelTranscribing : micLabelStart}
                        className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#012e7a]/40 ${
                            isRecording
                                ? 'border-[#012e7a] bg-[#012e7a] text-white'
                                : isTranscribing
                                    ? 'border-[#E7E7E5] bg-[#F3F4F6] text-[#73726E] cursor-wait'
                                    : 'border-[#E7E7E5] bg-white text-[#73726E] hover:bg-[#F4F7FC] hover:text-[#012e7a]'
                        }`}
                    >
                        {isTranscribing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isRecording ? (
                            <MicOff className="h-4 w-4" />
                        ) : (
                            <Mic className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>
            {localError && (
                <p className="text-xs leading-5 text-[#B7470F]" role="alert">
                    {localError}
                </p>
            )}
        </div>
    );
}
