import { describe, expect, it } from 'vitest'
import goldApiSource from '../api/gold.ts?raw'
import monthContextSource from '../context/MonthContext.tsx?raw'
import type { Competencia } from '../api/types'
import {
  pickCompetenciaAfterFetch,
  resolveInitialCompetencia,
} from './competenciaPersistence'

const competencias: Competencia[] = [
  {
    ano: 2026,
    mes: 1,
    competencia: '2026-01',
    label: 'Janeiro de 2026',
  },
  {
    ano: 2025,
    mes: 12,
    competencia: '2025-12',
    label: 'Dezembro de 2025',
  },
]

describe('default competence policy', () => {
  it('selects the chronologically latest valid competence', () => {
    const selected = resolveInitialCompetencia(
      competencias,
      new URLSearchParams(),
      null,
      null,
    )

    expect(selected?.competencia).toBe('2026-01')
  })

  it('uses the canonical default returned by the API', () => {
    const selected = resolveInitialCompetencia(
      competencias,
      new URLSearchParams(),
      competencias[1],
      null,
    )

    expect(selected?.competencia).toBe('2025-12')
  })

  it('returns a safe null state when no valid competence exists', () => {
    expect(
      resolveInitialCompetencia([], new URLSearchParams(), null, null),
    ).toBeNull()
  })

  it('preserves a later manual selection after a refresh', () => {
    const selected = pickCompetenciaAfterFetch(
      competencias,
      new URLSearchParams(),
      competencias[1],
      competencias[0],
      null,
    )

    expect(selected?.competencia).toBe('2025-12')
  })

  it('honors an explicit valid URL selection on initialization', () => {
    const selected = resolveInitialCompetencia(
      competencias,
      new URLSearchParams('ano=2025&mes=12'),
      competencias[0],
      null,
    )

    expect(selected?.competencia).toBe('2025-12')
  })

  it('uses a valid stored selection before the API default', () => {
    const selected = resolveInitialCompetencia(
      competencias,
      new URLSearchParams(),
      competencias[0],
      { ano: 2025, mes: 12 },
    )

    expect(selected?.competencia).toBe('2025-12')
  })

  it('falls back to the canonical default when the current selection is invalid', () => {
    const selected = pickCompetenciaAfterFetch(
      competencias,
      new URLSearchParams(),
      {
        ano: 2024,
        mes: 1,
        competencia: '2024-01',
        label: 'Janeiro de 2024',
      },
      competencias[0],
      null,
    )

    expect(selected?.competencia).toBe('2026-01')
  })

  it('ignores an invalid URL and preserves a valid stored selection', () => {
    const selected = resolveInitialCompetencia(
      competencias,
      new URLSearchParams('ano=1999&mes=12'),
      competencias[0],
      { ano: 2025, mes: 12 },
    )

    expect(selected?.competencia).toBe('2025-12')
  })

  it('contains no hardcoded competence fallback', () => {
    expect(goldApiSource).not.toContain('buildFallbackCompetencias')
    expect(goldApiSource).not.toMatch(/DEFAULT_API_(ANO|MES)/)
    expect(monthContextSource).toContain('useState<Competencia[]>([])')
    expect(monthContextSource).toContain('setCompetencias(items)')
    expect(monthContextSource).not.toMatch(/fallbackItems|fallbackDefault/)
  })
})
