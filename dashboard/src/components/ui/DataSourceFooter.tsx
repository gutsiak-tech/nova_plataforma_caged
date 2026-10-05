import { Info } from 'lucide-react'
import { DATA_SOURCE_FOOTER_LABEL } from '../../lib/dataSourceMeta'
import { theme } from '../../lib/theme'

export function DataSourceFooter() {
  return (
    <p className={theme.dataSourceFooter.className}>
      <Info className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
      <span>{DATA_SOURCE_FOOTER_LABEL}</span>
    </p>
  )
}
