// Chat API

// Types matching the shapes returned by Flask
export type Friend = { id: number; username: string }
export type PendingRequest = { id: number; from: string }
export type Conversation = {id: number; type: 'dm' | 'group'; name: string }
export type ChatMessage = {
    id: number
    sender: string
    content: string
    created_at: string
}

export async function getFriends(): Promise<{ friends: Friend[]; pending: PendingRequest[] }> {
    const res = await fetch('/api/friends')
    if (!res.ok) throw new Error('Failed to fetch friends')
    return res.json()
}

export async function sendFriendRequest(username: string): Promise<void> {
    const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
    }) 
    if (!res.ok) throw new Error('Failed to send request')
}

export async function acceptFriendRequest(id: number): Promise<void> {
  const res = await fetch(`/api/friends/${id}/accept`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to accept')
}

export async function declineFriendRequest(id: number): Promise<void> {
  const res = await fetch(`/api/friends/${id}/decline`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to decline')
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await fetch('/api/conversations')
  if (!res.ok) throw new Error('Failed to fetch conversations')
  const data = await res.json()
  return data.conversations
}

export async function openDM(username: string): Promise<number> {
  const res = await fetch('/api/conversations/dm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  if (!res.ok) throw new Error('Failed to open DM')
  const data = await res.json()
  return data.id
}

export async function getMessages(convId: number): Promise<ChatMessage[]> {
  const res = await fetch(`/api/conversations/${convId}/messages`)
  if (!res.ok) throw new Error('Failed to fetch messages')
  const data = await res.json()
  return data.messages
}