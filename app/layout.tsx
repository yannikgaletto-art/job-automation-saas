import { Inter } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/error-boundary';
import { Suspense } from 'react';
import { PostHogProvider } from '@/components/providers/posthog-provider';


const inter = Inter({ subsets: ['latin', 'latin-ext'] });

export const metadata = {
  title: 'Pathly V2.0 - Intelligent Job Application SaaS',
  description: 'DSGVO & NIS2 Compliant AI-Powered Job Application Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ErrorBoundary>
          <Suspense fallback={null}>
            <PostHogProvider>
              {children}
            </PostHogProvider>
          </Suspense>
        </ErrorBoundary>

      </body>
    </html>
  );
}

