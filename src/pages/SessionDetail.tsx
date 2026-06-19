import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as store from '../lib/store'
import { speakerColor } from '../lib/colors'
import { radarDimensions, expressiveness, monotonyTip, countFillers, fillerBreakdown, fillerTip, FILLERS, questionStats, questionTip, interruptionStats, interruptionTip, backchannelStats, backchannelTip, emotionFor, arousalOf, textValence, emotionTip, entrainmentStats, entrainmentTip, type SpeakerFeatures } from '../lib/coaching'
import RadarChart from '../components/RadarChart'

interface TLine { id: string; speakerID: number; text: string; startTime: number }
interface PauseStats { totalSilenceSec: number; talkRatio: number; avgPauseSec: number; longestPauseSec: number; pauseCount: number }
interface Session {
  id: string; name: string; session_type: string; duration_seconds: number
  speaker_count: number; created_at: string
  transcript: TLine[]; speakers: SpeakerFeatures[]
  report: { headline: string; insight: string; tip: string } | null
  pauses?: PauseStats
}

function fmt(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const speakerName = (s: SpeakerFeatures) => s.name || `Speaker ${s.speakerID + 1}`

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    store.getUser().then(async user => {
      const row = await store.getSession(id!, user.id)
      setSession(row as unknown as Session | null)
      setLoading(false)
    })
  }, [id])

  async function saveName(speakerID: number) {
    if (!session) return
    const speakers = session.speakers.map(s => s.speakerID === speakerID ? { ...s, name: draftName.trim() || undefined } : s)
    setSession({ ...session, speakers })
    setEditing(null)
    await store.updateSession(session.id, { speakers })
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Loading…</div>
  if (!session) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>Session not found.</p>
        <Link to="/dashboard" style={{ color: 'var(--accent)' }}>← Dashboard</Link>
      </div>
    </div>
  )

  const speakers = session.speakers ?? []
  const nameFor = (id: number) => speakerName(speakers.find(s => s.speakerID === id) ?? { speakerID: id } as SpeakerFeatures)

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <header style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, background: 'var(--nav-bg)',
        backdropFilter: 'blur(18px)', zIndex: 50,
      }}>
        <Link to="/dashboard" style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>← Sessions</Link>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>{session.name}</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
          {fmtDate(session.created_at)} · {fmt(session.duration_seconds)} · {session.speaker_count} speaker{session.speaker_count !== 1 ? 's' : ''}
        </p>

        {/* Coaching report */}
        {session.report && (
          <div className="fade-in" style={{
            background: 'var(--accent-soft)', border: '1px solid var(--accent-dim)',
            borderRadius: 16, padding: 24, marginBottom: 28,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 10 }}>COACHING REPORT</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>{session.report.headline}</h2>
            <p style={{ fontSize: 15, color: 'var(--text-mid)', lineHeight: 1.65, marginBottom: 16 }}>{session.report.insight}</p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>{session.report.tip}</p>
            </div>
          </div>
        )}

        {/* Emotional tone */}
        {speakers.length > 0 && session.transcript.length > 0 && (() => {
          const perSpeaker = speakers.map(s => {
            const txt = session.transcript.filter(l => l.speakerID === s.speakerID).map(l => l.text).join(' ')
            return { s, emotion: emotionFor(txt, arousalOf(s)) }
          })
          const allText = session.transcript.map(l => l.text)
          const half = Math.floor(allText.length / 2)
          const firstVal = textValence(allText.slice(0, half).join(' '))
          const lastVal = textValence(allText.slice(half).join(' '))
          const overall = textValence(allText.join(' '))
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>EMOTIONAL TONE</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                {perSpeaker.map(({ s, emotion }) => (
                  <div key={s.speakerID} style={{ flex: '1 1 130px', background: 'var(--bg-subtle)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                    <div style={{ fontSize: 30, marginBottom: 6 }}>{emotion.emoji}</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{emotion.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(s.speakerID) }} />
                      {nameFor(s.speakerID)}
                    </div>
                  </div>
                ))}
              </div>
              {/* valence trend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                <span>Start {firstVal >= 0 ? '🙂' : '🙁'}</span>
                <div style={{ flex: 1, height: 6, background: 'var(--bg-subtle)', borderRadius: 3, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 10, background: 'var(--border-strong)' }} />
                  <div style={{ position: 'absolute', left: `${((overall + 1) / 2) * 100}%`, top: -3, width: 12, height: 12, borderRadius: '50%', background: overall >= 0 ? 'var(--green)' : 'var(--red)', transform: 'translateX(-50%)' }} />
                </div>
                <span>End {lastVal >= 0 ? '🙂' : '🙁'}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 16, lineHeight: 1.55 }}>
                💡 {emotionTip(overall, lastVal - firstVal)}
              </p>
            </div>
          )
        })()}

        {/* Radar chart */}
        {speakers.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 8 }}>SPEAKER PROFILE</h3>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RadarChart
                size={280}
                series={speakers.map(s => ({ color: speakerColor(s.speakerID), points: radarDimensions(s) }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              {speakers.map(s => (
                <div key={s.speakerID} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: speakerColor(s.speakerID) }} />
                  {nameFor(s.speakerID)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Silence & Pause analysis */}
        {session.pauses && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>PACING & SILENCE</h3>
            {/* talk vs silence bar */}
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ width: `${session.pauses.talkRatio * 100}%`, background: 'var(--accent)' }} />
              <div style={{ flex: 1, background: 'var(--bg-subtle)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
              <span>{Math.round(session.pauses.talkRatio * 100)}% talking</span>
              <span>{Math.round((1 - session.pauses.talkRatio) * 100)}% silence</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <PauseStat value={`${session.pauses.pauseCount}`} label="Pauses" />
              <PauseStat value={`${session.pauses.avgPauseSec}s`} label="Avg pause" />
              <PauseStat value={`${session.pauses.longestPauseSec}s`} label="Longest pause" />
              <PauseStat value={`${session.pauses.totalSilenceSec}s`} label="Total silence" />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 16, lineHeight: 1.55 }}>
              💡 {pauseTip(session.pauses)}
            </p>
          </div>
        )}

        {/* Vocal delivery / monotony */}
        {speakers.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>VOCAL DELIVERY</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {speakers.map(s => {
                const score = expressiveness(s)
                return (
                  <div key={s.speakerID}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: speakerColor(s.speakerID) }} />
                        {nameFor(s.speakerID)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: speakerColor(s.speakerID) }}>
                        {Math.round(score * 100)}% expressive
                      </span>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${score * 100}%`, background: speakerColor(s.speakerID), borderRadius: 4 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      <span>Monotone</span>
                      <span>±{s.pitchVariance} Hz pitch · ±{s.energyVariance} dB</span>
                      <span>Dynamic</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 16, lineHeight: 1.55 }}>
              💡 {monotonyTip(expressiveness(speakers.find(s => s.speakerID === 0) ?? speakers[0]))}
            </p>
          </div>
        )}

        {/* Speech clarity / fillers */}
        {(() => {
          const userText = session.transcript.filter(l => l.speakerID === 0).map(l => l.text).join(' ')
          if (!userText.trim()) return null
          const total = countFillers(userText)
          const breakdown = Object.entries(fillerBreakdown(userText)).sort((a, b) => b[1] - a[1])
          const perMin = session.duration_seconds > 0 ? +(total / (session.duration_seconds / 60)).toFixed(1) : 0
          const topWord = breakdown[0]?.[0] ?? ''
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>SPEECH CLARITY</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: breakdown.length ? 16 : 0 }}>
                <PauseStat value={`${total}`} label="Filler words" />
                <PauseStat value={`${perMin}/min`} label="Filler rate" />
              </div>
              {breakdown.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {breakdown.map(([word, count]) => (
                    <span key={word} style={{
                      fontSize: 13, fontWeight: 600, padding: '5px 12px', borderRadius: 20,
                      background: 'var(--accent-dim)', color: 'var(--accent)',
                    }}>
                      "{word}" × {count}
                    </span>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 16, lineHeight: 1.55 }}>
                💡 {fillerTip(perMin, topWord)}
              </p>
            </div>
          )
        })()}

        {/* Question-to-statement ratio */}
        {(() => {
          const userText = session.transcript.filter(l => l.speakerID === 0).map(l => l.text).join(' ')
          if (!userText.trim()) return null
          const q = questionStats(userText)
          if (q.questions + q.statements === 0) return null
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>CURIOSITY</h3>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${q.ratio * 100}%`, background: 'var(--accent)' }} />
                <div style={{ flex: 1, background: 'var(--bg-subtle)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 18 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{q.questions} question{q.questions !== 1 ? 's' : ''} ({Math.round(q.ratio * 100)}%)</span>
                <span style={{ color: 'var(--muted)' }}>{q.statements} statement{q.statements !== 1 ? 's' : ''}</span>
              </div>
              {speakers.length > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {speakers.map(s => {
                    const txt = session.transcript.filter(l => l.speakerID === s.speakerID).map(l => l.text).join(' ')
                    const sq = questionStats(txt)
                    return (
                      <div key={s.speakerID} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: speakerColor(s.speakerID) }} />
                          {nameFor(s.speakerID)}
                        </span>
                        <span style={{ color: 'var(--muted)' }}>{sq.questions} question{sq.questions !== 1 ? 's' : ''} asked</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.55 }}>
                💡 {questionTip(q.ratio, q.questions, session.session_type)}
              </p>
            </div>
          )
        })()}

        {/* Active listening / backchannels */}
        {speakers.length > 1 && session.transcript.length > 0 && (() => {
          const bc = backchannelStats(session.transcript)
          const chips = Object.entries(bc.phrases).sort((a, b) => b[1] - a[1])
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>ACTIVE LISTENING</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Listening score</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{Math.round(bc.score * 100)}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ height: '100%', width: `${bc.score * 100}%`, background: 'var(--green)', borderRadius: 4 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: chips.length ? 16 : 0 }}>
                <span style={{ color: 'var(--muted)' }}>Acknowledgements given</span>
                <span style={{ fontWeight: 700 }}>{bc.count}</span>
              </div>
              {chips.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {chips.map(([word, count]) => (
                    <span key={word} style={{ fontSize: 13, fontWeight: 600, padding: '5px 12px', borderRadius: 20, background: 'rgba(29,158,117,0.14)', color: 'var(--green)' }}>
                      "{word}" × {count}
                    </span>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 16, lineHeight: 1.55 }}>
                💡 {backchannelTip(bc.score, bc.count, true)}
              </p>
            </div>
          )
        })()}

        {/* Turn-taking / interruptions */}
        {speakers.length > 1 && session.transcript.length > 1 && (() => {
          const ir = interruptionStats(session.transcript.map(l => ({ speakerID: l.speakerID, startTime: l.startTime })))
          const userMade = ir.made[0] ?? 0
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>TURN-TAKING</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
                <PauseStat value={`${ir.total}`} label="Total interruptions" />
                <PauseStat value={`${userMade}`} label="You interrupted" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {speakers.map(s => (
                  <div key={s.speakerID} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: speakerColor(s.speakerID) }} />
                      {nameFor(s.speakerID)}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      interrupted {ir.made[s.speakerID] ?? 0}× · cut off {ir.received[s.speakerID] ?? 0}×
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.55 }}>
                💡 {interruptionTip(userMade, ir.total)}
              </p>
            </div>
          )
        })()}

        {/* Prosodic entrainment / rapport */}
        {speakers.length > 1 && (() => {
          const ent = entrainmentStats(speakers)
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 28, boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 16 }}>RAPPORT</h3>
              {/* big circular score */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
                <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
                  <svg width={84} height={84} viewBox="0 0 84 84">
                    <circle cx={42} cy={42} r={36} fill="none" stroke="var(--bg-subtle)" strokeWidth={8} />
                    <circle cx={42} cy={42} r={36} fill="none" stroke="var(--accent)" strokeWidth={8}
                      strokeLinecap="round" strokeDasharray={`${ent.score * 226} 226`}
                      transform="rotate(-90 42 42)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800 }}>
                    {Math.round(ent.score * 100)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                    {ent.score > 0.75 ? 'In sync' : ent.score > 0.5 ? 'Fairly aligned' : 'Different styles'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Vocal alignment across pitch, energy &amp; airtime balance.
                  </div>
                </div>
              </div>
              {ent.pairs.length > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {ent.pairs.map(p => (
                    <div key={`${p.a}-${p.b}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(p.a) }} />
                        <span style={{ color: 'var(--muted)' }}>↔</span>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(p.b) }} />
                        {nameFor(p.a)} &amp; {nameFor(p.b)}
                      </span>
                      <span style={{ fontWeight: 700 }}>{Math.round(p.score * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.55 }}>
                💡 {entrainmentTip(ent.score)}
              </p>
            </div>
          )
        })()}

        {/* Speaker cards */}
        {speakers.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 14 }}>SPEAKERS</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {speakers.map(s => (
                <div key={s.speakerID} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: speakerColor(s.speakerID) }} />
                    {editing === s.speakerID ? (
                      <input
                        autoFocus value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        onBlur={() => saveName(s.speakerID)}
                        onKeyDown={e => e.key === 'Enter' && saveName(s.speakerID)}
                        placeholder={`Speaker ${s.speakerID + 1}`}
                        style={{ flex: 1, fontSize: 14, fontWeight: 700, border: 'none', borderBottom: '1.5px solid var(--accent)', outline: 'none', background: 'transparent', color: 'var(--text)' }}
                      />
                    ) : (
                      <button onClick={() => { setEditing(s.speakerID); setDraftName(s.name ?? '') }}
                        style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 14, background: 'none', border: 'none', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {speakerName(s)} <span style={{ fontSize: 11, color: 'var(--muted)' }}>✎</span>
                      </button>
                    )}
                  </div>
                  {[
                    ['Talk time', `${Math.round(s.talkTimeRatio * 100)}%`],
                    ['Turns', s.turnCount],
                    ['Dominance', `${Math.round(s.dominanceScore * 100)}%`],
                    ['Confidence', `${Math.round(s.confidenceScore * 100)}%`],
                    ['Avg pitch', `${s.avgPitch} Hz`],
                    ['Hedge words', s.hedgeCount],
                    ['Questions', s.questionCount],
                  ].map(([l, v]) => (
                    <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: 'var(--muted)' }}>{l}</span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, height: 4, background: 'var(--bg-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.talkTimeRatio * 100}%`, background: speakerColor(s.speakerID), borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {session.transcript?.length > 0 && (
          <div>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 14 }}>TRANSCRIPT</h3>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
              {session.transcript.map((line, i) => (
                <div key={line.id} style={{ padding: '14px 18px', borderBottom: i < session.transcript.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 14 }}>
                  <div style={{ paddingTop: 4, flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: speakerColor(line.speakerID) }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: speakerColor(line.speakerID), display: 'block', marginBottom: 4 }}>
                      {nameFor(line.speakerID)}
                    </span>
                    <p style={{ fontSize: 14, lineHeight: 1.6 }}>{highlightFillers(line.text)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// Cleaned, lowercased filler set for inline matching
const FILLER_SET = new Set(FILLERS.map(f => f.replace(/[.,]/g, '').trim().toLowerCase()).filter(Boolean))

/** Wrap filler words/phrases in a highlighted span within transcript text. */
function highlightFillers(text: string): React.ReactNode {
  const pattern = [...FILLER_SET]
    .sort((a, b) => b.length - a.length)
    .map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const re = new RegExp(`\\b(${pattern})\\b`, 'gi')
  const parts = text.split(re) // capturing group keeps the matched fillers
  return parts.map((part, i) =>
    FILLER_SET.has(part.toLowerCase())
      ? <mark key={i} style={{ background: 'rgba(216,90,48,0.18)', color: '#D85A30', padding: '0 2px', borderRadius: 3, fontWeight: 600 }}>{part}</mark>
      : <span key={i}>{part}</span>
  )
}

function PauseStat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function pauseTip(p: PauseStats): string {
  if (p.talkRatio > 0.92) return 'Very little silence — you may be rushing. Leave space for others to respond and for your points to land.'
  if (p.longestPauseSec > 4) return `One pause stretched to ${p.longestPauseSec}s. Long gaps can feel awkward — prepare transitions to keep momentum.`
  if (p.talkRatio < 0.55) return 'Lots of quiet time. Some silence is good for thinking, but check the conversation isn’t stalling.'
  return 'Healthy pacing — a good balance of speech and natural pauses.'
}
