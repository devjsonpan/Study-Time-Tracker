// Study session API — create, delete, and toggle importance.
// Sessions are also the backing store for Notes (same table, different view).

export type StudySessionEntry = {
  id: number
  course: string
  topic: string | null
  start_datetime: string
  end_datetime: string
  notes: string | null
  is_important: boolean
}

export async function getSessions(): Promise<StudySessionEntry[]> {
  const res = await fetch('/api/sessions')
  if (!res.ok) throw new Error('Failed to fetch sessions')
  return res.json()
}

export async function createSession(data: {
  course: string
  topic: string | null
  start_datetime: string
  end_datetime: string
  notes: string | null
}): Promise<StudySessionEntry> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to save session')
  return res.json()
}

export async function deleteSession(id: number): Promise<void> {
  const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete session')
}

export async function toggleSessionImportance(id: number): Promise<Pick<StudySessionEntry, 'id' | 'is_important'>> {
  const res = await fetch(`/api/sessions/${id}/importance`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to toggle importance')
  return res.json()
}
