import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref, type TransitionEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { fetchOverview, fetchTable } from '../api/gold'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { GOLD_TABLES } from '../api/goldTables'
import type { GoldRow, OverviewResponse, Scope, TableResponse } from '../api/types'
import type { FeatureFocusPayload } from '../api/featureFocus'
import type { TerritorialMapModel } from '../components/territorial/TerritorialMapStage'
import { TerritorialDetailPanel } from '../components/territorial/TerritorialDetailPanel'
import { TerritorialFeaturePanel } from '../components/territorial/TerritorialFeaturePanel'
import { useMonth } from '../context/MonthContext'
import { useScope } from '../context/ScopeContext'
import { fetchCompleteTable } from '../lib/completeTable'
import { rankTerritorialUnits, TERRITORIAL_GEOGRAPHY } from '../lib/territorialDetail'
import type { DetailFirstPaint, FeatureFirstPaint } from '../components/territorial/territorialFirstPaint'
import { buildRequestContextKey, responseMatchesRequest } from '../lib/requestContext'
import {
  retreatTerritorialHistory,
  territorialDetailLocation,
  territorialLandingLocation,
} from '../lib/territorialPose'
import { territoryOption } from '../lib/territorialSummary'

const EMPTY_ROWS: GoldRow[] = []

export type TerritorialFeatureChrome = {
  id: string
  revealed: boolean
  leaving: boolean
  instant: boolean
  seed: FeatureFocusPayload | null
  seedError: boolean
}

type DetailPayload = {
  key: string
  overview: OverviewResponse | null
  table: TableResponse | null
  overviewError: boolean
  tableError: boolean
}

