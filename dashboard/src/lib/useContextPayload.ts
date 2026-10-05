import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyContextPayload,
  payloadForContext,
  type ContextPayload,
  type RequestContextKey,
} from './requestContext'

export function useContextPayload<T>(activeKey: RequestContextKey) {
  const activeKeyRef = useRef(activeKey)
  const [payload, setPayload] = useState<ContextPayload<T> | null>(null)

  useEffect(() => {
    activeKeyRef.current = activeKey
  }, [activeKey])

  const commit = useCallback((requestKey: RequestContextKey, data: T): boolean => {
    if (requestKey !== activeKeyRef.current) return false
    setPayload((current) =>
      applyContextPayload(current, activeKeyRef.current, requestKey, data),
    )
    return true
  }, [])

  const update = useCallback(
    (requestKey: RequestContextKey, apply: (current: T) => T): boolean => {
      if (requestKey !== activeKeyRef.current) return false
      setPayload((current) => {
        if (current?.key !== requestKey) return current
        return { key: requestKey, data: apply(current.data) }
      })
      return true
    },
    [],
  )

  const clear = useCallback((requestKey: RequestContextKey): void => {
    if (requestKey !== activeKeyRef.current) return
    setPayload((current) => (current?.key === requestKey ? null : current))
  }, [])

  return {
    data: payloadForContext(payload, activeKey),
    payload,
    commit,
    update,
    clear,
  }
}
