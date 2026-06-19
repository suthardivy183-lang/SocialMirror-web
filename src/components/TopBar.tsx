interface Props {
  title: string
  right?: React.ReactNode
}

export default function TopBar({ title, right }: Props) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 20px', borderBottom: '1px solid var(--border)',
      background: 'var(--nav-bg)', backdropFilter: 'blur(18px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-ink)',
          display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-accent)', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M2 11h2M7 6v10M11 2v18M15 6v10M20 11h0" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>{title}</h1>
      </div>
      {right}
    </header>
  )
}
