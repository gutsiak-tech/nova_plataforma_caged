import { useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import type { GoldRow, Scope } from '../../api/types'
import { describeTerritoryTooltip } from '../map/mapTooltip'
import { MapLegend } from '../map/MapLegend'
import { saldoFillColor } from '../map/mapChoropleth'
import { useTerritoryGeoJson } from '../map/useTerritoryGeoJson'
import {
  buildMetricIndex,
  joinGeoJsonWithMetrics,
  type TerritoryMetricRow,
} from '../../lib/geoJoin'
import { TERRITORIAL_MOVE_MS } from '../../lib/territorialPose'
import { CANONICAL_VIEW_BOX, canonicalTerritoryPaths } from '../../lib/territorialGeometry'
import { TERRITORIAL_GEOGRAPHY } from '../../lib/territorialDetail'
import { territoryOption } from '../../lib/territorialSummary'

export type TerritorialMapModel = {
  scope: Scope
  rows: GoldRow[]
  loading: boolean
  error: boolean
  dataKey: string
  onRetry: () => void
}

export type TerritorialStageBox = {
  left: number
  top: number
  width: number
  height: number
}

const LANDING_STROKE: Record<Scope, number> = {
  br: 1.6,
  pr: 1.15,
  rmc: 1.25,
}

const DETAIL_STROKE: Record<Scope, number> = {
  br: 1.05,
  pr: 0.8,
  rmc: 1.15,
}

const MOVE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function paintTransition(reducedMotion: boolean, hovered: boolean): string {
  if (reducedMotion || hovered) return 'none'
  const ms = `${TERRITORIAL_MOVE_MS}ms ${MOVE_EASE}`
  return `fill ${ms}, fill-opacity ${ms}, stroke-opacity ${ms}, stroke-width ${ms}`
}

export function TerritorialMapStage({
  scope,
  pose,
  box,
  duration,
  reducedMotion,
  model,
  onMoveComplete,
}: {
  scope: Scope
  pose: 'landing' | 'detail'
  box: TerritorialStageBox
  duration: number
  reducedMotion: boolean
  model: TerritorialMapModel | null
  onMoveComplete: () => void
}) {
  const territory = territoryOption(scope)
  const { geoJson, geoLoading, geoError } = useTerritoryGeoJson(scope)
  const [hover, setHover] = useState<{
    index: number
    x: number
    y: number
    key: string
  } | null>(null)
  const geography = TERRITORIAL_GEOGRAPHY[scope]
  const metricsReady = model != null && model.scope === scope && !model.loading && !model.error
  const showMetrics = pose === 'detail' && metricsReady
  const hoverKey = `${scope}:${pose}:${model?.dataKey ?? ''}`
  const activeHover = hover?.key === hoverKey ? hover : null

  const paths = useMemo(
    () => (geoJson ? canonicalTerritoryPaths(geoJson, scope) : []),
    [geoJson, scope],
  )
  const join = useMemo(() => {
    if (!geoJson || !showMetrics || !model) return null
    return joinGeoJsonWithMetrics(geoJson, {
      joinProperty: geography.joinProperty,
      metricIndex: buildMetricIndex(model.rows, geography.labelKey),
    })
  }, [geoJson, geography.joinProperty, geography.labelKey, model, showMetrics])

  const interactive = pose === 'detail' && paths.length > 0
  const hoveredPath = activeHover != null ? paths[activeHover.index] : undefined
  const hoveredMetric = hoveredPath && join ? join.lookup(hoveredPath.properties) : undefined
  const tooltip = hoveredPath
    ? describeTerritoryTooltip(hoveredPath.properties, scope, hoveredMetric)
    : null

  return (
    <motion.div
      className="territorial-map-stage territorial-detail-map"
      initial={false}
      animate={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        backgroundColor: pose === 'detail' ? '#f3efe6' : 'rgba(243, 239, 230, 0)',
      }}
      transition={
        duration === 0
          ? { duration: 0 }
          : { duration: duration / 1000, ease: [0.22, 1, 0.36, 1] }
      }
      onAnimationComplete={onMoveComplete}
      style={{ position: 'absolute', zIndex: 3, overflow: 'visible', pointerEvents: interactive ? 'auto' : 'none' }}
    >
      <motion.div
        key={scope}
        className="h-full w-full"
        initial={pose === 'landing' && !reducedMotion ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: pose === 'landing' && !reducedMotion ? 0.28 : 0, ease: 'easeOut' }}
      >
        {paths.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center">
            {geoError && !geoLoading ? (
              <p className="max-w-sm text-sm text-[#727d91]">
                {pose === 'detail' ? 'Camada cartográfica indisponível.' : 'Mapa indisponível'}
              </p>
            ) : (
              <p
                role="status"
                className={
                  pose === 'detail'
                    ? 'text-sm text-[#727d91]'
                    : 'text-xs uppercase tracking-[0.14em] text-[#727d91]'
                }
              >
                {pose === 'detail' ? 'Carregando mapa territorial' : 'Carregando mapa'}
              </p>
            )}
          </div>
        ) : (
          <svg
            viewBox={CANONICAL_VIEW_BOX}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            role="img"
            aria-label={
              pose === 'detail'
                ? `Mapa de ${territory.name} por saldo`
                : `Mapa de ${territory.name}`
            }
          >
            {paths.map((path, index) => {
              const metric = join?.lookup(path.properties)
              const hovered = activeHover?.index === index
              return (
                <path
                  key={`${path.territoryKey}-${path.featureIndex}-${index}`}
                  d={path.d}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  style={pathPaint(scope, pose, showMetrics, Boolean(metric), hovered, metric, join?.maxAbsSaldo ?? 0, reducedMotion)}
                  onMouseEnter={
                    interactive
                      ? (event) => {
                          const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                          if (!bounds) return
                          setHover({
                            index,
                            x: event.clientX - bounds.left,
                            y: event.clientY - bounds.top,
                            key: hoverKey,
                          })
                        }
                      : undefined
                  }
                  onMouseMove={
                    interactive
                      ? (event) => {
                          const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                          if (!bounds) return
                          setHover({
                            index,
                            x: event.clientX - bounds.left,
                            y: event.clientY - bounds.top,
                            key: hoverKey,
                          })
                        }
                      : undefined
                  }
                  onMouseLeave={interactive ? () => setHover(null) : undefined}
                />
              )
            })}
          </svg>
        )}
      </motion.div>

      {pose === 'detail' && model?.scope === scope && model.error ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
          <div className="pointer-events-auto max-w-sm rounded-md border border-[#ebe4d6] bg-[#fffdfb]/95 px-4 py-3 text-center shadow-[0_8px_24px_rgba(26,33,48,0.05)]">
            <p className="text-sm text-[#5d6678]">Não foi possível carregar as métricas do mapa.</p>
            <button
              type="button"
              onClick={model.onRetry}
              className="mt-2 text-sm font-semibold text-[#1a2130] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      <div
        aria-hidden={pose !== 'detail'}
        className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[calc(100%-1.5rem)]"
        style={{
          opacity: pose === 'detail' ? 1 : 0,
          transition: reducedMotion ? 'none' : `opacity ${TERRITORIAL_MOVE_MS}ms ${MOVE_EASE}`,
        }}
      >
        <div className="rounded-md border border-[#ebe4d6] bg-[#fffdfb]/90 px-3 py-2 shadow-[0_8px_24px_rgba(26,33,48,0.05)]">
          <MapLegend />
        </div>
      </div>

      {tooltip && activeHover ? (
        <div
          className="territory-map-tooltip pointer-events-none absolute z-20"
          style={{ left: activeHover.x, top: activeHover.y, transform: 'translate(-50%, calc(-100% - 12px))' }}
        >
          <div className="territory-map-tooltip__body">
            <div className="territory-map-tooltip__title">{tooltip.primary}</div>
            {tooltip.secondary ? (
              <div className="territory-map-tooltip__meta">{tooltip.secondary}</div>
            ) : null}
            {tooltip.admissions == null ? (
              <div className="territory-map-tooltip__empty">
                Sem métrica associada para o recorte selecionado.
              </div>
            ) : (
              <>
                <div className="territory-map-tooltip__row">
                  <span>Admissões</span>
                  <strong>{tooltip.admissions}</strong>
                </div>
                <div className="territory-map-tooltip__row">
                  <span>Desligamentos</span>
                  <strong>{tooltip.dismissals}</strong>
                </div>
                <div className="territory-map-tooltip__row territory-map-tooltip__saldo">
                  <span>Saldo</span>
                  <strong style={{ color: tooltip.saldoColor }}>{tooltip.saldoText}</strong>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {pose === 'detail' ? (
        <span className="sr-only">
          Mapa por saldo. A legenda distingue saldo positivo, neutro, negativo e sem métrica.
        </span>
      ) : null}
    </motion.div>
  )
}

function pathPaint(
  scope: Scope,
  pose: 'landing' | 'detail',
  showMetrics: boolean,
  hasMetric: boolean,
  hovered: boolean,
  metric: TerritoryMetricRow | undefined,
  maxAbsSaldo: number,
  reducedMotion: boolean,
): CSSProperties {
  const detail = pose === 'detail'
  return {
    fill: showMetrics ? saldoFillColor(metric?.saldo, maxAbsSaldo) : '#d3c9b6',
    fillOpacity: showMetrics ? (hovered ? (hasMetric ? 0.96 : 0.58) : hasMetric ? 0.84 : 0.42) : 1,
    stroke: '#1a2130',
    strokeOpacity: hovered ? 1 : detail ? 0.38 : 1,
    strokeWidth: hovered
      ? DETAIL_STROKE[scope] + 1.15
      : detail
        ? DETAIL_STROKE[scope]
        : LANDING_STROKE[scope],
    cursor: detail ? 'default' : 'auto',
    transition: paintTransition(reducedMotion, hovered),
  }
}
