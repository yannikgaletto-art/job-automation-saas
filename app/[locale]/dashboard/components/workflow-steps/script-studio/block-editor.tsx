"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Reorder, AnimatePresence, motion } from 'framer-motion';
import { GripVertical, Plus, Trash2, AlertTriangle } from 'lucide-react';

export interface ScriptBlock {
    id: string;
    templateId: string | null;
    title: string;
    durationSeconds: number;
    isRequired: boolean;
    content: string;
    sortOrder: number;
}

interface BlockEditorProps {
    blocks: ScriptBlock[];
    onChange: (blocks: ScriptBlock[]) => void;
    mode: 'teleprompter' | 'bullets';
}

export function BlockEditor({ blocks, onChange, mode }: BlockEditorProps) {
    const t = useTranslations('video_letter');
    const [showNewForm, setShowNewForm] = useState(false);
    const [newBlockTitle, setNewBlockTitle] = useState('');
    const [newBlockDuration, setNewBlockDuration] = useState(15);
    const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

    // Validation: check that all required blocks are present
    const missingRequired = blocks.some(b => b.isRequired) && blocks.filter(b => b.isRequired).length < 2;
    const totalDuration = blocks.reduce((sum, b) => sum + b.durationSeconds, 0);

    const handleReorder = (reordered: ScriptBlock[]) => {
        const updated = reordered.map((b, i) => ({ ...b, sortOrder: i }));
        onChange(updated);
    };

    const handleBlockChange = (id: string, field: keyof ScriptBlock, value: string | number) => {
        const updated = blocks.map(b =>
            b.id === id ? { ...b, [field]: value } : b
        );
        onChange(updated);
    };

    const handleDeleteBlock = (id: string) => {
        const block = blocks.find(b => b.id === id);
        if (block?.isRequired) return; // Can't delete required blocks
        const updated = blocks.filter(b => b.id !== id).map((b, i) => ({ ...b, sortOrder: i }));
        onChange(updated);
    };

    const handleAddBlock = () => {
        if (!newBlockTitle.trim()) return;
        const newBlock: ScriptBlock = {
            id: crypto.randomUUID(),
            templateId: null,
            title: newBlockTitle.trim(),
            durationSeconds: newBlockDuration,
            isRequired: false,
            content: '',
            sortOrder: blocks.length,
        };
        onChange([...blocks, newBlock]);
        setNewBlockTitle('');
        setNewBlockDuration(15);
        setShowNewForm(false);
    };

    return (
        <div className="space-y-3">
            {/* Validation Warnings */}
            <AnimatePresence>
                {missingRequired && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2"
                    >
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-700">
                            <p>{t('editor_missing_required')}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Duration Summary — driven by WPM in Teleprompter, hidden here */}

            {/* Reorderable Block List */}
            <Reorder.Group axis="y" values={blocks} onReorder={handleReorder} className="space-y-2">
                {blocks.map((block) => (
                    <Reorder.Item
                        key={block.id}
                        value={block}
                        layout
                        className="bg-white border border-gray-200 rounded-lg p-4 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start gap-3">
                            {/* Drag Handle */}
                            <div className="mt-1 text-gray-400 hover:text-gray-600">
                                <GripVertical className="w-5 h-5" />
                            </div>

                            {/* Block Content */}
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-gray-900 text-sm">{block.title}</h4>
                                        {block.isRequired && (
                                            <span className="text-[10px] bg-blue-100 text-[#012e7a] px-1.5 py-0.5 rounded font-medium">
                                                {t('editor_required_badge')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Delete (only non-required) */}
                                        {!block.isRequired && (
                                            <button
                                                onClick={() => handleDeleteBlock(block.id)}
                                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Content Input — expandable on focus */}
                                <textarea
                                    value={block.content}
                                    onChange={(e) => handleBlockChange(block.id, 'content', e.target.value)}
                                    onFocus={() => setFocusedBlockId(block.id)}
                                    onBlur={() => setFocusedBlockId(null)}
                                    placeholder={mode === 'teleprompter'
                                        ? t('editor_placeholder_teleprompter')
                                        : t('editor_placeholder_bullets')}
                                    rows={focusedBlockId === block.id ? 8 : (mode === 'teleprompter' ? 3 : 2)}
                                    className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20 focus:border-[#012e7a] placeholder:text-gray-400 transition-[rows] duration-200"
                                />
                            </div>
                        </div>
                    </Reorder.Item>
                ))}
            </Reorder.Group>

            {/* Add Custom Block */}
            <AnimatePresence>
                {showNewForm ? (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3"
                    >
                        <input
                            type="text"
                            value={newBlockTitle}
                            onChange={(e) => setNewBlockTitle(e.target.value)}
                            placeholder={t('editor_add_block_placeholder')}
                            className="w-full text-sm bg-white border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleAddBlock()}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleAddBlock}
                                disabled={!newBlockTitle.trim()}
                                className="px-3 py-1.5 bg-[#012e7a] text-white text-sm rounded-md hover:bg-[#012e7a]/90 disabled:opacity-40 transition"
                            >
                                {t('editor_add_btn')}
                            </button>
                            <button
                                onClick={() => { setShowNewForm(false); setNewBlockTitle(''); }}
                                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition"
                            >
                                {t('editor_cancel_btn')}
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setShowNewForm(true)}
                        className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-[#012e7a] hover:text-[#012e7a] transition flex items-center justify-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> {t('editor_add_block')}
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}
