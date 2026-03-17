import { redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';

// Root page: redirect to the default locale
// next-intl middleware handles locale detection, but if someone hits /
// directly (e.g. from a bookmark), we redirect to the default locale.
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`);
}
