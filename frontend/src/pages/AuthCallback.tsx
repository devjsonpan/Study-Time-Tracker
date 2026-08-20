// OAuth callback page — Google redirects here after authentication.
// The access token arrives in the URL hash (#access_token=xxx...).
// We read it, POST it to Flask's /auth/verify endpoint, then navigate home.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Parse the token out of the URL hash (Supabase implicit flow)
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')

    if (!accessToken) {
      setError('No access token in the redirect URL. Please try signing in again.')
      return
    }

    // Hand the token to Flask, which validates it against Supabase's REST API
    // and creates or links the User row in the database.
    fetch('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Verification failed')
        return res.json()
      })
      .then(() => navigate('/home', { replace: true }))
      .catch(() => setError('Google sign-in failed. Please try again.'))
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 dark:bg-[#1c1814] px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-sm font-semibold text-rose-500 bg-rose-50 px-4 py-3 rounded-2xl mb-4">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="text-sm font-bold text-amber-500 hover:text-amber-600 cursor-pointer transition-colors"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <p className="text-sm font-semibold text-amber-500 animate-pulse">Signing you in…</p>
        )}
      </div>
    </div>
  )
}
