import type { Scope } from '../api/types'

export const TERRITORIAL_SLUGS = {
  brasil: 'br',
  parana: 'pr',
  rmc: 'rmc',
} as const

export type TerritorialSlug = keyof typeof TERRITORIAL_SLUGS

export const SLUG_BY_SCOPE: Record<Scope, TerritorialSlug> = {
  br: 'brasil',
  pr: 'parana',
  rmc: 'rmc',
}

export function resolveTerritorialSlug(slug: string | undefined | null): Scope | null {
  if (!slug) return null
  const normalized = slug.trim().toLowerCase()
  if (!Object.prototype.hasOwnProperty.call(TERRITORIAL_SLUGS, normalized)) return null
  return TERRITORIAL_SLUGS[normalized as TerritorialSlug]
}

export function territorialSlug(scope: Scope): TerritorialSlug {
  return SLUG_BY_SCOPE[scope]
}
