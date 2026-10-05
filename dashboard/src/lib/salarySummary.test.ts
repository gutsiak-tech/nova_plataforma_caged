import { describe, expect, it } from 'vitest'
import salaryPageSource from '../pages/SalaryPage.tsx?raw'
import { getTerritorialSalaryMedian } from './salarySummary'

describe('territorial salary median', () => {
  it('uses salary_summary instead of the first salary profile group', () => {
    const overview = {
      salary_summary: { median: 2000 },
      salary_profiles: {
        sexo: [
          { sexo: 'Mulher', salario_mediano: 1900, saldo: 100 },
          { sexo: 'Homem', salario_mediano: 2079.17, saldo: 50 },
        ],
      },
    }

    expect(getTerritorialSalaryMedian(overview)).toBe(2000)

    overview.salary_profiles.sexo.reverse()
    expect(getTerritorialSalaryMedian(overview)).toBe(2000)
  })

  it('returns null when the territorial summary is absent', () => {
    const overview = {
      salary_summary: undefined,
      salary_profiles: {
        sexo: [{ sexo: 'Mulher', salario_mediano: 1900 }],
      },
    }

    expect(getTerritorialSalaryMedian(overview)).toBeNull()
  })

  it('returns null for a non-finite territorial median', () => {
    expect(
      getTerritorialSalaryMedian({ salary_summary: { median: Number.NaN } }),
    ).toBeNull()
  })

  it('wires the SalaryPage card to the territorial summary', () => {
    expect(salaryPageSource).toContain('getTerritorialSalaryMedian(ov)')
    expect(salaryPageSource).toContain('Mediana salarial')
    expect(salaryPageSource).not.toMatch(/salary_profiles\[[^\]]+\]\?\.\[0\]/)
  })
})
