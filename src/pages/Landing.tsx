import { Link } from 'react-router-dom'

const features = [
  { icon: '🎙️', title: 'Real-time recording', desc: 'Capture live conversations directly in your browser. No app install needed.' },
  { icon: '👥', title: 'Speaker diarization', desc: 'Automatically detects who is speaking and tracks each person separately.' },
  { icon: '📝', title: 'AI transcription', desc: 'Whisper AI transcribes every word, labelled by speaker, on your device.' },
  { icon: '🧠', title: 'Coaching insights', desc: 'Actionable feedback on talk time, confidence, and conversation dynamics.' },
]

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 40px', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'var(--nav-bg)',
        backdropFilter: 'blur(16px)', zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: 'var(--accent-dim)',
            display: 'grid', placeItems: 'center', fontSize: 18,
          }}>〰️</div>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.3px' }}>SocialMirror</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/dashboard" style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
            border: '1px solid var(--border)', color: 'var(--text)',
          }}>Log in</Link>
          <Link to="/dashboard" style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: 'var(--accent)', color: '#fff',
          }}>Sign up free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '100px 24px 80px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{
          display: 'inline-block', padding: '5px 14px', borderRadius: 20,
          background: 'var(--accent-dim)', color: 'var(--accent)',
          fontSize: 13, fontWeight: 600, marginBottom: 28, letterSpacing: '0.02em',
        }}>
          100% free · runs in your browser · zero upload
        </div>
        <h1 style={{
          fontSize: 'clamp(2.4rem, 6vw, 4rem)', fontWeight: 800,
          lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 22,
        }}>
          Understand how you show up<br />
          <span style={{ color: 'var(--accent)' }}>in conversation</span>
        </h1>
        <p style={{
          fontSize: 18, color: 'var(--muted)', lineHeight: 1.65,
          maxWidth: 520, margin: '0 auto 40px',
        }}>
          Record any conversation, get real-time speaker diarization, AI transcription,
          and actionable coaching — all processed on your device.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/dashboard" style={{
            padding: '14px 32px', borderRadius: 10, fontSize: 16, fontWeight: 700,
            background: 'var(--accent)', color: '#fff',
          }}>Start for free</Link>
          <Link to="/dashboard" style={{
            padding: '14px 32px', borderRadius: 10, fontSize: 16, fontWeight: 600,
            border: '1px solid var(--border)', color: 'var(--text)',
          }}>Log in</Link>
        </div>
      </section>

      {/* Features */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '0 24px 100px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20,
      }}>
        {features.map(f => (
          <div key={f.title} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 24,
          }}>
            <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{f.desc}</p>
          </div>
        ))}
      </section>

      <footer style={{
        textAlign: 'center', padding: 24, borderTop: '1px solid var(--border)',
        color: 'var(--muted)', fontSize: 13,
      }}>
        © 2026 SocialMirror · Built with Whisper AI · Zero cloud audio processing
      </footer>
    </div>
  )
}
