import type { Scope } from '../../api/types'
import type { BoundsOverride } from '../../lib/geoSvg'

export type BackgroundMapPosition = {
  width: string
  height: string
  /** Deslocamento fino a partir do centro da área principal. */
  translateX?: string
  translateY?: string
}

export type BackgroundMapConfig = {
  opacity: number
  fill: string
  stroke: string
  strokeWidth: number
  cssScale: number
  boundsOverride?: BoundsOverride
  position: BackgroundMapPosition
}

export const GEO_URL_BY_SCOPE: Record<Scope, string> = {
  br: '/geo/ufs.geojson',
  pr: '/geo/municipios_pr.geojson',
  rmc: '/geo/municipios_rmc.geojson',
}

/** Enquadramento continental — apenas projeção visual do fundo BR. */
const BR_MAINLAND_BOUNDS: BoundsOverride = [
  [-34.0, -74.0],
  [5.5, -34.5],
]

export const BACKGROUND_MAP_CONFIG: Record<Scope, BackgroundMapConfig> = {
  br: {
    opacity: 0.5,
    fill: 'rgba(249, 250, 252, 0.04)',
    stroke: 'rgba(238, 242, 248, 0.2)',
    strokeWidth: 1.05,
    cssScale: 1.32,
    boundsOverride: BR_MAINLAND_BOUNDS,
    position: {
      width: 'min(95%, 1100px)',
      height: 'min(88vh, 900px)',
      translateX: '14%',
      translateY: '-10%',
    },
  },
  pr: {
    opacity: 0.46,
    fill: 'rgba(249, 250, 252, 0.038)',
    stroke: 'rgba(238, 242, 248, 0.18)',
    strokeWidth: 1,
    cssScale: 1.6,
    position: {
      width: 'min(95%, 1000px)',
      height: 'min(82vh, 820px)',
      translateX: '14%',
      translateY: '-12%',
    },
  },
  rmc: {
    opacity: 0.46,
    fill: 'rgba(249, 250, 252, 0.036)',
    stroke: 'rgba(238, 242, 248, 0.17)',
    strokeWidth: 1.1,
    cssScale: 1.68,
    position: {
      width: 'min(84%, 780px)',
      height: 'min(76vh, 700px)',
      translateX: '12%',
      translateY: '-10%',
    },
  },
}
