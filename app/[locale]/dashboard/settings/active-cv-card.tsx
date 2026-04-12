"use client";

/**
 * Active CV Card — Shows all uploaded documents in Settings.
 * Reads from /api/documents/list (same source as onboarding).
 * Uses /api/documents/upload-simple — fast upload, no AI pipeline.
 *
 * Contract (SICHERHEITSARCHITEKTUR.md Section 6):
 * - XHR for real upload progress
 * - Status texts: 0-30% "Datei wird hochgeladen...", 30-80% "Wird gespeichert...", 80-100% "Fertig ✅"
 *
 * Cover Letter Categorization:
 * - User-created categories stored in localStorage
 * - Collapsible category groups reduce visual clutter
 */

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FileText, Upload, Trash2, Plus, Download, ChevronDown, ChevronRight, Tag, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/motion/button";
import { useNotification } from "@/hooks/use-notification";
import { useTranslations } from "next-intl";

type DocumentEntry = {
    id: string;
    type: 'cv' | 'cover_letter';
    name: string;
    createdAt: string;
};

type CategoryMap = Record<string, string[]>; // categoryName → [documentId, ...]

const STORAGE_KEY = 'pathly_cl_categories';
const COLLAPSED_KEY = 'pathly_cl_collapsed';
const CV_HINT_DISMISSED_KEY = 'pathly_cv_hint_dismissed';

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function loadCategories(): CategoryMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveCategories(map: CategoryMap) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function loadCollapsed(): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(COLLAPSED_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveCollapsed(map: Record<string, boolean>) {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(map));
}

