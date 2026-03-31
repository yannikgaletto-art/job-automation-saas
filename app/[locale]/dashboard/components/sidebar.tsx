'use client'

import { useEffect, useState } from 'react'
import { Home, Inbox, BarChart3, Shield, Settings, User, MessageSquare, Search, Heart, Mic } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { PomodoroCard } from './pomodoro-card'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'

const navItems = [
  {
    title: 'Main',
    items: [
      { icon: Home, label: 'Today\'s Goals', href: '/dashboard', badge: 'G' },
      { icon: Search, label: 'Job Search', href: '/dashboard/job-search', badge: 'S' },
      { icon: Inbox, label: 'Job Queue', href: '/dashboard/job-queue', badge: 'Q' },
      { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics', badge: 'A' },
      { icon: MessageSquare, label: 'Coaching', href: '/dashboard/coaching', badge: 'I' },
    ],
  },
  {
    title: 'Community',
    items: [
      { icon: User, label: 'Community', href: '/dashboard/community', badge: 'C' },
      { icon: Heart, label: 'Ehrenamt', href: '/dashboard/ehrenamt', badge: 'E' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { icon: Shield, label: 'Data Security', href: '/dashboard/security', badge: null },
      { icon: Mic, label: 'Feedback Voice', href: '/dashboard/feedback', badge: null },
      { icon: Settings, label: 'Settings', href: '/dashboard/settings', badge: null },
    ],
  },
]

const getInitials = (str: string) =>
  str.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'

export function Sidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser({
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name,
        })
      }
    })
  }, [])

  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold">Pathly</h1>
        <p className="text-xs text-muted-foreground mt-1">Job Automation</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        {navItems.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold text-muted-foreground mb-2 px-3 uppercase tracking-widest">
              {section.title}
            </h2>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Admin — only for whitelisted emails */}
      {user?.email && ['galettoyannik7@gmail.com', 'yannik.galetto@gmail.com'].includes(user.email.toLowerCase()) && (
        <div className="px-4 pb-2">
          <Link
            href="/dashboard/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === '/dashboard/admin'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <Shield className="h-4 w-4" />
            <span className="flex-1">Admin</span>
          </Link>
        </div>
      )}

      {/* User Info */}
      <div className="px-4 py-3 border-t border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {user
              ? getInitials(user.full_name || user.email || '?')
              : <User className="w-4 h-4" />
            }
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">
              {user?.full_name || 'Kein Name'}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {user?.email || ''}
            </p>
          </div>
        </div>
      </div>



      {/* Pomodoro Timer */}
      <div className="p-4 border-t">
        <PomodoroCard />
      </div>
    </aside>
  )
}