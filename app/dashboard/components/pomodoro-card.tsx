'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Play, Pause, SkipForward } from 'lucide-react'
import { usePomodoro } from '../hooks/use-pomodoro'

export function PomodoroCard() {
  const { timeRemaining, isActive, progress, toggle, skip } = usePomodoro()

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  return (
    <Card className="mt-auto">
      <CardContent className="p-4">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">🍅</span>
            <h3 className="font-semibold">Focus Time</h3>
          </div>

          {/* Timer Display */}
          <div className="relative w-32 h-32 mx-auto">
            {/* Progress Ring */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 56}`}
                strokeDashoffset={`${2 * Math.PI * 56 * (1 - progress)}`}
                className="text-primary transition-all duration-1000"
                strokeLinecap="round"
              />
            </svg>

            {/* Time Text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={toggle}
            >
              {isActive ? (
                <><Pause className="h-4 w-4 mr-2" />Pause</>
              ) : (
                <><Play className="h-4 w-4 mr-2" />Start</>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={skip}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}