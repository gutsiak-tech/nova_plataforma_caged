import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { animate, motion, useMotionValue } from 'framer-motion'
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
import { flightStableSize, flightTransform } from '../../lib/territorialFlight'
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
const MOVE_EASE_BEZIER = [0.22, 1, 0.36, 1] as const
const REVEAL_MS = 180

function paintTransition(reducedMotion: boolean, hovered: boolean, reveal: boolean): string {
  if (reducedMotion || hovered || !reveal) return 'none'
  const ms = `${REVEAL_MS}ms ease-out`
  return `fill ${ms}, fill-opacity ${ms}, stroke-opacity ${ms}, stroke-width ${ms}`
}

export function TerritorialMapStage({
  scope,
  pose,
  box,
  landingBox,
  detailBox,
  duration,
  reducedMotion,
  model,
  onMoveComplete,
}: {
  scope: Scope
  pose: 'landing' | 'detail'
  box: TerritorialStageBox
  landingBox: TerritorialStageBox
  detailBox: TerritorialStageBox
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
  const flying = duration > 0 && !reducedMotion
  const settledDetail = pose === 'detail' && !flying
  const metricsReady = model != null && model.scope === scope && !model.loading && !model.error
  const showMetrics = settledDetail && metricsReady
  const hoverKey = `${scope}:${pose}:${model?.dataKey ?? ''}`
  const activeHover = hover?.key === hoverKey ? hover : null
  const onMoveCompleteRef = useRef(onMoveComplete)
  useLayoutEffect(() => {
    onMoveCompleteRef.current = onMoveComplete
  }, [onMoveComplete])

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

  const interactive = settledDetail && paths.length > 0
  const hoveredPath = activeHover != null ? paths[activeHover.index] : undefined
  const hoveredMetric = hoveredPath && join ? join.lookup(hoveredPath.properties) : undefined
  const tooltip = hoveredPath
    ? describeTerritoryTooltip(hoveredPath.properties, scope, hoveredMetric)
    : null

  const sourceBox = pose === 'detail' ? landingBox : detailBox
  const targetBox = pose === 'detail' ? detailBox : landingBox
  const stable = flightStableSize(landingBox, detailBox)
  const sourceTf = flightTransform(sourceBox, stable)
  const targetTf = flightTransform(targetBox, stable)
  const restTf = flightTransform(box, stable)
  const paintScale = flying ? sourceTf.scale : restTf.scale
  const holder = { left: 0, top: 0, width: stable, height: stable }

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)

  useLayoutEffect(() => {
    if (flying) return
    x.set(restTf.x)
    y.set(restTf.y)
    scale.set(restTf.scale)
  }, [flying, restTf.x, restTf.y, restTf.scale, x, y, scale])

  useLayoutEffect(() => {
    if (!flying) return
    const unchanged =
      Math.abs(sourceTf.x - targetTf.x) < 0.5 &&
      Math.abs(sourceTf.y - targetTf.y) < 0.5 &&
      Math.abs(sourceTf.scale - targetTf.scale) < 0.001
    x.set(sourceTf.x)
    y.set(sourceTf.y)
    scale.set(sourceTf.scale)
    if (unchanged) {
      onMoveCompleteRef.current()
      return
    }
    const options = { duration: duration / 1000, ease: MOVE_EASE_BEZIER }
    let stopped = false
    const ax = animate(x, targetTf.x, options)
    const ay = animate(y, targetTf.y, options)
    const az = animate(scale, targetTf.scale, {
      ...options,
      onComplete: () => {
        if (!stopped) onMoveCompleteRef.current()
      },
    })
    return () => {
      stopped = true
      ax.stop()
      ay.stop()
      az.stop()
    }
  }, [
    flying,
    duration,
    sourceTf.x,
    sourceTf.y,
    sourceTf.scale,
    targetTf.x,
    targetTf.y,
    targetTf.scale,
    x,
    y,
    scale,
  ])

  return (
    <div
      className="territorial-map-stage territorial-detail-map"
      style={{ inset: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          backgroundColor: pose === 'detail' ? '#f3efe6' : 'rgba(243, 239, 230, 0)',
          transition: flying ? `background-color ${TERRITORIAL_MOVE_MS}ms ${MOVE_EASE}` : 'none',
          pointerEvents: 'none',
        }}
      />
      <div
        data-territorial-map=""
        style={{
          position: 'absolute',
          left: holder.left,
          top: holder.top,
          width: holder.width,
          height: holder.height,
          pointerEvents: 'none',
        }}
      >
        <motion.div
          className="h-full w-full"
          style={{
            x,
            y,
            scale,
            originX: 0,
            originY: 0,
            willChange: 'transform',
            pointerEvents: interactive ? 'auto' : 'none',
          }}
          onAnimationComplete={onMoveComplete}
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
                  settledDetail
                    ? `Mapa de ${territory.name} por saldo`
                    : `Mapa de ${territory.name}`
                }
              >
                <TerritoryShapes
                  paths={paths}
                  scope={scope}
                  settledDetail={settledDetail}
                  showMetrics={showMetrics}
                  join={join}
                  hoverIndex={activeHover?.index ?? null}
                  reducedMotion={reducedMotion}
                  interactive={interactive}
                  paintScale={paintScale}
                  hoverKey={hoverKey}
                  setHover={setHover}
                />
              </svg>
            )}
          </motion.div>
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
        </motion.div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          pointerEvents: 'none',
        }}
      >
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
          aria-hidden={!settledDetail}
          className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[calc(100%-1.5rem)]"
          style={{
            opacity: settledDetail ? 1 : 0,
            transition: settledDetail && !reducedMotion ? `opacity ${REVEAL_MS}ms ease-out` : 'none',
          }}
        >
          <div className="rounded-md border border-[#ebe4d6] bg-[#fffdfb]/90 px-3 py-2 shadow-[0_8px_24px_rgba(26,33,48,0.05)]">
            <MapLegend />
          </div>
        </div>

        {settledDetail ? (
          <span className="sr-only">
            Mapa por saldo. A legenda distingue saldo positivo, neutro, negativo e sem métrica.
          </span>
        ) : null}
      </div>
    </div>
  )
}

