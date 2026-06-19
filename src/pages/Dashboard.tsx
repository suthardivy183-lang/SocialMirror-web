import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as store from '../lib/store'
import { speakerColor } from '../lib/colors'
import TabBar from '../components/TabBar'
import TopBar from '../components/TopBar'

interface Session {
  id: string; name: string; session_type: string
  duration_seconds: number; speaker_count: number
  created_at: string; report: { headline: string } | null
}

const ICONS: Record<string, string> = {
  interview: '🎯', meeting: '👥', negotiation: '⚖️', call: '📞', podcast: '🎙️', other: '💬',
}

function fmt(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    store.getUser().then(user => {
      store.listSessions(user.id).then(rows => {
        setSessions(rows as unknown as Session[])
        setLoading(false)
      })
    })
  }, [])

  async function del(id: string, e: React.MouseEvent) {
    e.preventDefault()
    await store.deleteSession(id)
    setSessions(p => p.filter(s => s.id !== id))
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 90 }}>
      <TopBar title="Sessions" right={
        <Link to="/session/new" style={{
          padding: '9px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
        }}>+ New</Link>
      } />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px' }}>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
          {sessions.length} conversation{sessions.length !== 1 ? 's' : ''} recorded
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading…</div>
        ) : sessions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '70px 24px',
            border: '1px dashed var(--border)', borderRadius: 16, background: 'var(--bg-card)',
          }}>
            <div style={{ fontSize: 46, marginBottom: 14 }}>🎙️</div>
            <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>No sessions yet</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>
              Record your first conversation to get coaching insights.
            </p>
            <Link to="/session/new" style={{
              padding: '12px 26px', borderRadius: 10, fontSize: 15, fontWeight: 700,
              background: 'var(--accent)', color: '#fff',
            }}>Start recording</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map(s => (
              <Link to={`/session/${s.id}`} key={s.id} className="fade-in" style={{
                display: 'flex', alignItems: 'center', gap: 16,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--shadow-card)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: 'var(--accent-dim)',
                  display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0,
                }}>{ICONS[s.session_type] ?? '💬'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.name}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fmtDate(s.created_at)}</span>
                    <span style={{ color: 'var(--border-strong)' }}>·</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fmt(s.duration_seconds)}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: s.speaker_count }, (_, i) => (
                        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(i) }} />
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={e => del(s.id, e)} style={{
                  padding: '6px 9px', borderRadius: 8, background: 'transparent',
                  border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12, flexShrink: 0,
                }}>✕</button>
              </Link>
            ))}
          </div>
        )}
      </main>
      <TabBar />
    </div>
  )
}
