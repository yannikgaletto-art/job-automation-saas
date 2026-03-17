import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Locale root page: /de, /en, /es
// Handles auth check and redirects to dashboard or login within the locale
export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(`/${locale}/dashboard`);
  } else {
    redirect(`/${locale}/login`);
  }
}
