'use client'

import { Home, Inbox, BarChart3, Shield, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { PomodoroCard } from './pomodoro-card'

const navItems = [
  {
    title: 'Main',
    items: [
      { icon: Home, label: 'Dashboard', href: '/dashboard', badge: null },
      { icon: Inbox, label: 'Job Queue', href: '/job-queue', badge: 12 },
      { icon: BarChart3, label: 'Analytics', href: '/dashboard/analytics', badge: null },
    ],
  },
  {
    title: 'Tools',
    items: [
      { icon: Shield, label: 'Data Security', href: '/dashboard/security', badge: null },
      { icon: Settings, label: 'Settings', href: '/dashboard/settings', badge: null },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold">Job Automation</h1>
        <p className="text-xs text-muted-foreground mt-1">SaaS Platform</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        {navItems.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold text-muted-foreground mb-2 px-3">
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

      {/* Pomodoro Timer */}
      <div className="p-4 border-t">
        <PomodoroCard />
      </div>
    </aside>
  )
}