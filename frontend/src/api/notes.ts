// Notes API — view, edit, star, and soft-delete study session notes.
// "Delete" here is a soft delete: the session row stays to preserve study time stats,
// but hidden_from_notes is set True and the notes text is cleared.

export type Note = {
  id: number
  course: string
  topic: string | null
  start_datetime: string
  end_datetime: string
  notes: string | null
  is_important: boolean
}

export async function getNotes(): Promise<Note[]> {
  const res = await fetch('/api/notes')
  if (!res.ok) throw new Error('Failed to fetch notes')
  return res.json()
}

export async function toggleNoteImportance(id: number): Promise<Pick<Note, 'id' | 'is_important'>> {
  const res = await fetch(`/api/notes/${id}/importance`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to toggle importance')
  return res.json()
}

export async function editNote(
  id: number,
  data: { course?: string; topic?: string | null; notes?: string | null }
): Promise<Note> {
  const res = await fetch(`/api/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to edit note')
  return res.json()
}

// Soft delete — row is kept in DB but hidden from the Notes view
export async function deleteNote(id: number): Promise<void> {
  const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete note')
}
