import { useEffect, useMemo, type ReactNode } from 'react'
import { GeoJSON, MapContainer, useMap } from 'react-leaflet'
import type { Layer, PathOptions } from 'leaflet'
import L from 'leaflet'
import type { Feature, GeoJsonObject } from 'geojson'
import { GOLD_COLUMNS } from '../../api/goldColumns'
import type { GoldRow, Scope } from '../../api/types'
import {
  buildMetricIndex,
  joinGeoJsonWithMetrics,
  type GeoFeatureProperties,
  type GeoJsonFeatureCollection,
} from '../../lib/geoJoin'
import { Card } from '../ui/Card'
import { MapLegend } from './MapLegend'
import { MapPlaceholder } from './MapPlaceholder'
import { theme } from '../../lib/theme'
import { saldoFillColor, MAP_CHOROPLETH } from './mapChoropleth'
import {
  BRASIL_FRAMING_BOUNDS,
  FIT_BOUNDS_PADDING,
  formatJoinCoverage,
  MAP_FALLBACK,
  SCOPE_MAP_NOTE,
} from './mapTerritoryCopy'
import { buildTerritoryTooltipHtml } from './mapTooltip'

const JOIN_PROPERTY_BY_SCOPE: Record<Scope, 'uf_norm' | 'municipio_norm'> = {
  br: 'uf_norm',
  pr: 'municipio_norm',
  rmc: 'municipio_norm',
}

function FitBounds({
  data,
  scope,
}: {
  data: GeoJsonFeatureCollection
  scope: Scope
}) {
  const map = useMap()
  useEffect(() => {
    const bounds =
      scope === 'br'
        ? L.latLngBounds(BRASIL_FRAMING_BOUNDS)
        : L.geoJSON(data as GeoJsonObject).getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING[scope], animate: false })
    }
  }, [data, map, scope])
  return null
}

type TerritoryMapProps = {
  scope: Scope
  municipalityRows: GoldRow[]
  ufRows: GoldRow[] | null
  competenciaLabel: string
  geoJson: GeoJsonFeatureCollection | null
  geoLoading: boolean
  geoError: string | null
}

function MapCanvasLoading({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
      <div className={theme.loadingState.spinnerClass} aria-hidden />
      <p className="max-w-md text-center text-sm text-[color:var(--ds-text-muted)]">{message}</p>
    </div>
  )
}

