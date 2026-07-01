import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as store from '../lib/store'
import { speakerColor } from '../lib/colors'
import TabBar from '../components/TabBar'
import TopBar from '../components/TopBar'
import { TypeIcon, MicIcon } from '../components/Icons'

interface Session {
  id: string; name: string; session_type: string
  duration_seconds: number; speaker_count: number
  created_at: string; report: { headline: string } | null
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
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="frost" style={{
            textAlign: 'center', padding: '70px 24px',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
            background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ color: 'var(--accent)', marginBottom: 14, display: 'flex', justifyContent: 'center' }}><MicIcon size={44} /></div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>No sessions yet</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>
              Record your first conversation to get coaching insights.
            </p>
            <Link to="/session/new" className="btn btn-solid" style={{
              display: 'inline-block', padding: '12px 26px', borderRadius: 'var(--radius-pill)', fontSize: 15, fontWeight: 700,
              background: 'var(--accent)', color: '#fff', boxShadow: 'var(--shadow-accent)',
            }}>Start recording</Link>
          </div>
        ) : (
          <>
            {/* Glass summary strip */}
            <div className="frost reveal" style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)',
              overflow: 'hidden', marginBottom: 20,
            }}>
              <SummaryTile value={String(sessions.length)} label={`conversation${sessions.length !== 1 ? 's' : ''}`} />
              <SummaryTile value={`${Math.round(sessions.reduce((s, x) => s + x.duration_seconds, 0) / 60)}m`} label="recorded" divider />
              <SummaryTile value={String(new Set(sessions.map(s => s.session_type)).size)} label="types" divider />
            </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map(s => (
              <Link to={`/session/${s.id}`} key={s.id} className="fade-in card-hover frost" style={{
                display: 'flex', alignItems: 'center', gap: 16,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)', padding: '16px 18px', boxShadow: 'var(--shadow-card)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: 'var(--accent-dim)',
                  display: 'grid', placeItems: 'center', color: 'var(--accent)', flexShrink: 0,
                }}><TypeIcon type={s.session_type} /></div>
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
          </>
        )}
      </main>
      <TabBar />
    </div>
  )
}

function SummaryTile({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  return (
    <div style={{
      padding: '16px 18px',
      borderLeft: divider ? '1px solid var(--border)' : 'none',
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
