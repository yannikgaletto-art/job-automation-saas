/**
 * Structured Logger — Vercel Log-Drain Compatible
 *
 * Outputs JSON-structured logs with consistent fields:
 *   - timestamp, level, message, requestId, userId, endpoint, durationMs, meta
 *
 * Vercel log drains (Datadog, Axiom, etc.) can parse these automatically.
 * In dev mode, outputs human-readable format to console.
 *
 * Usage:
 *   import { logger } from '@/lib/logging';
 *   const log = logger.forRequest(requestId, userId, '/api/cv/match');
 *   log.info('CV Match started', { jobId });
 *   log.error('Analysis failed', { error: err.message });
 *   log.timing('AI inference', startTime);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    requestId?: string;
    userId?: string;
    endpoint?: string;
    durationMs?: number;
    meta?: Record<string, unknown>;
}

const IS_DEV = process.env.NODE_ENV === 'development';

function formatEntry(entry: LogEntry): string {
    if (IS_DEV) {
        // Human-readable dev format
        const prefix = `[${entry.level.toUpperCase()}]`;
        const ctx = [
            entry.endpoint,
            entry.requestId ? `req:${entry.requestId.substring(0, 8)}` : null,
            entry.durationMs != null ? `${entry.durationMs}ms` : null,
        ].filter(Boolean).join(' | ');
        const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
        return `${prefix} ${ctx ? `(${ctx}) ` : ''}${entry.message}${metaStr}`;
    }

    // Production: single-line JSON for log drains
    return JSON.stringify(entry);
}

function emitLog(entry: LogEntry) {
    const formatted = formatEntry(entry);
    switch (entry.level) {
        case 'debug':
            if (IS_DEV) console.debug(formatted);
            break;
        case 'info':
            console.log(formatted);
            break;
        case 'warn':
            console.warn(formatted);
            break;
        case 'error':
            console.error(formatted);
            break;
    }
}

export interface RequestLogger {
    debug: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    /** Log elapsed time since startTime */
    timing: (label: string, startTime: number, meta?: Record<string, unknown>) => void;
}

function createRequestLogger(
    requestId?: string,
    userId?: string,
    endpoint?: string
): RequestLogger {
    const baseEntry = {
        requestId: requestId || generateRequestId(),
        userId: userId ? userId.substring(0, 8) + '…' : undefined, // PII-safe: truncated
        endpoint,
    };

    const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
        emitLog({
            timestamp: new Date().toISOString(),
            level,
            message,
            ...baseEntry,
            meta,
        });
    };

    return {
        debug: (msg, meta) => log('debug', msg, meta),
        info: (msg, meta) => log('info', msg, meta),
        warn: (msg, meta) => log('warn', msg, meta),
        error: (msg, meta) => log('error', msg, meta),
        timing: (label, startTime, meta) => {
            const durationMs = Math.round(Date.now() - startTime);
            emitLog({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `⏱ ${label}`,
                ...baseEntry,
                durationMs,
                meta,
            });
        },
    };
}

/** Generate a short request ID (8 chars) */
function generateRequestId(): string {
    return Math.random().toString(36).substring(2, 10);
}

export const logger = {
    /**
     * Create a scoped logger for an API request.
     * userId is PII-truncated to first 8 chars automatically.
     */
    forRequest: (requestId?: string, userId?: string, endpoint?: string) =>
        createRequestLogger(requestId, userId, endpoint),

    /** Quick log without request context */
    info: (message: string, meta?: Record<string, unknown>) =>
        emitLog({ timestamp: new Date().toISOString(), level: 'info', message, meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
        emitLog({ timestamp: new Date().toISOString(), level: 'warn', message, meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
        emitLog({ timestamp: new Date().toISOString(), level: 'error', message, meta }),
};
