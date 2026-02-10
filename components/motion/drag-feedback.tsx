"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

// ============================================================================
// DRAG FEEDBACK OVERLAY - Visual feedback for swipe actions
// ============================================================================

interface DragFeedbackProps {
  dragX: any; // MotionValue<number>
  approveThreshold?: number;
  rejectThreshold?: number;
}

export function DragFeedback({ 
  dragX, 
  approveThreshold = 100, 
  rejectThreshold = -100 
}: DragFeedbackProps) {
  return (
    <>
      {/* Approve Overlay (Right Swipe) */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-[#00C853]/0 to-[#00C853]/20 rounded-xl flex items-center justify-end pr-8 pointer-events-none"
        style={{
          opacity: dragX,
        }}
      >
        <motion.div
          className="w-16 h-16 rounded-full bg-[#00C853] flex items-center justify-center shadow-lg"
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Check className="w-8 h-8 text-white" strokeWidth={3} />
        </motion.div>
      </motion.div>

      {/* Reject Overlay (Left Swipe) */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-l from-[#D32F2F]/0 to-[#D32F2F]/20 rounded-xl flex items-center justify-start pl-8 pointer-events-none"
        style={{
          opacity: dragX,
        }}
      >
        <motion.div
          className="w-16 h-16 rounded-full bg-[#D32F2F] flex items-center justify-center shadow-lg"
          initial={{ scale: 0, rotate: 45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <X className="w-8 h-8 text-white" strokeWidth={3} />
        </motion.div>
      </motion.div>
    </>
  );
}
