'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchSession } from '@/lib/db'
import { Session } from '@/types'
import { speakerColor } from '@/lib/colors'

function formatDuration(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function SessionDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      fetchSession(id, data.user.id).then(s => { setSession(s); setLoading(false) })
    })
  }, [id, router])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text-secondary)' }}>
      Loading…
    </div>
  )

  if (!session) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Session not found.</p>
        <Link href="/dashboard" style={{ color: 'var(--accent)' }}>← Back to dashboard</Link>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Nav */}
      <nav style={{
        padding: '16px 32px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, background: 'rgba(10,10,10,0.9)',
        backdropFilter: 'blur(12px)', zIndex: 50,
      }}>
        <Link href="/dashboard" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>
          ← Sessions
        </Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{session.name}</span>
      </nav>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        {/* Meta */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>
            {session.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {formatDate(session.createdAt)} · {formatDuration(session.durationSeconds)} · {session.speakerCount} speaker{session.speakerCount !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Coaching report */}
        {session.report && (
          <div style={{
            background: 'var(--accent-dim)', border: '1px solid var(--border-focus)',
            borderRadius: 16, padding: 24, marginBottom: 32,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 10 }}>
              COACHING REPORT
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>
              {session.report.headline}
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 16 }}>
              {session.report.insight}
            </p>
            <div style={{
              background: 'rgba(127,119,221,0.15)', borderRadius: 10, padding: '12px 16px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                {session.report.actionableTip}
              </p>
            </div>
          </div>
        )}

        {/* Speaker breakdown */}
        {session.speakers.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              SPEAKERS
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {session.speakers.map(s => (
                <div key={s.speakerID} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 18,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: speakerColor(s.speakerID) }} />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Speaker {s.speakerID + 1}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Stat label="Talk time" value={`${Math.round(s.talkTimeRatio * 100)}%`} />
                    <Stat label="Turns" value={String(s.turnCount)} />
                    <Stat label="Hedge words" value={String(s.hedgeCount)} />
                    <Stat label="Questions" value={String(s.questionCount)} />
                  </div>
                  {/* Mini bar */}
                  <div style={{ marginTop: 14, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.talkTimeRatio * 100}%`, background: speakerColor(s.speakerID), borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {session.transcript.length > 0 && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              TRANSCRIPT
            </h3>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '8px 0', maxHeight: 480, overflow: 'auto',
            }}>
              {session.transcript.map(line => (
                <div key={line.id} style={{
                  padding: '14px 20px', borderBottom: '1px solid var(--border)',
                  display: 'flex', gap: 14,
                }}>
                  <div style={{ paddingTop: 4, flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(line.speakerID) }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: speakerColor(line.speakerID), display: 'block', marginBottom: 4 }}>
                      Speaker {line.speakerID + 1}
                    </span>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>{line.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {session.transcript.length === 0 && session.speakers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            No transcript data for this session.
          </div>
        )}
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )
}
