'use client'

/**
 * @deprecated ZOMBIE CODE — DO NOT USE
 *
 * Diese Page nutzte window.postMessage('*') zum Token-Transfer.
 * Das ist eine SICHERHEITSLÜCKE (beliebige Scripts empfangen den JWT).
 *
 * Ersetzt durch: /auth/extension/callback (PKCE Tab-Callback)
 * Datum: 2026-03-31
 *
 * TODO: Nach Bestätigung, dass keine Extension-Version mehr diese
 * URL nutzt → komplette Datei löschen.
 */

export default function ExtensionSyncPageDeprecated() {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="bg-red-900/20 backdrop-blur-sm rounded-2xl p-8 border border-red-700 max-w-md w-full text-center">
                <h1 className="text-2xl font-bold text-red-400 mb-4">
                    ⚠️ Veraltete Seite
                </h1>
                <p className="text-slate-300 text-sm mb-4">
                    Diese Seite wird nicht mehr verwendet.
                </p>
                <p className="text-slate-400 text-xs">
                    Bitte nutze die aktuelle Pathly Browser Extension.
                </p>
            </div>
        </div>
    )
}