function TerritoryMapChrome({
  scope,
  competenciaLabel,
  coverageText,
  children,
  showLegend,
}: {
  scope: Scope
  competenciaLabel: string
  coverageText: string
  children: ReactNode
  showLegend: boolean
}) {
  return (
    <Card className="overflow-hidden p-0" hover={false}>
      <div className="min-h-[5.5rem] space-y-1.5 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className="text-sm font-semibold text-white">Mapa territorial · saldo</h3>
          <p className="text-[11px] text-slate-500">Competência {competenciaLabel}</p>
        </div>
        <p className="min-h-[2.75rem] text-xs leading-relaxed text-slate-400">
          {SCOPE_MAP_NOTE[scope]}
        </p>
        <p className="min-h-[1.125rem] text-[11px] text-slate-500">{coverageText || '\u00A0'}</p>
      </div>

      <div className="relative">
        <div className="territory-map-canvas h-[360px] w-full md:h-[500px]">{children}</div>

        {showLegend ? (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:right-auto">
            <div className="pointer-events-auto inline-flex max-w-full rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 shadow-lg backdrop-blur-sm">
              <MapLegend />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function TerritoryLeafletMap({
  scope,
  municipalityRows,
  ufRows,
  competenciaLabel,
  geoJson,
}: {
  scope: Scope
  municipalityRows: GoldRow[]
  ufRows: GoldRow[] | null
  competenciaLabel: string
  geoJson: GeoJsonFeatureCollection
}) {
  const metricIndex = useMemo(() => {
    const rows = scope === 'br' ? (ufRows ?? []) : municipalityRows
    const key = scope === 'br' ? GOLD_COLUMNS.UF : GOLD_COLUMNS.MUNICIPIO
    return buildMetricIndex(rows, key)
  }, [scope, municipalityRows, ufRows])

  const join = useMemo(
    () =>
      joinGeoJsonWithMetrics(geoJson, {
        joinProperty: JOIN_PROPERTY_BY_SCOPE[scope],
        metricIndex,
      }),
    [geoJson, scope, metricIndex],
  )

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const properties = (feature.properties ?? {}) as GeoFeatureProperties
    const metric = join.lookup(properties)
    layer.bindTooltip(buildTerritoryTooltipHtml(properties, scope, metric), {
      sticky: true,
      opacity: 0.98,
      className: 'territory-map-tooltip',
    })
  }

  const styleFeature = (feature?: Feature): PathOptions => {
    const properties = (feature?.properties ?? {}) as GeoFeatureProperties
    const metric = join.lookup(properties)
    const fill = saldoFillColor(metric?.[GOLD_COLUMNS.SALDO], join.maxAbsSaldo)
    return {
      fillColor: fill,
      fillOpacity: metric ? 0.84 : 0.38,
      color: MAP_CHOROPLETH.stroke,
      weight: scope === 'br' ? 1 : 1.25,
    }
  }

  return (
    <MapContainer
      center={[-15.5, -52]}
      zoom={4}
      className="h-full w-full rounded-none"
      scrollWheelZoom={false}
      attributionControl={false}
      zoomControl={false}
      zoomSnap={0.25}
      zoomDelta={0.25}
    >
      <FitBounds data={geoJson} scope={scope} />
      <GeoJSON
        key={`${scope}-${competenciaLabel}-${join.matched}`}
        data={geoJson as GeoJsonObject}
        style={styleFeature}
        onEachFeature={onEachFeature}
      />
    </MapContainer>
  )
}

function resolveCoverageText(
  scope: Scope,
  geoJson: GeoJsonFeatureCollection,
  municipalityRows: GoldRow[],
  ufRows: GoldRow[] | null,
): string {
  const metricRows = scope === 'br' ? (ufRows ?? []) : municipalityRows
  const metricKey = scope === 'br' ? GOLD_COLUMNS.UF : GOLD_COLUMNS.MUNICIPIO
  const metricIndex = buildMetricIndex(metricRows, metricKey)
  const join = joinGeoJsonWithMetrics(geoJson, {
    joinProperty: JOIN_PROPERTY_BY_SCOPE[scope],
    metricIndex,
  })
  return formatJoinCoverage(scope, join.matched, geoJson.features.length, join.unmatched)
}

export function TerritoryMap({
  scope,
  municipalityRows,
  ufRows,
  competenciaLabel,
  geoJson,
  geoLoading,
  geoError,
}: TerritoryMapProps) {
  if (geoError && !geoJson) {
    return <MapPlaceholder message={MAP_FALLBACK.geoError} />
  }

  if (scope === 'br' && ufRows !== null && ufRows.length === 0) {
    return <MapPlaceholder message={MAP_FALLBACK.noMetrics} />
  }

  if (scope !== 'br' && !municipalityRows.length && geoJson && !geoLoading) {
    return <MapPlaceholder message={MAP_FALLBACK.noMetrics} />
  }

  const coverageText =
    geoJson && !geoLoading && !(scope === 'br' && ufRows === null)
      ? resolveCoverageText(scope, geoJson, municipalityRows, ufRows)
      : ''

  const mapReady =
    Boolean(geoJson) &&
    !geoLoading &&
    !(scope === 'br' && ufRows === null) &&
    !(scope !== 'br' && !municipalityRows.length)

  let canvasContent: ReactNode
  if (!mapReady) {
    canvasContent = (
      <MapCanvasLoading
        message={
          geoLoading || !geoJson ? MAP_FALLBACK.geoLoading : MAP_FALLBACK.metricsLoading
        }
      />
    )
  } else {
    canvasContent = (
      <TerritoryLeafletMap
        scope={scope}
        municipalityRows={municipalityRows}
        ufRows={ufRows}
        competenciaLabel={competenciaLabel}
        geoJson={geoJson!}
      />
    )
  }

  return (
    <TerritoryMapChrome
      scope={scope}
      competenciaLabel={competenciaLabel}
      coverageText={coverageText}
      showLegend={mapReady}
    >
      {canvasContent}
    </TerritoryMapChrome>
  )
}
