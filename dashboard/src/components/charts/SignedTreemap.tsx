import { ResponsiveContainer, Tooltip, Treemap } from 'recharts'
import { chartTheme } from '../../lib/chartTheme'
import { formatInt } from '../../lib/format'

export type SignedTreemapNode = {
  name: string
  value: number
  signedValue: number
}

const treemapTooltipStyle = {
  ...chartTheme.tooltip.contentStyle,
  background: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
  padding: 10,
  color: '#f9fafb',
} as const

type TreemapTooltipPayload = {
  name?: string
  signedValue?: number
}

type TreemapTooltipProps = {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: TreemapTooltipPayload }>
}

function TreemapTooltip({ active, payload }: TreemapTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as TreemapTooltipPayload | undefined
  const name = String(p?.name ?? '')
  const signed = Number(p?.signedValue ?? 0)
  const saldoColor =
    signed > 0
      ? 'var(--ds-accent-green)'
      : signed < 0
        ? 'var(--ds-accent-rose)'
        : 'rgba(249,250,251,0.85)'

  return (
    <div style={treemapTooltipStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ color: '#f9fafb', fontWeight: 600, lineHeight: 1.25 }}>
          {name}
        </div>
        <div style={{ color: saldoColor, lineHeight: 1.25 }}>
          saldo: {formatInt(signed)}
        </div>
      </div>
    </div>
  )
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x))
}

function fillForSignedValue(v: number, maxAbs: number) {
  const t = maxAbs <= 0 ? 0 : clamp01(Math.abs(v) / maxAbs)
  const base = v > 0 ? '16,185,129' : v < 0 ? '244,63,94' : '148,163,184'
  const a = 0.18 + 0.55 * t
  return `rgba(${base},${a.toFixed(3)})`
}

function TreemapCell({
  depth,
  x,
  y,
  width,
  height,
  name,
  signedValue,
  maxAbs,
  selectedName,
  onSelect,
}: {
  depth: number
  x: number
  y: number
  width: number
  height: number
  name: string
  signedValue: number
  maxAbs: number
  selectedName?: string | null
  onSelect?: (name: string) => void
}) {
  const fill = fillForSignedValue(signedValue, maxAbs)
  const canLabel = depth === 1 && width > 90 && height > 32
  const label = name.length > 28 ? `${name.slice(0, 27)}…` : name
  const isSelected = !!selectedName && selectedName === name

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        onClick={depth === 1 && onSelect ? () => onSelect(name) : undefined}
        style={{
          fill,
          stroke: isSelected ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)',
          strokeWidth: isSelected ? 2 : 1,
          cursor: depth === 1 && onSelect ? 'pointer' : 'default',
        }}
      />
      {canLabel ? (
        <text
          x={x + 10}
          y={y + 20}
          fill="rgba(226,232,240,0.92)"
          fontSize={11}
          fontWeight={600}
          style={{ pointerEvents: 'none' }}
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}

export function SignedTreemap({
  nodes,
  selectedName,
  onSelect,
}: {
  nodes: SignedTreemapNode[]
  selectedName?: string | null
  onSelect?: (name: string) => void
}) {
  const maxAbs = nodes.reduce((m, n) => Math.max(m, Math.abs(n.signedValue)), 0)

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={nodes}
          dataKey="value"
          nameKey="name"
          stroke="rgba(255,255,255,0.08)"
          isAnimationActive
          content={(p) => (
            <TreemapCell
              depth={p.depth as number}
              x={p.x as number}
              y={p.y as number}
              width={p.width as number}
              height={p.height as number}
              name={String((p as unknown as { name?: string }).name ?? '')}
              signedValue={Number((p as unknown as { signedValue?: number }).signedValue ?? 0)}
              maxAbs={maxAbs}
              selectedName={selectedName}
              onSelect={onSelect}
            />
          )}
        >
          <Tooltip content={TreemapTooltip} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}
