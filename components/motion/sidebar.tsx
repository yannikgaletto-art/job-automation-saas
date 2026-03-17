"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon, LogOut, Coins } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { DynamicIsland } from './dynamic-island';

// 20 animals for the avatar picker — displayed in Pathly dark-blue style
const ANIMALS: { id: string; emoji: string }[] = [
  { id: 'wolf',     emoji: '🐺' },
  { id: 'fox',      emoji: '🦊' },
  { id: 'bear',     emoji: '🐻' },
  { id: 'lion',     emoji: '🦁' },
  { id: 'tiger',    emoji: '🐯' },
  { id: 'eagle',    emoji: '🦅' },
  { id: 'owl',      emoji: '🦉' },
  { id: 'dolphin',  emoji: '🐬' },
  { id: 'shark',    emoji: '🦈' },
  { id: 'panther',  emoji: '🐆' },
  { id: 'horse',    emoji: '🐴' },
  { id: 'elephant', emoji: '🐘' },
  { id: 'penguin',  emoji: '🐧' },
  { id: 'octopus',  emoji: '🐙' },
  { id: 'deer',     emoji: '🦌' },
  { id: 'crow',     emoji: '🦝' },
  { id: 'snake',    emoji: '🐍' },
  { id: 'hawk',     emoji: '🦎' },
  { id: 'dragon',   emoji: '🐉' },
  { id: 'unicorn',  emoji: '🦄' },
];
import { Badge } from './badge';
import { Progress } from './progress';
import { CountUp } from './count-up';

/** Extracts up to 2 uppercase initials from a name or email */
const getInitials = (str: string) =>
  str.split(/[\s@.]/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

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
  collapsed?: boolean;
}

// ============================================================================
// NAV ITEM - Full Framer Motion
// ============================================================================

