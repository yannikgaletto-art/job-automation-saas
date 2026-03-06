/**
 * Admin constants — centralized list of admin email addresses.
 * Used by both frontend (sidebar visibility) and backend (API authorization).
 */
export const ADMIN_EMAILS = [
    'galettoyannik7@gmail.com',
    'yannik.galetto@gmail.com',
] as const;

export function isAdmin(email: string | undefined | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase() as typeof ADMIN_EMAILS[number]);
}
