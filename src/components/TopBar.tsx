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
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9, background: 'var(--accent-dim)',
          display: 'grid', placeItems: 'center', fontSize: 16,
        }}>〰️</div>
        <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
      </div>
      {right}
    </header>
  )
}
