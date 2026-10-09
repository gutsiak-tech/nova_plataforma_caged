import { describe, expect, it } from 'vitest'
import {
  clearDetailCompetenceCache,
  competenceMonthKey,
  competenceSurfaceReady,
  featureCompetenceReady,
  peekDetailCompetence,
  rememberDetailCompetence,
} from './territorialCompetence'

describe('territorial competence gate', () => {
  it('keeps a detail snapshot only when overview and ranking both arrived', () => {
    clearDetailCompetenceCache()
    rememberDetailCompetence({
      key: 'pr:2026:1',
      overview: null,
      table: null,
      overviewError: true,
      tableError: false,
    })
    expect(peekDetailCompetence('pr', 2026, 1)).toBeNull()

    const ready = {
      key: 'pr:2026:1',
      overview: { scope: 'pr' } as never,
      table: { rows: [] } as never,
      overviewError: false,
      tableError: false,
    }
    rememberDetailCompetence(ready)
    expect(peekDetailCompetence('pr', 2026, 1)).toEqual(ready)
    expect(competenceMonthKey(2026, 1)).toBe('2026-1')
  })

  it('does not treat another feature or an older month as ready', () => {
    expect(
      featureCompetenceReady('ready', { id: '4106902', ano: 2026, mes: 6 }, '4106902', 2026, 1),
    ).toBe(false)
    expect(
      featureCompetenceReady('ready', { id: '4106902', ano: 2026, mes: 1 }, '4104204', 2026, 1),
    ).toBe(false)
    expect(
      featureCompetenceReady('ready', { id: 'SP', ano: 2026, mes: 1 }, 'SP', 2026, 1),
    ).toBe(true)
    expect(featureCompetenceReady('loading', null, 'SP', 2026, 1)).toBe(false)
    expect(featureCompetenceReady('error', null, 'SP', 2026, 1)).toBe(true)
  })

  it('publishes a feature competence only after the feature payload matches', () => {
    expect(
      competenceSurfaceReady({
        active: true,
        dataReady: true,
        featureOpen: true,
        featureReady: false,
      }),
    ).toBe(false)
    expect(
      competenceSurfaceReady({
        active: true,
        dataReady: true,
        featureOpen: true,
        featureReady: true,
      }),
    ).toBe(true)
    expect(
      competenceSurfaceReady({
        active: true,
        dataReady: true,
        featureOpen: false,
        featureReady: false,
      }),
    ).toBe(true)
    expect(
      competenceSurfaceReady({
        active: false,
        dataReady: true,
        featureOpen: false,
        featureReady: true,
      }),
    ).toBe(false)
  })
})
