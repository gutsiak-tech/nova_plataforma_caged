export type Scope = 'br' | 'pr' | 'rmc'

export type GoldRow = Record<string, unknown>

export type Competencia = {
  ano: number
  mes: number
  competencia: string
  label: string
}

export type CompetenciasResponse = {
  default: Competencia | null
  items: Competencia[]
}

export type TableResponse = {
  month: { ano: number; mes: number }
  scope: Scope
  table: string
  columns: string[]
  total: number
  offset: number
  count: number
  rows: GoldRow[]
}

export type OverviewResponse = {
  month: { ano: number; mes: number }
  scope: Scope
  resumo: GoldRow | null
  rankings: {
    uf: GoldRow[] | null
    municipio: GoldRow[]
    setor: GoldRow[]
    ocupacao: GoldRow[]
  }
  profiles: Record<string, GoldRow[]>
  salary_profiles: Record<string, GoldRow[]>
}
