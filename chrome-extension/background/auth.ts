import { createClient } from '@supabase/supabase-js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SET_ACCESS_TOKEN') {
        chrome.storage.local.set({
            accessToken: message.token,
            expiresAt: message.expiresAt
        });
        sendResponse({ success: true });
    }
});

export async function getAuthenticatedClient() {
    const { accessToken } = await chrome.storage.local.get('accessToken');

    if (!accessToken) {
        throw new Error('Not authenticated. Please sync token from dashboard.');
    }

    return createClient(
        process.env.PLASMO_PUBLIC_SUPABASE_URL!,
        process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        }
    );
}
