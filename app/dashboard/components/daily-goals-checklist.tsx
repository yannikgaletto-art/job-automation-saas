'use client'

import { useState, useEffect } from 'react'
import { Check, Settings, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

interface Goal {
    id: string
    text: string
    progress: number
    completed: boolean
}

const DEFAULT_GOALS: Goal[] = [
    { id: '1', text: 'N26 to Review-Ready', progress: 75, completed: false },
    { id: '2', text: 'Stripe: Generate Cover Letter', progress: 40, completed: false },
    { id: '3', text: 'Tesla: Optimize CV', progress: 20, completed: false },
]

export function DailyGoalsChecklist() {
    const [goals, setGoals] = useState<Goal[]>(DEFAULT_GOALS)

    useEffect(() => {
        const saved = localStorage.getItem('dailyGoals')
        if (saved) {
            try {
                setGoals(JSON.parse(saved))
            } catch (error) {
                console.error('Failed to load daily goals:', error)
            }
        }
    }, [])

    const updateGoal = (updated: Goal) => {
        const newGoals = goals.map(g => (g.id === updated.id ? updated : g))
        setGoals(newGoals)
        localStorage.setItem('dailyGoals', JSON.stringify(newGoals))
    }

    const addGoal = () => {
        const newGoal: Goal = {
            id: crypto.randomUUID(),
            text: 'New goal...',
            progress: 0,
            completed: false,
        }
        const newGoals = [...goals, newGoal]
        setGoals(newGoals)
        localStorage.setItem('dailyGoals', JSON.stringify(newGoals))
    }

    return (
        <Card className="bg-white border border-[#E7E7E5] rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#37352F]">🎯 Today&apos;s Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {goals.map(goal => (
                    <GoalItem key={goal.id} goal={goal} onUpdate={updateGoal} />
                ))}

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={addGoal}
                    className="w-full justify-start text-[#787774] hover:text-[#37352F] hover:bg-[#F7F7F5]"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Goal
                </Button>
            </CardContent>
        </Card>
    )
}

function GoalItem({ goal, onUpdate }: { goal: Goal; onUpdate: (g: Goal) => void }) {
    const [showProgress, setShowProgress] = useState(false)
    const [tempProgress, setTempProgress] = useState(goal.progress)
    const [isEditing, setIsEditing] = useState(false)
    const [text, setText] = useState(goal.text)

    const updateProgress = () => {
        onUpdate({ ...goal, progress: tempProgress })
        setShowProgress(false)
    }

    const updateText = () => {
        if (text.trim()) {
            onUpdate({ ...goal, text: text.trim() })
        }
        setIsEditing(false)
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                {/* Checkbox */}
                <button
                    onClick={() => onUpdate({ ...goal, completed: !goal.completed })}
                    className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
                        goal.completed
                            ? 'bg-[#0066FF] border-[#0066FF]'
                            : 'border-[#D1D5DB] hover:border-[#0066FF]'
                    )}
                >
                    {goal.completed && <Check className="w-3 h-3 text-white" />}
                </button>

                {/* Text (Editable on double-click) */}
                {isEditing ? (
                    <input
                        autoFocus
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onBlur={updateText}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') updateText()
                            if (e.key === 'Escape') {
                                setText(goal.text)
                                setIsEditing(false)
                            }
                        }}
                        maxLength={60}
                        className="flex-1 text-sm border-none focus:outline-none bg-[#F7F7F5] px-2 py-1 rounded text-[#37352F]"
                    />
                ) : (
                    <span
                        onDoubleClick={() => setIsEditing(true)}
                        className={cn(
                            'flex-1 text-sm cursor-pointer text-[#37352F]',
                            goal.completed && 'line-through text-[#787774]'
                        )}
                    >
                        {goal.text}
                    </span>
                )}

                {/* Progress Percentage */}
                <span className="text-xs text-[#787774] font-mono flex-shrink-0">
                    [{goal.progress}%]
                </span>

                {/* Settings Icon - Manual Progress Control */}
                <Popover open={showProgress} onOpenChange={setShowProgress}>
                    <PopoverTrigger asChild>
                        <button className="p-1 hover:bg-[#F7F7F5] rounded transition-colors flex-shrink-0">
                            <Settings className="w-4 h-4 text-[#D1D5DB] hover:text-[#6B7280]" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-4 space-y-3 bg-white border border-[#E7E7E5]">
                        <div>
                            <label className="text-sm font-medium text-[#37352F]">
                                Set Progress
                            </label>
                            <div className="flex items-center gap-3 mt-2">
                                <Slider
                                    value={[tempProgress]}
                                    onValueChange={([val]) => setTempProgress(val)}
                                    max={100}
                                    step={5}
                                    className="flex-1"
                                />
                                <span className="text-sm font-mono w-12 text-right font-semibold text-[#37352F]">
                                    {tempProgress}%
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                onClick={updateProgress}
                                className="flex-1 bg-[#0066FF] hover:bg-[#0052CC] text-white"
                            >
                                Update
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setTempProgress(goal.progress)
                                    setShowProgress(false)
                                }}
                                className="text-[#787774] hover:text-[#37352F]"
                            >
                                Cancel
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1 bg-[#E7E7E5] rounded-full overflow-hidden">
                <div
                    className="h-full bg-[#0066FF] rounded-full transition-all duration-300"
                    style={{ width: `${goal.progress}%` }}
                />
            </div>
        </div>
    )
}
