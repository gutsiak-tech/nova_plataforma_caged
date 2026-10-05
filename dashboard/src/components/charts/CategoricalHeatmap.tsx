import { useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import {
  buildCategoricalHeatmap,
  HEATMAP_TOOLTIP_METRICS,
  HEATMAP_VALUE_KEY,
  heatmapCellKey,
  heatmapColor,
  heatmapValueRatio,
  isSmallSalarySample,
  type HeatmapCell,
  type HeatmapData,
} from '../../lib/categoricalHeatmap'
import type { GoldRow } from '../../api/types'
import { GOLD_COLUMNS } from '../../api/goldColumns'
import { formatCurrencyBRL } from '../../lib/format'
import { chartTheme } from '../../lib/chartTheme'
import { EmptyState } from '../ui/EmptyState'

type CategoricalHeatmapProps = {
  rows: GoldRow[]
  rowKey: string
  colKey: string
  rowAxisLabel: string
  colAxisLabel: string
  valueKey?: string
  valueLabel?: string
  /** Matriz ampla — colunas mais compactas e cabeçalho inclinado. */
  wide?: boolean
}

type TooltipState = {
  cell: HeatmapCell
  x: number
  y: number
}

export function CategoricalHeatmap({
  rows,
  rowKey,
  colKey,
  rowAxisLabel,
  colAxisLabel,
  valueKey = HEATMAP_VALUE_KEY,
  valueLabel = 'Salário mediano nominal',
  wide = false,
}: CategoricalHeatmapProps) {
  const data = useMemo(
    () => buildCategoricalHeatmap(rows, rowKey, colKey, valueKey),
    [rows, rowKey, colKey, valueKey],
  )
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>()
    for (const cell of data.cells) {
      map.set(heatmapCellKey(cell.row, cell.col), cell)
    }
    return map
  }, [data.cells])

  if (!rows.length || !data.rowLabels.length || !data.colLabels.length) {
    return (
      <EmptyState
        title="Sem dados para o heatmap"
        description="Não há combinações disponíveis para este cruzamento no recorte selecionado."
      />
    )
  }

  const rowLabelW = wide ? 100 : 112

  return (
    <div className="space-y-3">
      <div className="heatmap-scroll max-w-full overflow-x-hidden max-lg:overflow-x-auto">
        <div
          className="grid w-full max-w-full gap-1.5"
          style={
            {
              gridTemplateColumns: `${rowLabelW}px repeat(${data.colLabels.length}, minmax(0, 1fr))`,
            } as CSSProperties
          }
        >
          <div className="min-w-0" />
          {data.colLabels.map((col) => (
            <div
              key={col}
              className={clsx(
                'min-w-0 overflow-hidden px-0.5 text-center text-[10px] leading-tight text-slate-400',
                wide ? 'flex h-16 items-end justify-center' : 'flex min-h-[2.5rem] items-end justify-center',
              )}
              title={col}
            >
              <span
                className={clsx(
                  'block min-w-0 max-w-full',
                  wide
                    ? 'origin-bottom-left -rotate-45 whitespace-nowrap text-[9px] leading-none'
                    : 'line-clamp-2',
                )}
              >
                {col}
              </span>
            </div>
          ))}

          {data.rowLabels.map((row) => (
            <HeatmapRow
              key={row}
              row={row}
              colLabels={data.colLabels}
              cellMap={cellMap}
              data={data}
              valueLabel={valueLabel}
              onHover={setTooltip}
              onLeave={() => setTooltip(null)}
            />
          ))}
        </div>
      </div>

      <HeatmapLegend min={data.min} max={data.max} valueLabel={valueLabel} />

      <p className="text-[11px] text-slate-500">
        {rowAxisLabel} × {colAxisLabel} · intensidade por {valueLabel.toLowerCase()}
      </p>

      {tooltip
        ? createPortal(
            <HeatmapTooltip
              cell={tooltip.cell}
              rowAxisLabel={rowAxisLabel}
              colAxisLabel={colAxisLabel}
              valueLabel={valueLabel}
              valueKey={data.valueKey}
              x={tooltip.x}
              y={tooltip.y}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

function HeatmapRow({
  row,
  colLabels,
  cellMap,
  data,
  valueLabel,
  onHover,
  onLeave,
}: {
  row: string
  colLabels: string[]
  cellMap: Map<string, HeatmapCell>
  data: HeatmapData
  valueLabel: string
  onHover: (t: TooltipState) => void
  onLeave: () => void
}) {
  return (
    <>
      <div className="min-w-0 pr-1 text-xs leading-snug text-slate-300" title={row}>
        <span className="line-clamp-2">{row}</span>
      </div>
      {colLabels.map((col) => {
        const cell = cellMap.get(heatmapCellKey(row, col))
        const value = cell?.value ?? null
        const ratio = heatmapValueRatio(value, data.min, data.max)
        const fill = ratio === null ? 'rgba(30, 36, 52, 0.55)' : heatmapColor(ratio)

        return (
          <button
            key={`${row}-${col}`}
            type="button"
            className={clsx(
              'relative h-9 min-w-0 rounded-md border border-white/[0.06] transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35',
              value !== null && 'hover:z-10 hover:ring-1 hover:ring-cyan-400/30',
              value === null && 'cursor-default opacity-60',
            )}
            style={{ backgroundColor: fill }}
            aria-label={
              value !== null
                ? `${row} × ${col}: ${valueLabel.toLowerCase()} ${formatCurrencyBRL(value)}`
                : `${row} × ${col}: sem dado`
            }
            onMouseEnter={(e) => {
              if (!cell || value === null) return
              onHover({ cell, x: e.clientX, y: e.clientY })
            }}
            onMouseMove={(e) => {
              if (!cell || value === null) return
              onHover({ cell, x: e.clientX, y: e.clientY })
            }}
            onMouseLeave={onLeave}
            onFocus={(e) => {
              if (!cell || value === null) return
              const rect = e.currentTarget.getBoundingClientRect()
              onHover({ cell, x: rect.right, y: rect.top })
            }}
            onBlur={onLeave}
          >
            {value !== null ? (
              <span className="sr-only">
                {formatCurrencyBRL(value)}
              </span>
            ) : null}
          </button>
        )
      })}
    </>
  )
}

function HeatmapLegend({ min, max, valueLabel }: { min: number; max: number; valueLabel: string }) {
  const stops = [0, 0.25, 0.5, 0.75, 1]
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{valueLabel}</span>
      <div className="flex min-w-[10rem] flex-1 items-center gap-2">
        <span className="text-[11px] tabular-nums text-slate-500">{formatCurrencyBRL(min)}</span>
        <div
          className="h-2 flex-1 rounded-full border border-white/[0.06]"
          style={{
            background: `linear-gradient(90deg, ${stops.map((t) => `${heatmapColor(t)} ${t * 100}%`).join(', ')})`,
          }}
          aria-hidden
        />
        <span className="text-[11px] tabular-nums text-slate-500">{formatCurrencyBRL(max)}</span>
      </div>
    </div>
  )
}

function HeatmapTooltip({
  cell,
  rowAxisLabel,
  colAxisLabel,
  valueLabel,
  valueKey,
  x,
  y,
}: {
  cell: HeatmapCell
  rowAxisLabel: string
  colAxisLabel: string
  valueLabel: string
  valueKey: string
  x: number
  y: number
}) {
  const metrics = HEATMAP_TOOLTIP_METRICS.filter(
    (m) => cell.metrics[m.key] !== null && cell.metrics[m.key] !== undefined,
  )
  const smallSample = isSmallSalarySample(
    cell.metrics[GOLD_COLUMNS.N_SALARIOS_VALIDOS],
  )

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-xl border px-3 py-2.5 text-xs shadow-xl"
      style={{
        left: Math.min(x + 14, window.innerWidth - 280),
        top: Math.min(y + 14, window.innerHeight - 220),
        background: chartTheme.tooltip.contentStyle.background,
        borderColor: chartTheme.tooltip.contentStyle.border?.replace('1px solid ', '') ?? 'rgba(148,163,184,0.18)',
        color: chartTheme.tooltip.contentStyle.color,
      }}
      role="tooltip"
    >
      <p className="font-medium text-slate-100">
        {cell.row} × {cell.col}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-500">
        {rowAxisLabel} × {colAxisLabel}
      </p>
      <dl className="mt-2 space-y-1">
        {metrics.map((m) => (
          <div key={m.key} className="flex items-baseline justify-between gap-4">
            <dt className={clsx('text-slate-400', m.key === valueKey && 'text-cyan-300/90')}>
              {m.key === valueKey ? valueLabel : m.label}
            </dt>
            <dd
              className={clsx(
                'tabular-nums text-slate-200',
                m.key === GOLD_COLUMNS.SALDO &&
                  Number(cell.metrics[GOLD_COLUMNS.SALDO]) < 0 &&
                  'text-rose-300/90',
                m.key === GOLD_COLUMNS.SALDO &&
                  Number(cell.metrics[GOLD_COLUMNS.SALDO]) > 0 &&
                  'text-emerald-300/90',
                m.key === valueKey && 'font-medium text-cyan-200',
              )}
            >
              {m.format(cell.metrics[m.key])}
            </dd>
          </div>
        ))}
      </dl>
      {smallSample ? (
        <p className="mt-2 text-[10px] font-medium text-amber-300">
          Amostra pequena (N &lt; 30)
        </p>
      ) : null}
    </div>
  )
}
