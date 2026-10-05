import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartTheme } from '../../lib/chartTheme'
import { formatCompact, formatInt } from '../../lib/format'
import type { PeriodDeltaDatum } from '../../lib/periodDelta'
import { tokens } from '../../lib/tokens'
import {
  HORIZONTAL_BAR_Y_AXIS_WIDTH,
  horizontalBarChartHeight,
  truncateChartLabel,
} from './horizontalBarChartUtils'

function formatPctPtBr(n: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n)
}

function DeltaTooltip({
  active,
  payload,
  previousLabel,
  currentLabel,
}: {
  active?: boolean
  payload?: Array<{ payload?: PeriodDeltaDatum & { fullLabel?: string } }>
  previousLabel: string
  currentLabel: string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null

  const c =
    p.deltaAbs > 0
      ? tokens.colors.accent.green
      : p.deltaAbs < 0
        ? tokens.colors.accent.rose
        : tokens.colors.text.muted

  return (
    <div style={{ ...chartTheme.tooltip.contentStyle, padding: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: tokens.colors.text.primary, fontWeight: 650, lineHeight: 1.2 }}>
          {p.fullLabel ?? p.label}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: 6, alignItems: 'baseline' }}>
          <div style={{ color: tokens.colors.text.muted }}>{previousLabel}</div>
          <div style={{ color: tokens.colors.text.secondary, textAlign: 'right' }}>
            {formatInt(p.previousValue)}
          </div>
          <div style={{ color: tokens.colors.text.muted }}>{currentLabel}</div>
          <div style={{ color: tokens.colors.text.secondary, textAlign: 'right' }}>
            {formatInt(p.currentValue)}
          </div>
          <div style={{ color: tokens.colors.text.muted }}>Δ</div>
          <div style={{ color: c, textAlign: 'right', fontWeight: 650 }}>{formatInt(p.deltaAbs)}</div>
          {Number.isFinite(p.deltaPct) ? (
            <>
              <div style={{ color: tokens.colors.text.muted }}>Δ%</div>
              <div style={{ color: c, textAlign: 'right' }}>{formatPctPtBr(p.deltaPct as number)}%</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function CompetenciaDeltaBar({
  data,
  previousLabel,
  currentLabel,
}: {
  data: PeriodDeltaDatum[]
  previousLabel: string
  currentLabel: string
}) {
  const maxAbs = data.reduce((m, d) => Math.max(m, Math.abs(d.deltaAbs)), 0)
  const pad = maxAbs > 0 ? Math.ceil(maxAbs * 0.08) : 1
  const domain: [number, number] = [-maxAbs - pad, maxAbs + pad]
  const chartData = data.map((d) => ({
    ...d,
    fullLabel: d.label,
    label: truncateChartLabel(d.label),
  }))
  const chartHeight = horizontalBarChartHeight(chartData.length)

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 4, right: 18, top: 8, bottom: 8 }}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray={chartTheme.grid.strokeDasharray} stroke={chartTheme.grid.stroke} />
          <ReferenceLine x={0} stroke="rgba(148,163,184,0.35)" />
          <XAxis
            type="number"
            domain={domain}
            tick={chartTheme.axis.tick}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCompact(v)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={HORIZONTAL_BAR_Y_AXIS_WIDTH}
            tick={chartTheme.axis.label}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: chartTheme.tooltip.cursorFill }}
            content={
              <DeltaTooltip previousLabel={previousLabel} currentLabel={currentLabel} />
            }
          />
          <Bar
            dataKey="deltaAbs"
            radius={[8, 8, 8, 8]}
            maxBarSize={18}
            className="transition-[filter,opacity] duration-200 hover:brightness-110"
          >
            {data.map((d) => (
              <Cell
                key={d.label}
                fill={
                  d.deltaAbs > 0
                    ? tokens.colors.accent.green
                    : d.deltaAbs < 0
                      ? tokens.colors.accent.rose
                      : tokens.colors.text.muted
                }
                fillOpacity={0.95}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
