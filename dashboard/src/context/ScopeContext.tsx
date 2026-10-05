import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Scope } from '../api/types'

type ScopeContextValue = {
  scope: Scope
  setScope: (s: Scope) => void
}

const ScopeContext = createContext<ScopeContextValue | null>(null)

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<Scope>('br')

  const setScope = useCallback((s: Scope) => {
    setScopeState(s)
  }, [])

  const value = useMemo(() => ({ scope, setScope }), [scope, setScope])

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext)
  if (!ctx) throw new Error('useScope must be used within ScopeProvider')
  return ctx
}
