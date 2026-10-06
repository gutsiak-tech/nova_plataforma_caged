import { describe, expect, it } from 'vitest'
import type { OverviewResponse, Scope } from '../api/types'
import { GEO_URL_BY_SCOPE } from '../components/map/territoryBackgroundConfig'
import {
  finiteSaldo,
  profileLeaders,
  rankTerritorialUnits,
  territorialComposition,
  TERRITORIAL_GEOGRAPHY,
  topBySaldo,
  uniqueSaldoLeader,
} from './territorialDetail'

describe('territorial detail geography', () => {
  it('keeps Brasil on states and Paraná/RMC on the existing municipal meshes', () => {
    const cases: Array<[Scope, string, string]> = [
      ['br', 'uf_norm', '/geo/ufs.geojson'],
      ['pr', 'municipio_norm', '/geo/municipios_pr.geojson'],
      ['rmc', 'municipio_norm', '/geo/municipios_rmc.geojson'],
    ]

    for (const [scope, joinProperty, geoUrl] of cases) {
      expect(TERRITORIAL_GEOGRAPHY[scope].joinProperty).toBe(joinProperty)
      expect(TERRITORIAL_GEOGRAPHY[scope].geoUrl).toBe(geoUrl)
      expect(TERRITORIAL_GEOGRAPHY[scope].geoUrl).toBe(GEO_URL_BY_SCOPE[scope])
    }

    expect(TERRITORIAL_GEOGRAPHY.br.labelKey).toBe('uf')
    expect(TERRITORIAL_GEOGRAPHY.pr.labelKey).toBe('municipio')
    expect(TERRITORIAL_GEOGRAPHY.rmc.labelKey).toBe('municipio')
    expect(TERRITORIAL_GEOGRAPHY.br.rankTitle).toBe('UFs por saldo')
    expect(TERRITORIAL_GEOGRAPHY.pr.rankTitle).toBe('Municípios por saldo')
  })
})

describe('territorial saldo ranking', () => {
  it('ranks by saldo and does not turn missing values into zero', () => {
    expect(finiteSaldo(null)).toBeNull()
    expect(finiteSaldo(undefined)).toBeNull()
    expect(finiteSaldo('')).toBeNull()
    expect(finiteSaldo('n/d')).toBeNull()
    expect(finiteSaldo(0)).toBe(0)
    expect(finiteSaldo('8')).toBe(8)

    expect(
      rankTerritorialUnits(
        [
          { uf: 'Paraná', saldo: null },
          { uf: 'São Paulo' },
          { uf: 'Rio de Janeiro', saldo: '' },
          { uf: 'Acre', saldo: 'n/d' },
          { uf: '  ', saldo: 20 },
          { uf: 'Pará', saldo: 0 },
          { uf: 'Bahia', saldo: 3 },
          { uf: 'Amazonas', saldo: '8' },
        ],
        'br',
      ),
    ).toEqual([
      { label: 'Amazonas', saldo: 8 },
      { label: 'Bahia', saldo: 3 },
      { label: 'Pará', saldo: 0 },
    ])
  })

  it('breaks saldo ties by name and respects the limit', () => {
    expect(
      rankTerritorialUnits(
        [
          { uf: 'Bahia', saldo: 5 },
          { uf: 'Acre', saldo: 5 },
          { uf: 'Ceará', saldo: 1 },
        ],
        'br',
        2,
      ),
    ).toEqual([
      { label: 'Acre', saldo: 5 },
      { label: 'Bahia', saldo: 5 },
    ])
  })

  it('uses the municipality name for Paraná and RMC', () => {
    const rows = [
      { uf: 'Paraná', municipio: 'Curitiba', saldo: 2 },
      { uf: 'Paraná', municipio: 'Londrina', saldo: 5 },
      { uf: 'Paraná', saldo: 9 },
    ]
    expect(rankTerritorialUnits(rows, 'pr')).toEqual([
      { label: 'Londrina', saldo: 5 },
      { label: 'Curitiba', saldo: 2 },
    ])
    expect(rankTerritorialUnits(rows, 'rmc')).toEqual([
      { label: 'Londrina', saldo: 5 },
      { label: 'Curitiba', saldo: 2 },
    ])
  })
})

describe('territorial composition', () => {
  it('ranks sectors and occupations by saldo, not by admissions', () => {
    expect(
      topBySaldo(
        [
          { secao: 'Comércio', saldo: 10, admissoes: 1 },
          { secao: 'Indústria', saldo: 4, admissoes: 999 },
          { secao: 'Serviços', saldo: 7, admissoes: 2 },
          { secao: 'Agropecuária', saldo: null, admissoes: 500 },
          { secao: 'Extrativa', saldo: 1, admissoes: 40 },
        ],
        'secao',
        3,
      ),
    ).toEqual([
      { label: 'Comércio', saldo: 10 },
      { label: 'Serviços', saldo: 7 },
      { label: 'Indústria', saldo: 4 },
    ])
  })

  it('omits a profile dimension when the highest saldo is tied', () => {
    expect(uniqueSaldoLeader([{ sexo: 'Mulher', saldo: 4 }, { sexo: 'Homem', saldo: 4 }], 'sexo')).toBeNull()
    expect(
      profileLeaders({
        graudeinstrucao: [
          { graudeinstrucao: 'Médio completo', saldo: 10 },
          { graudeinstrucao: 'Superior completo', saldo: 4 },
        ],
        faixa_etaria: [
          { faixa_etaria: '18 a 24 anos', saldo: 3 },
          { faixa_etaria: '25 a 29 anos', saldo: 3 },
        ],
        sexo: [
          { sexo: 'Mulher', saldo: 8 },
          { sexo: 'Homem', saldo: 2 },
        ],
      }),
    ).toEqual([
      { dimension: 'Grau de instrução', label: 'Médio completo', saldo: 10 },
      { dimension: 'Sexo', label: 'Mulher', saldo: 8 },
    ])
  })

  it('reads territorial salary only from the institutional admissions summary', () => {
    const overview = {
      salary_summary: {
        movement: 'desligamento',
        n: 10,
        mean: 3000,
        median: 2500,
      },
      rankings: {
        uf: null,
        municipio: [],
        setor: [{ secao: 'Comércio', saldo: 12 }],
        ocupacao: [{ cbo2002ocupacao: 'Vendedor', saldo: 6 }],
      },
      profiles: {},
    } as Pick<OverviewResponse, 'rankings' | 'profiles' | 'salary_summary'>

    expect(territorialComposition(overview)).toEqual({
      remuneration: null,
      sectors: [{ label: 'Comércio', saldo: 12 }],
      occupations: [{ label: 'Vendedor', saldo: 6 }],
      profile: [],
    })
  })

  it('returns an empty composition when the overview is absent', () => {
    expect(territorialComposition(null)).toEqual({
      remuneration: null,
      sectors: [],
      occupations: [],
      profile: [],
    })
  })
})
