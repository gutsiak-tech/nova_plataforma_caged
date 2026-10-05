import type { TableResponse } from '../api/types'

export const COMPLETE_TABLE_PAGE_SIZE = 2000

type PageFetcher = (limit: number, offset: number) => Promise<TableResponse>

export async function fetchCompleteTable(
  fetchPage: PageFetcher,
  pageSize = COMPLETE_TABLE_PAGE_SIZE,
): Promise<TableResponse> {
  const first = await fetchPage(pageSize, 0)
  const rows = [...first.rows]

  while (rows.length < first.total) {
    const page = await fetchPage(pageSize, rows.length)
    if (
      page.total !== first.total ||
      page.scope !== first.scope ||
      page.table !== first.table ||
      page.month.ano !== first.month.ano ||
      page.month.mes !== first.month.mes
    ) {
      throw new Error('Paginação inconsistente para a tabela Gold.')
    }
    if (page.rows.length === 0) {
      throw new Error('Paginação incompleta para a tabela Gold.')
    }
    rows.push(...page.rows)
  }

  return {
    ...first,
    offset: 0,
    count: rows.length,
    rows,
  }
}
