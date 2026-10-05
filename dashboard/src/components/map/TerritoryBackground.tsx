import { useEffect, useMemo } from 'react'
import type { Scope } from '../../api/types'
import { useScope } from '../../context/ScopeContext'
import { geoJsonToDecorativePaths, SVG_VIEW_BOX } from '../../lib/geoSvg'
import { BACKGROUND_MAP_CONFIG } from './territoryBackgroundConfig'
import { fetchBackgroundGeoCached } from './geoBackgroundCache'
import {
  getDecorativeTerritoryStyleByKey,
  type DecorativeTerritoryStyle,
} from './territoryBackgroundPalette'
import { useTerritoryBackgroundGeo } from './useTerritoryBackgroundGeo'

const SCOPES: Scope[] = ['br', 'pr', 'rmc']

function ScopeBackgroundMapLayer({ scope, active }: { scope: Scope; active: boolean }) {
  const geoJson = useTerritoryBackgroundGeo(scope)
  const config = BACKGROUND_MAP_CONFIG[scope]

  const styledPaths = useMemo(() => {
    if (!geoJson) return []
    const paths = geoJsonToDecorativePaths(geoJson, {
      boundsOverride: config.boundsOverride,
      scope,
    })
    const styleByKey = new Map<string, DecorativeTerritoryStyle>()
    return paths.map((item) => {
      let style = styleByKey.get(item.territoryKey)
      if (!style) {
        style = getDecorativeTerritoryStyleByKey(item.territoryKey, scope)
        styleByKey.set(item.territoryKey, style)
      }
      return { ...item, style }
    })
  }, [geoJson, config.boundsOverride, scope])

  if (!styledPaths.length) return null

  const translateX = config.position.translateX ?? '0'
  const translateY = config.position.translateY ?? '0'

  return (
    <div
      className="territory-background-map-layer"
      style={{ opacity: active ? config.opacity : 0 }}
      aria-hidden={!active}
    >
      <div
        className="territory-background-map"
        style={{
          width: config.position.width,
          height: config.position.height,
          transform: `translate(${translateX}, ${translateY}) scale(${config.cssScale})`,
        }}
      >
        <svg
          viewBox={SVG_VIEW_BOX}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="presentation"
        >
          <defs>
            <clipPath id={`territory-bg-clip-${scope}`}>
              <rect x="0" y="0" width="1000" height="1000" />
            </clipPath>
          </defs>
          <g clipPath={`url(#territory-bg-clip-${scope})`}>
            {styledPaths.map((item, index) => (
              <path
                key={`${item.territoryKey}-${item.featureIndex}-${index}`}
                d={item.d}
                fill={item.style.fill}
                stroke={item.style.stroke}
                fillOpacity={item.style.fillOpacity}
                strokeOpacity={item.style.strokeOpacity}
                strokeWidth={config.strokeWidth}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}

export function TerritoryBackground() {
  const { scope } = useScope()
  const activeGeo = useTerritoryBackgroundGeo(scope)

  useEffect(() => {
    SCOPES.forEach((item) => {
      void fetchBackgroundGeoCached(item)
    })
  }, [])

  return (
    <div className="territory-background-layer hidden sm:block" aria-hidden>
      <div className="territory-background-stage">
        {!activeGeo ? <div className="territory-background-placeholder" /> : null}
        {SCOPES.map((item) => (
          <ScopeBackgroundMapLayer key={item} scope={item} active={scope === item} />
        ))}
      </div>
      <div className="territory-background-fade" />
    </div>
  )
}
