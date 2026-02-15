"use client";

import React, { useEffect } from "react";
import { motion, useSpring, useTransform, MotionValue } from "framer-motion";

// ============================================================================
// COUNT-UP ANIMATION - Reusable Helper
// ============================================================================

interface CountUpProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  onComplete?: () => void;
}

export function CountUp({
  value,
  duration = 1.5,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
  onComplete,
}: CountUpProps) {
  const spring = useSpring(0, {
    stiffness: 50,
    damping: 20,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (latest) => {
    const num = decimals > 0 ? latest.toFixed(decimals) : Math.round(latest);
    return `${prefix}${num}${suffix}`;
  });

  useEffect(() => {
    spring.set(value);
    if (onComplete) {
      const timeout = setTimeout(onComplete, duration * 1000);
      return () => clearTimeout(timeout);
    }
  }, [value, spring, duration, onComplete]);

  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {display as any}
    </motion.span>
  );
}

// ============================================================================
// MATCH SCORE WITH GRADIENT - Specialized for Job Cards
// ============================================================================

interface MatchScoreProps {
  score: number;
  showIcon?: boolean;
  className?: string;
}

export function AnimatedMatchScore({ score, showIcon = true, className = "" }: MatchScoreProps) {
  const getGradientClass = (value: number) => {
    if (value >= 70) return "from-[#00C853] to-[#0066FF]";
    return "from-[#D32F2F] to-[#C62828]";
  };

  return (
    <motion.div
      className={`px-3 py-1 rounded-full bg-gradient-to-r text-white font-semibold text-sm flex items-center gap-1 ${getGradientClass(score)} ${className}`}
      initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 15,
        delay: 0.2
      }}
      whileHover={{ scale: 1.05, rotate: 2 }}
    >
      {showIcon && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
        >
          ⭐
        </motion.span>
      )}
      <CountUp value={score} suffix="%" duration={1.8} />
    </motion.div>
  );
}
