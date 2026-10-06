import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { fetchOverview, fetchTable } from '../api/gold'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { GOLD_TABLES } from '../api/goldTables'
import type { OverviewResponse, TableResponse } from '../api/types'
import { TerritorialDetailMap } from '../components/territorial/TerritorialDetailMap'
import { TerritorialDetailPanel } from '../components/territorial/TerritorialDetailPanel'
import { useMonth } from '../context/MonthContext'
import { useScope } from '../context/ScopeContext'
import { fetchCompleteTable } from '../lib/completeTable'
import { rankTerritorialUnits, TERRITORIAL_GEOGRAPHY } from '../lib/territorialDetail'
import { buildRequestContextKey, responseMatchesRequest } from '../lib/requestContext'
import { resolveTerritorialSlug } from '../lib/territorialRoute'
import { territoryOption } from '../lib/territorialSummary'

type DetailPayload = {
  key: string
  overview: OverviewResponse | null
  table: TableResponse | null
  overviewError: boolean
  tableError: boolean
}

export function TerritorialDetailPage() {
  const { territory: territorySlug } = useParams()
  const scope = resolveTerritorialSlug(territorySlug)
  const [searchParams] = useSearchParams()
  const { setScope } = useScope()
  const { ano, mes, label, competencia, competencias, setCompetencia } = useMonth()
  const [retryKey, setRetryKey] = useState(0)
  const requestKey = scope ? buildRequestContextKey(scope, ano, mes) : null
  const [loaded, setLoaded] = useState<DetailPayload | null>(null)

  useEffect(() => {
    if (!scope) return
    setScope(scope)
  }, [scope, setScope])

  useEffect(() => {
    if (!scope || !requestKey) return
    let cancelled = false
    const key = requestKey
    const tableName = scope === 'br' ? GOLD_TABLES.UF : GOLD_TABLES.MUNICIPIO

    Promise.allSettled([
      fetchOverview(scope, ano, mes),
      fetchCompleteTable((limit, offset) =>
        fetchTable(tableName, scope, ano, mes, {
          limit,
          offset,
          sort_by: GOLD_COLUMNS.SALDO,
          sort_dir: 'desc',
        }),
      ),
    ]).then(([overviewResult, tableResult]) => {
      if (cancelled) return
      const overview =
        overviewResult.status === 'fulfilled' && responseMatchesRequest(overviewResult.value, key)
          ? overviewResult.value
          : null
      const table =
        tableResult.status === 'fulfilled' && responseMatchesRequest(tableResult.value, key)
          ? tableResult.value
          : null
      setLoaded({
        key,
        overview,
        table,
        overviewError: overviewResult.status === 'rejected' || overview === null,
        tableError: tableResult.status === 'rejected' || table === null,
      })
    })

    return () => {
      cancelled = true
    }
  }, [scope, ano, mes, requestKey, retryKey])

  if (!scope || !requestKey) {
    return (
      <Navigate
        to={{ pathname: '/territorial', search: searchParams.toString() }}
        replace
      />
    )
  }

  const ready = loaded?.key === requestKey
  const overview = ready ? loaded.overview : null
  const table = ready ? loaded.table : null
  const overviewError = ready ? loaded.overviewError : false
  const tableError = ready ? loaded.tableError : false
  const geography = TERRITORIAL_GEOGRAPHY[scope]
  const territory = territoryOption(scope)
  const ranking = table ? rankTerritorialUnits(table.rows, scope) : []

  return (
    <div className="flex min-h-dvh flex-col bg-[#f7f5f0] text-[#1a2130] lg:h-dvh lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#e4dfd4] px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/estudio_logo.png" alt="" className="h-8 w-8 rounded-lg" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#727d91]">
              CAGED
            </p>
            <p className="truncate text-sm font-semibold leading-4">Plataforma analítica</p>
          </div>
        </div>

        <p className="text-sm font-semibold tracking-tight text-[#1a2130]">{territory.name}</p>

        <div className="flex items-center justify-end gap-4 sm:gap-5">
          <Link
            to={{ pathname: '/territorial', search: searchParams.toString() }}
            aria-label="Voltar à entrada territorial"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5d6678] underline-offset-4 hover:text-[#1a2130] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Voltar
          </Link>
          <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#727d91]">
            Competência
            <select
              value={competencia}
              onChange={(event) => setCompetencia(event.target.value)}
              className="mt-0.5 block w-[11.5rem] border-0 border-b border-[#1a2130] bg-transparent pb-0.5 text-sm font-semibold normal-case tracking-normal text-[#1a2130] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617] sm:w-52"
            >
              {competencias.map((item) => (
                <option key={item.competencia} value={item.competencia}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(17.5rem,25%)_minmax(0,1fr)]">
        <aside className="territorial-detail-sidebar min-w-0 px-5 py-4 lg:overflow-y-auto lg:border-r lg:border-[#e4dfd4] xl:px-6">
          <TerritorialDetailPanel
            scope={scope}
            competenceLabel={label}
            overview={overview}
            loading={!ready}
            error={overviewError}
            onRetry={() => setRetryKey((current) => current + 1)}
            rankTitle={geography.rankTitle}
            ranking={ranking}
            rankingLoading={!ready || (!table && !tableError)}
            rankingError={tableError}
          />
        </aside>
        <section
          className="h-[70vh] min-h-[28rem] min-w-0 lg:h-full lg:min-h-0"
          aria-label={`Mapa de ${territory.name} por saldo`}
        >
          <TerritorialDetailMap
            key={`${scope}-${retryKey}`}
            scope={scope}
            rows={table?.rows ?? []}
            loading={!ready || (!table && !tableError)}
            error={tableError}
            onRetry={() => setRetryKey((current) => current + 1)}
            dataKey={requestKey}
          />
        </section>
      </div>
    </div>
  )
}
