import { Font } from '@react-pdf/renderer';

let registered = false;

/**
 * Register Inter font family for React-PDF rendering.
 * Call this once before rendering any PDF template.
 * Guard: only runs in the browser — @react-pdf/renderer is SSR-unsafe.
 *
 * IMPORTANT: @react-pdf/renderer renders in a Web Worker.
 * Relative paths like '/fonts/Inter-Regular.ttf' resolve relative to the
 * worker script URL (a webpack chunk), NOT the page origin — causing a
 * "Unknown font format" error because the worker fetches an HTML error page.
 * Solution: use window.location.origin for absolute URL resolution.
 */
export function registerPdfFonts() {
    if (typeof window === 'undefined') return; // SSR guard
    if (registered) return;
    registered = true;

    const origin = window.location.origin;

    Font.register({
        family: 'Inter',
        fonts: [
            {
                src: `${origin}/fonts/Inter-Regular.ttf`,
                fontWeight: 400,
            },
            {
                src: `${origin}/fonts/Inter-SemiBold.ttf`,
                fontWeight: 600,
            },
            {
                src: `${origin}/fonts/Inter-Bold.ttf`,
                fontWeight: 700,
            },
        ],
    });

    // Disable mid-word hyphenation globally.
    Font.registerHyphenationCallback((word: string) => [word]);
}
