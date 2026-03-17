'use client';

import { useEffect } from 'react';

export default function JobQueueError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Job Queue] Runtime error:', error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
            <div className="text-3xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-[#37352F] mb-2">
                Job Queue konnte nicht geladen werden
            </h2>
            <p className="text-sm text-[#73726E] mb-6 max-w-sm">
                {error.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
            </p>
            <button
                onClick={reset}
                className="px-4 py-2 bg-[#012e7a] text-white text-sm rounded-lg hover:bg-[#012e7a]/90 transition-colors"
            >
                Erneut versuchen
            </button>
        </div>
    );
}
