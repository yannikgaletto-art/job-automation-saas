"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================================
// SKELETON LOADERS - Fluid loading states
// ============================================================================

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <motion.div
      className={cn("rounded-md bg-[#E7E7E5]", className)}
      animate={{
        opacity: [0.5, 0.8, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      {...props}
    />
  );
}

// ============================================================================
// JOB CARD SKELETON
// ============================================================================

export function JobCardSkeleton() {
  return (
    <div className="w-full max-w-2xl bg-white rounded-xl border border-[#E7E7E5] shadow-sm p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="w-32 h-5" />
            <Skeleton className="w-48 h-4" />
          </div>
        </div>
        <Skeleton className="w-16 h-6 rounded-full" />
      </div>

      {/* Details */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-24 h-4" />
        <Skeleton className="w-20 h-4" />
        <Skeleton className="w-28 h-4" />
      </div>

      {/* AI Insight */}
      <Skeleton className="w-full h-16 rounded-lg" />

      {/* Skills */}
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="w-16 h-6 rounded-md" />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Skeleton className="flex-1 h-10 rounded-md" />
        <Skeleton className="flex-1 h-10 rounded-md" />
        <Skeleton className="w-10 h-10 rounded-md" />
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR SKELETON
// ============================================================================

export function SidebarSkeleton() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-[#E7E7E5] bg-white p-4 space-y-6">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="w-20 h-5" />
      </div>

      {/* Nav Items */}
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="w-full h-10 rounded-md" />
        ))}
      </div>

      {/* Stats */}
      <div className="space-y-3 mt-auto">
        <Skeleton className="w-full h-16 rounded-lg" />
        <Skeleton className="w-full h-12 rounded-lg" />
      </div>
    </aside>
  );
}
