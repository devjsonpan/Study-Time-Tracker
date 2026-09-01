// All fetch() calls for the homework feature live here.
// Components import these functions instead of writing fetch() inline.
// That way if the URL or format ever changes, you fix it in one place.

export type Task = {
  id: number
  course: string
  task_name: string
  description: string | null
  due_date: string        // ISO string from Flask e.g. "2026-08-15T23:59:00"
  is_completed: boolean
  is_important: boolean
}

export async function getTasks(): Promise<Task[]> {
  const res = await fetch('/api/homework')
  if (!res.ok) throw new Error('Failed to fetch tasks')
  return res.json()
}

export async function createTask(data: Omit<Task, 'id' | 'is_completed' | 'is_important'>): Promise<Task> {
  const res = await fetch('/api/homework', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create task')
  return res.json()
}

export async function toggleComplete(id: number): Promise<Pick<Task, 'id' | 'is_completed'>> {
  const res = await fetch(`/api/homework/${id}/complete`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to toggle completion')
  return res.json()
}

export async function toggleImportance(id: number): Promise<Pick<Task, 'id' | 'is_important'>> {
  const res = await fetch(`/api/homework/${id}/importance`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to toggle importance')
  return res.json()
}

export async function deleteTask(id: number): Promise<void> {
  const res = await fetch(`/api/homework/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete task')
}

export async function editTask(id: number, data: Omit<Task, 'id' | 'is_completed' | 'is_important'>): Promise<Task> {
  const res = await fetch(`/api/homework/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to edit task')
  return res.json()
}
