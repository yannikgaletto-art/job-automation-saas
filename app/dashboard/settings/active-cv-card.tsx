"use client";

/**
 * Active CV Card — Shows all uploaded documents in Settings.
 * Reads from /api/documents/list (same source as onboarding).
 * Uses /api/documents/upload-simple — fast upload, no AI pipeline.
 *
 * Contract (SICHERHEITSARCHITEKTUR.md Section 6):
 * - XHR for real upload progress
 * - Status texts: 0-30% “Datei wird hochgeladen...”, 30-80% “Wird gespeichert...”, 80-100% “Fertig ✅”
 */

import { useState, useEffect, useRef } from "react";
import { FileText, Upload, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/motion/button";
import { showSafeToast } from "@/lib/utils/toast";

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
    const [uploading, setUploading] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string>('');
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
        setUploadProgress(0);
        setUploadStatus('Datei wird hochgeladen...');

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('type', type);

            // ✅ XHR for real upload progress (SICHERHEITSARCHITEKTUR.md Section 6)
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 80);
                        setUploadProgress(pct);
                        if (pct >= 30) setUploadStatus('Wird gespeichert...');
                        else setUploadStatus('Datei wird hochgeladen...');
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        setUploadProgress(100);
                        setUploadStatus('Fertig ✅ — Analyse läuft im Hintergrund');
                        resolve();
                    } else {
                        try {
                            const body = JSON.parse(xhr.responseText);
                            reject(new Error(body.error || 'Upload fehlgeschlagen'));
                        } catch {
                            reject(new Error('Upload fehlgeschlagen'));
                        }
                    }
                };

                xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
                xhr.open('POST', '/api/documents/upload-simple');
                xhr.send(fd);
            });

            showSafeToast(
                type === 'cv' ? 'Lebenslauf gespeichert' : 'Anschreiben gespeichert',
                `upload_success:${type}`
            );
            await loadDocs();
        } catch (err: any) {
            showSafeToast(err.message || 'Upload fehlgeschlagen', `upload_error:${type}`, 'error');
        } finally {
            setUploading(null);
            setTimeout(() => {
                setUploadProgress(0);
                setUploadStatus('');
            }, 3000);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Löschen fehlgeschlagen');
            showSafeToast('Dokument gelöscht', `delete_success:${id}`);
            setDocs(prev => prev.filter(d => d.id !== id));
        } catch (err: any) {
            showSafeToast(err.message || 'Löschen fehlgeschlagen', `delete_error:${id}`, 'error');
        }
    };

    const cvDocs = docs.filter(d => d.type === 'cv');
    const clDocs = docs.filter(d => d.type === 'cover_letter');

    return (
        <div className="space-y-6">
            {/* Upload Progress Bar */}
            {uploading && (
                <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[#73726E]">
                        <span>{uploadStatus || 'Datei wird hochgeladen...'}</span>
                        <span className="font-mono">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-[#F7F7F5] rounded-full h-1.5">
                        <div
                            className="bg-[#0066FF] h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                </div>
            )}

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
                        {uploading === 'cv' ? `${uploadProgress}%` : 'Hochladen'}
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
                                <button onClick={() => handleDelete(doc.id)} className="text-[#A8A29E] hover:text-red-500 transition-colors p-1">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <input ref={cvRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleUpload(f, 'cv'); e.target.value = ''; } }}
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
                        {uploading === 'cover_letter' ? `${uploadProgress}%` : `Hochladen (${clDocs.length}/3)`}
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
                                <button onClick={() => handleDelete(doc.id)} className="text-[#A8A29E] hover:text-red-500 transition-colors p-1">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <input ref={clRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleUpload(f, 'cover_letter'); e.target.value = ''; } }}
                />
            </div>
        </div>
    );
}
