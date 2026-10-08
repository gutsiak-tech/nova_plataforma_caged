import { describe, expect, it } from 'vitest'
import type { GeoJsonFeatureCollection } from './geoJoin'
import prText from '../../public/geo/municipios_pr.geojson?raw'
import rmcText from '../../public/geo/municipios_rmc.geojson?raw'
import presentationText from '../../public/geo/ufs.presentation.geojson?raw'
import {
  FEATURE_CONTEXT_OPACITY,
  FEATURE_FOCUS_MARGIN,
  FEATURE_FOCUS_MS,
  FEATURE_TILT_DEGREES,
  FEATURE_VIEW_SIZE,
  featureExternalId,
  featureFocusTransform,
  featureViewBounds,
  normalizeFeatureId,
  pathCommandBounds,
} from './territorialFeatureFocus'
import { canonicalTerritoryPaths } from './territorialGeometry'
import { TERRITORIAL_MOVE_MS } from './territorialPose'

function loadGeo(text: string): GeoJsonFeatureCollection {
  return JSON.parse(text) as GeoJsonFeatureCollection
}

describe('feature focus identity', () => {
  it('uses the UF sigla and the municipal code, never the name', () => {
    expect(normalizeFeatureId('br', 'sp')).toBe('SP')
    expect(normalizeFeatureId('br', 'extra')).toBeNull()
    expect(normalizeFeatureId('pr', '4106902')).toBe('4106902')
    expect(normalizeFeatureId('rmc', 'Curitiba')).toBeNull()
    expect(featureExternalId('br', { uf: 'São Paulo', uf_sigla: 'SP' })).toBe('SP')
    expect(featureExternalId('pr', { municipio: 'Curitiba', cod_municipio: '4106902' })).toBe('4106902')
    expect(featureExternalId('br', { uf: 'São Paulo' })).toBeNull()
  })
})

describe('feature focus frame', () => {
  it('keeps the same duration as the territorial move and a shallow tilt', () => {
    expect(FEATURE_FOCUS_MS).toBe(TERRITORIAL_MOVE_MS)
    expect(FEATURE_TILT_DEGREES).toBeGreaterThanOrEqual(3)
    expect(FEATURE_TILT_DEGREES).toBeLessThanOrEqual(5)
    expect(FEATURE_CONTEXT_OPACITY).toBeGreaterThanOrEqual(0.1)
    expect(FEATURE_CONTEXT_OPACITY).toBeLessThanOrEqual(0.18)
  })

  it('derives one scale from the bounding box and keeps a margin inside the view', () => {
    const bounds = pathCommandBounds('M10,10L110,10L110,60L10,60Z')
    expect(bounds).toEqual({ x: 10, y: 10, width: 100, height: 50 })
    const frame = featureFocusTransform(bounds!)
    const span = Math.max(bounds!.width, bounds!.height)
    const pad = span * FEATURE_FOCUS_MARGIN
    const framedWidth = bounds!.width + pad * 2
    const framedHeight = bounds!.height + pad * 2
    expect(frame.scale).toBeCloseTo(Math.min(FEATURE_VIEW_SIZE / framedWidth, FEATURE_VIEW_SIZE / framedHeight))
    const centerX = bounds!.x + bounds!.width / 2
    const centerY = bounds!.y + bounds!.height / 2
    const left = bounds!.x * frame.scale + (FEATURE_VIEW_SIZE / 2 - centerX * frame.scale)
    const top = bounds!.y * frame.scale + (FEATURE_VIEW_SIZE / 2 - centerY * frame.scale)
    expect(left).toBeGreaterThan(20)
    expect(top).toBeGreaterThan(20)
  })

  it('uses the rendered mesh, so Acre, São Paulo, Curitiba and Adrianópolis do not share a hardcoded scale', () => {
    const brasil = canonicalTerritoryPaths(loadGeo(presentationText), 'br')
    const parana = canonicalTerritoryPaths(loadGeo(prText), 'pr')
    const rmc = canonicalTerritoryPaths(loadGeo(rmcText), 'rmc')

    const scaleOf = (paths: ReturnType<typeof canonicalTerritoryPaths>, scope: 'br' | 'pr' | 'rmc', id: string) => {
      const bounds = featureViewBounds(paths, scope, id)
      expect(bounds, id).not.toBeNull()
      return featureFocusTransform(bounds!).scale
    }

    const saoPaulo = scaleOf(brasil, 'br', 'SP')
    const acre = scaleOf(brasil, 'br', 'AC')
    const adrianopolis = parana.find((path) => path.properties.municipio === 'Adrianópolis')
    const adrianopolisId = String(adrianopolis?.properties.cod_municipio)
    const curitiba = scaleOf(parana, 'pr', '4106902')
    const smallCity = scaleOf(parana, 'pr', adrianopolisId)
    const curitibaRmc = scaleOf(rmc, 'rmc', '4106902')

    expect(saoPaulo).toBeGreaterThan(1)
    expect(acre).toBeGreaterThan(saoPaulo)
    expect(curitiba).toBeGreaterThan(1)
    expect(smallCity).toBeGreaterThan(1)
    expect(curitibaRmc).toBeGreaterThan(1)
    expect(new Set([saoPaulo, acre, curitiba, smallCity, curitibaRmc]).size).toBe(5)
    expect(saoPaulo).toBeCloseTo(3.4974, 3)
    expect(acre).toBeCloseTo(4.2532, 3)
    expect(curitiba).toBeCloseTo(17.4158, 3)
    expect(smallCity).toBeCloseTo(8.1681, 3)
    expect(curitibaRmc).toBeCloseTo(4.8055, 3)
    expect(adrianopolisId).toBe('4100202')
  })
})
