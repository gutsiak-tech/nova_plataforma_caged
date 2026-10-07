import { describe, expect, it } from 'vitest'
import type { GeoJsonFeatureCollection } from './geoJoin'
import { geoJsonToDecorativePaths, uniformProjectionScale } from './geoSvg'
import {
  BRASIL_CANONICAL_BOUNDS,
  CANONICAL_VIEW_BOX,
  canonicalBounds,
  canonicalTerritoryPaths,
} from './territorialGeometry'

function collection(
  coordinates: number[][][],
  properties: Record<string, unknown>,
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties,
        geometry: { type: 'Polygon', coordinates },
      },
    ],
  }
}

function pathBox(d: string) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const xs = nums.filter((_, index) => index % 2 === 0)
  const ys = nums.filter((_, index) => index % 2 === 1)
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

describe('canonical territorial geometry', () => {
  const wide = collection(
    [
      [
        [-50, -25],
        [-30, -25],
        [-30, -20],
        [-50, -20],
        [-50, -25],
      ],
    ],
    { municipio_norm: 'curitiba' },
  )

  it('keeps one viewBox for every scope', () => {
    expect(CANONICAL_VIEW_BOX).toBe('0 0 1000 1000')
    for (const scope of ['br', 'pr', 'rmc'] as const) {
      expect(canonicalTerritoryPaths(wide, scope).every((path) => path.d.length > 0)).toBe(true)
    }
  })

  it('reuses the decorative path identity instead of a second projection', () => {
    const br = canonicalTerritoryPaths(wide, 'br')
    const decorative = geoJsonToDecorativePaths(wide, {
      scope: 'br',
      boundsOverride: BRASIL_CANONICAL_BOUNDS,
    })
    expect(br.map((path) => path.d)).toEqual(decorative.map((path) => path.d))
    expect(canonicalTerritoryPaths(wide, 'br').map((path) => path.d)).toEqual(br.map((path) => path.d))
  })

  it('projects longitude and latitude with one scale', () => {
    const bounds = canonicalBounds(wide, 'pr')
    const scale = uniformProjectionScale(bounds)
    expect(scale).toBe(Math.min(928 / (bounds.maxLon - bounds.minLon), 928 / (bounds.maxLat - bounds.minLat)))
    const box = pathBox(canonicalTerritoryPaths(wide, 'pr')[0].d)
    expect(box.width / box.height).toBeCloseTo(4, 1)
  })

  it('keeps Brasil framing independent of features outside the continent', () => {
    const outside = collection(
      [
        [
          [10, 10],
          [12, 10],
          [12, 12],
          [10, 12],
          [10, 10],
        ],
      ],
      { uf_norm: 'xx' },
    )
    expect(canonicalBounds(outside, 'br')).toEqual({
      minLon: -74,
      maxLon: -34.5,
      minLat: -34,
      maxLat: 5.5,
    })
    expect(canonicalBounds(outside, 'pr').minLon).toBe(10)
  })

  it('keeps the feature properties on the same path', () => {
    const paths = canonicalTerritoryPaths(wide, 'pr')
    expect(paths[0].properties.municipio_norm).toBe('curitiba')
    expect(paths[0].featureIndex).toBe(0)
  })
})