export function ActiveCVCard() {
    const [docs, setDocs] = useState<DocumentEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const notify = useNotification();
    const t = useTranslations('upload');
    const [uploading, setUploading] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const cvRef = useRef<HTMLInputElement>(null);
    const clRef = useRef<HTMLInputElement>(null);
    const searchParams = useSearchParams();
    const router = useRouter();
    const returnTo = searchParams.get('returnTo');

    // Category state
    const [categories, setCategories] = useState<CategoryMap>({});
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [newCategoryName, setNewCategoryName] = useState('');
    const [showAddCategory, setShowAddCategory] = useState(false);

    // CV upload hint dialog
    const [showCvHint, setShowCvHint] = useState(false);
    const [pendingCvFile, setPendingCvFile] = useState<File | null>(null);
    const cvHintDismissedRef = useRef(false);

    useEffect(() => {
        try {
            cvHintDismissedRef.current = localStorage.getItem(CV_HINT_DISMISSED_KEY) === 'true';
        } catch {}
    }, []);

    const handleCvUploadClick = () => {
        if (cvHintDismissedRef.current) {
            cvRef.current?.click();
        } else {
            setShowCvHint(true);
        }
    };

    const handleCvHintContinue = () => {
        setShowCvHint(false);
        if (pendingCvFile) {
            handleUpload(pendingCvFile, 'cv');
            setPendingCvFile(null);
        } else {
            cvRef.current?.click();
        }
    };

    const handleCvHintDismissForever = () => {
        try { localStorage.setItem(CV_HINT_DISMISSED_KEY, 'true'); } catch {}
        cvHintDismissedRef.current = true;
        setShowCvHint(false);
        if (pendingCvFile) {
            handleUpload(pendingCvFile, 'cv');
            setPendingCvFile(null);
        } else {
            cvRef.current?.click();
        }
    };

    const handleCvFileSelect = (file: File) => {
        if (cvHintDismissedRef.current) {
            handleUpload(file, 'cv');
        } else {
            setPendingCvFile(file);
            setShowCvHint(true);
        }
    };

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

    useEffect(() => {
        loadDocs();
        setCategories(loadCategories());
        setCollapsed(loadCollapsed());
    }, []);

    const handleUpload = async (file: File, type: 'cv' | 'cover_letter') => {
        setUploading(type);
        setUploadProgress(0);
        setUploadStatus(t('status_uploading'));

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
                        if (pct >= 50) setUploadStatus(t('status_analyzing'));
                        else if (pct >= 20) setUploadStatus(t('status_reading'));
                        else setUploadStatus(t('status_uploading'));
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        setUploadProgress(100);
                        setUploadStatus(t('status_done'));
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
                xhr.open('POST', '/api/documents/upload');
                xhr.send(fd);
            });

            notify(type === 'cv' ? 'Lebenslauf hochgeladen' : 'Anschreiben hochgeladen');
            await loadDocs();

            // QA Integration: If user came from a feature via DocumentsRequiredDialog,
            // redirect them back after successful upload
            if (returnTo) {
                setTimeout(() => {
                    router.push(decodeURIComponent(returnTo));
                }, 1500); // Short delay so user sees "Fertig ✅" status
            }
        } catch (err: any) {
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
            notify('Dokument gelöscht');
            setDocs(prev => prev.filter(d => d.id !== id));
            // Also remove from categories
            const updated = { ...categories };
            for (const cat of Object.keys(updated)) {
                updated[cat] = updated[cat].filter(docId => docId !== id);
            }
            setCategories(updated);
            saveCategories(updated);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Löschen fehlgeschlagen';
        }
    };

    const handleDownload = async (id: string, name: string) => {
        try {
            const res = await fetch(`/api/documents/download?id=${id}`);
            if (!res.ok) throw new Error('Download fehlgeschlagen');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
        }
    };

    // Category management
    const addCategory = () => {
        const name = newCategoryName.trim();
        if (!name || categories[name]) return;
        const updated = { ...categories, [name]: [] };
        setCategories(updated);
        saveCategories(updated);
        setNewCategoryName('');
        setShowAddCategory(false);
    };

    const deleteCategory = (name: string) => {
        const updated = { ...categories };
        delete updated[name];
        setCategories(updated);
        saveCategories(updated);
    };

    const toggleCollapse = (name: string) => {
        const updated = { ...collapsed, [name]: !collapsed[name] };
        setCollapsed(updated);
        saveCollapsed(updated);
    };

    const assignCategory = (docId: string, categoryName: string) => {
        const updated = { ...categories };
        // Remove from all categories first
        for (const cat of Object.keys(updated)) {
            updated[cat] = updated[cat].filter(id => id !== docId);
        }
        // Add to target
        if (categoryName !== '__none__') {
            updated[categoryName] = [...(updated[categoryName] || []), docId];
        }
        setCategories(updated);
        saveCategories(updated);
    };

    const getCategoryForDoc = (docId: string): string | null => {
        for (const [cat, ids] of Object.entries(categories)) {
            if (ids.includes(docId)) return cat;
        }
        return null;
    };

    const cvDocs = docs.filter(d => d.type === 'cv');
    const clDocs = docs.filter(d => d.type === 'cover_letter');

    // Group cover letters by category
    const categoryNames = Object.keys(categories);
    const categorizedCLs: Record<string, DocumentEntry[]> = {};
    const uncategorizedCLs: DocumentEntry[] = [];

    for (const doc of clDocs) {
        const cat = getCategoryForDoc(doc.id);
        if (cat) {
            if (!categorizedCLs[cat]) categorizedCLs[cat] = [];
            categorizedCLs[cat].push(doc);
        } else {
            uncategorizedCLs.push(doc);
        }
    }

    const renderDocRow = (doc: DocumentEntry, highlight: boolean = false) => (
        <li key={doc.id} className={`flex items-center gap-3 p-3 rounded-lg ${highlight ? 'bg-[#F0F7FF] border border-[#012e7a]/20' : 'bg-white border border-[#E7E7E5]'}`}>
            <FileText className={`w-4 h-4 shrink-0 ${highlight ? 'text-[#012e7a]' : 'text-[#73726E]'}`} />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#37352F] truncate">{doc.name}</p>
                <p className="text-xs text-[#73726E]">Hochgeladen: {formatDate(doc.createdAt)}</p>
            </div>
            {/* Category selector for cover letters */}
            {doc.type === 'cover_letter' && categoryNames.length > 0 && (
                <select
                    value={getCategoryForDoc(doc.id) ?? '__none__'}
                    onChange={(e) => assignCategory(doc.id, e.target.value)}
                    className="text-xs border border-[#E7E7E5] rounded px-1.5 py-1 text-[#73726E] bg-white focus:outline-none focus:ring-1 focus:ring-[#012e7a]/30 max-w-[120px]"
                    title="Kategorie zuweisen"
                >
                    <option value="__none__">Ohne</option>
                    {categoryNames.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            )}
            <div className="flex items-center gap-1">
                <button onClick={() => handleDownload(doc.id, doc.name)} className="text-[#A8A29E] hover:text-[#012e7a] transition-colors p-1" title="Herunterladen">
                    <Download className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(doc.id)} className="text-[#A8A29E] hover:text-red-500 transition-colors p-1" title="Löschen">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </li>
    );

    return (
        <div className="space-y-6">
            {/* Upload Progress Bar */}
            {uploading && (
                <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-[#73726E]">{uploadStatus || t('status_uploading')}</span>
                        <div className="flex items-center gap-2">
                            {uploadProgress >= 20 && uploadProgress < 100 && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 font-medium">
                                    <ShieldCheck className="w-3 h-3" />
                                    EU
                                </span>
                            )}
                            <span className="font-mono text-[#73726E]">{uploadProgress}%</span>
                        </div>
                    </div>
                    <div className="w-full bg-[#F7F7F5] rounded-full h-1.5">
                        <div
                            className="bg-[#012e7a] h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                    {uploadProgress >= 20 && uploadProgress < 100 && (
                        <p className="text-[10px] text-slate-400">
                            {t('eu_privacy_note')}
                        </p>
                    )}
                </div>
            )}

            {/* CV Section */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#012e7a]" />
                        Lebenslauf (CV)
                    </h3>
                    <Button
                        variant="secondary"
                        className="text-xs h-8"
                        onClick={handleCvUploadClick}
                        disabled={!!uploading || cvDocs.length >= 3}
                        title={cvDocs.length >= 3 ? 'Bitte lösche erst einen bestehenden Lebenslauf' : undefined}
                    >
                        <Upload className="w-3 h-3 mr-1.5" />
                        {uploading === 'cv' ? `${uploadProgress}%` : `Hochladen (${cvDocs.length}/3)`}
                    </Button>
                </div>

                {isLoading ? (
                    <div className="h-10 bg-[#F7F7F5] rounded-lg animate-pulse" />
                ) : cvDocs.length === 0 ? (
                    <div
                        className="border-2 border-dashed border-[#E7E7E5] rounded-lg p-5 text-center cursor-pointer hover:border-[#012e7a]/40 hover:bg-[#F0F7FF]/30 transition-all"
                        onClick={handleCvUploadClick}
                    >
                        <Plus className="w-5 h-5 text-[#A8A29E] mx-auto mb-1" />
                        <p className="text-sm text-[#73726E]">Noch kein CV hochgeladen</p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {cvDocs.map(doc => renderDocRow(doc, true))}
                    </ul>
                )}
                <input ref={cvRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleCvFileSelect(f); e.target.value = ''; } }}
                />
            </div>

            {/* Cover Letters Section */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#012e7a]" />
                        Anschreiben (Cover Letters)
                    </h3>
                    <div className="flex items-center gap-2">
                        {/* Add Category Button */}
                        {clDocs.length > 0 && (
                            <button
                                onClick={() => setShowAddCategory(!showAddCategory)}
                                className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#012e7a] transition-colors px-2 py-1 rounded border border-[#E7E7E5] hover:border-[#012e7a]/30"
                                title="Kategorie erstellen"
                            >
                                <Tag className="w-3 h-3" />
                                Kategorie
                            </button>
                        )}
                        <Button
                            variant="secondary"
                            className="text-xs h-8"
                            onClick={() => clRef.current?.click()}
                            disabled={!!uploading || clDocs.length >= 3}
                            title={clDocs.length >= 3 ? 'Bitte lösche erst ein bestehendes Anschreiben' : undefined}
                        >
                            <Upload className="w-3 h-3 mr-1.5" />
                            {uploading === 'cover_letter' ? `${uploadProgress}%` : `Hochladen (${clDocs.length}/3)`}
                        </Button>
                    </div>
                </div>

                {/* Add Category Input */}
                {showAddCategory && (
                    <div className="flex items-center gap-2 mb-3 p-2 bg-[#F7F7F5] rounded-lg border border-[#E7E7E5]">
                        <Tag className="w-3.5 h-3.5 text-[#73726E] shrink-0" />
                        <input
                            type="text"
                            placeholder="z.B. Account Executive, Business Development..."
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
                            className="flex-1 text-sm bg-transparent text-[#37352F] placeholder-[#A8A29E] focus:outline-none"
                            autoFocus
                        />
                        <button
                            onClick={addCategory}
                            disabled={!newCategoryName.trim()}
                            className="text-xs px-2 py-1 bg-[#012e7a] text-white rounded disabled:opacity-40 hover:bg-[#011f5e] transition-colors"
                        >
                            Erstellen
                        </button>
                        <button
                            onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }}
                            className="text-[#A8A29E] hover:text-[#37352F] p-0.5"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <div className="h-10 bg-[#F7F7F5] rounded-lg animate-pulse" />
                ) : clDocs.length === 0 ? (
                    <div
                        className="border-2 border-dashed border-[#E7E7E5] rounded-lg p-5 text-center cursor-pointer hover:border-[#012e7a]/40 hover:bg-[#F0F7FF]/30 transition-all"
                        onClick={() => clRef.current?.click()}
                    >
                        <Plus className="w-5 h-5 text-[#A8A29E] mx-auto mb-1" />
                        <p className="text-sm text-[#73726E]">Lade erfolgreiche Anschreiben hoch, damit Pathly deinen Schreibstil lernt.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Categorized groups */}
                        {categoryNames.map(catName => {
                            const catDocs = categorizedCLs[catName] || [];
                            if (catDocs.length === 0 && categoryNames.length > 0) {
                                // Show empty category with delete option
                                return (
                                    <div key={catName} className="rounded-lg border border-[#E7E7E5] overflow-hidden">
                                        <div className="flex items-center justify-between px-3 py-2 bg-[#FAFAF9]">
                                            <button
                                                onClick={() => toggleCollapse(catName)}
                                                className="flex items-center gap-1.5 text-xs font-medium text-[#73726E] hover:text-[#37352F] transition-colors"
                                            >
                                                <ChevronRight className="w-3 h-3" />
                                                <Tag className="w-3 h-3" />
                                                {catName}
                                                <span className="text-[#A8A29E] font-normal">(0)</span>
                                            </button>
                                            <button
                                                onClick={() => deleteCategory(catName)}
                                                className="text-[#A8A29E] hover:text-red-500 transition-colors p-0.5"
                                                title="Kategorie löschen"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            }
                            if (catDocs.length === 0) return null;

                            const isCollapsed = collapsed[catName];
                            return (
                                <div key={catName} className="rounded-lg border border-[#E7E7E5] overflow-hidden">
                                    <div className="flex items-center justify-between px-3 py-2 bg-[#FAFAF9]">
                                        <button
                                            onClick={() => toggleCollapse(catName)}
                                            className="flex items-center gap-1.5 text-xs font-medium text-[#37352F] hover:text-[#012e7a] transition-colors"
                                        >
                                            {isCollapsed ? (
                                                <ChevronRight className="w-3 h-3" />
                                            ) : (
                                                <ChevronDown className="w-3 h-3" />
                                            )}
                                            <Tag className="w-3 h-3 text-[#012e7a]" />
                                            {catName}
                                            <span className="text-[#A8A29E] font-normal">({catDocs.length})</span>
                                        </button>
                                        <button
                                            onClick={() => deleteCategory(catName)}
                                            className="text-[#A8A29E] hover:text-red-500 transition-colors p-0.5"
                                            title="Kategorie löschen"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                    {!isCollapsed && (
                                        <ul className="space-y-1 p-2">
                                            {catDocs.map(doc => renderDocRow(doc))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}

                        {/* Uncategorized */}
                        {uncategorizedCLs.length > 0 && (
                            <div>
                                {categoryNames.length > 0 && (
                                    <p className="text-xs text-[#A8A29E] mb-1.5 px-1">Ohne Kategorie</p>
                                )}
                                <ul className="space-y-2">
                                    {uncategorizedCLs.map(doc => renderDocRow(doc))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
                <input ref={clRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleUpload(f, 'cover_letter'); e.target.value = ''; } }}
                />
            </div>
            {/* CV Upload Hint Dialog */}
            {showCvHint && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => { setShowCvHint(false); setPendingCvFile(null); }}
                    />
                    {/* Dialog */}
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-[#E7E7E5] w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                        <div className="p-6">
                            {/* Icon + Title */}
                            <div className="flex items-start gap-3 mb-4">
                                <div className="p-2 bg-[#012e7a]/10 rounded-xl shrink-0">
                                    <FileText className="w-5 h-5 text-[#012e7a]" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-[#37352F] leading-snug">
                                        {t('cv_hint_title')}
                                    </h3>
                                    <p className="text-sm text-[#73726E] mt-1">
                                        {t('cv_hint_description')}
                                    </p>
                                </div>
                            </div>

                            {/* Example */}
                            <div className="bg-[#FAFAF9] border border-[#E7E7E5] rounded-xl p-4 mb-5">
                                <p className="text-xs font-semibold text-[#37352F] mb-2 uppercase tracking-wide">
                                    {t('cv_hint_example_label')}
                                </p>
                                <div className="space-y-2.5">
                                    <div>
                                        <p className="text-sm font-medium text-[#37352F]">
                                            Fraunhofer IGD — UX Researcher
                                        </p>
                                        <ul className="mt-1 space-y-0.5">
                                            <li className="text-xs text-[#73726E] flex items-start gap-1.5">
                                                <span className="text-[#012e7a] mt-0.5">•</span>
                                                {t('cv_hint_bullet_1')}
                                            </li>
                                            <li className="text-xs text-[#73726E] flex items-start gap-1.5">
                                                <span className="text-[#012e7a] mt-0.5">•</span>
                                                {t('cv_hint_bullet_2')}
                                            </li>
                                            <li className="text-xs text-[#73726E] flex items-start gap-1.5">
                                                <span className="text-[#012e7a] mt-0.5">•</span>
                                                {t('cv_hint_bullet_3')}
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleCvHintContinue}
                                    className="w-full px-4 py-2.5 bg-[#012e7a] text-white text-sm font-medium rounded-lg hover:bg-[#011f5e] transition-colors"
                                >
                                    {t('cv_hint_continue')}
                                </button>
                                {/* Lean toggle — replaces old grey text button */}
                                <button
                                    onClick={handleCvHintDismissForever}
                                    className="group flex items-center justify-center gap-2 w-full py-1"
                                >
                                    {/* Toggle track */}
                                    <span className="relative w-7 h-4 rounded-full bg-[#E7E7E5] group-hover:bg-[#012e7a]/20 transition-colors flex-shrink-0">
                                        <span className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-[#A8A29E] group-hover:bg-[#012e7a] transition-all" />
                                    </span>
                                    <span className="text-xs text-[#A8A29E] group-hover:text-[#73726E] transition-colors">
                                        {t('cv_hint_dismiss')}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
