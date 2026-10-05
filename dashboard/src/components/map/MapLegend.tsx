import { MAP_CHOROPLETH } from './mapChoropleth'

const LEGEND_ITEMS = [
  { label: 'Saldo positivo', color: MAP_CHOROPLETH.positiveMid },
  { label: 'Saldo neutro', color: MAP_CHOROPLETH.neutral },
  { label: 'Saldo negativo', color: MAP_CHOROPLETH.negativeMid },
  { label: 'Sem métrica', color: MAP_CHOROPLETH.noData },
] as const

export function MapLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
      role="list"
      aria-label="Legenda do mapa por saldo"
    >
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5" role="listitem">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/10"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="text-[11px] text-slate-400">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
