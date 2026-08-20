// Profile API — get and update the logged-in user's settings.

export type UserProfile = {
  username: string
  fullname: string
  email: string | null
  timezone: string
  has_google: boolean
  has_password: boolean
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
