'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { cn } from '@/lib/utils'

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const

export function TimeBlockingCalendar() {
    const [blocks, setBlocks] = useState<Record<number, boolean>>({})

    useEffect(() => {
        const saved = localStorage.getItem('timeBlocks')
        if (saved) {
            try {
                setBlocks(JSON.parse(saved))
            } catch (error) {
                console.error('Failed to load time blocks:', error)
            }
        }
    }, [])

    const toggleBlock = (hour: number) => {
        const updated = { ...blocks, [hour]: !blocks[hour] }
        setBlocks(updated)
        localStorage.setItem('timeBlocks', JSON.stringify(updated))
    }

    const totalBlocked = Object.values(blocks).filter(Boolean).length

    const today = new Date().toLocaleDateString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })

    return (
        <Card className="bg-white border border-[#E7E7E5] rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                    📅 {today}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {/* Time Blocks - VERTICAL (untereinander) */}
                {HOURS.map(hour => (
                    <div key={hour} className="flex items-center gap-3">
                        {/* Hour Label */}
                        <span className="text-xs text-[#787774] font-mono w-8 flex-shrink-0">
                            {hour}h
                        </span>

                        {/* Time Block */}
                        <button
                            onClick={() => toggleBlock(hour)}
                            className={cn(
                                'flex-1 h-8 rounded-md border-2 transition-all',
                                blocks[hour]
                                    ? 'bg-[#D3E5FF] border-[#0066FF]'
                                    : 'bg-white border-[#E7E7E5] hover:bg-[#F7F7F5]'
                            )}
                            aria-label={`Toggle ${hour}:00`}
                        />
                    </div>
                ))}

                {/* Summary */}
                <div className="pt-3 mt-3 border-t border-[#E7E7E5]">
                    <p className="text-xs text-[#787774]">
                        💡 {totalBlocked}h blocked for applications
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
