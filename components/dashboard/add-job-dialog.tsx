"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/motion/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddJobDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onJobAdded: () => void; // Callback to refresh list
}

export function AddJobDialog({ isOpen, onClose, onJobAdded }: AddJobDialogProps) {
    const [url, setUrl] = useState('');
    const [company, setCompany] = useState(''); // Optional, for fuzzy check
    const [title, setTitle] = useState('');     // Optional, for fuzzy check

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setDuplicateWarning(null);

        try {
            const res = await fetch('/api/jobs/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: '00000000-0000-0000-0000-000000000000', // Mock User ID for demo/localhost
                    jobUrl: url,
                    company: company || undefined,
                    jobTitle: title || undefined
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (res.status === 409) {
                    // DUPLICATE DETECTED
                    setDuplicateWarning(data.details);
                    setIsLoading(false);
                    return;
                }
                throw new Error(data.error || 'Failed to add job');
            }

            // Success
            setUrl('');
            setCompany('');
            setTitle('');
            onJobAdded();
            onClose();

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
                            {duplicateWarning ? (
                                // DUPLICATE WARNING STATE
                                <div className="space-y-4">
                                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-3">
                                        <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h3 className="text-sm font-semibold text-orange-800">
                                                {duplicateWarning.reason === 'exact_url'
                                                    ? 'You already applied to this job!'
                                                    : 'Similar application detected!'}
                                            </h3>
                                            <p className="text-xs text-orange-700 mt-1">
                                                {duplicateWarning.reason === 'exact_url'
                                                    ? `You applied to this exact link roughly ${duplicateWarning.cooldownDaysRemaining} days ago.`
                                                    : `You applied to a similar role "${duplicateWarning.matchDetails?.jobTitle}" at ${duplicateWarning.matchDetails?.companyName}.`}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="outline" onClick={() => setDuplicateWarning(null)}>
                                            Cancel
                                        </Button>
                                        <Button variant="primary" onClick={onClose}>
                                            Okay, I'll check my history
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                // FORM STATE
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="url">Job URL <span className="text-red-500">*</span></Label>
                                        <Input
                                            id="url"
                                            placeholder="https://linkedin.com/jobs/..."
                                            value={url}
                                            onChange={(e) => setUrl(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="company">Company (Optional)</Label>
                                            <Input
                                                id="company"
                                                placeholder="e.g. Acme Corp"
                                                value={company}
                                                onChange={(e) => setCompany(e.target.value)}
                                            // Optional, but helps testing "Similar Role" check without scraping
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="title">Job Title (Optional)</Label>
                                            <Input
                                                id="title"
                                                placeholder="e.g. Engineer"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            {error}
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-2 pt-4">
                                        <Button type="button" variant="outline" onClick={onClose}>
                                            Cancel
                                        </Button>
                                        <Button type="submit" variant="primary" disabled={isLoading}>
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                'Add to Queue'
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
