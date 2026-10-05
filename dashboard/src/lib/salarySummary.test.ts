import { describe, expect, it } from 'vitest'
import salaryPageSource from '../pages/SalaryPage.tsx?raw'
import {
  DEFAULT_SALARY_MOVEMENT,
  getTerritorialSalaryMedian,
  getTerritorialSalarySummary,
  salaryColumnsForDisplay,
} from './salarySummary'

describe('territorial salary median', () => {
  it('uses the movement-specific summary instead of the first profile group', () => {
    const overview = {
      salary_summary: {
        movement: 'admissao',
        n: 5,
        mean: 2400,
        median: 2000,
      },
      salary_profiles: {
        sexo: [
          { sexo: 'Mulher', salario_mediano: 1900, saldo: 100 },
          { sexo: 'Homem', salario_mediano: 2079.17, saldo: 50 },
        ],
      },
    }

    expect(getTerritorialSalaryMedian(overview, 'admissao')).toBe(2000)

    overview.salary_profiles.sexo.reverse()
    expect(getTerritorialSalaryMedian(overview, 'admissao')).toBe(2000)
  })

  it('returns null when the institutional summary is absent or legacy', () => {
    const overview = {
      salary_summary: undefined,
      salary_profiles: {
        sexo: [{ sexo: 'Mulher', salario_mediano: 1900 }],
      },
    }

    expect(getTerritorialSalaryMedian(overview)).toBeNull()
    expect(
      getTerritorialSalaryMedian({ salary_summary: { median: 2000 } }),
    ).toBeNull()
  })

  it('keeps admissions and terminations independent', () => {
    const termination = {
      salary_summary: {
        movement: 'desligamento',
        n: 4,
        mean: 2507.06,
        median: 2022.67,
      },
    }

    expect(getTerritorialSalarySummary(termination, 'desligamento')).toEqual({
      movement: 'desligamento',
      n: 4,
      mean: 2507.06,
      median: 2022.67,
    })
    expect(getTerritorialSalarySummary(termination, 'admissao')).toBeNull()
  })

  it('returns null for a non-finite territorial median', () => {
    expect(
      getTerritorialSalaryMedian({
        salary_summary: {
          movement: 'admissao',
          n: 1,
          mean: 2000,
          median: Number.NaN,
        },
      }),
    ).toBeNull()
  })

  it('removes raw salary extremes from salary tables', () => {
    expect(
      salaryColumnsForDisplay([
        'sexo',
        'salario_medio',
        'salario_min',
        'salario_max',
        'salario_mediano',
      ]),
    ).toEqual(['sexo', 'salario_medio', 'salario_mediano'])
  })

  it('wires all salary surfaces to the selected movement', () => {
    expect(DEFAULT_SALARY_MOVEMENT).toBe('admissao')
    expect(salaryPageSource).toContain(
      'getTerritorialSalarySummary(currentOverview, movement)',
    )
    expect(salaryPageSource).toContain('movimento: movement')
    expect(salaryPageSource).toContain('SalaryMovementToggle')
    expect(salaryPageSource).toContain('Salário médio nominal')
    expect(salaryPageSource).toContain('Salário mediano nominal')
    expect(salaryPageSource).toContain('SALARY_METHODOLOGY')
    expect(salaryPageSource).toContain('Gold salarial separada por movimento')
    expect(salaryPageSource).not.toMatch(/salary_profiles\[[^\]]+\]\?\.\[0\]/)
  })
})
