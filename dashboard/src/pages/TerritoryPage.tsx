import { useEffect, useState } from 'react'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { GOLD_TABLES } from '../api/goldTables'
import { fetchTable } from '../api/gold'
import type { GoldRow, TableResponse } from '../api/types'
import { BarRank } from '../components/charts/BarRank'
import { MovementSplit } from '../components/charts/MovementSplit'
import { TerritoryMap } from '../components/map/TerritoryMap'
import { useTerritoryGeoJson } from '../components/map/useTerritoryGeoJson'
import { DataGrid } from '../components/table/DataGrid'
import { ChartCard } from '../components/ui/ChartCard'
import { ChartTablePanel, TableToggleButton } from '../components/ui/ChartTableToggle'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { useScope } from '../context/ScopeContext'
import { useMonth } from '../context/MonthContext'
import { chartTheme } from '../lib/chartTheme'
import { TERRITORY_TABLE_LIMIT } from '../lib/apiLimits'
import { formatInt, labelScope } from '../lib/format'
import { useScopeStableLoading } from '../lib/useScopeStableLoading'

const palette = chartTheme.palette
const TERRITORY_SORT_BY = GOLD_COLUMNS.SALDO
const TERRITORY_SORT_DIR = 'desc' as const

export function TerritoryPage() {
  const { scope } = useScope()
  const { ano, mes, label } = useMonth()
  const [tbl, setTbl] = useState<TableResponse | null>(null)
  const [ufRows, setUfRows] = useState<GoldRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [tableOpen, setTableOpen] = useState(false)
  const { beginFetch, endFetch, showInitialLoader } = useScopeStableLoading(tbl)
  const { geoJson, geoLoading, geoError } = useTerritoryGeoJson(scope)

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    beginFetch(isCancelled, () => {
      setErr(null)
    })
    fetchTable(GOLD_TABLES.MUNICIPIO, scope, ano, mes, {
      limit: TERRITORY_TABLE_LIMIT,
      sort_by: TERRITORY_SORT_BY,
      sort_dir: TERRITORY_SORT_DIR,
    })
      .then((d) => {
        if (!cancelled) setTbl(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Erro')
      })
      .finally(() => {
        if (!cancelled) endFetch()
      })
    return () => {
      cancelled = true
    }
  }, [scope, ano, mes, retryKey, beginFetch, endFetch])

  useEffect(() => {
    if (scope !== 'br') return

    let cancelled = false
    fetchTable(GOLD_TABLES.UF, 'br', ano, mes, { limit: 50 })
      .then((d) => {
        if (!cancelled) setUfRows(d.rows)
      })
      .catch(() => {
        if (!cancelled) setUfRows([])
      })
    return () => {
      cancelled = true
    }
  }, [scope, ano, mes, retryKey])

  if (err) {
    return <ErrorState message={err} onRetry={() => setRetryKey((k) => k + 1)} />
  }

  if (showInitialLoader || !tbl) {
    return <LoadingState label="Carregando dados territoriais..." />
  }

  const top = tbl.rows.slice(0, 14)
  const displayedUntil = tbl.offset + tbl.count
  const isPartial = displayedUntil < tbl.total
  const chartMountKey = `${scope}-${ano}-${mes}`

  return (
    <div className="space-y-8">
      <div className="min-h-[8rem]">
        <PageHeader
          eyebrow="Território"
          title={`Municípios · ${labelScope(scope)}`}
          subtitle={`${tbl.count.toLocaleString('pt-BR')} registros exibidos · ${tbl.total.toLocaleString('pt-BR')} no recorte · competência ${label} · ordenação por ${TERRITORY_SORT_BY} (${TERRITORY_SORT_DIR}).`}
        />
      </div>

      <TerritoryMap
        scope={scope}
        municipalityRows={tbl.rows}
        ufRows={scope === 'br' ? ufRows : null}
        competenciaLabel={label}
        geoJson={geoJson}
        geoLoading={geoLoading}
        geoError={geoError}
      />

      <div className="min-h-[5.75rem]">
        {isPartial ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-400">
            Exibindo os{' '}
            <span className="font-medium text-slate-300">{formatInt(tbl.count)}</span> municípios com
            maior saldo em <span className="font-medium text-slate-300">{labelScope(scope)}</span> na
            competência <span className="font-medium text-slate-300">{label}</span>. O recorte possui{' '}
            <span className="font-medium text-slate-300">{formatInt(tbl.total)}</span> municípios no
            total — a API retorna até{' '}
            <span className="font-medium text-slate-300">{formatInt(TERRITORY_TABLE_LIMIT)}</span>{' '}
            registros por consulta. A paginação completa da base territorial será disponibilizada em
            etapa futura.
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Principais municípios por saldo"
          subtitle={`Top ${top.length} entre os registros carregados (ordenados por saldo).`}
          action={
            <TableToggleButton open={tableOpen} onToggle={() => setTableOpen((v) => !v)} />
          }
        >
          <div key={`rank-${chartMountKey}`} className="min-h-[280px] w-full">
            <BarRank
              rows={top}
              labelKey={GOLD_COLUMNS.MUNICIPIO}
              valueKey={GOLD_COLUMNS.SALDO}
              color={palette.territory.primary}
              yAxisInterval={0}
              highlightTop1
            />
          </div>
          <ChartTablePanel open={tableOpen}>
            <DataGrid columns={tbl.columns} rows={tbl.rows} />
          </ChartTablePanel>
        </ChartCard>
        <ChartCard
          title="Movimentação (top 10)"
          subtitle="Comparação entre admissões e desligamentos dos 10 municípios líderes em saldo."
        >
          <div key={`movement-${chartMountKey}`} className="min-h-[320px] w-full">
            <MovementSplit rows={top.slice(0, 10)} labelKey={GOLD_COLUMNS.MUNICIPIO} />
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
