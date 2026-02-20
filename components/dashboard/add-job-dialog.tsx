"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import { Button } from '@/components/motion/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddJobDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onJobAdded: () => void; // Callback to refresh list
}

export function AddJobDialog({ isOpen, onClose, onJobAdded }: AddJobDialogProps) {
    const [company, setCompany] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setErrorRequestId(null);
        setLoadingStatus('AI parst Beschreibung...');

        try {
            const res = await fetch('/api/jobs/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company,
                    jobTitle: title,
                    jobDescription: description
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.requestId) setErrorRequestId(data.requestId);
                throw new Error(data.error || 'Failed to add job');
            }

            setLoadingStatus('Erfolgreich!');
            // Reset and close after brief delay
            setTimeout(() => {
                setCompany('');
                setTitle('');
                setDescription('');
                onJobAdded();
                onClose();
            }, 800);

        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
                    />

                    {/* Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-2xl z-50 overflow-hidden border border-[#d6d6d6]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[#d6d6d6] bg-[#FAFAF9]">
                            <h2 className="text-lg font-semibold text-[#37352F]">Add New Job</h2>
                            <button onClick={onClose} className="text-[#a1a1aa] hover:text-[#37352F] transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6">
                            {/* FORM STATE */}
                            <div className="space-y-6">
                                <div className="text-center space-y-2 pb-2">
                                    <h3 className="text-sm font-medium text-[#73726E]">Paste Job Description</h3>
                                    <p className="text-xs text-[#a1a1aa]">Our AI will extract the requirements automatically.</p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="company">Company <span className="text-red-500">*</span></Label>
                                            <Input
                                                id="company"
                                                placeholder="e.g. Acme Corp"
                                                value={company}
                                                onChange={(e) => setCompany(e.target.value)}
                                                required
                                                minLength={2}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="title">Job Title <span className="text-red-500">*</span></Label>
                                            <Input
                                                id="title"
                                                placeholder="e.g. Software Engineer"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                required
                                                minLength={2}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label htmlFor="description">Job Description <span className="text-red-500">*</span></Label>
                                            <span className={`text-xs ${description.length < 500 ? 'text-[#a1a1aa]' : 'text-green-600'}`}>
                                                {description.length} / 500 char min
                                            </span>
                                        </div>
                                        <textarea
                                            id="description"
                                            placeholder="Paste the full job description here..."
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            required
                                            minLength={500}
                                            className="w-full min-h-[160px] rounded-md border border-[#EBEBEA] bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-[#a1a1aa] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2383e2] disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                    </div>

                                    {error && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600 flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                                <span>{error}</span>
                                            </div>
                                            {errorRequestId && (
                                                <span className="text-xs text-red-400 pl-6">
                                                    Support-ID: {errorRequestId}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <Button type="submit" variant="primary" className="w-full flex justify-center py-2" disabled={isLoading || description.length < 500}>
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    {loadingStatus}
                                                </>
                                            ) : (
                                                <>
                                                    <Zap className="w-4 h-4 mr-2" />
                                                    Job hinzufügen
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
