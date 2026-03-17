'use client';

/**
 * Command Palette (Cmd+K) — Global keyboard shortcut.
 * Silicon Valley addition for power users.
 * Uses cmdk library.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Search, Inbox, BarChart3, Plus, Target, Settings, Shield } from 'lucide-react';

export function CommandPalette() {
    const router = useRouter();
    const t = useTranslations('command_palette');
    const [open, setOpen] = useState(false);

    const COMMANDS = useMemo(() => [
        { id: 'goals', icon: Home, label: t('cmd_goals'), shortcut: 'G', href: '/dashboard' },
        { id: 'search', icon: Search, label: t('cmd_search'), shortcut: 'S', href: '/dashboard/job-search' },
        { id: 'queue', icon: Inbox, label: t('cmd_queue'), shortcut: 'Q', href: '/dashboard/job-queue' },
        { id: 'analytics', icon: BarChart3, label: t('cmd_analytics'), shortcut: 'A', href: '/dashboard/analytics' },
        { id: 'settings', icon: Settings, label: t('cmd_settings'), shortcut: ',', href: '/dashboard/settings' },
        { id: 'security', icon: Shield, label: t('cmd_security'), shortcut: '', href: '/dashboard/security' },
    ], [t]);

    // Cmd+K toggle
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen(prev => !prev);
                return;
            }

            // Single-key shortcuts (only when palette is NOT open and not typing)
            if (!open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
                const cmd = COMMANDS.find(c => c.shortcut.toLowerCase() === e.key.toLowerCase());
                if (cmd) {
                    e.preventDefault();
                    router.push(cmd.href);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, router, COMMANDS]);

    const handleSelect = useCallback((href: string) => {
        setOpen(false);
        router.push(href);
    }, [router]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
                    onClick={() => setOpen(false)}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />

                    {/* Palette */}
                    <motion.div
                        initial={{ scale: 0.95, y: -10 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: -10 }}
                        onClick={e => e.stopPropagation()}
                        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#E7E7E5] overflow-hidden"
                    >
                        <Command
                            label="Command Palette"
                            className="[&_[cmdk-input]]:outline-none"
                        >
                            <div className="flex items-center border-b border-[#E7E7E5] px-4">
                                <Search className="w-4 h-4 text-[#A8A29E] shrink-0" />
                                <Command.Input
                                    placeholder={t('placeholder')}
                                    autoFocus
                                    className="flex-1 py-4 px-3 text-sm text-[#37352F] placeholder:text-[#A8A29E] border-none outline-none bg-transparent"
                                />
                                <kbd className="hidden sm:inline text-[10px] text-[#A8A29E] px-1.5 py-0.5 bg-[#F7F7F5] rounded border border-[#E7E7E5]">
                                    ESC
                                </kbd>
                            </div>

                            <Command.List className="max-h-64 overflow-y-auto py-2">
                                <Command.Empty className="px-4 py-8 text-center text-sm text-[#A8A29E]">
                                    {t('empty')}
                                </Command.Empty>

                                <Command.Group heading={t('group_navigation')} className="px-2 pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[#A8A29E] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider">
                                    {COMMANDS.map(cmd => (
                                        <Command.Item
                                            key={cmd.id}
                                            value={cmd.label}
                                            onSelect={() => handleSelect(cmd.href)}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-[#37352F] data-[selected=true]:bg-[#f0f4ff] data-[selected=true]:text-[#002e7a] transition-colors"
                                        >
                                            <cmd.icon className="w-4 h-4 opacity-60" />
                                            <span className="flex-1">{cmd.label}</span>
                                            {cmd.shortcut && (
                                                <kbd className="text-[10px] text-[#A8A29E] px-1.5 py-0.5 bg-[#F7F7F5] rounded border border-[#E7E7E5]">
                                                    {cmd.shortcut}
                                                </kbd>
                                            )}
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                            </Command.List>

                            {/* Footer */}
                            <div className="border-t border-[#E7E7E5] px-4 py-2 flex items-center gap-4 text-[10px] text-[#A8A29E]">
                                <span>↑↓ {t('hint_navigate')}</span>
                                <span>↵ {t('hint_select')}</span>
                                <span>ESC {t('hint_close')}</span>
                            </div>
                        </Command>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
