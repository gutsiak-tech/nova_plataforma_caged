import type { Scope } from '../api/types'
import { resolveTerritorialSlug, territorialSlug } from './territorialRoute'

export const TERRITORIAL_MOVE_MS = 720

export type TerritorialPose =
  | { kind: 'landing' }
  | { kind: 'detail'; scope: Scope }
  | { kind: 'invalid' }

export function resolveTerritorialPose(pathname: string): TerritorialPose {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/'
  if (path === '/territorial') return { kind: 'landing' }
  const prefix = '/territorial/'
  if (!path.startsWith(prefix)) return { kind: 'invalid' }
  const slug = path.slice(prefix.length)
  if (!slug || slug.includes('/')) return { kind: 'invalid' }
  const scope = resolveTerritorialSlug(slug)
  if (!scope) return { kind: 'invalid' }
  return { kind: 'detail', scope }
}

export function territorialDetailLocation(scope: Scope, search = '') {
  return { pathname: `/territorial/${territorialSlug(scope)}`, search }
}

export function territorialLandingLocation(search = '') {
  return { pathname: '/territorial', search }
}

export function territorialMoveDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : TERRITORIAL_MOVE_MS
}
