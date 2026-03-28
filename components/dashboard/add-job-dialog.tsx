"use client";

import { useState } from 'react';
import { Loader2, AlertTriangle, Globe } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';

interface AddJobDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onJobAdded: () => void;
}

export function AddJobDialog({ isOpen, onClose, onJobAdded }: AddJobDialogProps) {
    const t = useTranslations('add_job_dialog');
    const [company, setCompany] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [companyWebsite, setCompanyWebsite] = useState('');
    const [description, setDescription] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

    const isUrlValid = /^https?:\/\/.+\..+/.test(companyWebsite);
    const isFormValid = company.length >= 2 && jobTitle.length >= 2 && description.length >= 500 && description.length <= 7000 && companyWebsite.length > 0;
    const isSubmitting = isLoading;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setErrorRequestId(null);

        try {
            const res = await fetch('/api/jobs/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company,
                    jobTitle,
                    jobDescription: description,
                    companyWebsite: companyWebsite.trim() || undefined,
                    source: 'manual_entry',
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.requestId) setErrorRequestId(data.requestId);
                setError(data.error || 'Failed to add job');
                return;
            }

            setCompany('');
            setJobTitle('');
            setCompanyWebsite('');
            setDescription('');
            onJobAdded();
            onClose();

        } catch (err: unknown) {
            console.error(err);
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
            <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto rounded-xl shadow-lg bg-white p-6 focus:outline-none">
                <DialogHeader className="mb-6">
                    <DialogTitle className="text-xl font-semibold text-gray-900">
                        {t('title')}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-500 mt-1">
                        {t('desc')}
                    </DialogDescription>
                    <p className="text-xs text-gray-400 mt-1">{t('tip')}</p>
                </DialogHeader>

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="company">{t('company_label')} <span className="text-red-500">*</span></Label>
                            <Input
                                id="company"
                                placeholder={t('company_placeholder')}
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                required
                                minLength={2}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="title">{t('title_label')} <span className="text-red-500">*</span></Label>
                            <Input
                                id="title"
                                placeholder={t('title_placeholder')}
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                                required
                                minLength={2}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-[#73726E]" />
                            <Label htmlFor="companyWebsite">{t('website_label')} <span className="text-red-500">*</span></Label>
                        </div>
                        <Input
                            id="companyWebsite"
                            type="url"
                            placeholder={t('website_placeholder')}
                            value={companyWebsite}
                            onChange={(e) => setCompanyWebsite(e.target.value)}
                            required
                        />
                        {companyWebsite && !isUrlValid && (
                            <p className="text-xs text-red-500">{t('website_invalid')}</p>
                        )}
                        <p className="text-xs text-[#a1a1aa]">{t('website_hint')}</p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="description">{t('desc_label')} <span className="text-red-500">*</span></Label>
                            <span className={`text-xs ${description.length < 500 ? 'text-[#a1a1aa]' : description.length > 7000 ? 'text-red-500' : 'text-green-600'}`}>
                                {t('desc_chars', { n: description.length })}
                            </span>
                        </div>
                        <Textarea
                            id="description"
                            placeholder={t('desc_placeholder')}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            minLength={500}
                            maxLength={7000}
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
                                <p className="text-xs text-red-400 pl-6">Ref: {errorRequestId}</p>
                            )}
                        </div>
                    )}

                    <DialogFooter className="mt-6 flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose} disabled={isSubmitting} type="button">
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={!isFormValid || isSubmitting} className="bg-[#002e7a] hover:bg-[#001f5c] text-white">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('submitting')}
                                </>
                            ) : (
                                t('submit')
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
