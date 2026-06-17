'use client'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function AuthForm() {
  const params = useSearchParams()
  const router = useRouter()
  const [isSignUp, setIsSignUp] = useState(params.get('mode') === 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [passFocused, setPassFocused] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInfo('')
    if (!email || !password) { setError('Please fill in all fields.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setLoading(true)
    try {
      if (isSignUp) {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        setInfo('Check your inbox to confirm your email, then log in.')
        setIsSignUp(false)
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        router.push('/dashboard')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? friendlyMsg(err.message) : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (err) setError(err.message)
  }

  function friendlyMsg(msg: string) {
    if (msg.includes('Invalid login')) return 'Incorrect email or password.'
    if (msg.includes('already registered')) return 'That email is already registered. Log in instead.'
    return msg
  }

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: '100%', background: 'var(--bg-input)', border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 10, padding: '13px 16px', fontSize: 16, color: 'var(--text-primary)',
    outline: 'none', transition: 'border-color 0.15s',
  })

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'var(--accent-dim)',
            display: 'grid', placeItems: 'center', fontSize: 26, margin: '0 auto 20px',
          }}>〰️</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" placeholder="Email address" value={email}
            onChange={e => setEmail(e.target.value)}
            onFocus={() => setEmailFocused(true)} onBlur={() => setEmailFocused(false)}
            style={inputStyle(emailFocused)} autoComplete="email"
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)}
            onFocus={() => setPassFocused(true)} onBlur={() => setPassFocused(false)}
            style={inputStyle(passFocused)} autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />

          {error && (
            <p style={{ color: '#e74c3c', fontSize: 13, padding: '8px 12px', background: 'rgba(231,76,60,0.1)', borderRadius: 8 }}>
              {error}
            </p>
          )}
          {info && (
            <p style={{ color: 'var(--accent)', fontSize: 13, padding: '8px 12px', background: 'var(--accent-dim)', borderRadius: 8 }}>
              {info}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '13px', borderRadius: 10, fontSize: 16, fontWeight: 700,
              background: loading ? '#ccc' : '#fff', color: '#000', border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4,
              transition: 'opacity 0.15s', opacity: loading ? 0.7 : 1,
            }}>
            {loading ? 'Please wait…' : 'Continue'}
          </button>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); setInfo('') }}
              style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              {isSignUp ? 'Log in' : 'Sign up'}
            </button>
          </p>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Google */}
        <button onClick={handleGoogle} style={{
          width: '100%', padding: '13px', borderRadius: 10, fontSize: 15, fontWeight: 600,
          background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <GoogleG /> Continue with Google
        </button>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 32, fontSize: 12, color: 'var(--text-secondary)' }}>
          <a href="#" style={{ color: 'inherit' }}>Terms of Use</a>
          {' · '}
          <a href="#" style={{ color: 'inherit' }}>Privacy Policy</a>
        </p>
      </div>
    </main>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  )
}