export function NavItem({ icon: Icon, label, href, badge, isActive: isActiveProp, shortcut }: NavItemProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Auto-detect active state if not explicitly provided, but only after mount
  // (prevents SSR/client hydration mismatch)
  const isActive = mounted
    ? (isActiveProp !== undefined ? isActiveProp : pathname === href || pathname.startsWith(href + '/'))
    : false

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

          <div className="w-8 flex justify-end shrink-0">
            {badge && badge > 0 ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={badge}
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                >
                  <Badge variant="primary" interactive>
                    {badge}
                  </Badge>
                </motion.div>
              </AnimatePresence>
            ) : shortcut ? (
              <motion.span
                className="text-xs text-[#A8A29E] font-mono"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {shortcut}
              </motion.span>
            ) : null}
          </div>

          {/* Active Indicator — only after mount to avoid hydration mismatch */}
          {isActive && (
            <motion.div
              className="absolute left-0 top-1/2 w-1 h-4 bg-[#012e7a] rounded-r-full"
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
      className={cn("px-3 py-3 rounded-lg bg-gradient-to-br from-[#012e7a]/10 to-[#1a4a9a]/10 border border-[#012e7a]/20", className)}
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
          <Coins className="h-3.5 w-3.5 text-[#012e7a]" />
          Credits
        </span>
        <motion.span
          className="text-sm font-semibold text-[#012e7a]"
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

export function Sidebar({ children, className, collapsed = false }: SidebarProps) {
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const t = useTranslations('common.sidebar');
  const tAnimal = useTranslations('common.animal');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: authData }) => {
      if (!authData?.user) return;

      // Load avatar from localStorage (instant, no network)
      const saved = localStorage.getItem(`pathly_avatar_${authData.user.id}`);
      if (saved) setSelectedAnimal(saved);

      // Try to get full_name + avatar_animal from profile API
      try {
        const res = await fetch('/api/settings/profile');
        if (res.ok) {
          const profile = await res.json();
          setUser({
            email: authData.user.email,
            full_name: profile.full_name || profile.data?.full_name || authData.user.user_metadata?.full_name,
          });
          // DB-fallback: if localStorage was empty but DB has an avatar, use it
          if (!saved && profile.avatar_animal) {
            setSelectedAnimal(profile.avatar_animal);
            localStorage.setItem(`pathly_avatar_${authData.user.id}`, profile.avatar_animal);
          }
        } else {
          setUser({ email: authData.user.email, full_name: authData.user.user_metadata?.full_name });
        }
      } catch {
        setUser({ email: authData.user.email, full_name: authData.user.user_metadata?.full_name });
      }
    });
  }, []);

  const handleSelectAnimal = async (animalId: string) => {
    setSelectedAnimal(animalId);
    setShowPicker(false);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) {
      localStorage.setItem(`pathly_avatar_${data.user.id}`, animalId);
    }
    // Fire-and-forget persist
    fetch('/api/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_animal: animalId }),
    }).catch(() => {});
  };

  return (
    <motion.aside
      className={cn(
        "sticky top-0 h-screen shrink-0 border-r border-[#E7E7E5] bg-white",
        "flex flex-col p-4 space-y-6 z-30",
        className
      )}
      animate={{
        width: collapsed ? 0 : 256,
        padding: collapsed ? 0 : 16,
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      {/* Dynamic Island Logo */}
      <DynamicIsland />

      {/* Navigation Content */}
      <div className="flex-1 flex flex-col space-y-6 overflow-y-auto scrollbar-hide">
        {children}
      </div>

      {/* User Info */}
      <div className="pt-4 border-t border-[#E7E7E5]">
        <div className="flex items-center gap-3 px-2 py-2 relative">

          {/* Avatar button — click to open animal picker */}
          <motion.button
            onClick={() => setShowPicker(v => !v)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            className="h-8 w-8 rounded-full bg-[#012e7a] flex items-center justify-center text-white text-sm shrink-0 cursor-pointer border-none outline-none ring-offset-0 focus:ring-2 focus:ring-[#012e7a]/40"
            title={t('avatar_change')}
          >
            {selectedAnimal ? (
              <span role="img" aria-label={selectedAnimal} className="text-base leading-none select-none">
                {ANIMALS.find(a => a.id === selectedAnimal)?.emoji ?? '🐾'}
              </span>
            ) : (
              <span className="text-xs font-semibold">{getInitials(user?.full_name || user?.email || '?')}</span>
            )}
          </motion.button>

          {/* Animal picker popover */}
          <AnimatePresence>
            {showPicker && (
              <motion.div
                initial={{ opacity: 0, scale: 0.88, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: 8 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="absolute bottom-12 left-0 z-50 bg-white border border-[#E7E7E5] rounded-2xl shadow-2xl p-3 w-[200px]"
              >
                <p className="text-[10px] font-bold text-[#012e7a] uppercase tracking-widest mb-2 px-1">
                  {t('avatar_picker_title')}
                </p>
                <div className="grid grid-cols-5 gap-1">
                  {ANIMALS.map(animal => (
                    <motion.button
                      key={animal.id}
                      onClick={() => handleSelectAnimal(animal.id)}
                      whileHover={{ scale: 1.25 }}
                      whileTap={{ scale: 0.88 }}
                      className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center text-base border-none cursor-pointer',
                        selectedAnimal === animal.id
                          ? 'bg-[#012e7a]/15 ring-2 ring-[#012e7a]'
                          : 'bg-[#F7F7F5] hover:bg-[#E8EDF8]'
                      )}
                      title={tAnimal(animal.id)}
                    >
                      {animal.emoji}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#37352F] truncate leading-tight">
              {user?.full_name || user?.email?.split('@')[0] || t('profile')}
            </p>
            <p className="text-xs text-[#73726E] truncate leading-tight">
              {user?.email || ''}
            </p>
          </div>
        </div>
      </div>

      {/* Logout Button */}
      <div className="pt-2 border-t border-[#E7E7E5]">
        <LogoutButton />
      </div>
    </motion.aside>
  );
}

// ============================================================================
// LOGOUT BUTTON
// ============================================================================

function LogoutButton() {
  const router = useRouter();
  const t = useTranslations('common.sidebar');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      console.log("✅ Logged out");
      // next-intl's useRouter adds locale prefix automatically — don't add it manually
      router.push('/login');
    } catch (error) {
      console.error("❌ Logout failed:", error);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="flex items-center gap-3 w-full px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
    >
      <LogOut className="h-5 w-5" />
      <span className="font-medium">{isLoggingOut ? t('logging_out') : t('logout')}</span>
    </button>
  );
}

