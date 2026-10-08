import { describe, expect, it } from 'vitest'
import stageSource from '../components/territorial/TerritorialMapStage.tsx?raw'
import renderSource from '../components/map/territorialRenderGeo.ts?raw'
import { GEO_URL_BY_SCOPE } from '../components/map/territoryBackgroundConfig'
import { territorialRenderGeoUrl } from '../components/map/territorialRenderGeo'
import { saldoFillColor } from '../components/map/mapChoropleth'
import { describeTerritoryTooltip } from '../components/map/mapTooltip'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { buildMetricIndex, joinGeoJsonWithMetrics, type GeoJsonFeatureCollection } from './geoJoin'
import { canonicalTerritoryPaths } from './territorialGeometry'
import { uniformProjectionScale } from './geoSvg'
import sourceText from '../../public/geo/ufs.geojson?raw'
import presentationText from '../../public/geo/ufs.presentation.geojson?raw'
import metadataText from '../../public/geo/ufs.presentation.metadata.json?raw'

type LonLat = [number, number]
type Ring = LonLat[]

type PresentationMetadata = {
  source: string
  referenceStagePx: number
  referenceTolerancePx: number
  viewBoxTolerance: number
  features: number
  verticesBefore: number
  verticesAfter: number
  neighborPairs: number
  projection: { scale: number }
  maxDeviationPx: Record<string, number>
}

const source = JSON.parse(sourceText) as GeoJsonFeatureCollection
const presentation = JSON.parse(presentationText) as GeoJsonFeatureCollection
const metadata = JSON.parse(metadataText) as PresentationMetadata

function ringsOf(geometry: { type?: string; coordinates?: unknown }): Ring[] {
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as Ring[]
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as Ring[][]).flat()
  }
  return []
}

function coordKey(position: LonLat): string {
  return `${position[0].toFixed(6)},${position[1].toFixed(6)}`
}

function openVertices(geo: GeoJsonFeatureCollection): number {
  let count = 0
  for (const feature of geo.features) {
    for (const ring of ringsOf(feature.geometry as { type?: string; coordinates?: unknown })) {
      count += Math.max(0, ring.length - 1)
    }
  }
  return count
}

function neighborPairs(geo: GeoJsonFeatureCollection): Set<string> {
  const owners = new Map<string, Set<string>>()
  for (const feature of geo.features) {
    const sigla = String(feature.properties.uf_sigla)
    for (const ring of ringsOf(feature.geometry as { type?: string; coordinates?: unknown })) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const left = coordKey(ring[index])
        const right = coordKey(ring[index + 1])
        if (left === right) continue
        const edge = left < right ? `${left}|${right}` : `${right}|${left}`
        const set = owners.get(edge) ?? new Set<string>()
        set.add(sigla)
        owners.set(edge, set)
      }
    }
  }
  const pairs = new Set<string>()
  for (const set of owners.values()) {
    expect(set.size).toBeLessThanOrEqual(2)
    if (set.size === 2) {
      const [left, right] = [...set].sort()
      pairs.add(`${left}|${right}`)
    }
  }
  return pairs
}

