"use client";

import { useState } from 'react';
import { Reorder, AnimatePresence, motion } from 'framer-motion';
import { GripVertical, Plus, Trash2, Clock, AlertTriangle } from 'lucide-react';

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
    const [showNewForm, setShowNewForm] = useState(false);
    const [newBlockTitle, setNewBlockTitle] = useState('');
    const [newBlockDuration, setNewBlockDuration] = useState(15);

    // Validation warnings
    const hasVorstellung = blocks.some(b => b.title === 'Vorstellung');
    const hasAbschluss = blocks.some(b => b.title === 'Abschluss');
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
                {(!hasVorstellung || !hasAbschluss) && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2"
                    >
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-700">
                            {!hasVorstellung && <p>Pflicht-Block „Vorstellung" fehlt.</p>}
                            {!hasAbschluss && <p>Pflicht-Block „Abschluss" fehlt.</p>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Duration Summary */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" />
                <span>
                    Gesamt: <strong className={totalDuration > 75 ? 'text-red-600' : totalDuration < 30 ? 'text-amber-600' : 'text-gray-900'}>
                        {totalDuration}s
                    </strong> / 60s empfohlen
                </span>
            </div>

            {/* Reorderable Block List */}
            <Reorder.Group axis="y" values={blocks} onReorder={handleReorder} className="space-y-2">
                {blocks.map((block) => (
                    <Reorder.Item
                        key={block.id}
                        value={block}
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
                                                Pflicht
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Duration slider */}
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                            <Clock className="w-3.5 h-3.5" />
                                            <input
                                                type="range"
                                                min={5}
                                                max={45}
                                                step={5}
                                                value={block.durationSeconds}
                                                onChange={(e) => handleBlockChange(block.id, 'durationSeconds', parseInt(e.target.value))}
                                                className="w-16 h-1.5 accent-[#012e7a]"
                                            />
                                            <span className="w-6 text-right">{block.durationSeconds}s</span>
                                        </div>

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

                                {/* Content Input */}
                                <textarea
                                    value={block.content}
                                    onChange={(e) => handleBlockChange(block.id, 'content', e.target.value)}
                                    placeholder={mode === 'teleprompter'
                                        ? 'Vollständigen Text hier schreiben…'
                                        : 'Stichpunkte hier notieren…'}
                                    rows={mode === 'teleprompter' ? 3 : 2}
                                    className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20 focus:border-[#012e7a] placeholder:text-gray-400"
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
                            placeholder="Blockname (z.B. Icebreaker, Fun Fact)"
                            className="w-full text-sm bg-white border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleAddBlock()}
                        />
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Clock className="w-4 h-4" />
                            <input
                                type="range"
                                min={5}
                                max={30}
                                step={5}
                                value={newBlockDuration}
                                onChange={(e) => setNewBlockDuration(parseInt(e.target.value))}
                                className="w-20 accent-[#012e7a]"
                            />
                            <span>{newBlockDuration}s</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleAddBlock}
                                disabled={!newBlockTitle.trim()}
                                className="px-3 py-1.5 bg-[#012e7a] text-white text-sm rounded-md hover:bg-[#012e7a]/90 disabled:opacity-40 transition"
                            >
                                Hinzufügen
                            </button>
                            <button
                                onClick={() => { setShowNewForm(false); setNewBlockTitle(''); }}
                                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition"
                            >
                                Abbrechen
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
                        <Plus className="w-4 h-4" /> Eigenen Block erstellen
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}
