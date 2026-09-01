// Break time API — create and delete break entries.
// No edit or importance toggle: breaks are just time ranges, nothing more.

export type BreakEntry = {
  id: number
  start_datetime: string // ISO string e.g. "2026-08-15T14:00:00"
  end_datetime: string
}

export async function getBreaks(): Promise<BreakEntry[]> {
  const res = await fetch('/api/breaks')
  if (!res.ok) throw new Error('Failed to fetch breaks')
  return res.json()
}

export async function createBreak(data: { start_datetime: string; end_datetime: string }): Promise<BreakEntry> {
  const res = await fetch('/api/breaks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to save break')
  return res.json()
}

export async function deleteBreak(id: number): Promise<void> {
  const res = await fetch(`/api/breaks/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete break')
}
