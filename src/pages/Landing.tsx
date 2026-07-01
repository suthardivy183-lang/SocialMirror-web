import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import './landing.css'

const REPO = 'https://github.com/suthardivy183-lang/SocialMirror-web'

export default function Landing() {
  return (
    <div className="rl">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="rl-nav">
        <div className="rl-wrap rl-nav-inner">
          <Link to="/" className="rl-brand">
            <span className="rl-brand-dot">
              <Waves size={12} stroke="#fff" />
            </span>
            SocialMirror
          </Link>
          <div className="rl-nav-links">
            <a href="#uncover">What it finds</a>
            <a href="#how">How it works</a>
            <a href="#why">Why it works</a>
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/dashboard" className="rl-btn rl-btn--ghost">Sign in</Link>
            <Link to="/dashboard" className="rl-btn rl-btn--primary">Start free</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="rl-hero">
        <div className="rl-wrap rl-hero-inner">
          <h1 className="rl-h1">Understand how you really come across</h1>
          <p>
            SocialMirror listens to your real conversations and reflects the truth
            beneath the words — who led, where you hesitated, how you actually sounded.
            What matters gets measured. What matters gets better.
          </p>
          <div className="rl-hero-cta">
            <Link to="/dashboard" className="rl-btn rl-btn--onmag rl-btn--primary">Start free</Link>
            <a href="#how" className="rl-btn rl-btn--onmag">See how it works</a>
          </div>
        </div>
        <div className="rl-wrap">
          <div className="rl-hero-media">
            <TranscriptMock />
          </div>
        </div>
      </header>

      {/* ── Conversations become insight (split) ────────────────────────── */}
      <section className="rl-section rl-section--peri rl-pad-top">
        <div className="rl-wrap rl-split">
          <div>
            <div className="rl-ico"><Chat /></div>
            <h2 className="rl-h2">Conversations<br />become insight</h2>
            <p className="rl-lead" style={{ marginTop: 20, maxWidth: 460 }}>
              We take the noise of a real conversation and distil it into clarity.
              Every word, every pause, every shift in tone tells a story — SocialMirror
              reads between the lines so you don't have to.
            </p>
            <div style={{ marginTop: 28 }}>
              <Link to="/dashboard" className="rl-btn">Try it now</Link>
            </div>
          </div>
          <div className="rl-split-media">
            <Photo src={PHOTOS.collab} alt="Two colleagues talking over a laptop" />
          </div>
        </div>
      </section>

      {/* ── What we uncover (capabilities bento) ────────────────────────── */}
      <section id="uncover" className="rl-section rl-section--peri" style={{ paddingTop: 0 }}>
        <div className="rl-wrap">
          <div className="rl-kicker">
            <span className="rl-eyebrow">Capabilities</span>
            <h2 className="rl-h2" style={{ marginTop: 12 }}>What we uncover</h2>
            <p className="rl-lead" style={{ marginTop: 12 }}>Behavioural patterns emerge from the audio.</p>
          </div>
          <div className="rl-bento-3">
            <Bento
              tag="Balance"
              title="Talk-time & dominance"
              desc="See exactly who led and who followed — the share of the room each voice actually took."
              media={<TalkBar />}
            />
            <Bento
              tag="Delivery"
              title="Fillers, pace & pauses"
              desc="Every 'um', 'like' and hesitation, counted — plus how long you paused and how fast you spoke."
            />
            <Bento
              tag="Precision"
              title="Who said what"
              desc="Neural speaker diarization separates each person automatically, then labels the transcript line by line."
            />
          </div>
        </div>
      </section>

      {/* ── Why it works (results bento) ────────────────────────────────── */}
      <section id="why" className="rl-section rl-section--peri" style={{ paddingTop: 0 }}>
        <div className="rl-wrap">
          <div className="rl-kicker">
            <span className="rl-eyebrow">Results</span>
            <h2 className="rl-h2" style={{ marginTop: 12 }}>Why it works</h2>
            <p className="rl-lead" style={{ marginTop: 12 }}>Better conversations come from honest feedback.</p>
          </div>
          <div className="rl-bento-results">
            <Bento
              tag="Objective"
              title="Numbers, not vibes"
              desc="Real measurements from the audio — not a gut feeling about how it went."
            />
            <Bento
              tag="Private"
              title="Your voice, your data"
              desc="Built for individuals, not surveillance. On-device processing is on the roadmap."
            />
            <div className="rl-card rl-big">
              <span className="rl-card-tag">Impact</span>
              <h3 className="rl-h3">Measurable change over time</h3>
              <p className="rl-body" style={{ marginTop: 12 }}>
                Every session is scored the same way, so you can watch the numbers
                move — more questions asked, fewer fillers, a fairer share of the floor.
              </p>
              <div className="rl-viz rl-viz--tall" style={{ marginTop: 22, flex: 1 }}>
                <Photo src={PHOTOS.team} alt="A diverse team in discussion" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Three steps (process) ───────────────────────────────────────── */}
      <section id="how" className="rl-section rl-section--peri" style={{ paddingTop: 0 }}>
        <div className="rl-wrap">
          <div className="rl-kicker">
            <span className="rl-eyebrow">Process</span>
            <h2 className="rl-h2" style={{ marginTop: 12 }}>Three steps to clarity</h2>
            <p className="rl-lead" style={{ marginTop: 12 }}>Feed a conversation in, get coaching out.</p>
          </div>
          <div className="rl-bento-3">
            <Step n="01" tag="Capture" title="Record the moment" desc="Record live in the browser or upload an audio file. Raw and unfiltered — no setup." />
            <Step n="02" tag="Analyze" title="AI reads the intent" desc="Whisper transcribes, pyannote separates speakers, librosa measures your delivery." />
            <Step n="03" tag="Improve" title="Get your coaching" desc="A speaker-labelled transcript, a full dashboard, and one clear thing to change next time." />
          </div>
        </div>
      </section>

      {/* ── See it in action (highlight) ────────────────────────────────── */}
      <section className="rl-section rl-section--paper">
        <div className="rl-wrap rl-split">
          <a href="https://socialmirror-nine.vercel.app" target="_blank" rel="noreferrer" className="rl-split-media" style={{ display: 'block', position: 'relative' }}>
            <Photo src={PHOTOS.warm} alt="Two people in conversation at a desk" />
            <span style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            }}>
              <span style={{
                width: 74, height: 74, borderRadius: '50%', background: '#fff',
                border: '1.5px solid var(--line)', display: 'grid', placeItems: 'center',
                boxShadow: 'var(--shadow-card)',
              }}>
                <Play />
              </span>
            </span>
          </a>
          <div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} />)}
            </div>
            <h2 className="rl-h2" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)' }}>
              “It showed me I talked 79% of the time and never asked a single question.”
            </h2>
            <p className="rl-lead" style={{ marginTop: 18 }}>
              The kind of blunt, specific feedback a mock interview should give you —
              free, in a browser, in a couple of minutes.
            </p>
            <div className="rl-chips" style={{ marginTop: 22 }}>
              <span className="rl-chip"><b>10+</b> metrics per speaker</span>
              <span className="rl-chip"><b>2-way</b> speaker separation</span>
              <span className="rl-chip"><b>Free</b> · open source</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="rl-section rl-section--peri" style={{ paddingTop: 'clamp(48px,6vw,80px)' }}>
        <div className="rl-wrap">
          <div className="rl-cta-card">
            <h2 className="rl-h2">See how you really come across</h2>
            <p className="rl-lead" style={{ marginTop: 14 }}>
              Record a conversation and watch it turn into coaching.
            </p>
            <div className="rl-hero-cta">
              <Link to="/dashboard" className="rl-btn rl-btn--primary">Start free</Link>
              <a href={REPO} target="_blank" rel="noreferrer" className="rl-btn">View on GitHub</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="rl-footer">
        <div className="rl-wrap">
          <div className="rl-footer-top">
            <Link to="/" className="rl-brand">
              <span className="rl-brand-dot"><Waves size={12} stroke="#fff" /></span>
              SocialMirror
            </Link>
            <div className="rl-footer-links">
              <a href="#uncover">What it finds</a>
              <a href="#how">How it works</a>
              <a href="#why">Why it works</a>
              <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            </div>
            <div className="rl-footer-social">
              <a href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub"><Github /></a>
            </div>
          </div>
          <div className="rl-footer-bottom">
            <span>© 2026 SocialMirror · Divy Suthar · Parul University</span>
            <span>Built with Whisper · pyannote · librosa · Photos: Unsplash</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ── Bento & step cards ──────────────────────────────────────────────────── */

