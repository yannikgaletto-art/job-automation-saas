import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// Ensure strict 32-byte key length. 
// In production, this should come from process.env.ENCRYPTION_KEY and be strictly managed.
// For development, we'll use a fallback but warn about it.
const ERR_MISSING_KEY = 'ENCRYPTION_KEY must be set in environment variables and be 32 bytes long (hex or raw).';

function getKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        // Fallback for DEV ONLY - generates a warning
        console.warn('⚠️ WARNING: Using fallback encryption key. SET ENCRYPTION_KEY IN PRODUCTION!');
        return crypto.scryptSync('development-fallback-secret', 'salt', 32);
    }
    // If key is hex string (64 chars), convert to buffer
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }
    // If key is 32 chars (raw bytes represented as string)
    if (key.length === 32) {
        return Buffer.from(key, 'utf-8');
    }
    // If key is Base64-encoded (44 chars = 32 bytes)
    if (key.length === 44 && key.endsWith('=')) {
        const buf = Buffer.from(key, 'base64');
        if (buf.length === 32) return buf;
    }
    // Final fallback: try base64 regardless of length and check decoded length
    try {
        const buf = Buffer.from(key, 'base64');
        if (buf.length === 32) return buf;
    } catch { }

    throw new Error(ERR_MISSING_KEY);
}

export function encrypt(text: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(16); // Initialization vector
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Return format: iv:authTag:encrypted_content
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
    const key = getKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format. Expected iv:authTag:content');
    }

    const [ivHex, authTagHex, contentHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(contentHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
