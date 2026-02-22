import { Font } from '@react-pdf/renderer';

let registered = false;

/**
 * Register Inter font family for React-PDF rendering.
 * Uses Google Fonts CDN for reliable loading in all environments.
 * Call this once before rendering any PDF template.
 */
export function registerPdfFonts() {
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
}
