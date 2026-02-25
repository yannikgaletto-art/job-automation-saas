"use client";

/**
 * Active CV Card — Shows all uploaded documents in Settings.
 * Reads from /api/documents/list (same source as onboarding).
 * Uses /api/documents/upload-simple — fast upload, no AI pipeline.
 */

import { useState, useEffect, useRef } from "react";
import { FileText, Upload, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/motion/button";
import { toast } from "sonner";

type DocumentEntry = {
    id: string;
    type: 'cv' | 'cover_letter';
    name: string;
    createdAt: string;
};

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export function ActiveCVCard() {
    const [docs, setDocs] = useState<DocumentEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploading, setUploading] = useState<string | null>(null); // type being uploaded
    const cvRef = useRef<HTMLInputElement>(null);
    const clRef = useRef<HTMLInputElement>(null);

    const loadDocs = async () => {
        try {
            const res = await fetch('/api/documents/list');
            const data = await res.json();
            if (data.success) setDocs(data.documents);
        } catch (err) {
            console.error('Failed to load docs', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadDocs(); }, []);

    const handleUpload = async (file: File, type: 'cv' | 'cover_letter') => {
        setUploading(type);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('type', type);

            const res = await fetch('/api/documents/upload-simple', { method: 'POST', body: fd });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');

            toast.success(type === 'cv' ? 'Lebenslauf gespeichert' : 'Anschreiben gespeichert');
            await loadDocs();
        } catch (err: any) {
            toast.error(err.message || 'Upload fehlgeschlagen');
        } finally {
            setUploading(null);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Löschen fehlgeschlagen');
            toast.success('Dokument gelöscht');
            setDocs(prev => prev.filter(d => d.id !== id));
        } catch (err: any) {
            toast.error(err.message || 'Löschen fehlgeschlagen');
        }
    };

    const cvDocs = docs.filter(d => d.type === 'cv');
    const clDocs = docs.filter(d => d.type === 'cover_letter');

    return (
        <div className="space-y-6">
            {/* CV Section */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#0066FF]" />
                        Lebenslauf (CV)
                    </h3>
                    <Button
                        variant="secondary"
                        className="text-xs h-8"
                        onClick={() => cvRef.current?.click()}
                        disabled={!!uploading}
                    >
                        <Upload className="w-3 h-3 mr-1.5" />
                        {uploading === 'cv' ? 'Lädt...' : 'Hochladen'}
                    </Button>
                </div>

                {isLoading ? (
                    <div className="h-10 bg-[#F7F7F5] rounded-lg animate-pulse" />
                ) : cvDocs.length === 0 ? (
                    <div
                        className="border-2 border-dashed border-[#E7E7E5] rounded-lg p-5 text-center cursor-pointer hover:border-[#0066FF]/40 hover:bg-[#F0F7FF]/30 transition-all"
                        onClick={() => cvRef.current?.click()}
                    >
                        <Plus className="w-5 h-5 text-[#A8A29E] mx-auto mb-1" />
                        <p className="text-sm text-[#73726E]">Noch kein CV hochgeladen</p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {cvDocs.map(doc => (
                            <li key={doc.id} className="flex items-center gap-3 p-3 bg-[#F0F7FF] border border-[#0066FF]/20 rounded-lg">
                                <FileText className="w-4 h-4 text-[#0066FF] shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#37352F] truncate">{doc.name}</p>
                                    <p className="text-xs text-[#73726E]">Hochgeladen: {formatDate(doc.createdAt)}</p>
                                </div>
                                <button
                                    onClick={() => handleDelete(doc.id)}
                                    className="text-[#A8A29E] hover:text-red-500 transition-colors p-1"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <input
                    ref={cvRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { handleUpload(f, 'cv'); e.target.value = ''; }
                    }}
                />
            </div>

            {/* Cover Letters Section */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#0066FF]" />
                        Anschreiben (Cover Letters)
                    </h3>
                    <Button
                        variant="secondary"
                        className="text-xs h-8"
                        onClick={() => clRef.current?.click()}
                        disabled={!!uploading || clDocs.length >= 3}
                    >
                        <Upload className="w-3 h-3 mr-1.5" />
                        {uploading === 'cover_letter' ? 'Lädt...' : `Hochladen (${clDocs.length}/3)`}
                    </Button>
                </div>

                {isLoading ? (
                    <div className="h-10 bg-[#F7F7F5] rounded-lg animate-pulse" />
                ) : clDocs.length === 0 ? (
                    <div
                        className="border-2 border-dashed border-[#E7E7E5] rounded-lg p-5 text-center cursor-pointer hover:border-[#0066FF]/40 hover:bg-[#F0F7FF]/30 transition-all"
                        onClick={() => clRef.current?.click()}
                    >
                        <Plus className="w-5 h-5 text-[#A8A29E] mx-auto mb-1" />
                        <p className="text-sm text-[#73726E]">Noch keine Anschreiben hochgeladen</p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {clDocs.map(doc => (
                            <li key={doc.id} className="flex items-center gap-3 p-3 bg-white border border-[#E7E7E5] rounded-lg">
                                <FileText className="w-4 h-4 text-[#73726E] shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#37352F] truncate">{doc.name}</p>
                                    <p className="text-xs text-[#73726E]">Hochgeladen: {formatDate(doc.createdAt)}</p>
                                </div>
                                <button
                                    onClick={() => handleDelete(doc.id)}
                                    className="text-[#A8A29E] hover:text-red-500 transition-colors p-1"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <input
                    ref={clRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { handleUpload(f, 'cover_letter'); e.target.value = ''; }
                    }}
                />
            </div>
        </div>
    );
}
