import { useEffect, useMemo, type ReactNode } from 'react'
import { GeoJSON, MapContainer, useMap } from 'react-leaflet'
import type { Layer, Path, PathOptions } from 'leaflet'
import L from 'leaflet'
import type { Feature, GeoJsonObject } from 'geojson'
import type { GoldRow, Scope } from '../../api/types'
import {
  buildMetricIndex,
  joinGeoJsonWithMetrics,
  type GeoFeatureProperties,
  type GeoJsonFeatureCollection,
} from '../../lib/geoJoin'
import { TERRITORIAL_GEOGRAPHY } from '../../lib/territorialDetail'
import { MapLegend } from '../map/MapLegend'
import { saldoFillColor } from '../map/mapChoropleth'
import { BRASIL_FRAMING_BOUNDS, FIT_BOUNDS_PADDING } from '../map/mapTerritoryCopy'
import { buildTerritoryTooltipHtml } from '../map/mapTooltip'
import { useTerritoryGeoJson } from '../map/useTerritoryGeoJson'

const BASE_WEIGHT: Record<Scope, number> = {
  br: 1.05,
  pr: 0.8,
  rmc: 1.15,
}

function asPath(layer: Layer): Path | null {
  return typeof (layer as Path).setStyle === 'function' ? (layer as Path) : null
}

function FitBounds({ data, scope }: { data: GeoJsonFeatureCollection; scope: Scope }) {
  const map = useMap()
  useEffect(() => {
    const bounds =
      scope === 'br'
        ? L.latLngBounds(BRASIL_FRAMING_BOUNDS)
        : L.geoJSON(data as GeoJsonObject).getBounds()
    if (bounds.isValid()) {
      const [vertical, horizontal] = FIT_BOUNDS_PADDING[scope]
      map.fitBounds(bounds, {
        paddingTopLeft: L.point(horizontal, vertical),
        paddingBottomRight: L.point(horizontal, vertical + 28),
        animate: false,
      })
    }
  }, [data, map, scope])
  return null
}

function MapMessage({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="max-w-sm text-sm text-[#5d6678]">{title}</p>
      {action}
    </div>
  )
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="text-sm font-semibold text-[#1a2130] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
    >
      Tentar novamente
    </button>
  )
}

export function TerritorialDetailMap({
  scope,
  rows,
  loading,
  error,
  onRetry,
  dataKey,
}: {
  scope: Scope
  rows: GoldRow[]
  loading: boolean
  error: boolean
  onRetry: () => void
  dataKey: string
}) {
  const { geoJson, geoLoading, geoError } = useTerritoryGeoJson(scope)
  const geography = TERRITORIAL_GEOGRAPHY[scope]
  const waiting = loading || geoLoading || (!geoJson && !geoError)

  const metricIndex = useMemo(
    () => buildMetricIndex(rows, geography.labelKey),
    [rows, geography.labelKey],
  )
  const join = useMemo(
    () =>
      geoJson
        ? joinGeoJsonWithMetrics(geoJson, {
            joinProperty: geography.joinProperty,
            metricIndex,
          })
        : null,
    [geoJson, geography.joinProperty, metricIndex],
  )

  let content: ReactNode
  if (geoError && !geoJson) {
    content = <MapMessage title="Camada cartográfica indisponível." />
  } else if (error) {
    content = (
      <MapMessage
        title="Não foi possível carregar as métricas do mapa."
        action={<RetryButton onRetry={onRetry} />}
      />
    )
  } else if (waiting || !geoJson || !join) {
    content = (
      <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
        <p className="text-sm text-[#727d91]">Carregando mapa territorial</p>
      </div>
    )
  } else {
    const styleFeature = (feature?: Feature): PathOptions => {
      const properties = (feature?.properties ?? {}) as GeoFeatureProperties
      const metric = join.lookup(properties)
      return {
        fillColor: saldoFillColor(metric?.saldo, join.maxAbsSaldo),
        fillOpacity: metric ? 0.84 : 0.42,
        color: 'rgba(26, 33, 48, 0.38)',
        weight: BASE_WEIGHT[scope],
      }
    }

    const onEachFeature = (feature: Feature, layer: Layer) => {
      const path = asPath(layer)
      const properties = (feature.properties ?? {}) as GeoFeatureProperties
      const metric = join.lookup(properties)
      layer.bindTooltip(buildTerritoryTooltipHtml(properties, scope, metric), {
        sticky: true,
        opacity: 0.98,
        className: 'territory-map-tooltip',
      })
      if (!path) return
      const base = styleFeature(feature)
      path.on('mouseover', () => {
        path.setStyle({
          ...base,
          color: '#1a2130',
          weight: BASE_WEIGHT[scope] + 1.15,
          fillOpacity: metric ? 0.96 : 0.58,
        })
        path.bringToFront()
      })
      path.on('mouseout', () => {
        path.setStyle(base)
      })
    }

    content = (
      <>
        <MapContainer
          center={[-15.5, -52]}
          zoom={4}
          className="h-full w-full"
          attributionControl={false}
          zoomSnap={0.25}
          zoomDelta={0.5}
        >
          <FitBounds data={geoJson} scope={scope} />
          <GeoJSON
            key={`${dataKey}-${join.matched}-${join.maxAbsSaldo}`}
            data={geoJson as GeoJsonObject}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        </MapContainer>
        <div className="pointer-events-none absolute bottom-3 right-3 z-[500] max-w-[calc(100%-1.5rem)]">
          <div className="rounded-md border border-[#ebe4d6] bg-[#fffdfb]/90 px-3 py-2 shadow-[0_8px_24px_rgba(26,33,48,0.05)]">
            <MapLegend />
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="territorial-detail-map relative h-full min-h-0 bg-[#f3efe6]">
      {content}
      <span className="sr-only">
        Mapa por saldo. A legenda distingue saldo positivo, neutro, negativo e sem métrica.
      </span>
    </div>
  )
}
