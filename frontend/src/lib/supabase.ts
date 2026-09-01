// Supabase client — lazily initialized so the public keys are fetched from Flask
// rather than baked into the frontend build. This keeps config in one place (app.env).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

async function getClient(): Promise<SupabaseClient> {
  if (client) return client
  const res = await fetch('/api/auth/supabase-config')
  if (!res.ok) throw new Error(`Failed to load Supabase config (${res.status})`)
  const { supabase_url, supabase_anon_key } = await res.json()
  if (!supabase_url || !supabase_anon_key) throw new Error('Supabase config missing — check SUPABASE_URL and SUPABASE_ANON_KEY in app.env')
  client = createClient(supabase_url, supabase_anon_key)
  return client
}

// Triggers the Google OAuth redirect. The user lands on /auth/callback after Google auth.
// Throws on failure so callers can show an error message.
export async function signInWithGoogle(): Promise<void> {
  const sb = await getClient()
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw new Error(error.message)
}
