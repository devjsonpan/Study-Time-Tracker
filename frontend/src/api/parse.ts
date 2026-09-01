// Client for the AI schedule-parsing endpoint.
// Sends raw text to Flask, which calls Gemini and returns structured items.

export type Recurrence = {
  days: string[]   // e.g. ['Tue', 'Thu'] — Mon/Tue/Wed/Thu/Fri/Sat/Sun
  until: string    // YYYY-MM-DD
}

export type ParsedItem = {
  type: 'task' | 'event'
  // Task fields
  course?: string | null
  task_name?: string | null
  description?: string | null
  due_date?: string | null         // ISO 8601 date: YYYY-MM-DD
  // Event fields
  event_name?: string | null
  start_datetime?: string | null   // ISO 8601 datetime: YYYY-MM-DDTHH:MM — first occurrence only
  end_datetime?: string | null
  location?: string | null
  recurrence?: Recurrence | null   // present only for recurring events
}

export async function parseSchedule(text: string): Promise<ParsedItem[]> {
  const res = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error || `Parse failed (${res.status})`)
  }
  const data = await res.json() as { items: ParsedItem[] }
  return data.items
}
