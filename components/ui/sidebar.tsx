"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';
import { Progress } from './progress';

// ============================================================================
// SIDEBAR COMPONENT - Notion-Linear Hybrid Design
// ============================================================================

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: number;
  isActive?: boolean;
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

interface SidebarProps {
  children: React.ReactNode;
  className?: string;
}

// ============================================================================
// NAV ITEM
// ============================================================================

export function NavItem({ icon: Icon, label, href, badge, isActive }: NavItemProps) {
  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.2 }}
    >
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          "hover:bg-[#F5F5F4] active:bg-[#E7E7E5]",
          isActive
            ? "bg-[#F7F7F5] text-[#37352F] font-semibold"
            : "text-[#73726E] hover:text-[#37352F]"
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="flex-1">{label}</span>
        {badge && badge > 0 && (
          <Badge variant="primary" className="ml-auto">
            {badge}
          </Badge>
        )}
      </Link>
    </motion.div>
  );
}

// ============================================================================
// NAV SECTION
// ============================================================================

export function NavSection({ title, children, className }: NavSectionProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {title && (
        <h3 className="px-3 mb-2 text-xs font-semibold text-[#A8A29E] uppercase tracking-wider">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

// ============================================================================
// PROGRESS CARD
// ============================================================================

export function ProgressCard({ title, value, total, className }: ProgressCardProps) {
  const percentage = Math.round((value / total) * 100);

  return (
    <div className={cn("px-3 py-3 rounded-lg bg-[#FAFAF9] border border-[#E7E7E5]", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[#37352F]">{title}</span>
        <span className="text-xs text-[#73726E]">
          {value}/{total}
        </span>
      </div>
      <Progress value={percentage} className="h-1.5" />
    </div>
  );
}

// ============================================================================
// CREDITS CARD
// ============================================================================

interface CreditsCardProps {
  remaining: number;
  className?: string;
}

export function CreditsCard({ remaining, className }: CreditsCardProps) {
  return (
    <div className={cn("px-3 py-3 rounded-lg bg-[#FAFAF9] border border-[#E7E7E5]", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#37352F]">💰 Credits</span>
        <span className="text-sm font-semibold text-[#0066FF]">{remaining} left</span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN SIDEBAR
// ============================================================================

export function Sidebar({ children, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen w-64 border-r border-[#E7E7E5] bg-white",
        "flex flex-col p-4 space-y-6",
        className
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0066FF] to-[#3385FF] flex items-center justify-center">
          <span className="text-white font-bold text-lg">P</span>
        </div>
        <span className="text-lg font-semibold text-[#37352F]">Pathly</span>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 flex flex-col space-y-6 overflow-y-auto">
        {children}
      </div>
    </aside>
  );
}

// ============================================================================
// USAGE EXAMPLE (Comment out in production)
// ============================================================================

/*
import { Home, Inbox, History, Settings } from 'lucide-react';

<Sidebar>
  <NavSection title="Main">
    <NavItem icon={Home} label="Dashboard" href="/dashboard" isActive />
    <NavItem icon={Inbox} label="Auto-Apply" href="/auto-apply" badge={12} />
    <NavItem icon={History} label="History" href="/history" />
    <NavItem icon={Settings} label="Settings" href="/settings" />
  </NavSection>

  <NavSection title="Stats" className="mt-auto">
    <ProgressCard title="This Week" value={3} total={10} />
    <CreditsCard remaining={47} />
  </NavSection>
</Sidebar>
*/
