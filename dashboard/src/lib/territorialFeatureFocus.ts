import type { Scope } from '../api/types'
import type { GeoFeatureProperties } from './geoJoin'
import type { CanonicalTerritoryPath } from './territorialGeometry'

/** Mesma duração e a mesma curva da transição landing → detalhe. */
export const FEATURE_FOCUS_EASE = [0.22, 1, 0.36, 1] as const
export const FEATURE_FOCUS_MS = 720

/** Margem em torno do maior lado do bounding box, antes do encaixe uniforme. */
export const FEATURE_FOCUS_MARGIN = 0.18

/** Inclinação máxima. Discreta de propósito: a malha não pode parecer deformada. */
export const FEATURE_TILT_DEGREES = 4

/** Contexto das features não selecionadas, dentro da faixa 0.10–0.18. */
export const FEATURE_CONTEXT_OPACITY = 0.14

export const FEATURE_VIEW_SIZE = 1000

export type ViewRect = {
  x: number
  y: number
  width: number
  height: number
}

export type FeatureFocusTransform = {
  x: number
  y: number
  scale: number
}

const UF_ID = /^[A-Z]{2}$/
const MUNICIPALITY_ID = /^\d{7}$/

export function normalizeFeatureId(scope: Scope, raw: string | null | undefined): string | null {
  if (raw == null) return null
  const value = raw.trim()
  if (!value) return null
  if (scope === 'br') {
    const sigla = value.toUpperCase()
    return UF_ID.test(sigla) ? sigla : null
  }
  return MUNICIPALITY_ID.test(value) ? value : null
}

export function featurePathSegment(scope: Scope, featureId: string): string {
  return scope === 'br' ? featureId.toLowerCase() : featureId
}

/** Identificador externo da feature. Nunca o nome textual. */
export function featureExternalId(scope: Scope, properties: GeoFeatureProperties): string | null {
  if (scope === 'br') return normalizeFeatureId(scope, stringProperty(properties.uf_sigla))
  return normalizeFeatureId(scope, stringProperty(properties.cod_municipio))
}

function stringProperty(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/** Bounding box das coordenadas absolutas já projetadas no viewBox. */
export function pathCommandBounds(d: string): ViewRect | null {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 2) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let index = 0; index + 1 < nums.length; index += 2) {
    const x = Number(nums[index])
    const y = Number(nums[index + 1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  return { x: minX, y: minY, width: Math.max(maxX - minX, 0), height: Math.max(maxY - minY, 0) }
}

export function unionViewRects(rects: ViewRect[]): ViewRect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function featureViewBounds(
  paths: CanonicalTerritoryPath[],
  scope: Scope,
  featureId: string,
): ViewRect | null {
  const rects: ViewRect[] = []
  for (const path of paths) {
    if (featureExternalId(scope, path.properties) !== featureId) continue
    const rect = pathCommandBounds(path.d)
    if (rect) rects.push(rect)
  }
  return unionViewRects(rects)
}

/**
 * Enquadra o bounding box no viewBox com uma escala só.
 * A margem é fração do maior lado, então o mesmo cálculo serve para qualquer feature.
 */
export function featureFocusTransform(
  bounds: ViewRect,
  viewSize = FEATURE_VIEW_SIZE,
  margin = FEATURE_FOCUS_MARGIN,
): FeatureFocusTransform {
  const span = Math.max(bounds.width, bounds.height, 1)
  const pad = span * margin
  const framedWidth = Math.max(bounds.width + pad * 2, 1)
  const framedHeight = Math.max(bounds.height + pad * 2, 1)
  const scale = Math.min(viewSize / framedWidth, viewSize / framedHeight)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return {
    x: viewSize / 2 - centerX * scale,
    y: viewSize / 2 - centerY * scale,
    scale,
  }
}
