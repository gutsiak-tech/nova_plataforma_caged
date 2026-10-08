import type { NavigateFunction } from 'react-router-dom'
import type { Scope } from '../api/types'
import { featurePathSegment, normalizeFeatureId } from './territorialFeatureFocus'
import { resolveTerritorialSlug, territorialSlug } from './territorialRoute'

export const TERRITORIAL_MOVE_MS = 720

export type TerritorialPose =
  | { kind: 'landing' }
  | { kind: 'detail'; scope: Scope }
  | { kind: 'feature'; scope: Scope; featureId: string }
  | { kind: 'invalid' }

export function resolveTerritorialPose(pathname: string): TerritorialPose {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/'
  if (path === '/territorial') return { kind: 'landing' }
  const prefix = '/territorial/'
  if (!path.startsWith(prefix)) return { kind: 'invalid' }
  const slug = path.slice(prefix.length)
  if (!slug) return { kind: 'invalid' }
  const parts = slug.split('/')
  if (parts.length > 2) return { kind: 'invalid' }
  const scope = resolveTerritorialSlug(parts[0])
  if (!scope) return { kind: 'invalid' }
  if (parts.length === 1) return { kind: 'detail', scope }
  const featureId = normalizeFeatureId(scope, parts[1])
  if (!featureId) return { kind: 'invalid' }
  return { kind: 'feature', scope, featureId }
}

export function territorialDetailLocation(scope: Scope, search = '') {
  return { pathname: `/territorial/${territorialSlug(scope)}`, search }
}

export function territorialFeatureLocation(scope: Scope, featureId: string, search = '') {
  return {
    pathname: `/territorial/${territorialSlug(scope)}/${featurePathSegment(scope, featureId)}`,
    search,
  }
}

export function territorialLandingLocation(search = '') {
  return { pathname: '/territorial', search }
}

export function territorialHistoryIndex(): number {
  const state = window.history.state as { idx?: unknown } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}

/** Volta um nível na pilha. Sem histórico anterior, empurra o pai. */
export function retreatTerritorialHistory(
  navigate: NavigateFunction,
  fallback: { pathname: string; search: string },
) {
  if (territorialHistoryIndex() > 0) navigate(-1)
  else navigate(fallback)
}

export function territorialMoveDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : TERRITORIAL_MOVE_MS
}
