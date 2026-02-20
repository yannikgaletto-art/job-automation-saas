"use client";

import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface AddJobDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onJobAdded: () => void;
}

export function AddJobDialog({ isOpen, onClose, onJobAdded }: AddJobDialogProps) {
    const [company, setCompany] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

    const isFormValid = company.length >= 2 && title.length >= 2 && description.length >= 500 && description.length <= 5000;
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
                    jobTitle: title,
                    jobDescription: description
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.requestId) {
                    setErrorRequestId(data.requestId);
                    toast.error(`Fehler. Support-ID: ${data.requestId}`);
                } else {
                    toast.error("Ein unerwarteter Fehler ist aufgetreten.");
                }
                setError(data.error || 'Failed to add job');
                return;
            }

            toast.success("Job erfolgreich hinzugefügt!");
            setCompany('');
            setTitle('');
            setDescription('');
            onJobAdded();
            onClose();

        } catch (err: any) {
            console.error(err);
            setError(err.message);
            toast.error("Ein unerwarteter Fehler ist aufgetreten.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
            <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto rounded-xl shadow-lg bg-white p-6 focus:outline-none">
                <DialogHeader className="mb-6">
                    <DialogTitle className="text-xl font-semibold text-gray-900">
                        Job hinzufügen
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-500 mt-1">
                        Kopiere die vollständige Stellenbeschreibung. Unsere KI extrahiert die Anforderungen automatisch.
                    </DialogDescription>
                    <p className="text-xs text-gray-400 mt-1">
                        Tipp: Inklusive Aufgaben, Anforderungen und Tech-Stack.
                    </p>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="company">Unternehmen <span className="text-red-500">*</span></Label>
                            <Input
                                id="company"
                                placeholder="z.B. Fraunhofer"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                required
                                minLength={2}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="title">Jobtitel <span className="text-red-500">*</span></Label>
                            <Input
                                id="title"
                                placeholder="z.B. Software Engineer"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                minLength={2}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="description">Stellenbeschreibung <span className="text-red-500">*</span></Label>
                            <span className={`text-xs ${description.length < 500 ? 'text-[#a1a1aa]' : description.length > 5000 ? 'text-red-500' : 'text-green-600'}`}>
                                {description.length} / 5.000 Zeichen
                            </span>
                        </div>
                        <Textarea
                            id="description"
                            placeholder="Vollständige Stellenbeschreibung hier einfügen..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            minLength={500}
                            maxLength={5000}
                            className="w-full min-h-[160px] rounded-md border border-[#EBEBEA] bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-[#a1a1aa] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2383e2] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>

                    {error && !errorRequestId && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="mt-6 flex justify-end gap-3">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={isSubmitting}
                            type="button"
                        >
                            Abbrechen
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isFormValid || isSubmitting}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Wird hinzugefügt...
                                </>
                            ) : (
                                'Zur Queue hinzufügen'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
