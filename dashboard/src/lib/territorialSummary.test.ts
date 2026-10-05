import { describe, expect, it } from 'vitest'
import type { OverviewResponse } from '../api/types'
import {
  formatVinculosMagnitude,
  territorialExecutiveCopy,
  territorialKpis,
  territorialMovementPoint,
  topSectorAdmissions,
  uniqueLeadingSector,
} from './territorialSummary'

function overview(partial: Partial<OverviewResponse>): OverviewResponse {
  return {
    month: { ano: 2026, mes: 6 },
    scope: 'br',
    resumo: null,
    salary_summary: {
      movement: 'admissao',
      n: null,
      mean: null,
      median: null,
    },
    rankings: { uf: null, municipio: [], setor: [], ocupacao: [] },
    profiles: {},
    salary_profiles: {},
    ...partial,
  }
}

describe('territorial landing summary', () => {
  it('reads the four institutional indicators already published by the overview', () => {
    const kpis = territorialKpis(
      overview({
        resumo: { saldo: 1200, admissoes: 8000, desligamentos: 6800 },
        salary_summary: {
          movement: 'admissao',
          n: 7400,
          mean: 2410.4,
          median: 1800,
        },
      }),
    )

    expect(kpis).toEqual({
      saldo: 1200,
      admissoes: 8000,
      desligamentos: 6800,
      salarioMedio: 2410.4,
    })
  })

  it('keeps the salary mean empty when the published summary is not for admissions', () => {
    const kpis = territorialKpis(
      overview({
        salary_summary: {
          movement: 'desligamento',
          n: 10,
          mean: 3000,
          median: 2500,
        },
      }),
    )

    expect(kpis.salarioMedio).toBeNull()
  })

  it('ranks the existing sector rows by admissions', () => {
    expect(
      topSectorAdmissions([
        { secao: 'Comércio', admissoes: 20 },
        { secao: 'Indústria', admissoes: 50 },
        { secao: 'Serviços', admissoes: 50 },
        { secao: '  ', admissoes: 90 },
        { secao: 'Agropecuária', admissoes: 0 },
      ]),
    ).toEqual([
      { label: 'Indústria', value: 50 },
      { label: 'Serviços', value: 50 },
      { label: 'Comércio', value: 20 },
    ])
  })

  it('formats published volumes without inventing a unit', () => {
    expect(formatVinculosMagnitude(145161)).toBe('145,2 mil')
    expect(formatVinculosMagnitude(2220131)).toBe('2,2 milhões')
    expect(formatVinculosMagnitude(1000000)).toBe('1 milhão')
    expect(formatVinculosMagnitude(1000)).toBe('1 mil')
    expect(formatVinculosMagnitude(999)).toBe('999')
  })

  it('writes only sentences that follow directly from the published figures', () => {
    expect(
      territorialExecutiveCopy({
        territoryName: 'Brasil',
        competenceLabel: 'Junho de 2026',
        saldo: 145161,
        leadingSector: 'Comércio',
      }),
    ).toEqual({
      balance: 'Brasil registrou saldo positivo de 145,2 mil vínculos em junho de 2026.',
      sector: 'Comércio liderou as admissões na competência selecionada.',
    })

    expect(
      territorialExecutiveCopy({
        territoryName: 'Paraná',
        competenceLabel: 'Junho de 2026',
        saldo: -3200,
        leadingSector: null,
      }).balance,
    ).toBe('Paraná registrou saldo negativo de 3,2 mil vínculos em junho de 2026.')

    expect(
      territorialExecutiveCopy({
        territoryName: 'RMC',
        competenceLabel: '',
        saldo: 0,
        leadingSector: null,
      }).balance,
    ).toBe('RMC registrou saldo igual a zero.')
  })

  it('does not name a sector leader when the top admissions are tied', () => {
    expect(
      uniqueLeadingSector([
        { label: 'Indústria', value: 50 },
        { label: 'Serviços', value: 50 },
      ]),
    ).toBeNull()
  })

  it('reads the movement series from the same overview indicators', () => {
    expect(
      territorialMovementPoint(
        { ano: 2026, mes: 6, label: 'Junho de 2026' },
        overview({
          resumo: { saldo: 10, admissoes: 80, desligamentos: 70 },
          salary_summary: {
            movement: 'admissao',
            n: 1,
            mean: 100,
            median: 90,
          },
        }),
      ),
    ).toEqual({
      ano: 2026,
      mes: 6,
      label: 'Junho de 2026',
      saldo: 10,
      admissoes: 80,
      desligamentos: 70,
    })
  })
})
