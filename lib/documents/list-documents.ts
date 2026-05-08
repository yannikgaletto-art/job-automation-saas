export type SupabaseLikeError = {
    code?: string;
    message?: string;
};

export function isMissingOriginColumnError(error: SupabaseLikeError | null | undefined): boolean {
    if (!error) return false;
    const message = error.message?.toLocaleLowerCase('en-US') ?? '';
    return error.code === '42703' || (
        message.includes('origin')
        && message.includes('does not exist')
    );
}
