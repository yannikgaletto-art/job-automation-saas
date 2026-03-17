'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function ExtensionSyncPage() {
    const [synced, setSynced] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function syncToken() {
            try {
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );
                const { data: { session } } = await supabase.auth.getSession();

                if (session?.access_token) {
                    window.postMessage({
                        type: 'PATHLY_SET_TOKEN',
                        token: session.access_token,
                        expiresAt: session.expires_at
                    }, '*');

                    setSynced(true);
                } else {
                    setError('Kein aktiver Login gefunden. Bitte einloggen.');
                }
            } catch (err) {
                setError('Fehler beim Synchronisieren.');
            }
        }

        syncToken();
    }, []);

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 max-w-md w-full text-center">
                <h1 className="text-2xl font-bold text-white mb-6">🔗 Chrome Extension Sync</h1>

                {error ? (
                    <div className="text-red-400 bg-red-900/20 rounded-lg p-4">
                        <p>❌ {error}</p>
                    </div>
                ) : synced ? (
                    <div className="text-green-400 bg-green-900/20 rounded-lg p-4">
                        <p className="text-xl mb-2">✅ Extension synchronisiert!</p>
                        <p className="text-slate-400 text-sm">
                            Du kannst dieses Tab jetzt schließen.
                        </p>
                    </div>
                ) : (
                    <div className="text-yellow-400 bg-yellow-900/20 rounded-lg p-4">
                        <p className="text-xl">⏳ Synchronisiere...</p>
                    </div>
                )}
            </div>
        </div>
    );
}
