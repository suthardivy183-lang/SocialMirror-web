'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchSessions, deleteSession } from '@/lib/db'
import { Session } from '@/types'
import { speakerColor } from '@/lib/colors'

const SESSION_ICONS: Record<string, string> = {
  interview: '🎯', meeting: '👥', negotiation: '⚖️',
  call: '📞', podcast: '🎙️', other: '💬',
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DashboardPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      setEmail(data.user.email ?? '')
      fetchSessions(data.user.id).then(s => { setSessions(s); setLoading(false) })
    })
  }, [router])

  async function handleDelete(id: string) {
    if (!userId) return
    await deleteSession(id, userId)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'rgba(10,10,10,0.9)',
        backdropFilter: 'blur(12px)', zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 22 }}>〰️</div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>SocialMirror</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{email}</span>
          <button onClick={handleSignOut} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Sign out</button>
        </div>
      </nav>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>Sessions</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
              {sessions.length} conversation{sessions.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <Link href="/session/new" style={{
            padding: '11px 22px', borderRadius: 10, fontSize: 15, fontWeight: 700,
            background: 'var(--accent)', color: '#fff', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            + New session
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)' }}>
            Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 24px',
            border: '1px dashed var(--border)', borderRadius: 16,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎙️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>No sessions yet</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 15 }}>
              Record your first conversation to get coaching insights.
            </p>
            <Link href="/session/new" style={{
              padding: '12px 28px', borderRadius: 10, fontSize: 15, fontWeight: 700,
              background: 'var(--accent)', color: '#fff', textDecoration: 'none',
            }}>
              Start recording
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map(s => (
              <Link key={s.id} href={`/session/${s.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: '18px 22px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 18,
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'var(--accent-dim)', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0,
                  }}>
                    {SESSION_ICONS[s.sessionType] ?? '💬'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.name}</div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatDate(s.createdAt)}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>·</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatDuration(s.durationSeconds)}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {Array.from({ length: s.speakerCount }, (_, i) => (
                          <div key={i} style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: speakerColor(i),
                          }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  {s.report && (
                    <div style={{
                      fontSize: 13, color: 'var(--text-secondary)',
                      maxWidth: 200, textAlign: 'right', flexShrink: 0,
                    }}>
                      {s.report.headline}
                    </div>
                  )}
                  <button onClick={e => { e.preventDefault(); handleDelete(s.id) }} style={{
                    padding: '6px 10px', borderRadius: 8, background: 'transparent',
                    border: '1px solid var(--border)', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 13, flexShrink: 0,
                  }}>✕</button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
