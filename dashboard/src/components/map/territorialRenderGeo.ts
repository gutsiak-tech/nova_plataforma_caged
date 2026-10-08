import { useEffect, useState } from 'react'
import type { Scope } from '../../api/types'
import type { GeoJsonFeatureCollection } from '../../lib/geoJoin'
import { fetchTerritoryGeoCached, getCachedTerritoryGeo } from './geoBackgroundCache'
import { GEO_URL_BY_SCOPE } from './territoryBackgroundConfig'

/**
 * Brasil de apresentação. A fonte geográfica continua em GEO_URL_BY_SCOPE.br.
 * Paraná e RMC usam a mesma malha do restante do aplicativo.
 */
export const TERRITORIAL_RENDER_GEO_URL: Record<Scope, string> = {
  br: '/geo/ufs.presentation.geojson',
  pr: GEO_URL_BY_SCOPE.pr,
  rmc: GEO_URL_BY_SCOPE.rmc,
}

const presentationCache = new Map<Scope, GeoJsonFeatureCollection>()
const presentationInflight = new Map<Scope, Promise<GeoJsonFeatureCollection>>()

export function territorialRenderGeoUrl(scope: Scope): string {
  return TERRITORIAL_RENDER_GEO_URL[scope]
}

export function getCachedTerritorialRenderGeo(scope: Scope): GeoJsonFeatureCollection | null {
  if (scope !== 'br') return getCachedTerritoryGeo(scope)
  return presentationCache.get(scope) ?? null
}

export function fetchTerritorialRenderGeo(scope: Scope): Promise<GeoJsonFeatureCollection> {
  if (scope !== 'br') return fetchTerritoryGeoCached(scope)

  const cached = presentationCache.get(scope)
  if (cached) return Promise.resolve(cached)

  const pending = presentationInflight.get(scope)
  if (pending) return pending

  const request = fetch(TERRITORIAL_RENDER_GEO_URL[scope])
    .then(async (res) => {
      if (!res.ok) throw new Error(`GeoJSON não encontrado (${res.status})`)
      return (await res.json()) as GeoJsonFeatureCollection
    })
    .then((data) => {
      presentationCache.set(scope, data)
      presentationInflight.delete(scope)
      return data
    })
    .catch((error: unknown) => {
      presentationInflight.delete(scope)
      throw error
    })

  presentationInflight.set(scope, request)
  return request
}

export function useTerritorialRenderGeo(scope: Scope) {
  const [geoJson, setGeoJson] = useState<GeoJsonFeatureCollection | null>(() =>
    getCachedTerritorialRenderGeo(scope),
  )
  const [loadedScope, setLoadedScope] = useState<Scope | null>(() =>
    getCachedTerritorialRenderGeo(scope) ? scope : null,
  )
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (getCachedTerritorialRenderGeo(scope)) return

    fetchTerritorialRenderGeo(scope)
      .then((data) => {
        if (!cancelled) {
          setGeoJson(data)
          setLoadedScope(scope)
          setGeoError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setGeoJson(null)
          setLoadedScope(scope)
          setGeoError(error instanceof Error ? error.message : 'Falha ao carregar GeoJSON')
        }
      })

    return () => {
      cancelled = true
    }
  }, [scope])

  const cached = getCachedTerritorialRenderGeo(scope)
  const resolvedGeoJson = cached ?? (loadedScope === scope ? geoJson : null)
  const geoLoading = !cached && loadedScope !== scope
  const resolvedError = cached ? null : geoError

  return { geoJson: resolvedGeoJson, geoLoading, geoError: resolvedError }
}
