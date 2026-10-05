import { useCallback, useEffect, useRef, useState } from 'react'
import { scheduleAsyncState } from './scheduleAsyncState'

/** Evita tela de loading completa ao refetch por troca de escopo ou competência. */
export function useScopeStableLoading<T>(data: T | null) {
  const [loading, setLoading] = useState(data === null)
  const [refreshing, setRefreshing] = useState(false)
  const hadDataRef = useRef(data !== null)

  useEffect(() => {
    if (data !== null) {
      hadDataRef.current = true
    }
  }, [data])

  const beginFetch = useCallback((isCancelled: () => boolean, onReset?: () => void) => {
    scheduleAsyncState(isCancelled, () => {
      onReset?.()
      if (hadDataRef.current) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
    })
  }, [])

  const endFetch = useCallback(() => {
    setLoading(false)
    setRefreshing(false)
  }, [])

  const shellClass = refreshing
    ? 'transition-opacity duration-200 ease-out opacity-[0.88]'
    : ''

  return {
    loading,
    refreshing,
    beginFetch,
    endFetch,
    shellClass,
    showInitialLoader: loading && data === null,
  }
}