export function TerritorialDetailPage({
  scope,
  active,
  mapSlotRef,
  onMapModel,
  initialPaint = null,
  onBindRetry,
  feature = null,
  onFeaturePanelExited,
}: {
  scope: Scope
  active: boolean
  mapSlotRef: Ref<HTMLDivElement>
  onMapModel: (model: TerritorialMapModel) => void
  initialPaint?: DetailFirstPaint | FeatureFirstPaint | null
  onBindRetry?: (retry: () => void) => void
  feature?: TerritorialFeatureChrome | null
  onFeaturePanelExited?: () => void
}) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setScope } = useScope()
  const { ano, mes, label, competencia, competencias, setCompetencia } = useMonth()
  const [retryKey, setRetryKey] = useState(0)
  const requestKey = buildRequestContextKey(scope, ano, mes)
  const [loaded, setLoaded] = useState<DetailPayload | null>(() =>
    initialPaint && initialPaint.key === requestKey
      ? {
          key: initialPaint.key,
          overview: initialPaint.overview,
          table: initialPaint.table,
          overviewError: initialPaint.overviewError,
          tableError: initialPaint.tableError,
        }
      : null,
  )
  const skipReadyFetch = useRef(loaded?.key === requestKey)
  const retry = useCallback(() => setRetryKey((current) => current + 1), [])

  useEffect(() => {
    onBindRetry?.(retry)
  }, [onBindRetry, retry])

  useEffect(() => {
    if (!active) return
    setScope(scope)
  }, [active, scope, setScope])

  useEffect(() => {
    if (skipReadyFetch.current) {
      skipReadyFetch.current = false
      return
    }
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

  const ready = loaded?.key === requestKey
  const overview = ready ? loaded.overview : null
  const table = ready ? loaded.table : null
  const overviewError = ready ? loaded.overviewError : false
  const tableError = ready ? loaded.tableError : false
  const geography = TERRITORIAL_GEOGRAPHY[scope]
  const territory = territoryOption(scope)
  const ranking = table ? rankTerritorialUnits(table.rows, scope) : []
  const mapLoading = !ready || (!table && !tableError)
  const mapRows = table?.rows ?? EMPTY_ROWS

  useEffect(() => {
    onMapModel({
      scope,
      rows: mapRows,
      loading: mapLoading,
      error: tableError,
      dataKey: `${requestKey}:${retryKey}`,
      onRetry: retry,
    })
  }, [onMapModel, scope, mapRows, mapLoading, tableError, requestKey, retryKey, retry])

  return (
    <div className="territorial-detail-screen flex min-h-dvh flex-col bg-[#f7f5f0] text-[#1a2130] lg:h-dvh lg:overflow-hidden">
      <header className="territorial-detail-header flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#e4dfd4] px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/estudio_logo.png" alt="" className="h-8 w-8 shrink-0 rounded-lg" aria-hidden />
          <div className="flex min-w-0 items-center gap-x-2.5">
            <p className="text-sm font-semibold leading-[1.15] tracking-[-0.02em] text-[#1a2130]">
              Plataforma
              <br />
              Becker
            </p>
            <p className="whitespace-nowrap text-[13px] font-medium leading-none text-[#5d6678]">
              powered by vonturing.tech
            </p>
          </div>
        </div>

        <p className="text-sm font-semibold tracking-tight text-[#1a2130]">{territory.name}</p>

        <div className="flex items-center justify-end gap-4 sm:gap-5">
          {feature ? (
            <button
              type="button"
              onClick={() => {
                if (feature.leaving) return
                retreatTerritorialHistory(
                  navigate,
                  territorialDetailLocation(scope, searchParams.toString()),
                )
              }}
              aria-label="Voltar ao mapa do território"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5d6678] underline-offset-4 hover:text-[#1a2130] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Voltar
            </button>
          ) : (
            <Link
              to={territorialLandingLocation(searchParams.toString())}
              aria-label="Voltar à entrada territorial"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5d6678] underline-offset-4 hover:text-[#1a2130] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Voltar
            </Link>
          )}
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

      <div className="territorial-detail-grid grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(17.5rem,25%)_minmax(0,1fr)]">
        <aside className="territorial-detail-sidebar relative min-w-0 lg:h-full lg:min-h-0 lg:overflow-hidden lg:border-r lg:border-[#e4dfd4]">
          <div className="territorial-detail-scroll h-full overflow-y-auto px-5 py-4 xl:px-6">
            <div aria-hidden={feature != null}>
              <TerritorialDetailPanel
                scope={scope}
                competenceLabel={label}
                overview={overview}
                loading={!ready}
                error={overviewError}
                onRetry={retry}
                rankTitle={geography.rankTitle}
                ranking={ranking}
                rankingLoading={!ready || (!table && !tableError)}
                rankingError={tableError}
              />
            </div>
          </div>
          {feature ? (
            <FeatureReveal
              revealed={feature.revealed}
              leaving={feature.leaving}
              instant={feature.instant}
              onExited={onFeaturePanelExited}
            >
              <TerritorialFeaturePanel
                scope={scope}
                featureId={feature.id}
                ano={ano}
                mes={mes}
                competenceLabel={label}
                seed={feature.seed}
                seedError={feature.seedError}
              />
            </FeatureReveal>
          ) : null}
        </aside>
        <section className="territorial-map-slot h-[70vh] min-h-[28rem] min-w-0 lg:h-full lg:min-h-0">
          <div ref={mapSlotRef} className="h-full min-h-0 w-full" />
        </section>
      </div>
    </div>
  )
}

function FeatureReveal({
  revealed,
  leaving,
  instant,
  onExited,
  children,
}: {
  revealed: boolean
  leaving: boolean
  instant: boolean
  onExited?: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(instant && revealed)
  const [animate, setAnimate] = useState(!(instant && revealed))
  const rootRef = useRef<HTMLDivElement>(null)
  const exited = useRef(false)

  useEffect(() => {
    if (leaving || !revealed) setOpen(false)
    else setOpen(true)
  }, [leaving, revealed])

  useEffect(() => {
    setAnimate(true)
  }, [])

  useEffect(() => {
    if (!leaving || open) return
    const node = rootRef.current
    if (!node) return
    const duration = Number.parseFloat(window.getComputedStyle(node).transitionDuration)
    if (!Number.isFinite(duration) || duration === 0) onExited?.()
  }, [leaving, open, onExited])

  function onTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return
    if (!open && leaving && !exited.current) {
      exited.current = true
      onExited?.()
    }
  }

  return (
    <div
      ref={rootRef}
      className="territorial-feature-reveal absolute inset-0 overflow-y-auto bg-[#f7f5f0] px-5 py-4 xl:px-6"
      data-state={open ? 'open' : 'closed'}
      style={animate ? undefined : { transition: 'none' }}
      onTransitionEnd={onTransitionEnd}
    >
      {children}
    </div>
  )
}
