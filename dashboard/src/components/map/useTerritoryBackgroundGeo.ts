import { useEffect, useState } from 'react'
import type { Scope } from '../../api/types'
import type { GeoJsonFeatureCollection } from '../../lib/geoJoin'
import { fetchBackgroundGeoCached, getCachedBackgroundGeo } from './geoBackgroundCache'

export function useTerritoryBackgroundGeo(scope: Scope) {
  const [geoJson, setGeoJson] = useState<GeoJsonFeatureCollection | null>(
    () => getCachedBackgroundGeo(scope),
  )
  const [loadedScope, setLoadedScope] = useState<Scope | null>(() =>
    getCachedBackgroundGeo(scope) ? scope : null,
  )

  useEffect(() => {
    let cancelled = false
    fetchBackgroundGeoCached(scope).then((data) => {
      if (!cancelled) {
        setGeoJson(data)
        setLoadedScope(scope)
      }
    })
    return () => {
      cancelled = true
    }
  }, [scope])

  const cached = getCachedBackgroundGeo(scope)
  if (cached) return cached
  return loadedScope === scope ? geoJson : null
}
