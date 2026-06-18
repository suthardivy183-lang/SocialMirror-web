interface Axis { label: string; value: number }

interface Props {
  series: { color: string; points: Axis[] }[]
  size?: number
}

/** Lightweight SVG radar chart — mirrors the iOS Canvas RadarChart. */
export default function RadarChart({ series, size = 240 }: Props) {
  const axes = series[0]?.points ?? []
  const n = axes.length
  if (n < 3) return null

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 38
  const rings = [0.25, 0.5, 0.75, 1]

  function point(i: number, value: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    return [cx + Math.cos(angle) * r * value, cy + Math.sin(angle) * r * value]
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* grid rings */}
      {rings.map(ring => (
        <polygon
          key={ring}
          points={axes.map((_, i) => point(i, ring).join(',')).join(' ')}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {/* spokes */}
      {axes.map((_, i) => {
        const [x, y] = point(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />
      })}
      {/* series */}
      {series.map((s, si) => (
        <polygon
          key={si}
          points={s.points.map((p, i) => point(i, p.value).join(',')).join(' ')}
          fill={s.color}
          fillOpacity={0.18}
          stroke={s.color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ))}
      {/* vertices on first series */}
      {series.map((s, si) =>
        s.points.map((p, i) => {
          const [x, y] = point(i, p.value)
          return <circle key={`${si}-${i}`} cx={x} cy={y} r={2.5} fill={s.color} />
        })
      )}
      {/* labels */}
      {axes.map((a, i) => {
        const [x, y] = point(i, 1.18)
        return (
          <text
            key={i}
            x={x}
            y={y}
            fontSize={10.5}
            fontWeight={600}
            fill="var(--muted)"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {a.label}
          </text>
        )
      })}
    </svg>
  )
}
