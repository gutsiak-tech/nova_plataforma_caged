import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import type { Scope } from '../../api/types'
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

type StageFrame = TerritorialStageBox & {
  poseKey: 'landing' | 'detail'
  duration: number
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
  const reduced = useReducedMotion() === true
  const pose = resolveTerritorialPose(pathname)
  const poseKey: 'landing' | 'detail' = pose.kind === 'detail' ? 'detail' : 'landing'
  const detailScope = pose.kind === 'detail' ? pose.scope : null
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

  const landingSlotRef = useCallback((node: HTMLDivElement | null) => {
    landingNode.current = node
    setSlotsReady((value) => value + 1)
  }, [])
  const detailSlotRef = useCallback((node: HTMLDivElement | null) => {
    detailNode.current = node
    setSlotsReady((value) => value + 1)
  }, [])

  const measure = useCallback((): TerritorialStageBox | null => {
    const slot = (poseKey === 'detail' ? detailNode : landingNode).current
    const root = rootRef.current
    if (!slot || !root) return null
    const slotRect = slot.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    if (slotRect.width < 2 || slotRect.height < 2) return null
    return {
      left: slotRect.left - rootRect.left,
      top: slotRect.top - rootRect.top,
      width: slotRect.width,
      height: slotRect.height,
    }
  }, [poseKey])

  useLayoutEffect(() => {
    const next = measure()
    if (!next) {
      setFrame((current) => {
        const slot = (poseKey === 'detail' ? detailNode : landingNode).current
        if (!slot) return null
        return current
      })
    } else {
      setFrame((current) => {
        if (current == null) return { ...next, poseKey, duration: 0 }
        if (current.poseKey !== poseKey) {
          return { ...next, poseKey, duration: territorialMoveDuration(reduced) }
        }
        if (current.duration > 0) return { ...next, poseKey, duration: current.duration }
        return { ...next, poseKey, duration: 0 }
      })
    }

    const slot = (poseKey === 'detail' ? detailNode : landingNode).current
    const root = rootRef.current
    if (!slot || !root) return
    const follow = () => {
      const resized = measure()
      if (!resized) return
      setFrame((current) => {
        if (!current || current.duration > 0) return current
        if (sameBox(current, resized)) return current
        return { ...resized, poseKey: current.poseKey, duration: 0 }
      })
    }
    const observer = new ResizeObserver(follow)
    observer.observe(slot)
    observer.observe(root)
    const layer = slot.closest('.territorial-experience-layer')
    layer?.addEventListener('scroll', follow, { passive: true })
    return () => {
      observer.disconnect()
      layer?.removeEventListener('scroll', follow)
    }
  }, [measure, poseKey, reduced, scope, slotsReady])

  function releaseMove() {
    setFrame((current) => {
      if (!current || current.duration === 0) return current
      const next = measure()
      if (!next) return { ...current, duration: 0 }
      return { ...next, poseKey: current.poseKey, duration: 0 }
    })
  }

  if (pose.kind === 'invalid') {
    return <Navigate to={territorialLandingLocation(search)} replace />
  }

  const activeModel = mapModel?.scope === scope ? mapModel : null

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
        />
      </div>
      {frame ? (
        <TerritorialMapStage
          scope={scope}
          pose={poseKey}
          box={frame}
          duration={frame.duration}
          reducedMotion={reduced}
          model={activeModel}
          onMoveComplete={releaseMove}
        />
      ) : null}
      <Outlet />
    </div>
  )
}