type HoverState = {
  index: number
  x: number
  y: number
  key: string
}

type TerritoryShapesProps = {
  paths: ReturnType<typeof canonicalTerritoryPaths>
  scope: Scope
  settledDetail: boolean
  showMetrics: boolean
  join: ReturnType<typeof joinGeoJsonWithMetrics> | null
  hoverIndex: number | null
  reducedMotion: boolean
  interactive: boolean
  paintScale: number
  hoverKey: string
  setHover: Dispatch<SetStateAction<HoverState | null>>
}

function shapesStay(prev: TerritoryShapesProps, next: TerritoryShapesProps) {
  return (
    prev.paths === next.paths &&
    prev.scope === next.scope &&
    prev.settledDetail === next.settledDetail &&
    prev.showMetrics === next.showMetrics &&
    prev.join === next.join &&
    prev.hoverIndex === next.hoverIndex &&
    prev.reducedMotion === next.reducedMotion &&
    prev.interactive === next.interactive &&
    prev.paintScale === next.paintScale
  )
}

const TerritoryShapes = memo(function TerritoryShapes({
  paths,
  scope,
  settledDetail,
  showMetrics,
  join,
  hoverIndex,
  reducedMotion,
  interactive,
  paintScale,
  hoverKey,
  setHover,
}: TerritoryShapesProps) {
  return paths.map((path, index) => {
    const metric = join?.lookup(path.properties)
    const hovered = hoverIndex === index
    return (
      <path
        key={`${path.territoryKey}-${path.featureIndex}-${index}`}
        d={path.d}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        style={pathPaint(
          scope,
          settledDetail,
          showMetrics,
          Boolean(metric),
          hovered,
          metric,
          join?.maxAbsSaldo ?? 0,
          reducedMotion,
          paintScale,
        )}
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
  })
}, shapesStay)

function pathPaint(
  scope: Scope,
  settledDetail: boolean,
  showMetrics: boolean,
  hasMetric: boolean,
  hovered: boolean,
  metric: TerritoryMetricRow | undefined,
  maxAbsSaldo: number,
  reducedMotion: boolean,
  paintScale: number,
): CSSProperties {
  const screenStroke = hovered
    ? DETAIL_STROKE[scope] + 1.15
    : settledDetail
      ? DETAIL_STROKE[scope]
      : LANDING_STROKE[scope]
  return {
    fill: showMetrics ? saldoFillColor(metric?.saldo, maxAbsSaldo) : '#d3c9b6',
    fillOpacity: showMetrics ? (hovered ? (hasMetric ? 0.96 : 0.58) : hasMetric ? 0.84 : 0.42) : 1,
    stroke: '#1a2130',
    strokeOpacity: hovered ? 1 : settledDetail ? 0.38 : 1,
    strokeWidth: screenStroke / Math.max(paintScale, 0.001),
    cursor: settledDetail ? 'default' : 'auto',
    transition: paintTransition(reducedMotion, hovered, settledDetail),
  }
}
