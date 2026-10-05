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
