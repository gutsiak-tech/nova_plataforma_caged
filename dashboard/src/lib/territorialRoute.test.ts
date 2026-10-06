import { describe, expect, it } from 'vitest'
import { resolveTerritorialSlug, territorialSlug } from './territorialRoute'

describe('territorial route slugs', () => {
  it('maps the three public slugs to the existing scopes', () => {
    expect(resolveTerritorialSlug('brasil')).toBe('br')
    expect(resolveTerritorialSlug('parana')).toBe('pr')
    expect(resolveTerritorialSlug('rmc')).toBe('rmc')
  })

  it('accepts surrounding space and uppercase without adding new territories', () => {
    expect(resolveTerritorialSlug(' Brasil ')).toBe('br')
    expect(resolveTerritorialSlug('PARANA')).toBe('pr')
  })

  it('rejects unknown, accented and empty slugs', () => {
    expect(resolveTerritorialSlug('paraná')).toBeNull()
    expect(resolveTerritorialSlug('brasilia')).toBeNull()
    expect(resolveTerritorialSlug('')).toBeNull()
    expect(resolveTerritorialSlug('   ')).toBeNull()
    expect(resolveTerritorialSlug(null)).toBeNull()
    expect(resolveTerritorialSlug(undefined)).toBeNull()
  })

  it('round-trips each scope to its public slug', () => {
    expect(territorialSlug('br')).toBe('brasil')
    expect(territorialSlug('pr')).toBe('parana')
    expect(territorialSlug('rmc')).toBe('rmc')
    expect(resolveTerritorialSlug(territorialSlug('pr'))).toBe('pr')
  })
})
