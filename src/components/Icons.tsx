// Clean line icons — replace emoji across the app for a professional look.

type IconProps = { size?: number }

function svgProps(size: number) {
  return {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    style: { display: 'block' as const },
  }
}

export function TypeIcon({ type, size = 20 }: { type: string } & IconProps) {
  const p = svgProps(size)
  switch (type) {
    case 'meeting':
      return (<svg {...p}><circle cx="8.5" cy="9" r="3" /><path d="M3 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.5" /><path d="M17.5 19a5 5 0 0 0-3-4.6" /></svg>)
    case 'interview':
      return (<svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 1.5v2.5M12 20v2.5M1.5 12h2.5M20 12h2.5" /></svg>)
    case 'call':
      return (<svg {...p}><path d="M6.3 3.5c.9 0 1.6.6 1.9 1.5l.7 2.3c.2.8 0 1.5-.6 1.9l-1.1.9a12 12 0 0 0 4.6 4.6l.9-1.1c.5-.6 1.2-.8 1.9-.6l2.3.7c.9.3 1.5 1 1.5 1.9v2.2c0 1.2-1 2.1-2.1 2A16.5 16.5 0 0 1 4.2 6.1C4.1 5 5 4 6.2 4z" /></svg>)
    case 'podcast':
      return (<svg {...p}><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M6 10a6 6 0 0 0 12 0" /><path d="M12 16v4M9 21h6" /></svg>)
    case 'negotiation':
      return (<svg {...p}><path d="M12 3.5v16" /><path d="M5.5 7h13" /><path d="M5.5 7 3 12.5a2.6 2.6 0 0 0 5 0z" /><path d="M18.5 7 16 12.5a2.6 2.6 0 0 0 5 0z" /><path d="M7.5 20h9" /></svg>)
    default:
      return (<svg {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></svg>)
  }
}

export function MicIcon({ size = 20 }: IconProps) {
  const p = svgProps(size)
  return (<svg {...p}><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M6 10a6 6 0 0 0 12 0" /><path d="M12 16v4M9 21h6" /></svg>)
}
export function UploadIcon({ size = 20 }: IconProps) {
  const p = svgProps(size)
  return (<svg {...p}><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>)
}
export function MusicIcon({ size = 20 }: IconProps) {
  const p = svgProps(size)
  return (<svg {...p}><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>)
}
export function ChartIcon({ size = 20 }: IconProps) {
  const p = svgProps(size)
  return (<svg {...p}><path d="M3 3v18h18" /><path d="m7 14 3-3 3 3 5-6" /></svg>)
}
export function PencilIcon({ size = 20 }: IconProps) {
  const p = svgProps(size)
  return (<svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>)
}
export function WaveIcon({ size = 20 }: IconProps) {
  const p = svgProps(size)
  return (<svg {...p} strokeWidth={2}><path d="M2 12h2M7 7v10M11 3v18M15 7v10M20 12h0" /></svg>)
}
export function Bulb({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: '-2px', flexShrink: 0 }}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.6.5 1 1.3 1 2.1V16h6v-.4c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  )
}
