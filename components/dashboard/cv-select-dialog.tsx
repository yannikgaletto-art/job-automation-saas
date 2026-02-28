"use client";

/**
 * CVSelectDialog — Pop-up for users with 2+ uploaded CVs.
 * Shown before CV Match / Cover Letter workflows to let the user
 * choose which CV to use for the analysis.
 *
 * Logic:
 *  - 0 CVs → Not rendered (parent shows blocking state)
 *  - 1 CV  → Not rendered (parent auto-selects)
 *  - 2+ CVs → This dialog is shown
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Check } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/motion/button";

export interface CVOption {
    id: string;
    name: string;
    createdAt: string;
}

interface CVSelectDialogProps {
    isOpen: boolean;
    cvOptions: CVOption[];
    onSelect: (documentId: string) => void;
    onClose: () => void;
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export function CVSelectDialog({ isOpen, cvOptions, onSelect, onClose }: CVSelectDialogProps) {
    const [selected, setSelected] = useState<string | null>(null);

    const handleConfirm = () => {
        if (selected) {
            onSelect(selected);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,calc(100vw-2rem))] rounded-xl shadow-lg bg-white p-6 focus:outline-none">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-lg font-semibold text-[#37352F]">
                        Lebenslauf auswählen
                    </DialogTitle>
                    <DialogDescription className="text-sm text-[#73726E] mt-1">
                        Du hast mehrere Lebensläufe hochgeladen. Welchen möchtest du für diese Analyse verwenden?
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <AnimatePresence>
                        {cvOptions.map((cv) => (
                            <motion.button
                                key={cv.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                type="button"
                                onClick={() => setSelected(cv.id)}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${selected === cv.id
                                        ? "border-[#0066FF] bg-[#F0F7FF] ring-1 ring-[#0066FF]/30"
                                        : "border-[#E7E7E5] bg-white hover:border-[#0066FF]/40 hover:bg-[#F0F7FF]/30"
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected === cv.id ? "bg-[#0066FF]" : "bg-[#F7F7F5]"
                                    }`}>
                                    {selected === cv.id ? (
                                        <Check className="w-4 h-4 text-white" />
                                    ) : (
                                        <FileText className="w-4 h-4 text-[#73726E]" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#37352F] truncate">{cv.name}</p>
                                    <p className="text-xs text-[#73726E]">Hochgeladen: {formatDate(cv.createdAt)}</p>
                                </div>
                            </motion.button>
                        ))}
                    </AnimatePresence>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                    <Button variant="secondary" onClick={onClose} className="text-sm">
                        Abbrechen
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selected}
                        className="text-sm"
                    >
                        Auswählen
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
