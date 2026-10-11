import { describe, expect, it } from 'vitest'
import {
  FEATURE_AGE_ORDER,
  FEATURE_SCHOOLING_ORDER,
  profileComparisonRows,
  profileShareWidth,
} from './featureProfiles'

describe('feature profile comparison', () => {
  it('keeps sex on an absolute 0–100 scale', () => {
    const rows = profileComparisonRows([
      { label: 'Homem', value: 536 },
      { label: 'Mulher', value: 464 },
    ])
    expect(rows.map((row) => row.width)).toEqual(['53.6%', '46.4%'])
    expect(rows[0]?.width).not.toBe('100%')
  })

  it('preserves API order for sex and does not turn a null into zero', () => {
    const rows = profileComparisonRows([
      { label: 'Mulher', value: 40 },
      { label: 'Homem', value: null },
      { label: 'Não identificado', value: 60 },
    ])
    expect(rows.map((row) => row.label)).toEqual(['Mulher', 'Não identificado'])
    expect(rows.map((row) => row.share)).toEqual([0.4, 0.6])
  })

  it('orders age chronologically, including bands the parquet appends at the end', () => {
    const rows = profileComparisonRows(
      [
        { label: '65 anos ou mais', value: 900 },
        { label: '18 a 24 anos', value: 10 },
        { label: 'Ignorado', value: 0 },
        { label: 'Até 17 anos', value: 50 },
        { label: '30 a 39 anos', value: 40 },
      ],
      FEATURE_AGE_ORDER,
    )
    expect(rows.map((row) => row.label)).toEqual([
      'Até 17 anos',
      '18 a 24 anos',
      '30 a 39 anos',
      '65 anos ou mais',
      'Ignorado',
    ])
    expect(rows.find((row) => row.label === 'Ignorado')?.share).toBe(0)
    expect(rows.find((row) => row.label === '18 a 24 anos')?.width).toBe('1%')
  })

  it('does not invent an age band that is absent', () => {
    const rows = profileComparisonRows([{ label: '18 a 24 anos', value: 8 }], FEATURE_AGE_ORDER)
    expect(rows.map((row) => row.label)).toEqual(['18 a 24 anos'])
  })

  it('reorders schooling semantically without renaming labels or filling gaps', () => {
    const rows = profileComparisonRows(
      [
        { label: '5ª Completo Fundamental', value: 2 },
        { label: 'Doutorado', value: 1 },
        { label: 'Analfabeto', value: 4 },
        { label: 'Médio Completo', value: 80 },
        { label: 'Superior Completo', value: 5 },
        { label: 'Pós-Graduação completa', value: 3 },
        { label: 'Mestrado', value: 0 },
        { label: 'Curso não mapeado', value: 5 },
      ],
      FEATURE_SCHOOLING_ORDER,
    )
    expect(rows.map((row) => row.label)).toEqual([
      'Analfabeto',
      '5ª Completo Fundamental',
      'Médio Completo',
      'Superior Completo',
      'Pós-Graduação completa',
      'Mestrado',
      'Doutorado',
      'Curso não mapeado',
    ])
    expect(rows.find((row) => row.label === 'Mestrado')?.width).toBe('0%')
    expect(rows.find((row) => row.label === 'Médio Completo')?.share).toBe(0.8)
    expect(rows.some((row) => row.label === 'Médio Incompleto')).toBe(false)
  })

  it('leaves an all-zero block without a fake percentage', () => {
    const rows = profileComparisonRows([
      { label: 'Homem', value: 0 },
      { label: 'Mulher', value: 0 },
    ])
    expect(rows.map((row) => row.share)).toEqual([null, null])
    expect(rows.map((row) => row.width)).toEqual([null, null])
  })

  it('clamps only the rendered width', () => {
    expect(profileShareWidth(null)).toBeNull()
    expect(profileShareWidth(Number.NaN)).toBeNull()
    expect(profileShareWidth(0)).toBe('0%')
    expect(profileShareWidth(1.4)).toBe('100%')
    expect(profileShareWidth(-0.2)).toBe('0%')
  })
})
