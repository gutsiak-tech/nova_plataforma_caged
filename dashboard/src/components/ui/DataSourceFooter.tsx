import { Info } from 'lucide-react'
import { DATA_PIPELINE_UPDATED_AT_LABEL } from '../../lib/dataSourceMeta'
import { theme } from '../../lib/theme'

export function DataSourceFooter() {
  return (
    <p className={theme.dataSourceFooter.className}>
      <Info className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
      <span>
        Fonte: <span className="text-slate-400">Novo CAGED</span> · Dados com ajustes · Atualizado em{' '}
        <span className="font-medium text-sky-400/90">{DATA_PIPELINE_UPDATED_AT_LABEL}</span>
      </span>
    </p>
  )
}
