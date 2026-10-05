import type { Scope } from '../../api/types'
import type { GeoJsonFeatureCollection } from '../../lib/geoJoin'
import { GEO_URL_BY_SCOPE } from './territoryBackgroundConfig'

const cache = new Map<Scope, GeoJsonFeatureCollection>()
const inflight = new Map<Scope, Promise<GeoJsonFeatureCollection>>()

export function getCachedTerritoryGeo(scope: Scope): GeoJsonFeatureCollection | null {
  return cache.get(scope) ?? null
}

/** Alias usado pelo mapa decorativo de fundo. */
export const getCachedBackgroundGeo = getCachedTerritoryGeo

/**
 * Carrega GeoJSON territorial com cache em memória e deduplicação de requests em voo.
 * Compartilhado entre TerritoryBackground e TerritoryPage (useTerritoryGeoJson).
 */
export function fetchTerritoryGeoCached(scope: Scope): Promise<GeoJsonFeatureCollection> {
  const cached = cache.get(scope)
  if (cached) return Promise.resolve(cached)

  const pending = inflight.get(scope)
  if (pending) return pending

  const request = fetch(GEO_URL_BY_SCOPE[scope])
    .then(async (res) => {
      if (!res.ok) throw new Error(`GeoJSON não encontrado (${res.status})`)
      return (await res.json()) as GeoJsonFeatureCollection
    })
    .then((data) => {
      cache.set(scope, data)
      inflight.delete(scope)
      return data
    })
    .catch((e: unknown) => {
      inflight.delete(scope)
      throw e
    })

  inflight.set(scope, request)
  return request
}

/** Variante tolerante a falha para o fundo decorativo (não exibe erro ao usuário). */
export function fetchBackgroundGeoCached(scope: Scope): Promise<GeoJsonFeatureCollection | null> {
  return fetchTerritoryGeoCached(scope).catch(() => null)
}
