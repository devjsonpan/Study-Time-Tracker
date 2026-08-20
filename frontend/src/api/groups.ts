// Study Groups API — create, join, leave, and fetch current group info.

export type GroupInfo = {
  id: number
  name: string
  join_code: string
  members: string[]
}

// Safely parse JSON — returns null if the response is HTML (e.g. a Flask error page)
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export async function getMyGroup(): Promise<GroupInfo | null> {
  const res = await fetch('/api/groups/me')
  if (!res.ok) throw new Error('Failed to fetch group')
  const data = await safeJson(res)
  return (data.group as GroupInfo) ?? null
}

export async function createGroup(group_name: string): Promise<GroupInfo> {
  const res = await fetch('/api/groups/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group_name }),
  })
  const data = await safeJson(res)
  if (!res.ok) throw new Error((data.error as string) || 'Failed to create group. Make sure Flask is restarted.')
  return data as unknown as GroupInfo
}

export async function joinGroup(join_code: string): Promise<GroupInfo> {
  const res = await fetch('/api/groups/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ join_code }),
  })
  const data = await safeJson(res)
  if (!res.ok) throw new Error((data.error as string) || 'Invalid join code.')
  return data as unknown as GroupInfo
}

export async function leaveGroup(): Promise<void> {
  const res = await fetch('/api/groups/leave', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to leave group')
}
