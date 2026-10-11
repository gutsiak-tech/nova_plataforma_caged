import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type TransitionEvent } from 'react'
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
import {
  peekDetailCompetence,
  rememberDetailCompetence,
} from '../lib/territorialCompetence'
import { buildRequestContextKey, responseMatchesRequest } from '../lib/requestContext'

const EMPTY_ROWS: GoldRow[] = []

export type TerritorialFeatureChrome = {
  id: string
  revealed: boolean
  leaving: boolean
  instant: boolean
  seed: FeatureFocusPayload | null
  seedError: boolean
  pending: boolean
  crossfade: boolean
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
  competenceHold = false,
  onCompetenceSettled,
}: {
  scope: Scope
  active: boolean
  mapSlotRef: Ref<HTMLDivElement>
  onMapModel: (model: TerritorialMapModel) => void
  initialPaint?: DetailFirstPaint | FeatureFirstPaint | null
  onBindRetry?: (retry: () => void) => void
  feature?: TerritorialFeatureChrome | null
  onFeaturePanelExited?: () => void
  competenceHold?: boolean
  onCompetenceSettled?: (monthKey: string) => void
}) {
  const { setScope } = useScope()
  const { ano, mes, label } = useMonth()
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
  const skipReadyFetch = useRef<string | null>(loaded?.key === requestKey ? requestKey : null)
  const featureReadyRef = useRef(feature == null)
  const [featureEpoch, setFeatureEpoch] = useState(0)
  const retry = useCallback(() => setRetryKey((current) => current + 1), [])
  const onFeatureCompetence = useCallback((ready: boolean) => {
    if (featureReadyRef.current === ready) return
    featureReadyRef.current = ready
    setFeatureEpoch((value) => value + 1)
  }, [])
  if (retryKey === 0) {
    const cached = peekDetailCompetence(scope, ano, mes)
    if (cached && loaded?.key !== requestKey) setLoaded(cached)
  }

  useEffect(() => {
    onBindRetry?.(retry)
  }, [onBindRetry, retry])

  useEffect(() => {
    if (!active) return
    setScope(scope)
  }, [active, scope, setScope])

  useEffect(() => {
    if (!active) return
    if (skipReadyFetch.current === requestKey) {
      skipReadyFetch.current = null
      return
    }
    skipReadyFetch.current = null
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
      const next = {
        key,
        overview,
        table,
        overviewError: overviewResult.status === 'rejected' || overview === null,
        tableError: tableResult.status === 'rejected' || table === null,
      }
      rememberDetailCompetence(next)
      setLoaded(next)
    })

    return () => {
      cancelled = true
    }
  }, [active, scope, ano, mes, requestKey, retryKey])

  const ready = loaded?.key === requestKey
  const held = competenceHold && !ready && loaded != null
  const visible = ready || held ? loaded : null
  const overview = visible?.overview ?? null
  const table = visible?.table ?? null
  const overviewError = visible?.overviewError ?? false
  const tableError = visible?.tableError ?? false
  const geography = TERRITORIAL_GEOGRAPHY[scope]
  const ranking = table ? rankTerritorialUnits(table.rows, scope) : []
  const mapLoading = held ? false : !ready || (!table && !tableError)
  const mapRows = table?.rows ?? EMPTY_ROWS

  useLayoutEffect(() => {
    if (!active || !ready) return
    if (feature && !featureReadyRef.current) return
    onCompetenceSettled?.(`${ano}-${mes}`)
  }, [active, ready, feature, ano, mes, featureEpoch, onCompetenceSettled])

  useLayoutEffect(() => {
    if (competenceHold && !ready) return
    onMapModel({
      scope,
      rows: mapRows,
      loading: mapLoading,
      error: tableError,
      dataKey: `${requestKey}:${retryKey}`,
      onRetry: retry,
    })
  }, [competenceHold, onMapModel, scope, mapRows, mapLoading, tableError, requestKey, retryKey, retry, ready])

  return (
    <div className="territorial-detail-screen flex min-h-dvh flex-col bg-[#f7f5f0] text-[#1a2130] lg:h-dvh lg:overflow-hidden">
      <div className="territorial-header-reserve" aria-hidden />

      <div className="territorial-detail-grid grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(17.5rem,25%)_minmax(0,1fr)]">
        <aside className="territorial-detail-sidebar relative min-w-0 lg:h-full lg:min-h-0 lg:overflow-hidden lg:border-r lg:border-[#e4dfd4]">
          <div className="territorial-detail-scroll h-full overflow-y-auto px-5 py-4 xl:px-6">
            <div aria-hidden={feature != null}>
              <TerritorialDetailPanel
                scope={scope}
                competenceLabel={label}
                overview={overview}
                loading={!ready && !held}
                error={overviewError}
                onRetry={retry}
                rankTitle={geography.rankTitle}
                ranking={ranking}
                rankingLoading={held ? false : !ready || (!table && !tableError)}
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
              <div key={feature.id} className={feature.crossfade ? 'territorial-feature-panel-swap' : undefined}>
                <TerritorialFeaturePanel
                  scope={scope}
                  featureId={feature.id}
                  ano={ano}
                  mes={mes}
                  competenceLabel={label}
                  seed={feature.seed}
                  seedError={feature.seedError}
                  onCompetenceReady={onFeatureCompetence}
                />
              </div>
              {feature.pending ? (
                <p className="territorial-feature-pending">Carregando</p>
              ) : null}
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