describe('malha de apresentação do Brasil', () => {
  it('preserva as 27 UFs, os identificadores e as propriedades', () => {
    expect(source.features).toHaveLength(27)
    expect(presentation.features).toHaveLength(27)
    expect(metadata.features).toBe(27)
    expect(metadata.source).toBe('dashboard/public/geo/ufs.geojson')

    const sourceIds = source.features.map((feature) => String(feature.properties.uf_sigla))
    const presentationIds = presentation.features.map((feature) => String(feature.properties.uf_sigla))
    expect(new Set(presentationIds)).toEqual(new Set(sourceIds))
    expect(presentationIds).toEqual(sourceIds)

    for (let index = 0; index < source.features.length; index += 1) {
      expect(presentation.features[index].properties).toEqual(source.features[index].properties)
      const geometry = presentation.features[index].geometry as { type?: string; coordinates?: unknown }
      const rings = ringsOf(geometry)
      expect(rings.length).toBeGreaterThan(0)
      for (const ring of rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4)
        expect(ring[0]).toEqual(ring[ring.length - 1])
        for (const [lon, lat] of ring) {
          expect(Number.isFinite(lon)).toBe(true)
          expect(Number.isFinite(lat)).toBe(true)
        }
      }
    }

    expect(openVertices(source)).toBe(160645)
    expect(openVertices(source)).toBe(metadata.verticesBefore)
    expect(openVertices(presentation)).toBe(metadata.verticesAfter)
    expect(metadata.verticesAfter).toBeGreaterThan(18_000)
    expect(metadata.verticesAfter).toBeLessThan(26_000)
    expect(canonicalTerritoryPaths(presentation, 'br')).toHaveLength(
      canonicalTerritoryPaths(source, 'br').length,
    )
  })

  it('mantém as fronteiras compartilhadas coincidentes', () => {
    const sourcePairs = neighborPairs(source)
    const presentationPairs = neighborPairs(presentation)

    expect(presentationPairs.size).toBe(metadata.neighborPairs)
    expect(sourcePairs.size).toBeGreaterThan(0)
    for (const pair of sourcePairs) expect(presentationPairs.has(pair)).toBe(true)
  })

  it('usa a tolerância de 0,20 px convertida pela projeção do renderer', () => {
    const scale = uniformProjectionScale({
      minLon: -74,
      maxLon: -34.5,
      minLat: -34,
      maxLat: 5.5,
    })

    expect(metadata.referenceStagePx).toBe(831)
    expect(metadata.referenceTolerancePx).toBe(0.2)
    expect(metadata.viewBoxTolerance).toBeCloseTo(0.2 * (1000 / 831), 12)
    expect(metadata.projection.scale).toBeCloseTo(scale, 12)
    expect(metadata.maxDeviationPx['831']).toBeLessThanOrEqual(0.25)
    expect(metadata.maxDeviationPx['1080']).toBeLessThanOrEqual(0.35)
    expect(metadata.maxDeviationPx['1440']).toBeLessThanOrEqual(0.45)
  })

  it('atribui a mesma classe de choropleth e o mesmo tooltip a cada UF', () => {
    const rows = source.features.map((feature, index) => ({
      uf: feature.properties.uf,
      saldo: index === 0 ? 0 : (index - 13) * 40,
      admissoes: 100 + index,
      desligamentos: 40 + index,
    }))
    const metricIndex = buildMetricIndex(rows, GOLD_COLUMNS.UF)
    const sourceJoin = joinGeoJsonWithMetrics(source, { joinProperty: 'uf_norm', metricIndex })
    const presentationJoin = joinGeoJsonWithMetrics(presentation, {
      joinProperty: 'uf_norm',
      metricIndex,
    })

    expect(sourceJoin.matched).toBe(27)
    expect(presentationJoin.matched).toBe(27)
    expect(presentationJoin.maxAbsSaldo).toBe(sourceJoin.maxAbsSaldo)

    for (let index = 0; index < source.features.length; index += 1) {
      const sourceProperties = source.features[index].properties
      const presentationProperties = presentation.features[index].properties
      const sourceMetric = sourceJoin.lookup(sourceProperties)
      const presentationMetric = presentationJoin.lookup(presentationProperties)
      expect(presentationMetric).toEqual(sourceMetric)
      expect(saldoFillColor(presentationMetric?.saldo, presentationJoin.maxAbsSaldo)).toBe(
        saldoFillColor(sourceMetric?.saldo, sourceJoin.maxAbsSaldo),
      )
      expect(describeTerritoryTooltip(presentationProperties, 'br', presentationMetric)).toEqual(
        describeTerritoryTooltip(sourceProperties, 'br', sourceMetric),
      )
      expect(describeTerritoryTooltip(presentationProperties, 'br', undefined).primary).toBe(
        String(sourceProperties.uf),
      )
      expect(describeTerritoryTooltip(presentationProperties, 'br', undefined).secondary).toBe(
        String(sourceProperties.uf_sigla),
      )
    }
  })

  it('faz a entrada e o detalhe lerem a mesma malha, sem trocar Paraná nem RMC', () => {
    expect(territorialRenderGeoUrl('br')).toBe('/geo/ufs.presentation.geojson')
    expect(territorialRenderGeoUrl('pr')).toBe('/geo/municipios_pr.geojson')
    expect(territorialRenderGeoUrl('rmc')).toBe('/geo/municipios_rmc.geojson')
    expect(GEO_URL_BY_SCOPE.br).toBe('/geo/ufs.geojson')
    expect(stageSource).toContain('useTerritorialRenderGeo(scope)')
    expect(stageSource).not.toContain('useTerritoryGeoJson')
    expect(stageSource).not.toContain('ufs.geojson')
    expect(stageSource).not.toContain('ufs.presentation')
    expect(renderSource).not.toMatch(/pose/)
    expect(renderSource).toContain("if (scope !== 'br') return fetchTerritoryGeoCached(scope)")
  })
})
