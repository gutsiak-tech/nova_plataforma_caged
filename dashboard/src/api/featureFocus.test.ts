import { describe, expect, it } from 'vitest'
import {
  clearFeatureFocusCache,
  featureFocusCacheKey,
  parseFeatureFocusPayload,
  peekFeatureFocus,
  rememberFeatureFocus,
  type FeatureFocusPayload,
} from './featureFocus'

const payload = {
  identity: {
    level: 'uf',
    id: 'SP',
    name: 'São Paulo',
    cod_uf: '35',
    uf_sigla: 'SP',
    uf: 'São Paulo',
    uf_norm: 'SAO PAULO',
    parent: { level: 'brasil', id: 'BR', name: 'Brasil' },
  },
  period: { ano: 2026, mes: 2 },
  kpis: { admissoes: 770074, desligamentos: 674178, saldo: 95896 },
  salary: {
    movimento: 'admissao',
    n_salarios_validos: 748832,
    salario_medio: 2593.0005,
    salario_mediano: 2110,
  },
  sectors: { limit: 5, total: 22, by_saldo: [], by_admissoes: [], by_desligamentos: [] },
  occupations: { limit: 5, total: 2228, by_saldo: [], by_admissoes: [], by_desligamentos: [] },
  profiles: { sexo: [], faixa_etaria: [], graudeinstrucao: [] },
  timeseries: [{ ano: 2026, mes: 2, admissoes: 770074, desligamentos: 674178, saldo: 95896 }],
  comparison: { parents: [] },
}

describe('feature focus payload', () => {
  it('reads the API contract without inventing missing numbers', () => {
    const parsed = parseFeatureFocusPayload(payload)
    expect(parsed?.kpis).toEqual({ admissoes: 770074, desligamentos: 674178, saldo: 95896 })
    expect(parsed?.salary?.salario_mediano).toBe(2110)
    expect(parseFeatureFocusPayload({ identity: { level: 'uf', id: 'SP' } })).toBeNull()
    expect(parseFeatureFocusPayload({ ...payload, salary: null })?.salary).toBeNull()
  })

  it('reuses a cached feature for the same level, id and competência', () => {
    clearFeatureFocusCache()
    const parsed = parseFeatureFocusPayload(payload) as FeatureFocusPayload
    rememberFeatureFocus('br', 2026, 2, parsed)
    expect(peekFeatureFocus('br', 'SP', 2026, 2)?.kpis.admissoes).toBe(770074)
    expect(peekFeatureFocus('br', 'SP', 2026, 3)).toBeNull()
    expect(peekFeatureFocus('pr', '4106902', 2026, 2)).toBeNull()
    expect(featureFocusCacheKey('municipality', '4106902', 2026, 2, 'admissao')).toBe(
      'municipality:4106902:2026:2:admissao',
    )
  })
})
