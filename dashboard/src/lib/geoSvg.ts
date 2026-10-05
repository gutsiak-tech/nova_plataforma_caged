import type { GeoJsonFeatureCollection } from './geoJoin'
import type { Scope } from '../api/types'

type LonLat = [number, number]

export type DecorativeSvgPath = {
  d: string
  territoryKey: string
  featureIndex: number
}

function getDecorativeTerritoryKey(
  properties: Record<string, unknown>,
  featureIndex: number,
  scope: Scope,
): string {
  if (scope === 'br') {
    return String(
      properties.uf_norm ?? properties.uf ?? properties.uf_sigla ?? properties.name ?? featureIndex,
    )
  }
  return String(
    properties.municipio_norm ?? properties.municipio ?? properties.name ?? featureIndex,
  )
}

export type GeoBounds = {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

export type BoundsOverride = readonly [readonly [number, number], readonly [number, number]]

const VIEW_SIZE = 1000
const VIEW_PADDING = 36

function walkCoordinates(coords: unknown, visit: (lon: number, lat: number) => void): void {
  if (!Array.isArray(coords) || coords.length === 0) return
  if (typeof coords[0] === 'number') {
    const [lon, lat] = coords as LonLat
    visit(lon, lat)
    return
  }
  for (const part of coords) walkCoordinates(part, visit)
}

export function computeGeoBounds(
  geoJson: GeoJsonFeatureCollection,
  boundsOverride?: BoundsOverride,
): GeoBounds {
  if (boundsOverride) {
    const [[minLat, minLon], [maxLat, maxLon]] = boundsOverride
    return { minLon, maxLon, minLat, maxLat }
  }

  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const feature of geoJson.features) {
    walkCoordinates((feature.geometry as { coordinates?: unknown })?.coordinates, (lon, lat) => {
      minLon = Math.min(minLon, lon)
      maxLon = Math.max(maxLon, lon)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    })
  }

  if (!Number.isFinite(minLon)) {
    return { minLon: -74, maxLon: -34, minLat: -34, maxLat: 6 }
  }

  return { minLon, maxLon, minLat, maxLat }
}

function projectPoint(
  lon: number,
  lat: number,
  bounds: GeoBounds,
): [number, number] {
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.0001)
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001)
  const inner = VIEW_SIZE - VIEW_PADDING * 2
  const scale = Math.min(inner / lonSpan, inner / latSpan)
  const drawW = lonSpan * scale
  const drawH = latSpan * scale
  const offsetX = (VIEW_SIZE - drawW) / 2
  const offsetY = (VIEW_SIZE - drawH) / 2
  const x = offsetX + (lon - bounds.minLon) * scale
  const y = offsetY + (bounds.maxLat - lat) * scale
  return [x, y]
}

function ringToPath(ring: LonLat[], bounds: GeoBounds): string {
  if (ring.length === 0) return ''
  const [x0, y0] = projectPoint(ring[0][0], ring[0][1], bounds)
  let d = `M${x0.toFixed(2)},${y0.toFixed(2)}`
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = projectPoint(ring[i][0], ring[i][1], bounds)
    d += `L${x.toFixed(2)},${y.toFixed(2)}`
  }
  return `${d}Z`
}

function geometryToPaths(geometry: unknown, bounds: GeoBounds): string[] {
  if (!geometry || typeof geometry !== 'object') return []
  const g = geometry as { type?: string; coordinates?: unknown }
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    const ring = (g.coordinates as LonLat[][])[0]
    return ring ? [ringToPath(ring, bounds)] : []
  }
  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    return (g.coordinates as LonLat[][][])
      .map((poly) => {
        const ring = poly[0]
        return ring ? ringToPath(ring, bounds) : ''
      })
      .filter(Boolean)
  }
  return []
}

export function geoJsonToSvgPaths(
  geoJson: GeoJsonFeatureCollection,
  options?: { boundsOverride?: BoundsOverride },
): string[] {
  return geoJsonToDecorativePaths(geoJson, options).map((item) => item.d)
}

export function geoJsonToDecorativePaths(
  geoJson: GeoJsonFeatureCollection,
  options?: { boundsOverride?: BoundsOverride; scope?: Scope },
): DecorativeSvgPath[] {
  const bounds = computeGeoBounds(geoJson, options?.boundsOverride)
  const scope = options?.scope ?? 'br'
  const result: DecorativeSvgPath[] = []
  geoJson.features.forEach((feature, featureIndex) => {
    const properties = (feature.properties ?? {}) as Record<string, unknown>
    const territoryKey = getDecorativeTerritoryKey(properties, featureIndex, scope)
    for (const d of geometryToPaths(feature.geometry, bounds)) {
      result.push({ d, territoryKey, featureIndex })
    }
  })
  return result
}

export const SVG_VIEW_BOX = `0 0 ${VIEW_SIZE} ${VIEW_SIZE}`
