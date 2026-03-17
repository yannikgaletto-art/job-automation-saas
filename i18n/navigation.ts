import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Lightweight wrappers around Next.js navigation APIs
// that consider the i18n routing configuration.
// Use these INSTEAD of next/navigation imports throughout the app.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
