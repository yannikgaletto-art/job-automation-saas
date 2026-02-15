'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Check, RotateCcw, Split, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CVComparisonProps {
    originalCV: string;
    optimizedCV: string;
    changesLog: {
        added_keywords: string[];
        reordered_bullets: number;
        quantifications_added: number;
    };
    atsScore: number;
    onAccept: () => void;
    onRevert: () => void;
}

export function CVComparison({
    originalCV,
    optimizedCV,
    changesLog,
    atsScore,
    onAccept,
    onRevert,
}: CVComparisonProps) {
    const [view, setView] = useState<'split' | 'optimized'>('split');

    return (
        <div className="space-y-6">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 bg-white border-[#E7E7E5] shadow-sm flex flex-col items-center justify-center">
                    <div className="text-xs text-[#73726E] uppercase tracking-wider font-semibold mb-1">
                        ATS Score
                    </div>
                    <div
                        className={cn(
                            'text-4xl font-bold',
                            atsScore >= 80
                                ? 'text-green-600'
                                : atsScore >= 60
                                    ? 'text-orange-600'
                                    : 'text-red-600'
                        )}
                    >
                        {atsScore}%
                    </div>
                </Card>

                <Card className="p-4 bg-[#F7F7F5] border-[#E7E7E5] shadow-sm flex flex-col items-center justify-center">
                    <div className="text-xs text-[#73726E] uppercase tracking-wider font-semibold mb-1">
                        Keywords Added
                    </div>
                    <div className="text-2xl font-semibold text-[#37352F]">
                        +{changesLog.added_keywords.length}
                    </div>
                </Card>

                <Card className="p-4 bg-[#F7F7F5] border-[#E7E7E5] shadow-sm flex flex-col items-center justify-center">
                    <div className="text-xs text-[#73726E] uppercase tracking-wider font-semibold mb-1">
                        Bullets Reordered
                    </div>
                    <div className="text-2xl font-semibold text-[#37352F]">
                        {changesLog.reordered_bullets}
                    </div>
                </Card>

                <Card className="p-4 bg-[#F7F7F5] border-[#E7E7E5] shadow-sm flex flex-col items-center justify-center">
                    <div className="text-xs text-[#73726E] uppercase tracking-wider font-semibold mb-1">
                        Quantifications
                    </div>
                    <div className="text-2xl font-semibold text-[#37352F]">
                        +{changesLog.quantifications_added}
                    </div>
                </Card>
            </div>

            {/* Keyword Chips */}
            {changesLog.added_keywords.length > 0 && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                        <span className="text-lg">✨</span> Optimized with these keywords:
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {changesLog.added_keywords.map((keyword, idx) => (
                            <Badge
                                key={idx}
                                variant="secondary"
                                className="bg-white text-blue-700 hover:bg-blue-50 border-blue-200"
                            >
                                {keyword}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* View Toggle */}
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-[#37352F]">
                    CV Preview
                </h3>
                <div className="flex bg-[#F7F7F5] p-1 rounded-lg border border-[#E7E7E5]">
                    <button
                        onClick={() => setView('split')}
                        className={cn(
                            'px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2',
                            view === 'split'
                                ? 'bg-white text-[#37352F] shadow-sm ring-1 ring-[#E7E7E5]'
                                : 'text-[#73726E] hover:text-[#37352F]'
                        )}
                    >
                        <Split size={14} />
                        Side-by-Side
                    </button>
                    <button
                        onClick={() => setView('optimized')}
                        className={cn(
                            'px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2',
                            view === 'optimized'
                                ? 'bg-white text-[#37352F] shadow-sm ring-1 ring-[#E7E7E5]'
                                : 'text-[#73726E] hover:text-[#37352F]'
                        )}
                    >
                        <FileText size={14} />
                        Optimized Only
                    </button>
                </div>
            </div>

            {/* Comparison View */}
            <div
                className={cn(
                    'grid gap-6 h-[600px]',
                    view === 'split' ? 'grid-cols-2' : 'grid-cols-1'
                )}
            >
                {view === 'split' && (
                    <div className="flex flex-col h-full border border-[#E7E7E5] rounded-xl overflow-hidden bg-white shadow-sm">
                        <div className="bg-[#F7F7F5] px-4 py-3 border-b border-[#E7E7E5] flex justify-between items-center">
                            <span className="text-sm font-semibold text-[#73726E]">
                                Original
                            </span>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 prose prose-sm max-w-none prose-p:text-[#37352F] prose-headings:text-[#37352F]">
                            {/* Simple whitespace handling for now */}
                            <div className="whitespace-pre-wrap font-mono text-xs text-[#37352F]/80">
                                {originalCV}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-col h-full border-2 border-blue-100 rounded-xl overflow-hidden bg-white shadow-md ring-4 ring-blue-50/50">
                    <div className="bg-blue-50/80 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                        <span className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                            <span className="text-lg">✨</span> Optimized Version
                        </span>
                        <Badge className="bg-blue-600 hover:bg-blue-700">
                            Recommended
                        </Badge>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1">
                        <div
                            className="prose prose-sm max-w-none text-[#37352F]"
                            dangerouslySetInnerHTML={{ __html: markdownToHTML(optimizedCV) }}
                        />
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex gap-4 pt-4 border-t border-[#E7E7E5]">
                <Button
                    variant="outline"
                    size="lg"
                    onClick={onRevert}
                    className="flex-1 gap-2 border-[#E7E7E5] text-[#73726E] hover:text-[#37352F] hover:bg-[#F7F7F5]"
                >
                    <RotateCcw size={16} />
                    Keep Original
                </Button>
                <Button
                    size="lg"
                    onClick={onAccept}
                    className="flex-[2] gap-2 bg-[#0066FF] hover:bg-[#0052CC] text-white shadow-md hover:shadow-lg transition-all"
                >
                    <Check size={16} />
                    Use Optimized CV
                </Button>
            </div>
        </div>
    );
}

// Simple Markdown to HTML converter
// In a real app, use a library like 'marked' or 'react-markdown'
function markdownToHTML(markdown: string): string {
    if (!markdown) return '';

    return markdown
        // Headers
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-3 pb-1 border-b">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4">$1</h1>')

        // Bold
        .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-semibold text-black bg-yellow-50 px-0.5 rounded">$1</strong>')

        // Italic
        .replace(/\*(.*?)\*/gim, '<em class="italic">$1</em>')

        // Lists
        .replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc mb-1">$1</li>')

        // Paragraphs (double newline)
        .replace(/\n\n/gim, '<br/><br/>');
}
