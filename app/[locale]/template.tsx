"use client";

import { PageTransition } from '@/components/motion/page-transition';

// ============================================================================
// PAGE TEMPLATE - Fluid Page Transitions
// ============================================================================

export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
