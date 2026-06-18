import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as store from '../lib/store'
import TabBar from '../components/TabBar'
import TopBar from '../components/TopBar'

export default function Settings() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [saveTranscripts, setSaveTranscripts] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [howOpen, setHowOpen] = useState(false)

  useEffect(() => {
    store.getUser().then(user => {
      setEmail(user.email)
      setUserId(user.id)
    })
  }, [])

  async function signOut() { await store.signOut(); navigate('/auth') }
  async function deleteAll() {
    await store.deleteAllSessions(userId)
    setConfirmDelete(false)
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 90 }}>
      <TopBar title="Settings" />
      <main style={{ maxWidth: 620, margin: '0 auto', padding: '24px 20px' }}>
        {/* Account */}
        <Section title="Account">
          <Row label="Signed in as" value={email} />
          {store.isLocalMode && (
            <p style={{ fontSize: 12, color: 'var(--muted)', padding: '0 16px 14px' }}>
              Demo mode — data is stored locally in this browser.
            </p>
          )}
          <Divider />
          <button onClick={signOut} style={rowButton('var(--accent)')}>Sign out</button>
        </Section>

        {/* Privacy */}
        <Section title="Privacy">
          <Toggle label="Save transcripts" on={saveTranscripts} onChange={() => setSaveTranscripts(v => !v)} />
          <Divider />
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={rowButton('var(--red)')}>Delete all data</button>
          ) : (
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 14, marginBottom: 12 }}>This permanently removes all sessions. Continue?</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={deleteAll} style={{
                  flex: 1, padding: 11, borderRadius: 10, fontWeight: 700, fontSize: 14,
                  background: 'var(--red)', color: '#fff', border: 'none',
                }}>Delete everything</button>
                <button onClick={() => setConfirmDelete(false)} style={{
                  flex: 1, padding: 11, borderRadius: 10, fontWeight: 600, fontSize: 14,
                  background: 'var(--bg-subtle)', color: 'var(--text)', border: '1px solid var(--border)',
                }}>Cancel</button>
              </div>
            </div>
          )}
        </Section>

        {/* About */}
        <Section title="About">
          <button onClick={() => setHowOpen(v => !v)} style={{
            ...rowButton('var(--text)'), display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>How it works</span>
            <span style={{ color: 'var(--muted)', transform: howOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
          </button>
          {howOpen && (
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, padding: '0 16px 16px' }}>
              Social Mirror records audio in your browser and analyzes it using:
              <br />• A voice-activity detector that splits speech into segments
              <br />• Acoustic feature extraction (pitch, energy, variance)
              <br />• Speaker diarization that groups segments by voice
              <br />• Browser speech recognition for the transcript
              <br />• A rules-based coaching engine tailored to your patterns
              <br />Nothing leaves your device in demo mode.
            </p>
          )}
          <Divider />
          <Row label="Version" value="1.0 (web)" />
        </Section>
      </main>
      <TabBar />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>{title}</h2>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', fontSize: 14 }}>
      <span>{label}</span>
      <span style={{ color: 'var(--muted)' }}>{value}</span>
    </div>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', fontSize: 14 }}>
      <span>{label}</span>
      <button onClick={onChange} style={{
        width: 46, height: 28, borderRadius: 14, border: 'none', position: 'relative',
        background: on ? 'var(--accent)' : 'var(--border-strong)', transition: 'background 0.2s',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )
}

function Divider() { return <div style={{ height: 1, background: 'var(--border)' }} /> }

function rowButton(color: string): React.CSSProperties {
  return {
    width: '100%', textAlign: 'left', padding: '14px 16px', fontSize: 14, fontWeight: 600,
    background: 'transparent', border: 'none', color,
  }
}
