import type { Scope } from '../../api/types'
import type { GeoFeatureProperties } from '../../lib/geoJoin'

/** Ativar apenas para diagnóstico local — manter `false` no resultado final. */
export const DEBUG_TERRITORY_COLORS = false

// Decorative only: colors are deterministic and not data-driven.
// Silhueta institucional — contornos branco-gelo sobre navy sólido, sem teal/cinza.

export type DecorativeTerritoryStyle = {
  fill: string
  stroke: string
  fillOpacity: number
  strokeOpacity: number
}

type PaletteSwatch = DecorativeTerritoryStyle

const DEBUG_PALETTE: PaletteSwatch[] = [
  { fill: '#f9fafc', stroke: '#e8ecf4', fillOpacity: 0.08, strokeOpacity: 0.35 },
  { fill: '#f1f3f8', stroke: '#dfe6f0', fillOpacity: 0.07, strokeOpacity: 0.32 },
  { fill: '#eef2f8', stroke: '#d8e0ec', fillOpacity: 0.06, strokeOpacity: 0.3 },
]

const ICE_CONTOUR_PALETTE: PaletteSwatch[] = [
  { fill: '#f9fafc', stroke: '#eef2f8', fillOpacity: 0.045, strokeOpacity: 0.2 },
  { fill: '#f4f6fa', stroke: '#e8ecf4', fillOpacity: 0.04, strokeOpacity: 0.18 },
  { fill: '#f1f3f8', stroke: '#e2e8f2', fillOpacity: 0.038, strokeOpacity: 0.17 },
  { fill: '#eef2f8', stroke: '#dfe6f0', fillOpacity: 0.036, strokeOpacity: 0.16 },
  { fill: '#f6f8fb', stroke: '#e8edf6', fillOpacity: 0.042, strokeOpacity: 0.19 },
]

const TERRITORY_BACKGROUND_PALETTES: Record<Scope, PaletteSwatch[]> = {
  br: ICE_CONTOUR_PALETTE,
  pr: ICE_CONTOUR_PALETTE,
  rmc: ICE_CONTOUR_PALETTE,
}

export function stableTerritoryHash(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

export function getDecorativeTerritoryKey(
  properties: GeoFeatureProperties,
  index: number,
  scope: Scope,
): string {
  if (scope === 'br') {
    return String(
      properties.uf_norm ?? properties.uf ?? properties.uf_sigla ?? properties.name ?? index,
    )
  }
  return String(
    properties.municipio_norm ?? properties.municipio ?? properties.name ?? index,
  )
}

export function getDecorativeTerritoryStyle(
  properties: GeoFeatureProperties,
  index: number,
  scope: Scope,
): DecorativeTerritoryStyle {
  const key = getDecorativeTerritoryKey(properties, index, scope)
  const palette = DEBUG_TERRITORY_COLORS ? DEBUG_PALETTE : TERRITORY_BACKGROUND_PALETTES[scope]
  const colorIndex = stableTerritoryHash(key) % palette.length
  return palette[colorIndex]
}

export function getDecorativeTerritoryStyleByKey(
  territoryKey: string,
  scope: Scope,
): DecorativeTerritoryStyle {
  const palette = DEBUG_TERRITORY_COLORS ? DEBUG_PALETTE : TERRITORY_BACKGROUND_PALETTES[scope]
  const colorIndex = stableTerritoryHash(territoryKey) % palette.length
  return palette[colorIndex]
}
