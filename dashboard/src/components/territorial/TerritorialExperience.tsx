import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import type { Scope } from '../../api/types'
import { useMonth } from '../../context/MonthContext'
import { TerritorialDetailPage } from '../../pages/TerritorialDetailPage'
import { TerritorialLandingPage } from '../../pages/TerritorialLandingPage'
import {
  resolveTerritorialPose,
  territorialLandingLocation,
  territorialMoveDuration,
} from '../../lib/territorialPose'
import {
  TerritorialMapStage,
  type TerritorialMapModel,
  type TerritorialStageBox,
} from './TerritorialMapStage'
import { TerritorialRouteLoading } from './TerritorialRouteLoading'
import { loadTerritorialFirstPaint, type TerritorialFirstPaint } from './territorialFirstPaint'

type StageFrame = TerritorialStageBox & {
  poseKey: 'landing' | 'detail'
  duration: number
  landing: TerritorialStageBox
  detail: TerritorialStageBox
}

function measureNode(node: HTMLElement | null, root: HTMLElement): TerritorialStageBox | null {
  if (!node) return null
  const slotRect = node.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  if (slotRect.width < 2 || slotRect.height < 2) return null
  return {
    left: slotRect.left - rootRect.left,
    top: slotRect.top - rootRect.top,
    width: slotRect.width,
    height: slotRect.height,
  }
}

function sameBox(a: TerritorialStageBox, b: TerritorialStageBox): boolean {
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
}

