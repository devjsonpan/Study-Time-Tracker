// Profile API — get and update the logged-in user's settings.

export type UserProfile = {
  username: string
  fullname: string
  email: string | null
  timezone: string
  has_google: boolean
  has_password: boolean
  email_reminders: boolean
}

export async function getProfile(): Promise<UserProfile> {
  const res = await fetch('/api/profile')
  if (!res.ok) throw new Error('Failed to fetch profile')
  return res.json()
}

export async function updateProfile(data: {
  fullname?: string
  timezone?: string
  email?: string
  email_reminders?: boolean
}): Promise<UserProfile> {
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error || 'Failed to update profile')
  }
  return res.json()
}

// Fetches all valid pytz timezone names for the timezone selector
export async function getTimezones(): Promise<string[]> {
  const res = await fetch('/api/timezones')
  if (!res.ok) throw new Error('Failed to fetch timezones')
  return res.json()
}

export async function changeUsername(newUsername: string): Promise<{ username: string }> {
  const res = await fetch('/api/auth/change-username', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: newUsername }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error || 'Failed to change username')
  return d
}

export async function setPassword(password: string, confirmPassword: string): Promise<void> {
  const res = await fetch('/api/auth/set-password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, confirm_password: confirmPassword }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error || 'Failed to set password')
  }
}

export type PublicProfile = {
  username: string
  fullname: string
  total_sessions: number
  total_hours: number
  group_name: string | null
}

export async function getPublicProfile(username: string): Promise<PublicProfile> {
  const res = await fetch(`/api/user/${encodeURIComponent(username)}`)
  if (!res.ok) throw new Error('User not found')
  return res.json()
}
