import { formatCompact, formatInt, shortCompetenciaLabel } from '../../lib/format'
import type { TerritorialMovementPoint } from '../../lib/territorialSummary'

type TerritoryMovementChartProps = {
  points: TerritorialMovementPoint[]
  activeAno: number
  activeMes: number
  loading: boolean
  error: boolean
  onRetry: () => void
}

const PLOT = { w: 640, left: 58, right: 46 }
const LINE_VIEW = { h: 188, top: 14, bottom: 30 }
const BAR_VIEW = { h: 104, top: 8, bottom: 4 }

function finite(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function xAt(index: number, count: number, left: number, right: number): number {
  if (count <= 1) return (left + right) / 2
  return left + (index * (right - left)) / (count - 1)
}

function yAt(value: number, min: number, max: number, top: number, bottom: number): number {
  const span = max - min || 1
  return bottom - ((value - min) / span) * (bottom - top)
}

function linePath(coords: Array<{ x: number; y: number } | null>): string {
  let path = ''
  let open = false
  for (const point of coords) {
    if (!point) {
      open = false
      continue
    }
    path += `${open ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    open = true
  }
  return path
}

export function TerritoryMovementChart({
  points,
  activeAno,
  activeMes,
  loading,
  error,
  onRetry,
}: TerritoryMovementChartProps) {
  const series = [...points]
    .filter(
      (point) =>
        finite(point.admissoes) || finite(point.desligamentos) || finite(point.saldo),
    )
    .sort((left, right) => left.ano - right.ano || left.mes - right.mes)

  if (loading) {
    return (
      <div className="flex h-full min-h-[22rem] flex-col justify-center gap-6" aria-busy="true">
        <div className="h-40 animate-pulse bg-[#efece4]" />
        <div className="h-20 animate-pulse bg-[#efece4]" />
      </div>
    )
  }

  if (error || series.length === 0) {
    return (
      <div className="flex h-full min-h-[16rem] flex-col items-start justify-center gap-3">
        <p className="max-w-sm text-sm leading-6 text-[#5d6678]">
          A trajetória das competências publicadas não está disponível para este território.
        </p>
        {error ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-semibold text-[#1a2130] underline-offset-4 hover:underline"
          >
            Tentar novamente
          </button>
        ) : null}
      </div>
    )
  }

  const flowValues = series.flatMap((point) =>
    [point.admissoes, point.desligamentos].filter(finite),
  )
  const hasFlow = flowValues.length > 0
  const flowMin = hasFlow ? Math.min(...flowValues) : 0
  const flowMax = hasFlow ? Math.max(...flowValues) : 1
  const flowSpan = Math.max(flowMax - flowMin, flowMax * 0.08, 1)
  const yMin = Math.max(0, flowMin - flowSpan * 0.45)
  const yMax = flowMax + flowSpan * 0.2
  const lineBottom = LINE_VIEW.h - LINE_VIEW.bottom
  const lineTop = LINE_VIEW.top

  const admissionCoords = series.map((point, index) =>
    finite(point.admissoes)
      ? {
          x: xAt(index, series.length, PLOT.left, PLOT.w - PLOT.right),
          y: yAt(point.admissoes, yMin, yMax, lineTop, lineBottom),
        }
      : null,
  )
  const dismissalCoords = series.map((point, index) =>
    finite(point.desligamentos)
      ? {
          x: xAt(index, series.length, PLOT.left, PLOT.w - PLOT.right),
          y: yAt(point.desligamentos, yMin, yMax, lineTop, lineBottom),
        }
      : null,
  )

  const saldoValues = series.map((point) => point.saldo).filter(finite)
  const saldoMin = Math.min(0, ...saldoValues)
  const saldoMax = Math.max(0, ...saldoValues, 1)
  const barBottom = BAR_VIEW.h - BAR_VIEW.bottom
  const barTop = BAR_VIEW.top
  const baseline = yAt(0, saldoMin, saldoMax, barTop, barBottom)
  const barWidth = 22

  const ticks = [yMax, (yMin + yMax) / 2, yMin]

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#727d91]">
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-6 bg-[#1a2130]" />
          Admissões
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-6 bg-[#9a7b12]" />
          Desligamentos
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 bg-[#1a2130]" />
          Saldo
        </span>
      </div>

      {hasFlow ? (
      <svg
        viewBox={`0 0 ${PLOT.w} ${LINE_VIEW.h}`}
        className="mt-4 h-auto w-full"
        role="img"
        aria-label="Admissões e desligamentos nas competências publicadas"
      >
        {ticks.map((tick) => {
          const y = yAt(tick, yMin, yMax, lineTop, lineBottom)
          return (
            <g key={tick}>
              <line
                x1={PLOT.left}
                x2={PLOT.w - PLOT.right}
                y1={y}
                y2={y}
                stroke="#e4dfd4"
                strokeWidth="1"
              />
              <text x="0" y={y + 4} fill="#8b93a3" fontSize="12">
                {formatCompact(tick)}
              </text>
            </g>
          )
        })}
        <path
          d={linePath(dismissalCoords)}
          fill="none"
          stroke="#9a7b12"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={linePath(admissionCoords)}
          fill="none"
          stroke="#1a2130"
          strokeWidth="3.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {series.map((point, index) => {
          const active = point.ano === activeAno && point.mes === activeMes
          const admission = admissionCoords[index]
          const dismissal = dismissalCoords[index]
          const x = xAt(index, series.length, PLOT.left, PLOT.w - PLOT.right)
          return (
            <g key={`${point.ano}-${point.mes}`}>
              {active ? (
                <line
                  x1={x}
                  x2={x}
                  y1={lineTop}
                  y2={lineBottom}
                  stroke="#ebc617"
                  strokeWidth="2"
                />
              ) : null}
              {dismissal ? (
                <circle cx={dismissal.x} cy={dismissal.y} r={active ? 4.5 : 3} fill="#9a7b12" />
              ) : null}
              {admission ? (
                <circle cx={admission.x} cy={admission.y} r={active ? 4.5 : 3} fill="#1a2130" />
              ) : null}
              <text
                x={x}
                y={LINE_VIEW.h - 8}
                textAnchor="middle"
                fill={active ? '#1a2130' : '#8b93a3'}
                fontSize="13"
                fontWeight={active ? 600 : 500}
              >
                {shortCompetenciaLabel(point.mes, point.ano)}
              </text>
            </g>
          )
        })}
      </svg>
      ) : null}
      {hasFlow ? (
        <p className="mt-1 text-xs text-[#8b93a3]">Escala ampliada, sem partir de zero.</p>
      ) : null}

      <svg
        viewBox={`0 0 ${PLOT.w} ${BAR_VIEW.h}`}
        className="mt-6 h-auto w-full"
        role="img"
        aria-label="Saldo nas competências publicadas"
      >
        <line
          x1={PLOT.left}
          x2={PLOT.w - PLOT.right}
          y1={baseline}
          y2={baseline}
          stroke="#d9d3c7"
          strokeWidth="1"
        />
        {series.map((point, index) => {
          if (!finite(point.saldo)) return null
          const active = point.ano === activeAno && point.mes === activeMes
          const x = xAt(index, series.length, PLOT.left, PLOT.w - PLOT.right) - barWidth / 2
          const y = yAt(point.saldo, saldoMin, saldoMax, barTop, barBottom)
          const height = Math.max(Math.abs(y - baseline), 1)
          const top = Math.min(y, baseline)
          return (
            <rect
              key={`${point.ano}-${point.mes}`}
              x={x}
              y={top}
              width={barWidth}
              height={height}
              fill={point.saldo < 0 ? '#9a7b12' : '#1a2130'}
              opacity={point.saldo < 0 || active ? 1 : 0.38}
            />
          )
        })}
      </svg>

      <table className="sr-only">
        <caption>Admissões, desligamentos e saldo por competência</caption>
        <thead>
          <tr>
            <th>Competência</th>
            <th>Admissões</th>
            <th>Desligamentos</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={`${point.ano}-${point.mes}`}>
              <td>{point.label}</td>
              <td>{formatInt(point.admissoes)}</td>
              <td>{formatInt(point.desligamentos)}</td>
              <td>{formatInt(point.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
