import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'

const features = [
  { n: '01', title: 'Records in your browser', desc: 'Capture a live conversation or drop in an audio file. Nothing to install, nothing to set up.' },
  { n: '02', title: 'Knows who said what', desc: 'Voice-fingerprint diarization separates each speaker — and notices when a new voice joins.' },
  { n: '03', title: 'Transcribes every word', desc: 'Whisper turns speech into a clean, labelled transcript, running entirely on your device.' },
  { n: '04', title: 'Coaches how you show up', desc: 'Talk time, confidence, fillers, questions, rapport — read back as plain, useful guidance.' },
]

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px clamp(20px, 5vw, 56px)', position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--nav-bg)', backdropFilter: 'blur(18px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <Wordmark />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to="/dashboard" className="btn btn-ghost" style={ghostBtn}>Log in</Link>
          <Link to="/dashboard" className="btn btn-solid" style={solidBtn}>Get started</Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="reveal" style={{
        maxWidth: 1080, margin: '0 auto', padding: 'clamp(56px, 9vw, 120px) clamp(20px, 5vw, 40px) 0',
        position: 'relative',
      }}>
        <span className="frost" style={eyebrow}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.8s infinite' }} />
          Private · on-device · zero upload
        </span>

        <h1 style={{
          fontSize: 'clamp(3rem, 9vw, 6.4rem)', fontWeight: 600,
          margin: '26px 0 0', maxWidth: '15ch',
        }}>
          Hear how you really{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--accent)', fontWeight: 500 }}>show&nbsp;up</em>{' '}
          in conversation.
        </h1>

        <p style={{
          fontSize: 'clamp(1.05rem, 1.6vw, 1.3rem)', color: 'var(--text-mid)',
          lineHeight: 1.6, maxWidth: 540, marginTop: 30,
        }}>
          SocialMirror records any conversation, separates the speakers by voice,
          transcribes every word, and reflects back how you actually came across —
          all processed privately on your device.
        </p>

        <div style={{ display: 'flex', gap: 14, marginTop: 38, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/dashboard" className="btn btn-solid" style={{ ...solidBtn, padding: '15px 30px', fontSize: 16, boxShadow: 'var(--shadow-accent)' }}>
            Start listening — free
          </Link>
          <Link to="/dashboard" className="link-underline" style={{
            ...ghostBtn, padding: '15px 8px', fontSize: 16, border: 'none',
            color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 5,
            textDecorationColor: 'var(--border-strong)',
          }}>
            See how it works
          </Link>
        </div>

        {/* Soundwave motif inside a frosted glass panel */}
        <div aria-hidden className="frost" style={{
          marginTop: 56, padding: '26px 28px', borderRadius: 'var(--radius-card)',
          background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)',
        }}>
          <Waveform />
        </div>
      </header>

      {/* ── What it does — asymmetric editorial layout ──────────────────── */}
      <section className="split-2" style={{
        maxWidth: 1080, margin: '0 auto', padding: 'clamp(64px, 10vw, 130px) clamp(20px, 5vw, 40px)',
      }}>
        <div className="sticky-col" style={{ position: 'sticky', top: 110 }}>
          <span style={sectionLabel}>What it does</span>
          <h2 className="display" style={{ fontSize: 'clamp(1.9rem, 3.2vw, 2.8rem)', fontWeight: 500, marginTop: 14, lineHeight: 1.1 }}>
            A mirror for the way you talk.
          </h2>
          <p style={{ color: 'var(--muted)', marginTop: 16, lineHeight: 1.6, maxWidth: 320 }}>
            Four steps, no accounts, no uploads. Open it and start a session.
          </p>
        </div>

        <ol className="frost" style={{
          listStyle: 'none', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)',
          padding: '8px clamp(20px, 3vw, 32px)',
        }}>
          {features.map((f, i) => (
            <li key={f.n} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'clamp(16px, 3vw, 32px)',
              padding: '24px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              alignItems: 'baseline',
            }}>
              <span className="mono" style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 500 }}>{f.n}</span>
              <div>
                <h3 className="display" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.6rem)', fontWeight: 500, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ color: 'var(--text-mid)', lineHeight: 1.6, maxWidth: 440 }}>{f.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Privacy band ────────────────────────────────────────────────── */}
      <section style={{ padding: '0 clamp(20px, 5vw, 40px) clamp(64px, 10vw, 120px)' }}>
        <div className="frost" style={{
          maxWidth: 1080, margin: '0 auto', borderRadius: 'var(--radius-card)',
          background: 'var(--accent-dim)', border: '1px solid var(--border-strong)',
          padding: 'clamp(32px, 5vw, 56px)', boxShadow: 'var(--shadow-card)',
          display: 'flex', gap: 'clamp(20px, 4vw, 48px)', flexWrap: 'wrap',
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ maxWidth: 560 }}>
            <span style={{ ...sectionLabel, color: 'var(--accent)' }}>Yours alone</span>
            <h2 className="display" style={{ fontSize: 'clamp(1.6rem, 2.6vw, 2.3rem)', fontWeight: 500, margin: '12px 0 0', lineHeight: 1.15 }}>
              Your voice never leaves the device.
            </h2>
            <p style={{ color: 'var(--text-mid)', marginTop: 14, lineHeight: 1.6 }}>
              Transcription and speaker analysis run in your browser with on-device AI.
              No audio is uploaded, stored on a server, or sent anywhere.
            </p>
          </div>
          <Link to="/dashboard" className="btn btn-solid" style={{ ...solidBtn, padding: '15px 30px', fontSize: 16 }}>
            Try it now
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--border)', padding: '28px clamp(20px, 5vw, 40px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, color: 'var(--muted)', fontSize: 13,
        maxWidth: 1080, margin: '0 auto',
      }}>
        <Wordmark small />
        <span>© 2026 · Built with on-device Whisper AI</span>
      </footer>
    </div>
  )
}

