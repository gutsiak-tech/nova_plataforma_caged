import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { animate, motion, useMotionValue } from 'framer-motion'
import type { GoldRow, Scope } from '../../api/types'
import { describeTerritoryTooltip } from '../map/mapTooltip'
import { MapLegend } from '../map/MapLegend'
import { saldoFillColor } from '../map/mapChoropleth'
import { useTerritorialRenderGeo } from '../map/territorialRenderGeo'
import { buildMetricIndex, joinGeoJsonWithMetrics } from '../../lib/geoJoin'
import { TERRITORIAL_MOVE_MS } from '../../lib/territorialPose'
import { flightStableSize, flightTransform } from '../../lib/territorialFlight'
import { CANONICAL_VIEW_BOX, canonicalTerritoryPaths } from '../../lib/territorialGeometry'
import {
  FEATURE_CONTEXT_OPACITY,
  FEATURE_FOCUS_EASE,
  FEATURE_FOCUS_MS,
  FEATURE_TILT_DEGREES,
  featureExternalId,
  featureFocusTransform,
  featureViewBounds,
} from '../../lib/territorialFeatureFocus'
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

type PathPaint = {
  fill: string
  restOpacity: number
  hoverOpacity: number
}

export type TerritorialFeatureMotion = {
  id: string
  mode: 'approach' | 'hold' | 'return'
  instant: boolean
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
  feature = null,
  onSelectFeature,
  onFeatureArrived,
  onFeatureReturned,
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
  feature?: TerritorialFeatureMotion | null
  onSelectFeature?: (featureId: string) => void
  onFeatureArrived?: () => void
  onFeatureReturned?: () => void
}) {
  const territory = territoryOption(scope)
  const { geoJson, geoLoading, geoError } = useTerritorialRenderGeo(scope)
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
    if (!geoJson || !metricsReady || !model) return null
    return joinGeoJsonWithMetrics(geoJson, {
      joinProperty: geography.joinProperty,
      metricIndex: buildMetricIndex(model.rows, geography.labelKey),
    })
  }, [geoJson, geography.joinProperty, geography.labelKey, model, metricsReady])
  const paints = useMemo(() => {
    if (!join) return null
    return paths.map((path) => {
      const metric = join.lookup(path.properties)
      const hasMetric = Boolean(metric)
      return {
        fill: saldoFillColor(metric?.saldo, join.maxAbsSaldo),
        restOpacity: hasMetric ? 0.84 : 0.42,
        hoverOpacity: hasMetric ? 0.96 : 0.58,
      }
    })
  }, [join, paths])

  const featureId = feature?.id ?? null
  const featureMode = feature?.mode ?? 'off'
  const liftPaths = useMemo(() => {
    if (featureMode !== 'hold' || !featureId) return []
    return paths.filter((path) => featureExternalId(scope, path.properties) === featureId)
  }, [featureMode, featureId, paths, scope])
  const featureInstant = feature?.instant === true
  const dimOthers = featureMode === 'approach' || featureMode === 'hold'
  const opacityMotion = featureMode !== 'off'
  const focusTransform = useMemo(() => {
    if (!featureId) return null
    const bounds = featureViewBounds(paths, scope, featureId)
    if (!bounds) return null
    return featureFocusTransform(bounds)
  }, [featureId, paths, scope])
  const liftBlur = focusTransform ? Math.max(0.35, 8 / focusTransform.scale) : 1
  const liftDrop = focusTransform ? Math.max(0.2, 5 / focusTransform.scale) : 1
  const allowHover = settledDetail && featureMode === 'off' && paths.length > 0
  const clickable = allowHover || (settledDetail && featureMode === 'hold' && paths.length > 0)
  const interactive = clickable
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
  const screenStroke = settledDetail ? DETAIL_STROKE[scope] : LANDING_STROKE[scope]
  const strokeWidth = screenStroke / Math.max(paintScale, 0.001)
  const holder = { left: 0, top: 0, width: stable, height: stable }

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  const focusX = useMotionValue(0)
  const focusY = useMotionValue(0)
  const focusScale = useMotionValue(1)
  const tilt = useMotionValue(0)
  const focusGroupRef = useRef<SVGGElement>(null)
  const onFeatureArrivedRef = useRef(onFeatureArrived)
  const onFeatureReturnedRef = useRef(onFeatureReturned)
  const onSelectRef = useRef(onSelectFeature)
  useLayoutEffect(() => {
    onFeatureArrivedRef.current = onFeatureArrived
    onFeatureReturnedRef.current = onFeatureReturned
    onSelectRef.current = onSelectFeature
  })

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

  useLayoutEffect(() => {
    const node = focusGroupRef.current
    if (!node) return
    const apply = () => {
      node.setAttribute(
        'transform',
        `translate(${focusX.get()} ${focusY.get()}) scale(${focusScale.get()})`,
      )
    }
    apply()
    const unsubscribe = [focusX, focusY, focusScale].map((value) => value.on('change', apply))
    return () => {
      for (const stop of unsubscribe) stop()
    }
  }, [focusScale, focusX, focusY, paths.length])

  useLayoutEffect(() => {
    if (!featureId || featureMode === 'off') {
      focusX.set(0)
      focusY.set(0)
      focusScale.set(1)
      tilt.set(0)
      return
    }
    if (featureInstant) {
      if (!focusTransform) return
      focusX.set(focusTransform.x)
      focusY.set(focusTransform.y)
      focusScale.set(focusTransform.scale)
      tilt.set(FEATURE_TILT_DEGREES)
      return
    }
    if (featureMode === 'hold') {
      if (!focusTransform) return
      const drifted =
        Math.abs(focusScale.get() - focusTransform.scale) > 0.02 ||
        Math.abs(focusX.get() - focusTransform.x) > 1
      if (!drifted) return
      focusX.set(focusTransform.x)
      focusY.set(focusTransform.y)
      focusScale.set(focusTransform.scale)
      tilt.set(FEATURE_TILT_DEGREES)
      return
    }
    const durationSeconds = reducedMotion ? 0 : FEATURE_FOCUS_MS / 1000
    const options = { duration: durationSeconds, ease: FEATURE_FOCUS_EASE }
    let stopped = false
    if (featureMode === 'approach') {
      if (!focusTransform) {
        if (paths.length > 0) onFeatureArrivedRef.current?.()
        return
      }
      const ax = animate(focusX, focusTransform.x, options)
      const ay = animate(focusY, focusTransform.y, options)
      const at = animate(tilt, FEATURE_TILT_DEGREES, options)
      const az = animate(focusScale, focusTransform.scale, {
        ...options,
        onComplete: () => {
          if (!stopped) onFeatureArrivedRef.current?.()
        },
      })
      return () => {
        stopped = true
        ax.stop()
        ay.stop()
        az.stop()
        at.stop()
      }
    }
    const ax = animate(focusX, 0, options)
    const ay = animate(focusY, 0, options)
    const at = animate(tilt, 0, options)
    const az = animate(focusScale, 1, {
      ...options,
      onComplete: () => {
        if (!stopped) onFeatureReturnedRef.current?.()
      },
    })
    return () => {
      stopped = true
      ax.stop()
      ay.stop()
      az.stop()
      at.stop()
    }
  }, [
    featureId,
    featureInstant,
    featureMode,
    focusScale,
    focusTransform,
    focusX,
    focusY,
    paths.length,
    reducedMotion,
    tilt,
  ])

  return (
    <div
      className="territorial-map-stage territorial-detail-map"
      data-feature-mode={featureMode}
      data-feature-id={featureId ?? ''}
      data-feature-scale={focusTransform ? focusTransform.scale.toFixed(4) : '1'}
      data-feature-tilt={dimOthers ? String(FEATURE_TILT_DEGREES) : '0'}
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
          transition: flying && pose === 'detail' ? `background-color ${TERRITORIAL_MOVE_MS}ms ${MOVE_EASE}` : 'none',
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
            style={{ transformStyle: 'preserve-3d' }}
          >
            <motion.div
              className="h-full w-full"
              style={{
                rotateX: tilt,
                transformPerspective: 3200,
                originX: 0.5,
                originY: 0.5,
                willChange: 'transform',
              }}
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
                style={{
                  stroke: '#1a2130',
                  strokeWidth,
                  strokeOpacity: settledDetail ? 0.38 : 1,
                  cursor: clickable ? 'pointer' : 'auto',
                  overflow: 'visible',
                }}
              >
                <defs>
                  <filter
                    id="territorial-feature-lift"
                    x="-35%"
                    y="-35%"
                    width="170%"
                    height="170%"
                    colorInterpolationFilters="sRGB"
                  >
                    <feGaussianBlur in="SourceAlpha" stdDeviation={liftBlur} result="blur" />
                    <feOffset in="blur" dx="0" dy={liftDrop} result="offset" />
                    <feFlood floodColor="#1a2130" floodOpacity="0.22" result="ink" />
                    <feComposite in="ink" in2="offset" operator="in" result="shadow" />
                  </filter>
                </defs>
                <g ref={focusGroupRef}>
                  {liftPaths.length > 0 ? (
                    <g pointerEvents="none" filter="url(#territorial-feature-lift)">
                      {liftPaths.map((path, index) => (
                        <path key={`lift-${path.territoryKey}-${index}`} d={path.d} fill="#1a2130" />
                      ))}
                    </g>
                  ) : null}
                  <TerritoryShapes
                    paths={paths}
                    scope={scope}
                    showMetrics={showMetrics}
                    paints={showMetrics ? paints : null}
                    hoverIndex={allowHover ? (activeHover?.index ?? null) : null}
                    interactive={allowHover}
                    clickable={clickable}
                    paintScale={paintScale}
                    hoverKey={hoverKey}
                    setHover={setHover}
                    selectedId={dimOthers ? featureId : null}
                    dimmed={dimOthers}
                    opacityMotion={opacityMotion}
                    onSelectRef={onSelectRef}
                  />
                </g>
              </svg>
            )}
            </motion.div>
          </motion.div>
          {tooltip && activeHover && allowHover ? (
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
            opacity: settledDetail && featureMode === 'off' ? 1 : 0,
            transition: !reducedMotion ? `opacity ${REVEAL_MS}ms ease-out` : 'none',
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
  showMetrics: boolean
  paints: PathPaint[] | null
  hoverIndex: number | null
  interactive: boolean
  clickable: boolean
  paintScale: number
  hoverKey: string
  setHover: Dispatch<SetStateAction<HoverState | null>>
  selectedId: string | null
  dimmed: boolean
  opacityMotion: boolean
  onSelectRef: { current: ((featureId: string) => void) | undefined }
}

function shapesStay(prev: TerritoryShapesProps, next: TerritoryShapesProps) {
  return (
    prev.paths === next.paths &&
    prev.scope === next.scope &&
    prev.showMetrics === next.showMetrics &&
    prev.paints === next.paints &&
    prev.hoverIndex === next.hoverIndex &&
    prev.interactive === next.interactive &&
    prev.clickable === next.clickable &&
    prev.paintScale === next.paintScale &&
    prev.selectedId === next.selectedId &&
    prev.dimmed === next.dimmed &&
    prev.opacityMotion === next.opacityMotion
  )
}

const TerritoryShapes = memo(function TerritoryShapes({
  paths,
  scope,
  showMetrics,
  paints,
  hoverIndex,
  interactive,
  clickable,
  paintScale,
  hoverKey,
  setHover,
  selectedId,
  dimmed,
  opacityMotion,
  onSelectRef,
}: TerritoryShapesProps) {
  return paths.map((path, index) => {
    const hovered = hoverIndex === index
    const externalId = featureExternalId(scope, path.properties)
    const selected = selectedId != null && externalId === selectedId
    return (
      <path
        key={`${path.territoryKey}-${path.featureIndex}-${index}`}
        d={path.d}
        data-feature-id={externalId ?? undefined}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        style={pathPaint(scope, showMetrics, paints?.[index], hovered, paintScale, selected, dimmed, opacityMotion)}
        onClick={
          clickable && externalId
            ? (event) => {
                event.stopPropagation()
                onSelectRef.current?.(externalId)
              }
            : undefined
        }
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
  showMetrics: boolean,
  paint: PathPaint | undefined,
  hovered: boolean,
  paintScale: number,
  selected: boolean,
  dimmed: boolean,
  opacityMotion: boolean,
): CSSProperties {
  const style: CSSProperties = {
    fill: showMetrics && paint ? paint.fill : '#d3c9b6',
    fillOpacity: showMetrics && paint ? (hovered ? paint.hoverOpacity : paint.restOpacity) : 1,
  }
  if (selected) style.fillOpacity = 1
  else if (dimmed) style.fillOpacity = FEATURE_CONTEXT_OPACITY
  if (opacityMotion) {
    style.transition = `fill-opacity ${FEATURE_FOCUS_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
  }
  if (hovered || selected) {
    style.strokeOpacity = 1
    style.strokeWidth = (DETAIL_STROKE[scope] + (selected ? 0.65 : 1.15)) / Math.max(paintScale, 0.001)
  }
  return style
}
