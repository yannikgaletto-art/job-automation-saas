import { Font } from '@react-pdf/renderer';

let registered = false;

/**
 * Register Inter font family for React-PDF rendering.
 * Call this once before rendering any PDF template.
 * Guard: only runs in the browser — @react-pdf/renderer is SSR-unsafe.
 */
export function registerPdfFonts() {
    if (typeof window === 'undefined') return; // SSR guard
    if (registered) return;
    registered = true;

    Font.register({
        family: 'Inter',
        fonts: [
            {
                src: '/fonts/Inter-Regular.ttf',
                fontWeight: 400,
            },
            {
                src: '/fonts/Inter-SemiBold.ttf',
                fontWeight: 600,
            },
            {
                src: '/fonts/Inter-Bold.ttf',
                fontWeight: 700,
            },
        ],
    });

    // Disable mid-word hyphenation globally.
    // German compound words were breaking at arbitrary syllables.
    Font.registerHyphenationCallback((word: string) => [word]);
}
