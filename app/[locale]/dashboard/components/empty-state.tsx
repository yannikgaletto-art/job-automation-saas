'use client'

import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-muted p-6 mb-4">
        <Inbox className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Noch keine Jobs in der Queue</h3>
      <p className="text-muted-foreground text-center mb-6 max-w-md">
        Füge Jobs von Job-Portalen mit unserer Chrome-Erweiterung hinzu
        oder lade eine Stellenbeschreibung manuell hoch.
      </p>
      <div className="flex gap-3">
        <Button variant="outline">Erweiterung installieren</Button>
        <Button>Job manuell hinzufügen</Button>
      </div>
    </div>
  )
}