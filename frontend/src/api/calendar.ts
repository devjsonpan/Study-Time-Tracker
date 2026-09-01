// Calendar API — fetches homework tasks and events pre-formatted for FullCalendar.
// The server computes colors based on completion/overdue status so this stays simple.

export type CalendarEventItem = {
  id: string
  title: string
  start: string
  end?: string
  backgroundColor: string
  borderColor: string
  textColor: string
  display: string
  extendedProps: {
    type: 'task' | 'event'
    completed: boolean
    description: string
    location?: string
    deadline?: string
  }
}

export async function getCalendarEvents(): Promise<CalendarEventItem[]> {
  const res = await fetch('/api/calendar')
  if (!res.ok) throw new Error('Failed to fetch calendar data')
  return res.json()
}
