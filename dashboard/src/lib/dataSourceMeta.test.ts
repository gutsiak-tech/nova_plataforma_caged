import { describe, expect, it } from 'vitest'
import { DATA_SOURCE_FOOTER_LABEL } from './dataSourceMeta'

describe('dataSourceMeta', () => {
  it('does not claim an update timestamp without authoritative metadata', () => {
    expect(DATA_SOURCE_FOOTER_LABEL).toBe('Fonte: Novo CAGED · Dados com ajustes')
    expect(DATA_SOURCE_FOOTER_LABEL).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(DATA_SOURCE_FOOTER_LABEL).not.toContain('Atualizado em')
  })
})