export function TerritorialExperience() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const { ano, mes } = useMonth()
  const reduced = useReducedMotion() === true
  const pose = resolveTerritorialPose(pathname)
  const poseKey: 'landing' | 'detail' = pose.kind === 'detail' ? 'detail' : 'landing'
  const detailScope = pose.kind === 'detail' ? pose.scope : null
  const bootScope: Scope = detailScope ?? 'br'
  const requestKey = pose.kind === 'invalid' ? null : `${pose.kind}:${bootScope}:${ano}:${mes}`
  const [paint, setPaint] = useState<TerritorialFirstPaint | null>(null)
  const detailRetryRef = useRef<() => void>(() => {})
  const [picked, setPicked] = useState<Scope>(detailScope ?? 'br')
  const [mapModel, setMapModel] = useState<TerritorialMapModel | null>(null)
  const [frame, setFrame] = useState<StageFrame | null>(null)
  const [slotsReady, setSlotsReady] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const landingNode = useRef<HTMLDivElement>(null)
  const detailNode = useRef<HTMLDivElement>(null)

  const scope: Scope = detailScope ?? picked
  if (detailScope && picked !== detailScope) setPicked(detailScope)
  const search = searchParams.toString()
  const moveMs = territorialMoveDuration(reduced)

  useEffect(() => {
    if (!requestKey || paint || pose.kind === 'invalid') return
    let cancelled = false
    const request =
      pose.kind === 'detail'
        ? { kind: 'detail' as const, scope: bootScope, ano, mes }
        : { kind: 'landing' as const, ano, mes }
    loadTerritorialFirstPaint(request).then((result) => {
      if (!cancelled) setPaint((current) => current ?? result)
    })
    return () => {
      cancelled = true
    }
  }, [requestKey, pose.kind, bootScope, ano, mes, paint])

  const bindDetailRetry = useCallback((retry: () => void) => {
    detailRetryRef.current = retry
  }, [])

  const bootModel = useMemo<TerritorialMapModel | null>(() => {
    if (!paint || paint.kind !== 'detail' || paint.scope !== scope) return null
    return {
      scope: paint.scope,
      rows: paint.table?.rows ?? [],
      loading: false,
      error: paint.tableError,
      dataKey: `${paint.key}:0`,
      onRetry: () => detailRetryRef.current(),
    }
  }, [paint, scope])

  const landingSlotRef = useCallback((node: HTMLDivElement | null) => {
    landingNode.current = node
    setSlotsReady((value) => value + 1)
  }, [])
  const detailSlotRef = useCallback((node: HTMLDivElement | null) => {
    detailNode.current = node
    setSlotsReady((value) => value + 1)
  }, [])

  const readPair = useCallback(() => {
    const root = rootRef.current
    if (!root) return null
    const landing = measureNode(landingNode.current, root)
    const detail = measureNode(detailNode.current, root)
    const active = poseKey === 'detail' ? detail : landing
    if (!active) return null
    return {
      active,
      landing: landing ?? active,
      detail: detail ?? active,
    }
  }, [poseKey])

  useLayoutEffect(() => {
    const next = readPair()
    if (!next) {
      setFrame((current) => {
        const slot = (poseKey === 'detail' ? detailNode : landingNode).current
        if (!slot) return null
        return current
      })
    } else {
      setFrame((current) => {
        const pair = { landing: next.landing, detail: next.detail }
        if (current == null) return { ...next.active, poseKey, duration: 0, ...pair }
        if (current.poseKey !== poseKey) {
          return {
            ...next.active,
            poseKey,
            duration: territorialMoveDuration(reduced),
            landing: current.landing,
            detail: current.detail,
          }
        }
        if (current.duration > 0) {
          return {
            ...next.active,
            poseKey,
            duration: current.duration,
            landing: current.landing,
            detail: current.detail,
          }
        }
        return { ...next.active, poseKey, duration: 0, ...pair }
      })
    }

    const slot = (poseKey === 'detail' ? detailNode : landingNode).current
    const root = rootRef.current
    if (!slot || !root) return
    const follow = () => {
      const resized = readPair()
      if (!resized) return
      setFrame((current) => {
        if (!current || current.duration > 0) return current
        if (sameBox(current, resized.active) && sameBox(current.landing, resized.landing) && sameBox(current.detail, resized.detail)) {
          return current
        }
        return {
          ...resized.active,
          poseKey: current.poseKey,
          duration: 0,
          landing: resized.landing,
          detail: resized.detail,
        }
      })
    }
    const observer = new ResizeObserver(follow)
    observer.observe(slot)
    observer.observe(root)
    const landingSlot = landingNode.current
    const detailSlot = detailNode.current
    if (landingSlot && landingSlot !== slot) observer.observe(landingSlot)
    if (detailSlot && detailSlot !== slot) observer.observe(detailSlot)
    const layer = slot.closest('.territorial-experience-layer')
    layer?.addEventListener('scroll', follow, { passive: true })
    return () => {
      observer.disconnect()
      layer?.removeEventListener('scroll', follow)
    }
  }, [readPair, poseKey, reduced, scope, slotsReady, paint])

  function releaseMove() {
    setFrame((current) => {
      if (!current || current.duration === 0) return current
      const next = readPair()
      if (!next) return { ...current, duration: 0 }
      return {
        ...next.active,
        poseKey: current.poseKey,
        duration: 0,
        landing: next.landing,
        detail: next.detail,
      }
    })
  }

  if (pose.kind === 'invalid') {
    return <Navigate to={territorialLandingLocation(search)} replace />
  }

  if (!paint) return <TerritorialRouteLoading />

  const activeModel = mapModel?.scope === scope ? mapModel : bootModel
  const posePending = frame != null && frame.poseKey !== poseKey
  const stageDuration = frame == null ? 0 : posePending ? moveMs : frame.duration

  return (
    <div ref={rootRef} className="territorial-experience">
      <div
        className="territorial-experience-layer"
        data-layer="landing"
        data-active={poseKey === 'landing' ? 'true' : 'false'}
        inert={poseKey !== 'landing'}
        aria-hidden={poseKey !== 'landing'}
        style={{ transitionDuration: `${moveMs}ms` }}
      >
        <TerritorialLandingPage
          selected={scope}
          onSelectedChange={setPicked}
          initialPaint={paint.kind === 'landing' ? paint : null}
          mapSlot={
            <div
              ref={landingSlotRef}
              className="relative aspect-square h-[min(18rem,68vw)] w-auto max-w-full lg:h-[clamp(20rem,48vh,32rem)]"
            />
          }
        />
      </div>
      <div
        className="territorial-experience-layer"
        data-layer="detail"
        data-active={poseKey === 'detail' ? 'true' : 'false'}
        inert={poseKey !== 'detail'}
        aria-hidden={poseKey !== 'detail'}
        style={{ transitionDuration: `${moveMs}ms` }}
      >
        <TerritorialDetailPage
          scope={scope}
          active={poseKey === 'detail'}
          mapSlotRef={detailSlotRef}
          onMapModel={setMapModel}
          initialPaint={paint.kind === 'detail' ? paint : null}
          onBindRetry={bindDetailRetry}
        />
      </div>
      {frame ? (
        <TerritorialMapStage
          scope={scope}
          pose={poseKey}
          box={frame}
          landingBox={frame.landing}
          detailBox={frame.detail}
          duration={stageDuration}
          reducedMotion={reduced}
          model={activeModel}
          onMoveComplete={releaseMove}
        />
      ) : null}
      <Outlet />
    </div>
  )
}
