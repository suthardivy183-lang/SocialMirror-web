import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as store from '../lib/store'
import type { DbSession } from '../lib/store'
import type { SpeakerFeatures } from '../lib/coaching'
import TabBar from '../components/TabBar'
import TopBar from '../components/TopBar'

interface Agg {
  total: number
  totalMinutes: number
  avgTalkTime: number
  avgConfidence: number
  byType: Record<string, number>
  talkTimeSeries: { date: string; value: number }[]
}

function analyze(sessions: DbSession[]): Agg {
  const myTalk: number[] = []
  const conf: number[] = []
  const byType: Record<string, number> = {}
  const series: { date: string; value: number }[] = []
  let minutes = 0

  const ordered = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const s of ordered) {
    minutes += s.duration_seconds / 60
    byType[s.session_type] = (byType[s.session_type] ?? 0) + 1
    const speakers = (s.speakers as SpeakerFeatures[]) ?? []
    const me = speakers.find(x => x.speakerID === 0) ?? speakers[0]
    if (me) {
      myTalk.push(me.talkTimeRatio)
      conf.push(me.confidenceScore ?? 0)
      series.push({ date: s.created_at, value: me.talkTimeRatio })
    }
  }
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
  return {
    total: sessions.length,
    totalMinutes: Math.round(minutes),
    avgTalkTime: avg(myTalk),
    avgConfidence: avg(conf),
    byType,
    talkTimeSeries: series.slice(-12),
  }
}

export default function Trends() {
  const navigate = useNavigate()
  const [agg, setAgg] = useState<Agg | null>(null)

  useEffect(() => {
    store.getUser().then(user => {
      if (!user) { navigate('/auth'); return }
      store.listSessions(user.id).then(rows => setAgg(analyze(rows)))
    })
  }, [navigate])

  if (!agg) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Loading…</div>

  const hasData = agg.total > 0

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 90 }}>
      <TopBar title="Trends" />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        {!hasData ? (
          <Empty />
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
              <Stat big={String(agg.total)} label="Sessions" />
              <Stat big={`${agg.totalMinutes}m`} label="Total talk time" />
              <Stat big={`${Math.round(agg.avgTalkTime * 100)}%`} label="Your avg airtime" accent />
              <Stat big={`${Math.round(agg.avgConfidence * 100)}%`} label="Avg confidence" accent />
            </div>

            {/* Talk-time trend line */}
            <Card title="Your airtime over time">
              <LineChart points={agg.talkTimeSeries.map(p => p.value)} />
            </Card>

            {/* Session type breakdown */}
            <Card title="Session types">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(agg.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{type}</span>
                      <span style={{ color: 'var(--muted)' }}>{count}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / agg.total) * 100}%`, background: 'var(--accent)', borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </main>
      <TabBar />
    </div>
  )
}

function Empty() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 24px', border: '1px dashed var(--border)', borderRadius: 16, background: 'var(--bg-card)' }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>📈</div>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>No trends yet</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>Record a few sessions to see your patterns over time.</p>
    </div>
  )
}

function Stat({ big, label, accent }: { big: string; label: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, boxShadow: 'var(--shadow-card)' }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: accent ? 'var(--accent)' : 'var(--text)' }}>{big}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: 'var(--shadow-card)' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{title}</h3>
      {children}
    </div>
  )
}

function LineChart({ points }: { points: number[] }) {
  if (points.length < 2) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Need at least 2 sessions.</p>
  const w = 100, h = 40
  const max = Math.max(...points, 1)
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - (p / max) * h
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={120} preserveAspectRatio="none">
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="var(--accent-dim)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => {
        const x = (i / (points.length - 1)) * w
        const y = h - (p / max) * h
        return <circle key={i} cx={x} cy={y} r={1.4} fill="var(--accent)" vectorEffect="non-scaling-stroke" />
      })}
    </svg>
  )
}
