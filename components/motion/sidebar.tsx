"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';
import { Progress } from './progress';
import { CountUp } from './count-up';

// ============================================================================
// FLUID SIDEBAR - 100% Framer Motion Compliance
// ============================================================================

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: number;
  isActive?: boolean;
  shortcut?: string;
}

interface NavSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

interface ProgressCardProps {
  title: string;
  value: number;
  total: number;
  className?: string;
}

interface CreditsCardProps {
  remaining: number;
  className?: string;
}

interface SidebarProps {
  children: React.ReactNode;
  className?: string;
}

// ============================================================================
// NAV ITEM - Full Framer Motion
// ============================================================================

export function NavItem({ icon: Icon, label, href, badge, isActive: isActiveProp, shortcut }: NavItemProps) {
  const pathname = usePathname()
  // Auto-detect active state if not explicitly provided
  const isActive = isActiveProp !== undefined
    ? isActiveProp
    : pathname === href || pathname.startsWith(href + '/')

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Link href={href}>
        <motion.div
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative",
            isActive
              ? "bg-[#F7F7F5] text-[#37352F] font-semibold"
              : "text-[#73726E] hover:text-[#37352F]"
          )}
          whileHover={{
            scale: 1.02,
            y: -2,
            backgroundColor: isActive ? "#F7F7F5" : "#F5F5F4",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.07)"
          }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            whileHover={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 0.5 }}
          >
            <Icon className="h-5 w-5" />
          </motion.div>
          <span className="flex-1">{label}</span>

          {shortcut && (
            <motion.span
              className="text-xs text-[#A8A29E] font-mono"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {shortcut}
            </motion.span>
          )}

          {badge && badge > 0 && (
            <Badge variant="primary" interactive>
              {badge}
            </Badge>
          )}

          {/* Active Indicator */}
          {isActive && (
            <motion.div
              className="absolute left-0 top-1/2 w-1 h-4 bg-[#0066FF] rounded-r-full"
              layoutId="activeIndicator"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ============================================================================
// NAV SECTION
// ============================================================================

export function NavSection({ title, children, className }: NavSectionProps) {
  return (
    <motion.div
      className={cn("space-y-1", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {title && (
        <motion.h3
          className="px-3 mb-2 text-xs font-semibold text-[#A8A29E] uppercase tracking-wider"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {title}
        </motion.h3>
      )}
      {children}
    </motion.div>
  );
}

// ============================================================================
// PROGRESS CARD - With Animation
// ============================================================================

export function ProgressCard({ title, value, total, className }: ProgressCardProps) {
  const percentage = Math.round((value / total) * 100);

  return (
    <motion.div
      className={cn("px-3 py-3 rounded-lg bg-[#FAFAF9] border border-[#E7E7E5]", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        scale: 1.02,
        y: -2,
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.07)"
      }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[#37352F]">{title}</span>
        <motion.span
          className="text-xs text-[#73726E]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <CountUp value={value} duration={1} /> / {total}
        </motion.span>
      </div>
      <Progress value={percentage} className="h-1.5" animated />
    </motion.div>
  );
}

// ============================================================================
// CREDITS CARD - With Count-Up
// ============================================================================

export function CreditsCard({ remaining, className }: CreditsCardProps) {
  return (
    <motion.div
      className={cn("px-3 py-3 rounded-lg bg-gradient-to-br from-[#0066FF]/10 to-[#3385FF]/10 border border-[#0066FF]/20", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        scale: 1.02,
        y: -2,
        boxShadow: "0 4px 6px -1px rgba(0, 102, 255, 0.1)"
      }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#37352F] flex items-center gap-1">
          <motion.span
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            💰
          </motion.span>
          Credits
        </span>
        <motion.span
          className="text-sm font-semibold text-[#0066FF]"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
        >
          <CountUp value={remaining} suffix=" left" duration={2} />
        </motion.span>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN SIDEBAR
// ============================================================================

export function Sidebar({ children, className }: SidebarProps) {
  return (
    <motion.aside
      className={cn(
        "fixed left-0 top-0 h-screen w-64 border-r border-[#E7E7E5] bg-white",
        "flex flex-col p-4 space-y-6 z-50",
        className
      )}
      initial={{ x: -264 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Logo */}
      <motion.div
        className="flex items-center gap-2 px-2"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
      >
        <motion.div
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0066FF] to-[#3385FF] flex items-center justify-center"
          whileHover={{ rotate: 360, scale: 1.1 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <span className="text-white font-bold text-lg">P</span>
        </motion.div>
        <span className="text-lg font-semibold text-[#37352F]">Pathly</span>
      </motion.div>

      {/* Navigation Content */}
      <div className="flex-1 flex flex-col space-y-6 overflow-y-auto scrollbar-hide">
        {children}
      </div>
    </motion.aside>
  );
}
