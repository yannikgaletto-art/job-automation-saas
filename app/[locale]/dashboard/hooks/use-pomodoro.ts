'use client'

import { useState, useEffect, useCallback } from 'react'

const POMODORO_DURATION = 25 * 60 // 25 minutes in seconds

export function usePomodoro(duration: number = POMODORO_DURATION) {
  const [timeRemaining, setTimeRemaining] = useState(duration)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (isActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((time) => {
          if (time <= 1) {
            setIsActive(false)
            // Play notification sound or show notification
            return duration
          }
          return time - 1
        })
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isActive, timeRemaining, duration])

  const toggle = useCallback(() => {
    setIsActive((active) => !active)
  }, [])

  const skip = useCallback(() => {
    setTimeRemaining(duration)
    setIsActive(false)
  }, [duration])

  const progress = 1 - timeRemaining / duration

  return {
    timeRemaining,
    isActive,
    progress,
    toggle,
    skip,
  }
}