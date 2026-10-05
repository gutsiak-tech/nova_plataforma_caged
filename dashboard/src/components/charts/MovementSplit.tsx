import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { GoldRow } from '../../api/types'
import { GOLD_COLUMNS } from '../../api/goldColumns'
import { formatInt } from '../../lib/format'
import { chartTheme } from '../../lib/chartTheme'
import { EmptyState } from '../ui/EmptyState'
import { truncateVerticalXLabel, verticalBarXAxisProps } from './horizontalBarChartUtils'

type Props = {
  rows: GoldRow[]
  labelKey: string
}

export function MovementSplit({ rows, labelKey }: Props) {
  const data = rows.map((r) => {
    const full = String(r[labelKey] ?? '—')
    return {
      label: truncateVerticalXLabel(full),
      full,
      [GOLD_COLUMNS.ADMISSOES]: Number(r[GOLD_COLUMNS.ADMISSOES] ?? 0),
      [GOLD_COLUMNS.DESLIGAMENTOS]: Number(r[GOLD_COLUMNS.DESLIGAMENTOS] ?? 0),
    }
  })

  if (!data.length) {
    return (
      <EmptyState description="Não há dados disponíveis para este recorte na competência selecionada." />
    )
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 12, bottom: 4 }}>
          <CartesianGrid strokeDasharray={chartTheme.grid.strokeDasharray} stroke={chartTheme.grid.stroke} />
          <XAxis dataKey="label" {...verticalBarXAxisProps} />
          <YAxis
            tick={chartTheme.axis.tick}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
          />
          <Tooltip
            contentStyle={chartTheme.tooltip.contentStyle}
            formatter={(v, name) => [formatInt(v as number), String(name)]}
            labelFormatter={(_, p) => {
              const pl = (p as { payload?: { full?: string } })?.payload
              return pl?.full ?? ''
            }}
          />
          <Legend align="center" verticalAlign="bottom" wrapperStyle={{ paddingTop: 8 }} />
          <Bar
            dataKey={GOLD_COLUMNS.ADMISSOES}
            name="Admissões"
            stackId="a"
            fill={chartTheme.palette.movement.admissoes}
            radius={[0, 0, 0, 0]}
            className="transition-[filter,opacity] duration-200 hover:brightness-110"
          >
            {data.map((_, i) => (
              <Cell key={`adm-${i}`} fill={chartTheme.palette.movement.admissoes} fillOpacity={i === 0 ? 1 : 0.75} />
            ))}
          </Bar>
          <Bar
            dataKey={GOLD_COLUMNS.DESLIGAMENTOS}
            name="Desligamentos"
            stackId="a"
            fill={chartTheme.palette.movement.desligamentos}
            radius={[6, 6, 0, 0]}
            className="transition-[filter,opacity] duration-200 hover:brightness-110"
          >
            {data.map((_, i) => (
              <Cell key={`des-${i}`} fill={chartTheme.palette.movement.desligamentos} fillOpacity={i === 0 ? 1 : 0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
