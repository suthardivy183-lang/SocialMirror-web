import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import * as store from '../lib/store'
import { WaveIcon } from '../components/Icons'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.618 14.013 17.64 11.706 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

export default function Auth() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(params.get('mode') === 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [focused, setFocused] = useState<'email' | 'pass' | null>(null)

  const inputStyle = (f: 'email' | 'pass'): CSSProperties => ({
    width: '100%', background: 'var(--bg-input)', outline: 'none',
    border: `1.5px solid ${focused === f ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 10, padding: '13px 16px', fontSize: 16, color: 'var(--text)',
    transition: 'border-color 0.15s',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInfo('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setLoading(true)
    try {
      if (isSignUp) {
        await store.signUp(email, password)
        if (store.isLocalMode) { navigate('/dashboard'); return }
        setInfo('Check your inbox to confirm your email, then log in.')
        setIsSignUp(false)
      } else {
        await store.signIn(email, password)
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(msg.includes('Invalid login') ? 'Incorrect email or password.' : msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    try {
      await store.signInGoogle()
      if (store.isLocalMode) navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24, background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'var(--accent-dim)',
            display: 'grid', placeItems: 'center', color: 'var(--accent)', margin: '0 auto 20px',
          }}><WaveIcon size={26} /></div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h1>
          {store.isLocalMode && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Demo mode · any email + password works
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" placeholder="Email address" value={email} required
            onChange={e => setEmail(e.target.value)}
            onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
            style={inputStyle('email')} autoComplete="email"
          />
          <input
            type="password" placeholder="Password" value={password} required
            onChange={e => setPassword(e.target.value)}
            onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)}
            style={inputStyle('pass')} autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />

          {error && <p style={{ color: 'var(--red)', fontSize: 13, padding: '8px 12px', background: 'rgba(231,76,60,0.1)', borderRadius: 8 }}>{error}</p>}
          {info && <p style={{ color: 'var(--accent)', fontSize: 13, padding: '8px 12px', background: 'var(--accent-dim)', borderRadius: 8 }}>{info}</p>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 13, borderRadius: 10, fontSize: 16, fontWeight: 700,
            background: 'var(--accent)', color: '#fff', border: 'none',
            opacity: loading ? 0.6 : 1, marginTop: 4,
          }}>
            {loading ? 'Please wait…' : 'Continue'}
          </button>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)' }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); setInfo('') }}
              style={{ color: 'var(--accent)', background: 'none', border: 'none', fontSize: 14, fontWeight: 600 }}>
              {isSignUp ? 'Log in' : 'Sign up'}
            </button>
          </p>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <button onClick={handleGoogle} style={{
          width: '100%', padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 600,
          background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <GoogleIcon /> Continue with Google
        </button>

        <p style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: 'var(--muted)' }}>
          <Link to="/" style={{ color: 'var(--muted)' }}>← Back to home</Link>
          {' · '}
          <a href="#" style={{ color: 'var(--muted)' }}>Privacy</a>
        </p>
      </div>
    </div>
  )
}