/* ── Pieces ──────────────────────────────────────────────────────────── */

function Wordmark({ small }: { small?: boolean }) {
  return (
    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: small ? 26 : 32, height: small ? 26 : 32, borderRadius: 9,
        background: 'var(--accent)', color: 'var(--accent-ink)',
        display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-accent)',
      }}>
        <svg width={small ? 13 : 16} height={small ? 13 : 16} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M2 11h2M7 6v10M11 2v18M15 6v10M20 11h0" />
        </svg>
      </span>
      <span style={{ fontWeight: 700, fontSize: small ? 15 : 17, letterSpacing: '-0.02em' }}>SocialMirror</span>
    </Link>
  )
}

function Waveform() {
  // A calm, asymmetric bar field — the visual signature.
  const bars = [10, 22, 38, 28, 54, 70, 46, 84, 62, 96, 74, 52, 88, 60, 40, 26, 48, 34, 20, 12, 30, 18, 24, 14]
  const W = bars.length * 14
  return (
    <svg viewBox={`0 0 ${W} 110`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', maxHeight: 120 }}>
      {bars.map((h, i) => {
        const accent = i % 5 === 3
        return (
          <rect
            key={i}
            x={i * 14 + 2} y={55 - h / 2} width={8} height={h} rx={4}
            fill={accent ? 'var(--accent)' : 'var(--border-strong)'}
            opacity={accent ? 0.95 : 0.55}
          />
        )
      })}
    </svg>
  )
}

const eyebrow: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 9,
  padding: '7px 15px', borderRadius: 'var(--radius-pill)',
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  fontSize: 13, fontWeight: 600, color: 'var(--text-mid)', letterSpacing: '0.01em',
  boxShadow: 'var(--shadow-card)',
}

const sectionLabel: CSSProperties = {
  fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--muted)',
}

const solidBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '9px 18px', borderRadius: 'var(--radius-pill)', fontSize: 14, fontWeight: 700,
  background: 'var(--accent)', color: 'var(--accent-ink)',
}

const ghostBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '9px 18px', borderRadius: 'var(--radius-pill)', fontSize: 14, fontWeight: 600,
  border: '1px solid var(--border-strong)', color: 'var(--text)',
}
