/**
 * VoiceConsentModal — DSGVO Consent Popup for Microphone Usage
 * Feature-Silo: coaching
 * 
 * Shown before voice recording usage.
 * Includes a toggle to skip future consent prompts.
 * Styled in Pathly design (light mode, clean, Notion-like).
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Shield } from 'lucide-react';

const BLUE = '#2B5EA7';
const TEXT = '#37352F';
const MUTED = '#9B9A97';
const BORDER = '#E7E7E5';

interface VoiceConsentModalProps {
    isOpen: boolean;
    onAllow: (skipFuture: boolean) => void;
    onDeny: () => void;
}

export function VoiceConsentModal({ isOpen, onAllow, onDeny }: VoiceConsentModalProps) {
    const [skipFutureAsk, setSkipFutureAsk] = useState(false);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
                    onClick={onDeny}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-xl p-6 w-[400px] shadow-xl"
                        style={{ background: '#FAFAF9', border: `1px solid ${BORDER}` }}
                    >
                        {/* Icon */}
                        <div className="flex justify-center mb-4">
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center"
                                style={{ background: '#E8EFF8' }}
                            >
                                <Mic className="h-6 w-6" style={{ color: BLUE }} />
                            </div>
                        </div>

                        {/* Title */}
                        <h3
                            className="text-lg font-semibold text-center mb-2"
                            style={{ color: TEXT }}
                        >
                            Darf Pathly dein Mikrofon verwenden?
                        </h3>

                        {/* Description */}
                        <p
                            className="text-sm text-center mb-5 leading-relaxed"
                            style={{ color: MUTED }}
                        >
                            Deine Sprachaufnahme wird zur Texterkennung an OpenAI gesendet und
                            danach sofort verworfen. Es werden keine Audio-Dateien gespeichert.
                        </p>

                        {/* DSGVO info */}
                        <div
                            className="flex items-start gap-2 rounded-lg px-3 py-2.5 mb-4"
                            style={{ background: '#F0EFED' }}
                        >
                            <Shield className="h-4 w-4 mt-0.5 shrink-0" style={{ color: MUTED }} />
                            <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                                Du kannst diese Einstellung jederzeit in deinen Browser-Einstellungen
                                ändern. Pathly speichert nur deine Einwilligung, nicht die Aufnahme.
                            </p>
                        </div>

                        {/* Skip future consent toggle */}
                        <div
                            className="flex items-center justify-between rounded-lg px-3 py-3 mb-5"
                            style={{ background: '#F0EFED' }}
                        >
                            <span className="text-xs" style={{ color: skipFutureAsk ? TEXT : MUTED }}>
                                {skipFutureAsk ? 'Nicht mehr nachfragen' : 'Jedes Mal nachfragen'}
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={skipFutureAsk}
                                onClick={() => setSkipFutureAsk(!skipFutureAsk)}
                                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none"
                                style={{ background: skipFutureAsk ? BLUE : '#D1D1D0' }}
                            >
                                <span
                                    className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out"
                                    style={{
                                        transform: skipFutureAsk ? 'translateX(1.25rem)' : 'translateX(0.125rem)',
                                        marginTop: '0.125rem',
                                    }}
                                />
                            </button>
                        </div>

                        {/* Buttons */}
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => onAllow(skipFutureAsk)}
                                className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
                                style={{ background: BLUE }}
                            >
                                Erlauben
                            </button>
                            <button
                                onClick={onDeny}
                                className="w-full py-2.5 rounded-lg text-sm transition-colors hover:bg-[#F0EFED]"
                                style={{ color: MUTED, border: `1px solid ${BORDER}` }}
                            >
                                Nicht erlauben
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
