import { useMemo } from 'react'
import clsx from 'clsx'
import type { Scope } from '../../api/types'
import { geoJsonToDecorativePaths, SVG_VIEW_BOX, type BoundsOverride } from '../../lib/geoSvg'
import { territoryOption } from '../../lib/territorialSummary'
import { useTerritoryGeoJson } from '../map/useTerritoryGeoJson'

/** Mesmo enquadramento continental usado pelo mapa institucional do Brasil. */
const BRASIL_MINI_BOUNDS: BoundsOverride = [
  [-34.0, -74.0],
  [5.5, -34.5],
]

const STROKE_WIDTH: Record<Scope, number> = {
  br: 1.6,
  pr: 1.15,
  rmc: 1.25,
}

export function TerritoryMiniMap({
  scope,
  className,
}: {
  scope: Scope
  className?: string
}) {
  const territory = territoryOption(scope)
  const { geoJson, geoLoading, geoError } = useTerritoryGeoJson(scope)
  const paths = useMemo(() => {
    if (!geoJson) return []
    return geoJsonToDecorativePaths(geoJson, {
      scope,
      boundsOverride: scope === 'br' ? BRASIL_MINI_BOUNDS : undefined,
    })
  }, [geoJson, scope])

  return (
    <div className={clsx('relative', className)}>
      {geoLoading ? (
        <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.14em] text-[#727d91]">
          Carregando mapa
        </div>
      ) : null}
      {geoError ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[#727d91]">
          Mapa indisponível
        </div>
      ) : null}
      {paths.length > 0 ? (
        <svg
          viewBox={SVG_VIEW_BOX}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Mapa de ${territory.name}`}
        >
          {paths.map((path, index) => (
            <path
              key={`${path.territoryKey}-${index}`}
              d={path.d}
              fill="#d3c9b6"
              stroke="#1a2130"
              strokeWidth={STROKE_WIDTH[scope]}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      ) : null}
    </div>
  )
}
