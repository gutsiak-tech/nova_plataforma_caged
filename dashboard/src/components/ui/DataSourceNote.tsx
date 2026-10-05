import { useMonth } from '../../context/MonthContext'
import { useScope } from '../../context/ScopeContext'
import { labelScope } from '../../lib/format'
import { theme } from '../../lib/theme'

export function DataSourceNote({ compact = false }: { compact?: boolean }) {
  const { label } = useMonth()
  const { scope } = useScope()

  if (compact) {
    return (
      <p className={theme.dataSourceNote.compactClass}>
        Fonte: <span className={theme.dataSourceNote.highlightClass}>Novo CAGED</span> · Gold local ·{' '}
        <span className={theme.dataSourceNote.highlightClass}>{label}</span> ·{' '}
        <span className={theme.dataSourceNote.highlightClass}>{labelScope(scope)}</span>
      </p>
    )
  }

  return (
    <div className={theme.dataSourceNote.panelClass}>
      <p className={theme.dataSourceNote.titleClass}>Sobre os dados exibidos</p>
      <p className="mt-2">
        Indicadores derivados do <span className={theme.dataSourceNote.highlightClass}>Novo CAGED</span>, processados
        localmente (Bronze, Silver, Gold). Competência ativa:{' '}
        <span className={theme.dataSourceNote.highlightClass}>{label}</span>. Escopo:{' '}
        <span className={theme.dataSourceNote.highlightClass}>{labelScope(scope)}</span>.
      </p>
      <p className="mt-2">
        Atualização mensal depende do microdados oficial e da execução do pipeline institucional.
      </p>
    </div>
  )
}
