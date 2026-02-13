'use client'

interface ProgressWorkflowProps {
  current: number
  max: number
  size?: 'sm' | 'md'
}

const steps = [
  { label: 'Job', icon: '📋' },
  { label: 'CV', icon: '📄' },
  { label: 'Opt', icon: '✨' },
  { label: 'CL', icon: '📝' },
  { label: 'Review', icon: '✅' },
]

export function ProgressWorkflow({ current, max, size = 'md' }: ProgressWorkflowProps) {
  const percentage = (current / max) * 100

  return (
    <div className="flex items-center gap-1">
      {/* Progress Bar */}
      <div className={`flex-1 bg-muted rounded-full overflow-hidden ${
        size === 'sm' ? 'h-1.5' : 'h-2'
      }`}>
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Step Indicator */}
      <span className={`font-medium text-muted-foreground ${
        size === 'sm' ? 'text-xs' : 'text-sm'
      }`}>
        {current}/{max}
      </span>
    </div>
  )
}

export function ProgressWorkflowDetailed({ current, max }: { current: number, max: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, idx) => {
        const stepNumber = idx + 1
        const isCompleted = stepNumber <= current
        const isCurrent = stepNumber === current

        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                isCompleted
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-muted border-muted-foreground/20 text-muted-foreground'
              } transition-all`}>
                <span className="text-sm">{step.icon}</span>
              </div>
              <span className="text-xs text-muted-foreground">{step.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-12 h-0.5 mx-2 ${
                stepNumber < current ? 'bg-primary' : 'bg-muted'
              } transition-all`} />
            )}
          </div>
        )
      })}
    </div>
  )
}