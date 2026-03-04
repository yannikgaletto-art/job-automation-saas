'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, ChevronUp, MessageSquare, Plus, Send, X,
    Repeat, HelpCircle, Rocket, Clock, TrendingUp, MessageCircle,
    Loader2, AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────
interface CommunityProfile {
    user_id: string;
    display_name: string;
    skills: string[];
    learning_goals: string[];
    looking_for: string;
}

interface CommunityPost {
    id: string;
    community_slug: string;
    user_id: string;
    post_type: 'ask' | 'offer' | 'discussion';
    title: string;
    content: string;
    tags: string[];
    created_at: string;
    display_name: string;
    upvote_count: number;
    comment_count: number;
    user_has_upvoted?: boolean;
}

interface CommunityComment {
    id: string;
    post_id: string;
    user_id: string;
    content: string;
    created_at: string;
    display_name: string;
}

// ─── Slug Config ──────────────────────────────────────────────────
const SLUG_CONFIG: Record<string, {
    title: string;
    description: string;
    icon: typeof Repeat;
    gradient: string;
    iconColor: string;
}> = {
    'skill-share': {
        title: 'Skill-Share',
        description: 'Biete was du kannst, finde was du brauchst.',
        icon: Repeat,
        gradient: 'from-blue-50 to-indigo-100',
        iconColor: 'text-blue-500',
    },
    career: {
        title: 'Career Questions',
        description: 'Stelle Karrierefragen und lerne von der Community.',
        icon: HelpCircle,
        gradient: 'from-amber-50 to-orange-100',
        iconColor: 'text-amber-500',
    },
    entrepreneurship: {
        title: 'Entrepreneurship',
        description: 'Vernetze dich mit Gruendern und teile Ideen.',
        icon: Rocket,
        gradient: 'from-emerald-50 to-teal-100',
        iconColor: 'text-emerald-500',
    },
};

// ─── Helpers ──────────────────────────────────────────────────────
function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 85%)`;
}

function getInitials(name: string): string {
    if (!name || !name.trim()) return '?';
    return name.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `vor ${days}d`;
    return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

// ─── UserAvatar ───────────────────────────────────────────────────
function UserAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
    const dim = size === 'md' ? 'w-10 h-10 text-sm' : 'w-7 h-7 text-[11px]';
    return (
        <div
            className={`${dim} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
            style={{ backgroundColor: getAvatarColor(name), color: '#37352F' }}
        >
            {getInitials(name)}
        </div>
    );
}

