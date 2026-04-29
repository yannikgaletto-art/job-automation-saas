"use client";

/**
 * Active CV Card — Shows all uploaded documents in Settings.
 * Reads from /api/documents/list (same source as onboarding).
 * Uses /api/documents/upload — full pipeline with Azure OCR + Claude CV parsing.
 *
 * Contract (SICHERHEITSARCHITEKTUR.md Section 6):
 * - Time-based simulated progress that mirrors real server timing.
 *   File transfer is fast (~1s), but server-side OCR + Mistral parsing takes
 *   20–45s. Stage timing was tuned to match the real pipeline.
 * - Stages: 0→10% (1s upload) → 10→20% (8s analyse) → 20→40% (12s extract)
 *           → 40→60% (20s save) → 60→90% (10s formulate) → cap
 *   On server response: animate current → 100% over 5s.
 *
 * Cover Letter Categorization:
 * - User-created categories stored in localStorage
 * - Collapsible category groups reduce visual clutter
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { FileText, Upload, Trash2, Plus, Download, ChevronDown, ChevronRight, Tag, X, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/motion/button";
import { useNotification } from "@/hooks/use-notification";
import { useTranslations, useLocale } from "next-intl";
import { CvEditConfirmDialog } from "./cv-edit-confirm-dialog";
import type { CvStructuredData } from "@/types/cv";

type DocumentEntry = {
    id: string;
    type: 'cv' | 'cover_letter';
    name: string;
    createdAt: string;
};

type CategoryMap = Record<string, string[]>; // categoryName → [documentId, ...]

const STORAGE_KEY = 'pathly_cl_categories';
const COLLAPSED_KEY = 'pathly_cl_collapsed';
// User-scoped key — prevents one account's dismissed state leaking to another account on same browser
const clHintKey = (uid: string) => `pathly_cl_hint_dismissed_${uid}`;

function formatDate(dateStr: string, locale: string) {
    const tag = locale === 'de' ? 'de-DE' : locale === 'es' ? 'es-ES' : 'en-US';
    return new Date(dateStr).toLocaleDateString(tag, {
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

// Time-based simulated upload progress. Each stage holds (atSec, pct, statusKey)
// where atSec is the cumulative second mark at which the bar should reach pct.
// Bar fills smoothly between stages by linear interpolation.
const SIMULATION_STAGES: { atSec: number; pct: number; statusKey: string }[] = [
    { atSec: 0, pct: 0, statusKey: 'status_uploading' },
    { atSec: 1, pct: 10, statusKey: 'status_uploading' },
    { atSec: 9, pct: 20, statusKey: 'status_analyzing' },
    { atSec: 21, pct: 40, statusKey: 'status_extracting' },
    { atSec: 41, pct: 60, statusKey: 'status_saving' },
    { atSec: 51, pct: 90, statusKey: 'status_formulating' },
];

function computeSimulatedProgress(elapsedMs: number): { pct: number; statusKey: string } {
    const sec = elapsedMs / 1000;
    for (let i = 0; i < SIMULATION_STAGES.length - 1; i++) {
        const a = SIMULATION_STAGES[i];
        const b = SIMULATION_STAGES[i + 1];
        if (sec < b.atSec) {
            const ratio = (sec - a.atSec) / (b.atSec - a.atSec);
            return {
                pct: Math.round(a.pct + ratio * (b.pct - a.pct)),
                statusKey: b.statusKey,
            };
        }
    }
    const last = SIMULATION_STAGES[SIMULATION_STAGES.length - 1];
    return { pct: last.pct, statusKey: last.statusKey };
}

export function ActiveCVCard() {
    const [docs, setDocs] = useState<DocumentEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const notify = useNotification();
    const t = useTranslations('upload');
    const locale = useLocale();
    const [uploading, setUploading] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const cvRef = useRef<HTMLInputElement>(null);
    const clRef = useRef<HTMLInputElement>(null);
    const searchParams = useSearchParams();
    const router = useRouter();
    const returnTo = searchParams.get('returnTo');
    // ✅ User ID for scoped localStorage keys — loaded async, empty string until resolved
    const [userId, setUserId] = useState<string>('');

    // Category state
    const [categories, setCategories] = useState<CategoryMap>({});
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [newCategoryName, setNewCategoryName] = useState('');
    const [showAddCategory, setShowAddCategory] = useState(false);

    // CV delete confirm dialog (Phase 4 — Single-CV invariant)
    const [confirmDeleteCvId, setConfirmDeleteCvId] = useState<string | null>(null);
    const [isDeletingCv, setIsDeletingCv] = useState(false);

    // User-Edit-First parse confirmation dialog
    const [pendingConfirm, setPendingConfirm] = useState<{ documentId: string; parsedData: CvStructuredData } | null>(null);
    const [reparsingId, setReparsingId] = useState<string | null>(null);

    // CL upload hint dialog
    const [showClHint, setShowClHint] = useState(false);
    const [isClDismissing, setIsClDismissing] = useState(false);
    const [pendingClFile, setPendingClFile] = useState<File | null>(null);
    const clHintDismissedRef = useRef(false);
    const clHintSeenRef = useRef(false); // true once popup has been shown this session

    useEffect(() => {
        // Load user ID first, then read user-scoped dismissed flag for the CL hint.
        import('@/lib/supabase/client').then(({ createClient }) => {
            const supabase = createClient();
            supabase.auth.getUser().then(({ data }) => {
                const uid = data.user?.id ?? '';
                setUserId(uid);
                if (!uid) return;
                try {
                    clHintDismissedRef.current = localStorage.getItem(clHintKey(uid)) === 'true';
                } catch {}
            });
        });
    }, []);

    // ── CL Hint handlers ──────────────────────────────────────────────────────
    const handleClUploadClick = () => {
        if (clHintDismissedRef.current || clHintSeenRef.current) {
            clRef.current?.click();
        } else {
            clHintSeenRef.current = true; // mark seen so file-select doesn't re-trigger
            setShowClHint(true);
        }
    };

    const handleClHintContinue = () => {
        setShowClHint(false);
        if (pendingClFile) {
            handleUpload(pendingClFile, 'cover_letter');
            setPendingClFile(null);
        } else {
            clRef.current?.click();
        }
    };

    const handleClHintDismissForever = () => {
        if (isClDismissing) return;
        setIsClDismissing(true);
        try { if (userId) localStorage.setItem(clHintKey(userId), 'true'); } catch {}
        clHintDismissedRef.current = true;
        const pending = pendingClFile;
        setPendingClFile(null);
        setTimeout(() => {
            setShowClHint(false);
            setIsClDismissing(false);
            if (pending) {
                handleUpload(pending, 'cover_letter');
            } else {
                clRef.current?.click();
            }
        }, 1000);
    };

    const handleClFileSelect = (file: File) => {
        // Skip popup if: user dismissed forever OR already saw it this session
        if (clHintDismissedRef.current || clHintSeenRef.current) {
            handleUpload(file, 'cover_letter');
        } else {
            clHintSeenRef.current = true;
            setPendingClFile(file);
            setShowClHint(true);
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

        // Snapshot the current doc IDs of this type so we can detect a silent
        // server-side success even if the XHR connection drops mid-response
        // (Next.js dev/Turbopack occasionally closes long-running connections
        // after the route has already finished its work). See verifySuccess().
        const initialIds = new Set(docs.filter(d => d.type === type).map(d => d.id));

        // Poll /api/documents/list for up to 60s — if a new doc of `type`
        // appears, the upload silently succeeded and we treat it as success.
        const verifySilentSuccess = async (): Promise<boolean> => {
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const res = await fetch('/api/documents/list');
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (!data.success) continue;
                    const found = (data.documents as DocumentEntry[]).some(
                        d => d.type === type && !initialIds.has(d.id)
                    );
                    if (found) return true;
                } catch { /* keep polling */ }
            }
            return false;
        };


        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('type', type);

            // Time-based simulated progress: real server work takes 20–45s
            // (OCR + Mistral parser), but the browser-to-server file transfer
            // is fast (~1s). Tracking only XHR upload progress would leave the
            // bar stuck at 80% for 20+ seconds, signalling failure to the user.
            // Instead, we run a piecewise-linear timer matching real timing.
            const responseBody = await new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const startTime = Date.now();

                let simInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const { pct, statusKey } = computeSimulatedProgress(elapsed);
                    setUploadProgress(pct);
                    setUploadStatus(t(statusKey));
                }, 200);

                const stopSim = () => {
                    if (simInterval) { clearInterval(simInterval); simInterval = null; }
                };

                xhr.onload = () => {
                    stopSim();
                    if (xhr.status >= 200 && xhr.status < 300) {
                        // Smooth ramp from current pct → 100 over 5s, then resolve.
                        const elapsedAtResp = Date.now() - startTime;
                        const startPct = computeSimulatedProgress(elapsedAtResp).pct;
                        const animStart = Date.now();
                        const finishInterval = setInterval(() => {
                            const ratio = Math.min(1, (Date.now() - animStart) / 5000);
                            setUploadProgress(Math.round(startPct + ratio * (100 - startPct)));
                            if (ratio >= 1) {
                                clearInterval(finishInterval);
                                setUploadStatus(t('status_done'));
                                resolve(xhr.responseText);
                            }
                        }, 100);
                    } else {
                        try {
                            const body = JSON.parse(xhr.responseText);
                            reject(new Error(body.error || 'Upload fehlgeschlagen'));
                        } catch {
                            reject(new Error('Upload fehlgeschlagen'));
                        }
                    }
                };

                xhr.onerror = () => { stopSim(); reject(new Error('Netzwerkfehler beim Upload')); };
                xhr.open('POST', '/api/documents/upload');
                xhr.send(fd);
            });

            // For CV uploads, open the user-edit-first confirmation dialog with
            // the parsed structure. The profile is NOT yet updated — that
            // happens in /api/documents/confirm-parse, triggered by the dialog.
            if (type === 'cv') {
                try {
                    const parsed = JSON.parse(responseBody);
                    const cvId = parsed?.data?.document_ids?.cv as string | null | undefined;
                    const cvParsed = parsed?.data?.cv_parsed as CvStructuredData | null | undefined;
                    if (cvId && cvParsed) {
                        setPendingConfirm({ documentId: cvId, parsedData: cvParsed });
                        notify(t('cv_review_pending_toast'));
                    } else {
                        notify(t('cv_uploaded_toast'));
                    }
                } catch {
                    notify(t('cv_uploaded_toast'));
                }
            } else {
                notify(t('cl_uploaded_toast'));
            }
            await loadDocs();

            // QA Integration: If user came from a feature via DocumentsRequiredDialog,
            // redirect them back after successful upload
            if (returnTo) {
                setTimeout(() => {
                    router.push(decodeURIComponent(returnTo));
                }, 1500); // Short delay so user sees "Fertig ✅" status
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
            notify(errMsg);
            console.error('[ActiveCVCard] Upload failed:', errMsg);
        } finally {
            setUploading(null);
            setTimeout(() => {
                setUploadProgress(0);
                setUploadStatus('');
            }, 3000);
        }
    };

    const handleReparse = async (cvDocumentId: string) => {
        if (reparsingId) return;
        setReparsingId(cvDocumentId);
        try {
            const res = await fetch('/api/documents/reparse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cvDocumentId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) {
                throw new Error(data?.error || `HTTP ${res.status}`);
            }
            const parsed = data?.data?.cv_parsed as CvStructuredData | undefined;
            if (parsed) {
                setPendingConfirm({ documentId: cvDocumentId, parsedData: parsed });
                notify(t('cv_review_pending_toast'));
            } else {
                throw new Error('Re-parse returned no data');
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Re-parse failed';
            notify(t('reparse_failed', { error: errMsg }));
        } finally {
            setReparsingId(null);
        }
    };

    // Performs the actual delete request. CV deletes are routed through the
    // confirm dialog (executeDeleteCv); CL deletes call this directly.
    const performDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Löschen fehlgeschlagen');
            notify('Dokument gelöscht');
            setDocs(prev => prev.filter(d => d.id !== id));
            const updated = { ...categories };
            for (const cat of Object.keys(updated)) {
                updated[cat] = updated[cat].filter(docId => docId !== id);
            }
            setCategories(updated);
            saveCategories(updated);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Löschen fehlgeschlagen';
            notify(t('delete_failed_toast', { error: errMsg }));
        }
    };

    const requestDelete = (doc: DocumentEntry) => {
        if (doc.type === 'cv') {
            setConfirmDeleteCvId(doc.id);
        } else {
            performDelete(doc.id);
        }
    };

    const executeDeleteCv = async () => {
        if (!confirmDeleteCvId || isDeletingCv) return;
        setIsDeletingCv(true);
        try {
            await performDelete(confirmDeleteCvId);
        } finally {
            setIsDeletingCv(false);
            setConfirmDeleteCvId(null);
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
                <p className="text-xs text-[#73726E]">{t('uploaded_at')}: {formatDate(doc.createdAt, locale)}</p>
            </div>
            {/* Category selector for cover letters */}
            {doc.type === 'cover_letter' && categoryNames.length > 0 && (
                <select
                    value={getCategoryForDoc(doc.id) ?? '__none__'}
                    onChange={(e) => assignCategory(doc.id, e.target.value)}
                    className="text-xs border border-[#E7E7E5] rounded px-1.5 py-1 text-[#73726E] bg-white focus:outline-none focus:ring-1 focus:ring-[#012e7a]/30 max-w-[120px]"
                    title={t('category_assign_title')}
                >
                    <option value="__none__">{t('category_none')}</option>
                    {categoryNames.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            )}
            <div className="flex items-center gap-1">
                {doc.type === 'cv' && (
                    <button
                        onClick={() => handleReparse(doc.id)}
                        disabled={reparsingId === doc.id}
                        className="text-[#A8A29E] hover:text-[#012e7a] transition-colors p-1 disabled:opacity-50"
                        title={reparsingId === doc.id ? t('reparse_in_progress') : t('reparse_title')}
                    >
                        <RefreshCw className={`w-4 h-4 ${reparsingId === doc.id ? 'animate-spin' : ''}`} />
                    </button>
                )}
                <button onClick={() => handleDownload(doc.id, doc.name)} className="text-[#A8A29E] hover:text-[#012e7a] transition-colors p-1" title={t('download_title')}>
                    <Download className="w-4 h-4" />
                </button>
                <button onClick={() => requestDelete(doc)} className="text-[#A8A29E] hover:text-red-500 transition-colors p-1" title={t('delete_title')}>
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

            {/* CV Section — Single-CV invariant: max 1 per user */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#012e7a]" />
                        {t('cv_section_title')}
                    </h3>
                    <Button
                        variant="secondary"
                        className="text-xs h-8"
                        onClick={() => cvRef.current?.click()}
                        disabled={!!uploading || cvDocs.length >= 1}
                        title={cvDocs.length >= 1 ? t('cv_max_reached') : undefined}
                    >
                        <Upload className="w-3 h-3 mr-1.5" />
                        {uploading === 'cv' ? `${uploadProgress}%` : t('upload_button', { current: cvDocs.length, max: 1 })}
                    </Button>
                </div>

                {isLoading ? (
                    <div className="h-10 bg-[#F7F7F5] rounded-lg animate-pulse" />
                ) : cvDocs.length === 0 ? (
                    <div
                        className="border-2 border-dashed border-[#E7E7E5] rounded-lg p-5 text-center cursor-pointer hover:border-[#012e7a]/40 hover:bg-[#F0F7FF]/30 transition-all"
                        onClick={() => cvRef.current?.click()}
                    >
                        <Plus className="w-5 h-5 text-[#A8A29E] mx-auto mb-1" />
                        <p className="text-sm text-[#73726E]">{t('no_cv_uploaded')}</p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {cvDocs.map(doc => renderDocRow(doc, true))}
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
                        <FileText className="w-4 h-4 text-[#012e7a]" />
                        {t('cl_section_title')}
                    </h3>
                    <div className="flex items-center gap-2">
                        {/* Add Category Button */}
                        {clDocs.length > 0 && (
                            <button
                                onClick={() => setShowAddCategory(!showAddCategory)}
                                className="flex items-center gap-1 text-xs text-[#73726E] hover:text-[#012e7a] transition-colors px-2 py-1 rounded border border-[#E7E7E5] hover:border-[#012e7a]/30"
                                title={t('category_create_title')}
                            >
                                <Tag className="w-3 h-3" />
                                {t('category_button')}
                            </button>
                        )}
                        <Button
                            variant="secondary"
                            className="text-xs h-8"
                            onClick={handleClUploadClick}
                            disabled={!!uploading || clDocs.length >= 3}
                            title={clDocs.length >= 3 ? t('cl_max_reached') : undefined}
                        >
                            <Upload className="w-3 h-3 mr-1.5" />
                            {uploading === 'cover_letter' ? `${uploadProgress}%` : t('upload_button', { current: clDocs.length, max: 3 })}
                        </Button>
                    </div>
                </div>

                {/* Add Category Input */}
                {showAddCategory && (
                    <div className="flex items-center gap-2 mb-3 p-2 bg-[#F7F7F5] rounded-lg border border-[#E7E7E5]">
                        <Tag className="w-3.5 h-3.5 text-[#73726E] shrink-0" />
                        <input
                            type="text"
                            placeholder={t('category_placeholder')}
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
                        <p className="text-sm text-[#73726E]">{t('cl_empty_hint')}</p>
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
                                                title={t('category_delete_title')}
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
                                            title={t('category_delete_title')}
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
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleClFileSelect(f); e.target.value = ''; } }}
                />
            </div>
            {/* CL Upload Hint Dialog */}
            {showClHint && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => { if (!isClDismissing) { setShowClHint(false); setPendingClFile(null); } }}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-[#E7E7E5] w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6">
                            {/* Icon + Title */}
                            <div className="flex items-start gap-3 mb-4">
                                <div className="p-2 bg-[#012e7a]/10 rounded-xl shrink-0">
                                    <FileText className="w-5 h-5 text-[#012e7a]" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-[#37352F] leading-snug">
                                        {t('cl_hint_title')}
                                    </h3>
                                    <p className="text-sm text-[#73726E] mt-1">
                                        {t.rich('cl_hint_description', {
                                            strong: (chunks) => <strong className="font-semibold text-[#37352F]">{chunks}</strong>
                                        })}
                                    </p>
                                </div>
                            </div>


                            {/* Actions */}
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleClHintContinue}
                                    className="w-full px-4 py-2.5 bg-[#012e7a] text-white text-sm font-medium rounded-lg hover:bg-[#011f5e] transition-colors"
                                >
                                    {t('cl_hint_continue')}
                                </button>
                                <button
                                    onClick={handleClHintDismissForever}
                                    className="flex items-center justify-center gap-2 w-full py-1"
                                    disabled={isClDismissing}
                                >
                                    <span className={`relative w-7 h-4 rounded-full flex-shrink-0 transition-colors duration-300 ${
                                        isClDismissing ? 'bg-[#012e7a]' : 'bg-[#E7E7E5]'
                                    }`}>
                                        <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-300 ${
                                            isClDismissing ? 'left-3.5 bg-white' : 'left-0.5 bg-[#A8A29E]'
                                        }`} />
                                    </span>
                                    <span className={`text-xs transition-colors duration-300 ${
                                        isClDismissing ? 'text-[#012e7a] font-medium' : 'text-[#A8A29E]'
                                    }`}>
                                        {t('cl_hint_dismiss')}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {/* User-Edit-First parse confirmation dialog */}
            {pendingConfirm && (
                <CvEditConfirmDialog
                    cvDocumentId={pendingConfirm.documentId}
                    parsedData={pendingConfirm.parsedData}
                    onClose={() => { setPendingConfirm(null); loadDocs(); }}
                    onSaved={() => { setPendingConfirm(null); loadDocs(); }}
                />
            )}

            {/* CV Delete Confirm Dialog (Phase 4) */}
            {confirmDeleteCvId && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => { if (!isDeletingCv) setConfirmDeleteCvId(null); }}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-[#E7E7E5] w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-start gap-3 mb-4">
                                <div className="p-2 bg-red-50 rounded-xl shrink-0">
                                    <Trash2 className="w-5 h-5 text-red-500" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-[#37352F] leading-snug">
                                        {t('confirm_delete_cv_title')}
                                    </h3>
                                    <p className="text-sm text-[#73726E] mt-1">
                                        {t('confirm_delete_cv_body')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setConfirmDeleteCvId(null)}
                                    disabled={isDeletingCv}
                                    className="flex-1 px-4 py-2.5 border border-[#E7E7E5] text-[#37352F] text-sm font-medium rounded-lg hover:bg-[#F7F7F5] transition-colors disabled:opacity-50"
                                >
                                    {t('confirm_delete_cv_cancel')}
                                </button>
                                <button
                                    onClick={executeDeleteCv}
                                    disabled={isDeletingCv}
                                    className="flex-1 px-4 py-2.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                                >
                                    {t('confirm_delete_cv_confirm')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