function Bento({ tag, title, desc, media }: { tag: string; title: string; desc: string; media?: ReactNode }) {
  return (
    <article className="rl-card">
      <span className="rl-card-tag">{tag}</span>
      <h3 className="rl-h3">{title}</h3>
      <p className="rl-body" style={{ marginTop: 12 }}>{desc}</p>
      {media && <div style={{ marginTop: 22 }}>{media}</div>}
      <Link to="/dashboard" className="rl-arrow">Explore <ArrowR /></Link>
    </article>
  )
}

function Step({ n, tag, title, desc }: { n: string; tag: string; title: string; desc: string }) {
  return (
    <article className="rl-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <span className="rl-card-tag" style={{ margin: 0 }}>{tag}</span>
        <span style={{ fontFamily: 'var(--fh)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', opacity: 0.35 }}>{n}</span>
      </div>
      <h3 className="rl-h3">{title}</h3>
      <p className="rl-body" style={{ marginTop: 12 }}>{desc}</p>
    </article>
  )
}

/* ── Built product visuals (no stock imagery) ────────────────────────────── */

function TranscriptMock() {
  return (
    <div className="rl-mock">
      <div className="rl-mock-row">
        <span className="rl-spk rl-spk--2">Interviewer</span>
        <span className="rl-mock-text">Tell me about a project you're proud of.</span>
      </div>
      <div className="rl-mock-row">
        <span className="rl-spk rl-spk--1">You</span>
        <span className="rl-mock-text">
          Yeah, <span className="fil">um</span>, sure — so I <span className="fil">like</span> worked on
          three launches, and <span className="fil">uh</span> the biggest was the onboarding redesign.
        </span>
      </div>
      <div className="rl-mock-row">
        <span className="rl-spk rl-spk--2">Interviewer</span>
        <span className="rl-mock-text">What was the impact?</span>
      </div>
      <div className="rl-chips">
        <span className="rl-chip">Talk-time <b>79%</b></span>
        <span className="rl-chip">Fillers <b>×12</b></span>
        <span className="rl-chip">Questions asked <b>1</b></span>
        <span className="rl-chip">Speakers <b>2</b></span>
      </div>
    </div>
  )
}

