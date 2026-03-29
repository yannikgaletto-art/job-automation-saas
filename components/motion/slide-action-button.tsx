"use client";

import { useRef, useState, useLayoutEffect, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

// ============================================================================
// SLIDE-TO-ACTION BUTTON
// Framer Motion drag-based CTA. User slides the capsule handle right to trigger.
// Complies 100% with docs/MOTION_PRINCIPLES.md (spring physics, reduced-motion fallback)
//
// Fixes:
//   - controls.start() guarded by isMounted ref (Framer Motion invariant)
//   - dragConstraints resolved reactively via useLayoutEffect + ResizeObserver
//   - disabled guard disables drag and dims opacity
//   - useReducedMotion() fallback for accessibility
//   - Brand color: Pathly Navy (#002e7a)
// ============================================================================

interface SlideToActionButtonProps {
  /** Label shown in center of the pill */
  text: string;
  /** Prevents drag and dims button when true */
  disabled?: boolean;
  /** Async callback triggered on full swipe completion */
  onAction: () => void | Promise<void>;
}

const HANDLE_SIZE = 44; // px — diameter of the white circular handle
const THRESHOLD = 0.78; // fraction of track that must be dragged to trigger

export function SlideToActionButton({
  text,
  disabled = false,
  onAction,
}: SlideToActionButtonProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  // ── Mount guard: Framer Motion invariant — controls.start() only after mount
  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const x = useMotionValue(0);
  const controls = useAnimationControls();
  const [triggered, setTriggered] = useState(false);
  const [maxDrag, setMaxDrag] = useState(200); // updated after mount

  // Resolve maxDrag after the container has been painted (ref is valid)
  useLayoutEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setMaxDrag(
          Math.max(containerRef.current.offsetWidth - HANDLE_SIZE - 8, 0)
        );
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Label fades out as handle moves right
  const textOpacity = useTransform(x, [0, 80], [1, 0]);

  // ── Drag-end handler ──────────────────────────────────────────────────────
  const handleDragEnd = async () => {
    if (disabled || !isMounted.current) return;

    const currentX = x.get();
    const progress = maxDrag > 0 ? currentX / maxDrag : 0;

    if (progress >= THRESHOLD) {
      // SUCCESS — snap to end, show check, fire callback
      if (isMounted.current) {
        await controls.start({
          x: maxDrag,
          transition: { type: "spring", stiffness: 400, damping: 28 },
        });
      }
      if (!isMounted.current) return;
      setTriggered(true);
      await onAction();
      // Parent will switch phase (unmounting this), but guard anyway
      setTimeout(() => {
        if (!isMounted.current) return;
        setTriggered(false);
        controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 300, damping: 30 },
        });
      }, 600);
    } else {
      // INCOMPLETE — elastic snap back
      if (isMounted.current) {
        controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 500, damping: 32 },
        });
      }
    }
  };

  // ── Reduced-motion: plain button ──────────────────────────────────────────
  if (prefersReducedMotion) {
    return (
      <motion.button
        onClick={() => !disabled && onAction()}
        disabled={disabled}
        className="flex items-center justify-center gap-2 w-full h-14 rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: "#002e7a", opacity: disabled ? 0.45 : 1 }}
        whileHover={!disabled ? { scale: 1.02, y: -2 } : undefined}
        whileTap={!disabled ? { scale: 0.97 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <ArrowRight className="w-4 h-4" />
        <span>{text}</span>
      </motion.button>
    );
  }

  // ── Main drag interaction ─────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative flex items-center w-full h-14 rounded-full select-none overflow-hidden"
      style={{
        backgroundColor: triggered ? "#001e5a" : "#002e7a",
        opacity: disabled ? 0.45 : 1,
        transition: "background-color 0.3s ease, opacity 0.2s ease",
      }}
    >
      {/* Centered label — fades out while dragging */}
      <motion.span
        style={{ opacity: textOpacity }}
        className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white pointer-events-none pl-12"
      >
        {text}
      </motion.span>

      {/* Draggable round handle */}
      <motion.div
        drag={disabled ? false : "x"}
        dragConstraints={{ left: 0, right: maxDrag }}
        dragElastic={0.05}
        dragMomentum={false}
        style={{ x, width: HANDLE_SIZE, height: HANDLE_SIZE }}
        animate={controls}
        onDragEnd={handleDragEnd}
        className="absolute left-1 flex items-center justify-center rounded-full bg-white shadow-md cursor-grab active:cursor-grabbing z-10 shrink-0"
        whileTap={{ scale: 0.93 }}
      >
        {triggered ? (
          <motion.div
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Check className="w-5 h-5 text-[#002e7a]" />
          </motion.div>
        ) : (
          <motion.div key="arrow">
            <ArrowRight className="w-5 h-5 text-[#002e7a]" />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
