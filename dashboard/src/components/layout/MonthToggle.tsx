import clsx from 'clsx'
import { useMonth } from '../../context/MonthContext'
import { theme } from '../../lib/theme'

const SHORT_MONTH = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

function shortMonthLabel(mes: number, ano: number): string {
  const month = SHORT_MONTH[mes - 1] ?? String(mes).padStart(2, '0')
  const yearSuffix = String(ano).slice(-2)
  return `${month}/${yearSuffix}`
}

export function MonthToggle() {
  const { competencia, competencias, setCompetencia, loading, label } = useMonth()

  if (loading && competencias.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={theme.selector.labelClass}>Competência</span>
        <div
          className={clsx(theme.selector.containerClass, theme.selector.loadingContainerClass)}
          aria-busy="true"
          aria-label="Carregando competências"
        >
          <span className="px-3 py-1.5 text-sm text-[color:var(--ds-text-secondary)]">...</span>
        </div>
      </div>
    )
  }

  if (competencias.length === 0) {
    return (
      <p className="text-sm text-[color:var(--ds-text-secondary)]">
        Nenhuma competência Gold válida disponível.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={theme.selector.labelClass}>Competência</span>
      <div
        className={clsx(theme.selector.containerClass, 'max-w-full flex-wrap')}
        role="group"
        aria-label="Selecionar competência"
      >
        {competencias.map((item) => {
          const active = competencia === item.competencia
          return (
            <button
              key={item.competencia}
              type="button"
              onClick={() => setCompetencia(item.competencia)}
              title={item.label}
              aria-pressed={active}
              aria-label={`Competência ${item.label}`}
              className={clsx(
                theme.selector.toggleButtonBaseClass,
                theme.selector.monthButtonClass,
                active
                  ? theme.selector.toggleButtonActiveClass
                  : theme.selector.toggleButtonInactiveClass,
              )}
            >
              {shortMonthLabel(item.mes, item.ano)}
            </button>
          )
        })}
      </div>
      <p className="sr-only">
        Competência ativa: {label}. Preservada ao recarregar a página.
      </p>
    </div>
  )
}
