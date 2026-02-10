"use client";

import * as React from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================================
// FLUID PROGRESS - Animated with Framer Motion
// ============================================================================

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  showValue?: boolean;
  animated?: boolean;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, showValue = false, animated = true, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    
    const spring = useSpring(0, {
      stiffness: 50,
      damping: 20,
    });
    
    const width = useTransform(spring, (latest) => `${latest}%`);
    
    React.useEffect(() => {
      if (animated) {
        spring.set(percentage);
      }
    }, [percentage, spring, animated]);
    
    return (
      <div className="relative w-full">
        <div
          ref={ref}
          className={cn(
            "relative h-2 w-full overflow-hidden rounded-full bg-[#E7E7E5]",
            className
          )}
          {...props}
        >
          {animated ? (
            <motion.div
              className="h-full bg-[#0066FF] rounded-full"
              style={{ width }}
              initial={{ width: "0%" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          ) : (
            <div
              className="h-full bg-[#0066FF] rounded-full transition-all"
              style={{ width: `${percentage}%` }}
            />
          )}
        </div>
        {showValue && (
          <motion.span
            className="absolute right-0 top-0 -translate-y-6 text-xs font-medium text-[#73726E]"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {Math.round(percentage)}%
          </motion.span>
        )}
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