function TalkBar() {
  return (
    <div>
      <div className="rl-bar-track">
        <span className="rl-bar-fill" style={{ width: '79%' }} />
        <span className="rl-bar-fill two" style={{ width: '21%' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--fh)', fontWeight: 600, fontSize: 12.5 }}>
        <span>You · 79%</span><span>Them · 21%</span>
      </div>
    </div>
  )
}

// Free Unsplash photos (permanent CDN URLs, no local assets needed).
const PHOTOS = {
  collab: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1200&q=80&auto=format&fit=crop',
  team: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1200&q=80&auto=format&fit=crop',
  warm: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&q=80&auto=format&fit=crop',
}

function Photo({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
}

/* ── Icons ───────────────────────────────────────────────────────────────── */

function Waves({ size = 16, stroke = 'currentColor' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round">
      <path d="M2 11h2M7 6v10M11 2v18M15 6v10M20 11h0" />
    </svg>
  )
}
function Chat() {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
}
function ArrowR() {
  return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}
function Play() {
  return <svg width={26} height={26} viewBox="0 0 24 24" fill="var(--ink)"><path d="M8 5v14l11-7z" /></svg>
}
function Star() {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="var(--ink)"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6z" /></svg>
}
function Github() {
  return <svg width={22} height={22} viewBox="0 0 24 24" fill="var(--ink)"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" /></svg>
}
