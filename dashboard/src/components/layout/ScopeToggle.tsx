import clsx from 'clsx'
import { useScope } from '../../context/ScopeContext'
import type { Scope } from '../../api/types'
import { labelScope } from '../../lib/format'
import { theme } from '../../lib/theme'

const options: { id: Scope; hint: string }[] = [
  { id: 'br', hint: 'Brasil — visão nacional consolidada' },
  { id: 'pr', hint: 'Paraná — recorte estadual' },
  { id: 'rmc', hint: 'Região Metropolitana de Curitiba' },
]

export function ScopeToggle() {
  const { scope, setScope } = useScope()

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <span className={theme.selector.labelClass}>Escopo</span>
      <div
        className={theme.selector.containerClass}
        role="group"
        aria-label="Selecionar escopo geográfico"
      >
        {options.map((o) => {
          const active = scope === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setScope(o.id)}
              title={o.hint}
              aria-pressed={active}
              aria-label={`Escopo ${labelScope(o.id)}`}
              className={clsx(
                theme.selector.toggleButtonBaseClass,
                theme.selector.scopeButtonClass,
                active
                  ? theme.selector.toggleButtonActiveClass
                  : theme.selector.toggleButtonInactiveClass,
              )}
            >
              {labelScope(o.id)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
