import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/dashboard', label: 'Sessions', icon: 'M3 5h18M3 12h18M3 19h18' },
  { to: '/trends', label: 'Trends', icon: 'M3 17l6-6 4 4 8-8' },
  { to: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1L14.5 2h-5l-.3 2.6a7 7 0 00-1.7 1l-2.4-1-2 3.4L3 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.3 2.4h5l.3-2.6a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z' },
]

export default function TabBar() {
  const { pathname } = useLocation()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
      display: 'flex', justifyContent: 'center', gap: 4,
      padding: '8px 12px calc(8px + env(safe-area-inset-bottom))',
      background: 'var(--nav-bg)', backdropFilter: 'blur(18px)',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', gap: 4, width: '100%', maxWidth: 440 }}>
        {TABS.map(t => {
          const active = pathname === t.to
          return (
            <Link key={t.to} to={t.to} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 0', borderRadius: 12,
              color: active ? 'var(--accent)' : 'var(--muted)',
              background: active ? 'var(--accent-dim)' : 'transparent',
              transition: 'background 0.15s, color 0.15s',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
