import { useEffect, useState } from 'react'
import type { Scope } from '../../api/types'
import type { GeoJsonFeatureCollection } from '../../lib/geoJoin'
import { fetchTerritoryGeoCached, getCachedTerritoryGeo } from './geoBackgroundCache'

export function useTerritoryGeoJson(scope: Scope) {
  const [geoJson, setGeoJson] = useState<GeoJsonFeatureCollection | null>(
    () => getCachedTerritoryGeo(scope),
  )
  const [loadedScope, setLoadedScope] = useState<Scope | null>(() =>
    getCachedTerritoryGeo(scope) ? scope : null,
  )
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (getCachedTerritoryGeo(scope)) return

    fetchTerritoryGeoCached(scope)
      .then((data) => {
        if (!cancelled) {
          setGeoJson(data)
          setLoadedScope(scope)
          setGeoError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setGeoJson(null)
          setLoadedScope(scope)
          setGeoError(e instanceof Error ? e.message : 'Falha ao carregar GeoJSON')
        }
      })

    return () => {
      cancelled = true
    }
  }, [scope])

  const cached = getCachedTerritoryGeo(scope)
  const resolvedGeoJson = cached ?? (loadedScope === scope ? geoJson : null)
  const geoLoading = !cached && loadedScope !== scope
  const resolvedError = cached ? null : geoError

  return { geoJson: resolvedGeoJson, geoLoading, geoError: resolvedError }
}
