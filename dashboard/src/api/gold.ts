import { DEFAULT_API_ANO, DEFAULT_API_MES } from './constants'
import { http } from './http'
import type {
  CompetenciasResponse,
  OverviewResponse,
  SalaryMovement,
  Scope,
  TableResponse,
} from './types'

export async function fetchCompetencias(): Promise<CompetenciasResponse> {
  const { data } = await http.get<CompetenciasResponse>('/api/gold/v1/competencias')
  return data
}

export async function fetchOverview(
  scope: Scope,
  ano: number,
  mes: number,
  movimento: SalaryMovement = 'admissao',
): Promise<OverviewResponse> {
  const { data } = await http.get<OverviewResponse>('/api/gold/v1/overview', {
    params: { scope, ano, mes, movimento },
  })
  return data
}

export async function fetchTable(
  baseName: string,
  scope: Scope,
  ano: number,
  mes: number,
  opts?: {
    limit?: number
    offset?: number
    sort_by?: string
    sort_dir?: 'asc' | 'desc'
    movimento?: SalaryMovement
  },
): Promise<TableResponse> {
  const { data } = await http.get<TableResponse>(`/api/gold/v1/table/${baseName}`, {
    params: {
      scope,
      ano,
      mes,
      limit: opts?.limit ?? 2000,
      offset: opts?.offset ?? 0,
      sort_by: opts?.sort_by,
      sort_dir: opts?.sort_dir ?? 'desc',
      movimento: opts?.movimento,
    },
  })
  return data
}

/** Fallback local quando /competencias não responde. */
export function buildFallbackCompetencias(): CompetenciasResponse['items'] {
  return [
    {
      ano: DEFAULT_API_ANO,
      mes: 1,
      competencia: `${DEFAULT_API_ANO}-01`,
      label: 'Janeiro de 2026',
    },
    {
      ano: DEFAULT_API_ANO,
      mes: 2,
      competencia: `${DEFAULT_API_ANO}-02`,
      label: 'Fevereiro de 2026',
    },
  ]
}

export function buildFallbackDefault(): CompetenciasResponse['default'] {
  return {
    ano: DEFAULT_API_ANO,
    mes: DEFAULT_API_MES,
    competencia: `${DEFAULT_API_ANO}-${String(DEFAULT_API_MES).padStart(2, '0')}`,
    label: DEFAULT_API_MES === 1 ? 'Janeiro de 2026' : 'Fevereiro de 2026',
  }
}
