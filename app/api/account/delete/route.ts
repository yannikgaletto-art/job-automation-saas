/**
 * User Self-Delete API
 *
 * DELETE /api/account/delete
 *
 * Allows authenticated users to permanently delete their own account.
 * DSGVO Art. 17: Right to Erasure.
 *
 * Flow:
 * 1. Frontend reads userId from session (auth token still valid)
 * 2. This API validates auth + calls shared deletion service
 * 3. Frontend calls supabase.auth.signOut() AFTER successful response
 * 4. Frontend redirects to /login
 *
 * Rate limited to prevent abuse: 1 request per 10 minutes.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteUserAccount } from '@/lib/services/account-deletion';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';

export async function DELETE() {
    // Auth guard FIRST: derive userId from session (token is still valid at this point)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 1 per 10 minutes PER USER (must be AFTER auth to use user.id)
    // Using global key was a DoS vector — one request would block ALL users.
    const blocked = await checkUpstashLimit(rateLimiters.accountDelete, user.id);
    if (blocked) return blocked;

    console.log(`[account/delete] User ${user.id} requested account deletion`);

    // Execute deletion via shared service
    const result = await deleteUserAccount(user.id);

    if (!result.success) {
        console.error(`[account/delete] Failed for ${user.id}:`, result.error);
        return NextResponse.json(
            {
                error: result.error || 'Löschung fehlgeschlagen. Bitte kontaktiere support@path-ly.eu',
                success: false,
            },
            { status: 500 }
        );
    }

    return NextResponse.json({
        success: true,
        message: 'Account und alle Daten wurden dauerhaft gelöscht.',
    });
}
