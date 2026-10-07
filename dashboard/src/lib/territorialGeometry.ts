import type { Scope } from '../api/types'
import type { GeoFeatureProperties, GeoJsonFeatureCollection } from './geoJoin'
import {
  computeGeoBounds,
  geoJsonToDecorativePaths,
  SVG_VIEW_BOX,
  type BoundsOverride,
  type DecorativeSvgPath,
  type GeoBounds,
} from './geoSvg'

/** Mesmo enquadramento continental da landing e do mapa analítico do Brasil. */
export const BRASIL_CANONICAL_BOUNDS: BoundsOverride = [
  [-34.0, -74.0],
  [5.5, -34.5],
]

export const CANONICAL_VIEW_BOX = SVG_VIEW_BOX

export type CanonicalTerritoryPath = DecorativeSvgPath & {
  properties: GeoFeatureProperties
}

export function canonicalBounds(geoJson: GeoJsonFeatureCollection, scope: Scope): GeoBounds {
  return computeGeoBounds(geoJson, scope === 'br' ? BRASIL_CANONICAL_BOUNDS : undefined)
}

/** Paths do território. Não recebem pose, tamanho de container nem projeção alternativa. */
export function canonicalTerritoryPaths(
  geoJson: GeoJsonFeatureCollection,
  scope: Scope,
): CanonicalTerritoryPath[] {
  const decorative = geoJsonToDecorativePaths(geoJson, {
    scope,
    boundsOverride: scope === 'br' ? BRASIL_CANONICAL_BOUNDS : undefined,
  })
  return decorative.map((path) => ({
    ...path,
    properties: (geoJson.features[path.featureIndex]?.properties ?? {}) as GeoFeatureProperties,
  }))
}
