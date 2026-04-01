'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isAdmin } from '@/lib/admin';
import { Users, Trash2, RotateCcw, CheckCircle, XCircle, Shield, Loader2, Mail, Clock, Briefcase, FileText } from 'lucide-react';

type AdminUser = {
    id: string;
    email: string;
    full_name: string | null;
    created_at: string;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    onboarding_completed: boolean;
    active_jobs: number;
    applications: number;
};

function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleString('de-DE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatRelative(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `vor ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `vor ${days}d`;
}

export default function AdminPage() {
    const router = useRouter();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user || !isAdmin(user.email)) {
                router.replace('/dashboard');
                return;
            }

            setAuthorized(true);
            await loadUsers();
        };
        init();
    }, [router]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (data.success) {
                setUsers(data.users);
                setTotal(data.total);
            }
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (userId: string, email: string) => {
        if (!confirm(`User "${email}" wirklich löschen? Alle Daten werden gelöscht.`)) return;

        setActionLoading(userId);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            const data = await res.json();
            if (data.success) {
                setUsers(prev => prev.filter(u => u.id !== userId));
                setTotal(prev => prev - 1);
            } else {
                alert(data.error || 'Löschen fehlgeschlagen');
            }
        } finally {
            setActionLoading(null);
        }
    };

    const handleResetOnboarding = async (userId: string) => {
        setActionLoading(userId);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, action: 'reset_onboarding' }),
            });
            const data = await res.json();
            if (data.success) {
                setUsers(prev => prev.map(u =>
                    u.id === userId ? { ...u, onboarding_completed: false } : u
                ));
            }
        } finally {
            setActionLoading(null);
        }
    };

    if (!authorized) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-[#012e7a]" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-xl">
                    <Shield className="h-6 w-6 text-red-500" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-[#37352F]">Admin Panel</h1>
                    <p className="text-sm text-[#73726E]">
                        {total} registrierte User • Nur für Administratoren sichtbar
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                <div className="bg-white border border-[#E7E7E5] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-[#73726E] text-xs font-medium mb-1">
                        <Users className="w-3.5 h-3.5" />
                        Gesamt
                    </div>
                    <p className="text-2xl font-bold text-[#37352F]">{total}</p>
                </div>
                <div className="bg-white border border-[#E7E7E5] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-[#73726E] text-xs font-medium mb-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        Onboarding fertig
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                        {users.filter(u => u.onboarding_completed).length}
                    </p>
                </div>
                <div className="bg-white border border-[#E7E7E5] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-[#73726E] text-xs font-medium mb-1">
                        <Mail className="w-3.5 h-3.5 text-amber-500" />
                        E-Mail bestätigt
                    </div>
                    <p className="text-2xl font-bold text-amber-600">
                        {users.filter(u => u.email_confirmed_at).length}
                    </p>
                </div>
                <div className="bg-white border border-[#E7E7E5] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-[#73726E] text-xs font-medium mb-1">
                        <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                        Aktive Jobs
                    </div>
                    <p className="text-2xl font-bold text-blue-600">
                        {users.reduce((sum, u) => sum + u.active_jobs, 0)}
                    </p>
                </div>
                <div className="bg-white border border-[#E7E7E5] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-[#73726E] text-xs font-medium mb-1">
                        <FileText className="w-3.5 h-3.5 text-purple-500" />
                        Bewerbungen
                    </div>
                    <p className="text-2xl font-bold text-purple-600">
                        {users.reduce((sum, u) => sum + u.applications, 0)}
                    </p>
                </div>
            </div>

            {/* User Table */}
            <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-[#FAFAF9] border-b border-[#E7E7E5] flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#37352F]">Registrierte User</h2>
                    <button
                        onClick={loadUsers}
                        disabled={loading}
                        className="text-xs text-[#73726E] hover:text-[#012e7a] transition-colors flex items-center gap-1"
                    >
                        <RotateCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                        Aktualisieren
                    </button>
                </div>

                {loading ? (
                    <div className="p-12 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-[#73726E]" />
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E7E7E5] text-[#73726E]">
                                <th className="px-5 py-3 text-left font-medium">User</th>
                                <th className="px-5 py-3 text-left font-medium">Status</th>
                                <th className="px-5 py-3 text-center font-medium">Jobs</th>
                                <th className="px-5 py-3 text-center font-medium">Bewerbungen</th>
                                <th className="px-5 py-3 text-left font-medium">Registriert</th>
                                <th className="px-5 py-3 text-left font-medium">Letzter Login</th>
                                <th className="px-5 py-3 text-right font-medium">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E7E7E5]">
                            {users.map((u) => (
                                <tr key={u.id} className="hover:bg-[#FAFAF9] transition-colors">
                                    <td className="px-5 py-3">
                                        <div>
                                            <p className="font-medium text-[#37352F]">
                                                {u.full_name || '—'}
                                            </p>
                                            <p className="text-xs text-[#73726E]">{u.email}</p>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2">
                                            {u.onboarding_completed ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                                    <CheckCircle className="w-3 h-3" />
                                                    Aktiv
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                                    <Clock className="w-3 h-3" />
                                                    Onboarding
                                                </span>
                                            )}
                                            {!u.email_confirmed_at && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                                                    <XCircle className="w-3 h-3" />
                                                    Unbestätigt
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {u.active_jobs > 0 ? (
                                            <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                                {u.active_jobs}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-[#B4B4B0]">0</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {u.applications > 0 ? (
                                            <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                                {u.applications}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-[#B4B4B0]">0</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-[#73726E] text-xs">
                                        {formatDate(u.created_at)}
                                    </td>
                                    <td className="px-5 py-3 text-[#73726E] text-xs">
                                        {u.last_sign_in_at ? formatRelative(u.last_sign_in_at) : '—'}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {u.onboarding_completed && (
                                                <button
                                                    onClick={() => handleResetOnboarding(u.id)}
                                                    disabled={actionLoading === u.id}
                                                    className="p-1.5 text-[#73726E] hover:text-amber-600 hover:bg-amber-50 rounded-md transition-all disabled:opacity-40"
                                                    title="Onboarding zurücksetzen"
                                                >
                                                    {actionLoading === u.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <RotateCcw className="w-4 h-4" />
                                                    )}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(u.id, u.email)}
                                                disabled={actionLoading === u.id}
                                                className="p-1.5 text-[#73726E] hover:text-red-600 hover:bg-red-50 rounded-md transition-all disabled:opacity-40"
                                                title="User löschen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