// ─── Skeleton Loader ──────────────────────────────────────────────
function PostSkeleton() {
    return (
        <div className="bg-white rounded-lg border border-[#E7E7E5] p-5 animate-pulse space-y-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#E7E7E5]" />
                <div className="h-4 w-32 bg-[#E7E7E5] rounded" />
            </div>
            <div className="h-4 w-full bg-[#E7E7E5] rounded" />
            <div className="h-4 w-3/4 bg-[#E7E7E5] rounded" />
            <div className="flex gap-4 pt-2">
                <div className="h-4 w-12 bg-[#E7E7E5] rounded" />
                <div className="h-4 w-12 bg-[#E7E7E5] rounded" />
            </div>
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────
function EmptyState({ slug }: { slug: string }) {
    const messages: Record<string, { title: string; description: string }> = {
        'skill-share': {
            title: 'Noch keine Skill-Share-Posts',
            description: 'Sei der Erste und biete deine Skills an oder suche nach einem Tausch-Partner.',
        },
        career: {
            title: 'Noch keine Fragen',
            description: 'Stelle die erste Karrierefrage und starte die Diskussion.',
        },
        entrepreneurship: {
            title: 'Noch keine Posts',
            description: 'Teile deine Idee oder suche nach einem Co-Founder.',
        },
    };
    const msg = messages[slug] ?? messages.career;
    return (
        <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 text-[#E7E7E5]" />
            <p className="font-medium text-[#37352F]">{msg.title}</p>
            <p className="text-sm text-[#73726E] mt-1">{msg.description}</p>
        </div>
    );
}

// ─── Error State ──────────────────────────────────────────────────
function ErrorState({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="text-center py-12">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-300" />
            <p className="font-medium text-[#37352F]">Posts konnten nicht geladen werden</p>
            <button
                onClick={onRetry}
                className="mt-3 px-4 py-2 text-sm font-medium text-[#0066FF] border border-[#0066FF] rounded-lg hover:bg-[#0066FF]/5 transition-colors"
            >
                Erneut versuchen
            </button>
        </div>
    );
}

// ─── Inline Profile Form ──────────────────────────────────────────
function InlineProfileForm({
    onCreated,
    onCancel,
}: {
    onCreated: () => void;
    onCancel: () => void;
}) {
    const [displayName, setDisplayName] = useState('');
    const [skills, setSkills] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!displayName.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/community/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: displayName.trim(),
                    skills: skills ? skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
                    learning_goals: [],
                    looking_for: '',
                }),
            });
            if (res.ok) {
                toast.success('Profil erstellt');
                onCreated();
            } else {
                toast.error('Profil konnte nicht erstellt werden. Bitte erneut versuchen.');
            }
        } catch {
            toast.error('Aktion fehlgeschlagen. Bitte erneut versuchen.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#F7F7F5] rounded-lg border border-[#E7E7E5] p-4 mb-4 overflow-hidden"
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#37352F]">
                    Erstelle dein Community-Profil
                </h3>
                <button onClick={onCancel} className="text-[#73726E] hover:text-[#37352F] transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                    <label className="text-xs font-medium text-[#73726E] block mb-1">Anzeigename</label>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="z.B. Yannik G."
                        className="w-full px-3 py-2 text-sm rounded-md border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF]"
                        required
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-[#73726E] block mb-1">Skills (optional, kommagetrennt)</label>
                    <input
                        type="text"
                        value={skills}
                        onChange={(e) => setSkills(e.target.value)}
                        placeholder="z.B. React, UX Design, Python"
                        className="w-full px-3 py-2 text-sm rounded-md border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF]"
                    />
                </div>
                <button
                    type="submit"
                    disabled={saving || !displayName.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0066FF] rounded-md hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Profil erstellen
                </button>
            </form>
        </motion.div>
    );
}

// ─── Post Card ────────────────────────────────────────────────────
function PostCard({
    post,
    onToggleExpand,
    isExpanded,
}: {
    post: CommunityPost;
    onToggleExpand: () => void;
    isExpanded: boolean;
}) {
    const [upvoted, setUpvoted] = useState(post.user_has_upvoted ?? false);
    const [upvoteCount, setUpvoteCount] = useState(post.upvote_count ?? 0);
    const [upvoteAnimating, setUpvoteAnimating] = useState(false);
    const [comments, setComments] = useState<CommunityComment[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [sendingComment, setSendingComment] = useState(false);

    const handleUpvote = async (e: React.MouseEvent) => {
        e.stopPropagation();
        // Optimistic update
        const prev = upvoted;
        const prevCount = upvoteCount;
        setUpvoted(!prev);
        setUpvoteCount(prev ? prevCount - 1 : prevCount + 1);
        setUpvoteAnimating(true);
        setTimeout(() => setUpvoteAnimating(false), 300);

        try {
            const res = await fetch(`/api/community/posts/${post.id}/upvote`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setUpvoted(data.upvoted);
                setUpvoteCount(data.upvote_count);
            } else {
                // Revert on failure
                setUpvoted(prev);
                setUpvoteCount(prevCount);
                toast.error('Aktion fehlgeschlagen. Bitte erneut versuchen.', { id: `upvote-error-${post.id}` });
            }
        } catch {
            setUpvoted(prev);
            setUpvoteCount(prevCount);
            toast.error('Aktion fehlgeschlagen. Bitte erneut versuchen.', { id: `upvote-error-${post.id}` });
        }
    };

    useEffect(() => {
        if (isExpanded && comments.length === 0) {
            setLoadingComments(true);
            fetch(`/api/community/posts/${post.id}/comments`)
                .then((r) => r.json())
                .then((d) => {
                    if (d.success) setComments(d.data ?? []);
                })
                .catch(() => {
                    toast.error('Kommentare konnten nicht geladen werden.');
                })
                .finally(() => setLoadingComments(false));
        }
    }, [isExpanded, post.id, comments.length]);

    const handleSendComment = async () => {
        if (!commentText.trim() || sendingComment) return;
        setSendingComment(true);
        try {
            const res = await fetch(`/api/community/posts/${post.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: commentText.trim() }),
            });
            if (res.ok) {
                const d = await res.json();
                if (d.success && d.data) {
                    setComments((prev) => [...prev, d.data]);
                    setCommentText('');
                    toast.success('Kommentar gepostet', { id: `comment-${d.data.id}` });
                }
            } else {
                toast.error('Kommentar konnte nicht gepostet werden.');
            }
        } catch {
            toast.error('Aktion fehlgeschlagen. Bitte erneut versuchen.');
        } finally {
            setSendingComment(false);
        }
    };

    const displayName = post.display_name || 'Anonym';
    const postTypeBadge = post.post_type === 'offer'
        ? { label: 'Biete', className: 'bg-green-100 text-green-700 border-green-200' }
        : post.post_type === 'ask'
            ? { label: 'Suche', className: 'bg-blue-100 text-blue-700 border-blue-200' }
            : null;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg border border-[#E7E7E5] transition-shadow hover:shadow-sm"
        >
            <div className="p-4 cursor-pointer" onClick={onToggleExpand}>
                {/* Author Row */}
                <div className="flex items-center gap-2.5 mb-2.5">
                    <UserAvatar name={displayName} size="md" />
                    <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-[#37352F]">{displayName}</span>
                        <span className="text-xs text-[#A9A9A6] ml-2">{formatRelativeTime(post.created_at)}</span>
                    </div>
                    {postTypeBadge && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${postTypeBadge.className}`}>
                            {postTypeBadge.label}
                        </Badge>
                    )}
                </div>

                {/* Title + Content */}
                <h3 className="text-[15px] font-semibold text-[#37352F] leading-snug">{post.title}</h3>
                {post.content && (
                    <p className={`text-sm text-[#73726E] mt-1 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-3'}`}>
                        {post.content}
                    </p>
                )}

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {post.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Action bar */}
                <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-[#F0F0EE]">
                    <button
                        onClick={handleUpvote}
                        className={`flex items-center gap-1 text-xs font-medium transition-colors ${upvoted ? 'text-[#0066FF]' : 'text-[#A9A9A6] hover:text-[#37352F]'
                            }`}
                    >
                        <motion.div
                            animate={upvoteAnimating ? { scale: [1, 1.3, 1] } : {}}
                            transition={{ duration: 0.3 }}
                        >
                            <ChevronUp className={`w-4 h-4 ${upvoted ? 'text-[#0066FF]' : ''}`} />
                        </motion.div>
                        {upvoteCount > 0 && <span>{upvoteCount}</span>}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                        className="flex items-center gap-1 text-xs text-[#A9A9A6] hover:text-[#37352F] transition-colors"
                    >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{post.comment_count ?? 0}</span>
                    </button>
                </div>
            </div>

            {/* Expanded Comments */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-[#E7E7E5] bg-[#FAFAF9] overflow-hidden"
                    >
                        <div className="p-4 space-y-3">
                            {loadingComments ? (
                                <div className="animate-pulse space-y-3">
                                    {[1, 2].map((i) => (
                                        <div key={i} className="flex gap-2.5">
                                            <div className="w-7 h-7 rounded-full bg-[#E7E7E5] flex-shrink-0" />
                                            <div className="flex-1 space-y-1">
                                                <div className="h-3 w-20 bg-[#E7E7E5] rounded" />
                                                <div className="h-4 w-full bg-[#E7E7E5] rounded" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : comments.length === 0 ? (
                                <p className="text-xs text-[#A9A9A6] text-center py-2">
                                    Noch keine Kommentare. Schreibe den ersten.
                                </p>
                            ) : (
                                comments.map((c, idx) => {
                                    const cName = c.display_name || 'Anonym';
                                    return (
                                        <motion.div
                                            key={c.id}
                                            initial={idx === comments.length - 1 ? { opacity: 0, height: 0 } : false}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="flex gap-2.5"
                                        >
                                            <UserAvatar name={cName} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-[#37352F]">{cName}</span>
                                                    <span className="text-[10px] text-[#A9A9A6]">{formatRelativeTime(c.created_at)}</span>
                                                </div>
                                                <p className="text-sm text-[#37352F] mt-0.5">{c.content}</p>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}

                            {/* Comment Input */}
                            <div className="flex gap-2 pt-1">
                                <input
                                    type="text"
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
                                    placeholder="Antwort schreiben..."
                                    className="flex-1 px-3 py-2 text-sm rounded-md border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF]"
                                />
                                <button
                                    onClick={handleSendComment}
                                    disabled={sendingComment || !commentText.trim()}
                                    className="p-2 text-white bg-[#0066FF] rounded-md hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Create Post Form ─────────────────────────────────────────────
function CreatePostForm({
    slug,
    onCreated,
    onCancel,
}: {
    slug: string;
    onCreated: () => void;
    onCancel: () => void;
}) {
    const [postType, setPostType] = useState<'ask' | 'offer' | 'discussion'>(
        slug === 'career' ? 'discussion' : 'ask'
    );
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSaving(true);
        try {
            const tags = tagInput ? tagInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
            const res = await fetch('/api/community/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    community_slug: slug,
                    post_type: postType,
                    title: title.trim(),
                    content: content.trim() || title.trim() + ' — Details folgen.',
                    tags,
                }),
            });
            if (res.ok) {
                const d = await res.json();
                toast.success('Post erstellt', { id: `post-created-${d.data?.id ?? 'new'}` });
                onCreated();
                setTitle('');
                setContent('');
                setTagInput('');
            } else {
                const d = await res.json().catch(() => ({}));
                toast.error(d.error ?? 'Post konnte nicht erstellt werden.');
            }
        } catch {
            toast.error('Aktion fehlgeschlagen. Bitte erneut versuchen.');
        } finally {
            setSaving(false);
        }
    };

    // Slug-specific toggles
    const showPostTypeToggle = slug === 'skill-share' || slug === 'entrepreneurship';
    const isCareer = slug === 'career';

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-lg border border-[#E7E7E5] p-5"
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#37352F]">Neuer Post</h3>
                <button onClick={onCancel} className="text-[#73726E] hover:text-[#37352F] transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
                {showPostTypeToggle && (
                    <div className="flex gap-2">
                        {(slug === 'skill-share'
                            ? (['offer', 'ask'] as const)
                            : (['ask', 'discussion'] as const)
                        ).map((type) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setPostType(type)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${postType === type
                                    ? 'bg-[#0066FF] text-white'
                                    : 'bg-[#F7F7F5] text-[#73726E] hover:bg-[#F0F0EE]'
                                    }`}
                            >
                                {type === 'offer' ? 'Biete' : type === 'ask' ? 'Suche' : 'Diskussion'}
                            </button>
                        ))}
                    </div>
                )}

                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={isCareer ? 'Deine Frage...' : 'Titel'}
                    className="w-full px-3 py-2 text-sm rounded-md border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF]"
                    required
                />

                {!isCareer && (
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Beschreibung (optional)"
                        rows={3}
                        className="w-full px-3 py-2 text-sm rounded-md border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] resize-none"
                    />
                )}

                {!isCareer && (
                    <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="Tags (kommagetrennt, optional)"
                        className="w-full px-3 py-2 text-sm rounded-md border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF]"
                    />
                )}

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving || !title.trim()}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0066FF] rounded-md hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Posten
                    </button>
                </div>
            </form>
        </motion.div>
    );
}

// ─── Sort Toggle ──────────────────────────────────────────────────
type SortOption = 'recent' | 'popular' | 'unanswered';

function SortToggle({
    active,
    onChange,
}: {
    active: SortOption;
    onChange: (s: SortOption) => void;
}) {
    const options: { value: SortOption; label: string; icon: typeof Clock }[] = [
        { value: 'recent', label: 'Neueste', icon: Clock },
        { value: 'popular', label: 'Beliebteste', icon: TrendingUp },
        { value: 'unanswered', label: 'Unbeantwortet', icon: MessageSquare },
    ];

    return (
        <div className="flex bg-[#F7F7F5] rounded-lg p-0.5 border border-[#E7E7E5]">
            {options.map((opt) => {
                const Icon = opt.icon;
                return (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${active === opt.value
                            ? 'bg-white text-[#37352F] shadow-sm'
                            : 'text-[#73726E] hover:text-[#37352F]'
                            }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function CommunityDetailPage() {
    const { slug } = useParams<{ slug: string }>();
    const config = SLUG_CONFIG[slug];

    const [posts, setPosts] = useState<CommunityPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [profile, setProfile] = useState<CommunityProfile | null>(null);
    const [profileChecked, setProfileChecked] = useState(false);
    const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showProfileForm, setShowProfileForm] = useState(false);
    const [sort, setSort] = useState<SortOption>('recent');

    // Fetch posts
    const fetchPosts = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const params = new URLSearchParams({ slug, sort });
            const res = await fetch(`/api/community/posts?${params}`);
            if (res.ok) {
                const d = await res.json();
                if (d.success) setPosts(d.data ?? []);
            } else {
                setLoadError(true);
            }
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [slug, sort]);

    // Fetch profile (parallel)
    const fetchProfile = useCallback(async () => {
        try {
            const res = await fetch('/api/community/profile');
            if (res.ok) {
                const d = await res.json();
                if (d.success && d.data) setProfile(d.data);
            }
        } catch {
            // silent — profile check is non-blocking
        } finally {
            setProfileChecked(true);
        }
    }, []);

    useEffect(() => {
        fetchPosts();
        fetchProfile();
    }, [fetchPosts, fetchProfile]);

    // Handle "New Post" — profile gate
    const handleNewPostClick = () => {
        if (!profile && profileChecked) {
            setShowProfileForm(true);
        } else {
            setShowCreateForm(true);
        }
    };

    const handleProfileCreated = () => {
        setShowProfileForm(false);
        fetchProfile();
        setShowCreateForm(true);
    };

    const handlePostCreated = () => {
        setShowCreateForm(false);
        fetchPosts();
    };

    if (!config) {
        return (
            <div className="text-center py-20">
                <p className="text-[#73726E]">Community nicht gefunden.</p>
                <Link href="/dashboard/community" className="text-sm text-[#0066FF] hover:underline mt-2 inline-block">
                    Zurueck zur Uebersicht
                </Link>
            </div>
        );
    }

    const Icon = config.icon;

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <Link
                    href="/dashboard/community"
                    className="inline-flex items-center gap-1.5 text-sm text-[#73726E] hover:text-[#37352F] transition-colors mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Community
                </Link>

                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center`}>
                            <Icon className={`w-5 h-5 ${config.iconColor}`} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-[#37352F]">{config.title}</h1>
                            <p className="text-sm text-[#73726E]">{config.description}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleNewPostClick}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#0066FF] rounded-lg hover:bg-[#0052CC] transition-colors flex-shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                        Neuer Post
                    </button>
                </div>
            </motion.div>

            {/* Filter Bar: 3-way sort toggle */}
            <div className="flex items-center gap-4">
                <SortToggle active={sort} onChange={setSort} />
            </div>

            {/* Inline Profile Form */}
            <AnimatePresence>
                {showProfileForm && (
                    <InlineProfileForm
                        onCreated={handleProfileCreated}
                        onCancel={() => setShowProfileForm(false)}
                    />
                )}
            </AnimatePresence>

            {/* Create Post Form */}
            <AnimatePresence>
                {showCreateForm && (
                    <CreatePostForm
                        slug={slug}
                        onCreated={handlePostCreated}
                        onCancel={() => setShowCreateForm(false)}
                    />
                )}
            </AnimatePresence>

            {/* Posts */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => <PostSkeleton key={i} />)}
                </div>
            ) : loadError ? (
                <ErrorState onRetry={fetchPosts} />
            ) : posts.length === 0 ? (
                <EmptyState slug={slug} />
            ) : (
                <div className="space-y-3">
                    {posts.map((post) => (
                        <PostCard
                            key={post.id}
                            post={post}
                            isExpanded={expandedPostId === post.id}
                            onToggleExpand={() =>
                                setExpandedPostId((prev) => (prev === post.id ? null : post.id))
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
