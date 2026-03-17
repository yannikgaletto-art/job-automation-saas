'use client';

import { useEffect } from 'react';
import { Button } from '@/components/motion/button';

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Dashboard caught error:", error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-white rounded-xl border border-red-100 shadow-sm">
            <h2 className="text-xl font-bold text-red-600 mb-2">Da ist etwas schiefgelaufen!</h2>
            <p className="text-[#73726E] mb-6 max-w-md">
                Leider gab es beim Laden dieser Seite einen Fehler: {error.message}
            </p>
            <Button variant="primary" onClick={reset}>
                Erneut versuchen
            </Button>
        </div>
    );
}
