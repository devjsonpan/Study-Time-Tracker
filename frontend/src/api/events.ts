export type Event = {
  id: number
  event_name: string
  start_datetime: string   // ISO string e.g. "2026-08-15T09:00:00"
  end_datetime: string
  location: string | null
  description: string | null
  is_completed: boolean
  is_important: boolean
}

export async function getEvents(): Promise<Event[]> {
  const res = await fetch('/api/events')
  if (!res.ok) throw new Error('Failed to fetch events')
  return res.json()
}

export async function createEvent(data: Omit<Event, 'id' | 'is_completed' | 'is_important'>): Promise<Event> {
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create event')
  return res.json()
}

export async function toggleComplete(id: number): Promise<Pick<Event, 'id' | 'is_completed'>> {
  const res = await fetch(`/api/events/${id}/complete`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to toggle completion')
  return res.json()
}

export async function toggleImportance(id: number): Promise<Pick<Event, 'id' | 'is_important'>> {
  const res = await fetch(`/api/events/${id}/importance`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to toggle importance')
  return res.json()
}

export async function deleteEvent(id: number): Promise<void> {
  const res = await fetch(`/api/events/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete event')
}

export async function editEvent(id: number, data: Omit<Event, 'id' | 'is_completed' | 'is_important'>): Promise<Event> {
  const res = await fetch(`/api/events/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to edit event')
  return res.json()
}
