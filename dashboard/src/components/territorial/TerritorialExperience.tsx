import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { fetchFeatureFocus, peekFeatureFocus, type FeatureFocusPayload } from '../../api/featureFocus'
import type { Scope } from '../../api/types'
import { useMonth } from '../../context/MonthContext'
import { TerritorialDetailPage } from '../../pages/TerritorialDetailPage'
import { TerritorialLandingPage } from '../../pages/TerritorialLandingPage'
import {
  resolveTerritorialPose,
  territorialFeatureLocation,
  territorialLandingLocation,
  territorialMoveDuration,
  type TerritorialPose,
} from '../../lib/territorialPose'
import {
  TerritorialMapStage,
  type TerritorialFeatureMotion,
  type TerritorialMapModel,
  type TerritorialStageBox,
} from './TerritorialMapStage'
import { TerritorialChrome } from './TerritorialChrome'
import { TerritorialRouteLoading } from './TerritorialRouteLoading'
import { loadTerritorialFirstPaint, type TerritorialFirstPaint } from './territorialFirstPaint'
import { competenceMonthKey } from '../../lib/territorialCompetence'
import {
  featureChromeOnPose,
  featurePanelPending,
  featurePanelRevealed,
  initialFeatureChrome,
  promoteFeaturePanel,
  type FeatureChromeState,
  type FeaturePanelResolution,
} from '../../lib/territorialFeatureChrome'

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

type FeaturePanelResult = FeaturePanelResolution & {
  ano: number
  mes: number
  data: FeatureFocusPayload | null
}

function stageFeature(visual: FeatureChromeState | null, scope: Scope): TerritorialFeatureMotion | null {
  if (!visual || visual.scope !== scope) return null
  if (visual.phase === 'approach') return { id: visual.id, mode: 'approach', instant: false }
  if (visual.phase === 'return') return { id: visual.id, mode: 'return', instant: false }
  return { id: visual.id, mode: 'hold', instant: visual.instant && visual.phase === 'hold' }
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { ano, mes } = useMonth()
  const reduced = useReducedMotion() === true
  const pose = resolveTerritorialPose(pathname)
  const poseKey: 'landing' | 'detail' = pose.kind === 'landing' ? 'landing' : 'detail'
  const detailScope = pose.kind === 'detail' || pose.kind === 'feature' ? pose.scope : null
  const routeFeatureId = pose.kind === 'feature' ? pose.featureId : null
  const bootScope: Scope = detailScope ?? 'br'
  const requestKey =
    pose.kind === 'invalid' ? null : `${pose.kind}:${bootScope}:${routeFeatureId ?? ''}:${ano}:${mes}`
  const [paint, setPaint] = useState<TerritorialFirstPaint | null>(null)
  const detailRetryRef = useRef<() => void>(() => {})
  const [picked, setPicked] = useState<Scope>(detailScope ?? 'br')
  const [mapModel, setMapModel] = useState<TerritorialMapModel | null>(null)
  const [frame, setFrame] = useState<StageFrame | null>(null)
  const [featureVisual, setFeatureVisual] = useState<FeatureChromeState | null>(() =>
    pose.kind === 'feature' ? initialFeatureChrome(pose.scope, pose.featureId) : null,
  )
  const [panelResult, setPanelResult] = useState<FeaturePanelResult | null>(null)
  const panelResultRef = useRef<FeaturePanelResolution | null>(null)
  const panelRequest = useRef(0)
  const poseToken =
    pose.kind === 'feature'
      ? `feature:${pose.scope}:${pose.featureId}`
      : pose.kind === 'detail'
        ? `detail:${pose.scope}`
        : pose.kind
  const poseTokenRef = useRef<string | null>(null)
  const poseRef = useRef<TerritorialPose>(pose)
  poseRef.current = pose
  const [slotsReady, setSlotsReady] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const landingNode = useRef<HTMLDivElement>(null)
  const detailNode = useRef<HTMLDivElement>(null)

  const scope: Scope = detailScope ?? picked
  if (detailScope && picked !== detailScope) setPicked(detailScope)
  const search = searchParams.toString()
  const moveMs = territorialMoveDuration(reduced)
  const monthKey = competenceMonthKey(ano, mes)
  const [settledMonth, setSettledMonth] = useState(monthKey)
  const competenceHold = settledMonth !== monthKey
  const [competenceHost, setCompetenceHost] = useState<HTMLDivElement | null>(null)
  const onCompetenceSettled = useCallback(
    (key: string) => {
      if (key !== monthKey) return
      setSettledMonth((current) => (current === key ? current : key))
    },
    [monthKey],
  )

  useEffect(() => {
    if (!requestKey || paint || pose.kind === 'invalid') return
    let cancelled = false
    const request =
      pose.kind === 'feature'
        ? { kind: 'feature' as const, scope: bootScope, featureId: routeFeatureId ?? '', ano, mes }
        : pose.kind === 'detail'
          ? { kind: 'detail' as const, scope: bootScope, ano, mes }
          : { kind: 'landing' as const, ano, mes }
    loadTerritorialFirstPaint(request).then((result) => {
      if (!cancelled) setPaint((current) => current ?? result)
    })
    return () => {
      cancelled = true
    }
  }, [requestKey, pose.kind, routeFeatureId, bootScope, ano, mes, paint])

  useLayoutEffect(() => {
    if (pose.kind !== 'feature' || !routeFeatureId) return
    const cached = peekFeatureFocus(scope, routeFeatureId, ano, mes)
    if (!cached) return
    const next = { scope, id: routeFeatureId, ano, mes, status: 'ready' as const, data: cached }
    panelResultRef.current = next
    setPanelResult(next)
  }, [pose.kind, routeFeatureId, scope, ano, mes])

  useLayoutEffect(() => {
    const previous = poseTokenRef.current
    if (previous === poseToken) return
    poseTokenRef.current = poseToken
    const current = poseRef.current
    setFeatureVisual((visual) => {
      const committed = visual ? promoteFeaturePanel(visual, panelResultRef.current) : visual
      const next = featureChromeOnPose(committed, previous, current, reduced)
      return next ? promoteFeaturePanel(next, panelResultRef.current) : next
    })
  }, [poseToken, reduced])

  useEffect(() => {
    if (pose.kind !== 'feature' || !routeFeatureId) return
    const targetId = routeFeatureId
    const targetScope = scope
    if (peekFeatureFocus(targetScope, targetId, ano, mes)) return
    const serial = ++panelRequest.current
    let cancelled = false
    const apply = (status: 'ready' | 'error', data: FeatureFocusPayload | null) => {
      if (cancelled || serial !== panelRequest.current) return
      const next = { scope: targetScope, id: targetId, ano, mes, status, data }
      panelResultRef.current = next
      setPanelResult(next)
      setFeatureVisual((current) => (current ? promoteFeaturePanel(current, next) : current))
    }
    fetchFeatureFocus(targetScope, targetId, ano, mes)
      .then((data) => {
        if (data.identity.id !== targetId) return
        apply('ready', data)
      })
      .catch(() => apply('error', null))
    return () => {
      cancelled = true
    }
  }, [pose.kind, routeFeatureId, scope, ano, mes])

  const bindDetailRetry = useCallback((retry: () => void) => {
    detailRetryRef.current = retry
  }, [])

  const bootModel = useMemo<TerritorialMapModel | null>(() => {
    if (!paint || paint.kind === 'landing' || paint.scope !== scope) return null
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

  const onSelectFeature = useCallback(
    (featureId: string) => {
      const current = poseRef.current
      if (current.kind !== 'detail' && current.kind !== 'feature') return
      if (current.kind === 'feature' && current.featureId === featureId) return
      navigate(territorialFeatureLocation(current.scope, featureId, search))
    },
    [navigate, search],
  )

  const onFeatureArrived = useCallback(() => {
    setFeatureVisual((current) => {
      if (!current || current.phase !== 'approach') return current
      return promoteFeaturePanel({ ...current, phase: 'hold', instant: false }, panelResultRef.current)
    })
  }, [])

  const onFeaturePanelExited = useCallback(() => {
    setFeatureVisual((current) =>
      current && current.phase === 'panel-exit' ? { ...current, phase: 'return', instant: false } : current,
    )
  }, [])

  const onFeatureReturned = useCallback(() => {
    setFeatureVisual((current) => (current && current.phase === 'return' ? null : current))
  }, [])

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

  const featureBack = Boolean(
    featureVisual && featureVisual.scope === scope && featureVisual.phase !== 'return',
  )

  return (
    <div
      ref={rootRef}
      className="territorial-experience"
      data-competence-hold={competenceHold ? 'true' : 'false'}
    >
      <TerritorialChrome
        pose={poseKey}
        scope={scope}
        featureBack={featureBack}
        featureLeaving={featureVisual?.phase === 'panel-exit'}
      />
      <div
        className="territorial-experience-layer"
        data-layer="landing"
        data-active={poseKey === 'landing' ? 'true' : 'false'}
        inert={poseKey !== 'landing' || competenceHold}
        aria-hidden={poseKey !== 'landing' || competenceHold}
        style={{ transitionDuration: `${moveMs}ms` }}
      >
        <TerritorialLandingPage
          selected={scope}
          onSelectedChange={setPicked}
          initialPaint={paint.kind === 'landing' ? paint : null}
          active={poseKey === 'landing'}
          competenceHold={competenceHold}
          competenceHost={competenceHost}
          onCompetenceSettled={onCompetenceSettled}
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
        data-feature={featureVisual ? 'open' : 'closed'}
        data-active={poseKey === 'detail' ? 'true' : 'false'}
        inert={poseKey !== 'detail' || competenceHold}
        aria-hidden={poseKey !== 'detail' || competenceHold}
        style={{ transitionDuration: `${moveMs}ms` }}
      >
        <TerritorialDetailPage
          scope={scope}
          active={poseKey === 'detail'}
          mapSlotRef={detailSlotRef}
          onMapModel={setMapModel}
          initialPaint={paint.kind === 'detail' || paint.kind === 'feature' ? paint : null}
          onBindRetry={bindDetailRetry}
          feature={
            featureVisual && featureVisual.scope === scope && featureVisual.phase !== 'return'
              ? {
                  id: featureVisual.panelId,
                  revealed: featurePanelRevealed(featureVisual),
                  leaving: featureVisual.phase === 'panel-exit',
                  instant: featureVisual.instant && featureVisual.phase === 'hold' && featureVisual.panelId === featureVisual.id,
                  seed:
                    panelResult?.status === 'ready' &&
                    panelResult.scope === featureVisual.scope &&
                    panelResult.id === featureVisual.panelId &&
                    panelResult.ano === ano &&
                    panelResult.mes === mes
                      ? panelResult.data
                      : paint.kind === 'feature' && paint.featureId === featureVisual.panelId
                        ? paint.feature
                        : null,
                  seedError:
                    panelResult?.status === 'error' &&
                    panelResult.scope === featureVisual.scope &&
                    panelResult.id === featureVisual.panelId &&
                    panelResult.ano === ano &&
                    panelResult.mes === mes
                      ? true
                      : paint.kind === 'feature' && paint.featureId === featureVisual.panelId
                        ? paint.featureError
                        : false,
                  pending: featurePanelPending(featureVisual),
                  crossfade: featureVisual.crossfade,
                }
              : null
          }
          onFeaturePanelExited={onFeaturePanelExited}
          competenceHold={competenceHold}
          onCompetenceSettled={onCompetenceSettled}
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
          feature={stageFeature(featureVisual, scope)}
          onSelectFeature={onSelectFeature}
          onFeatureArrived={onFeatureArrived}
          onFeatureReturned={onFeatureReturned}
        />
      ) : null}
      <Outlet />
      {competenceHold ? (
        <>
          <div className="territorial-competence-cover">
            <TerritorialRouteLoading />
          </div>
          {poseKey === 'landing' ? (
            <div ref={setCompetenceHost} className="territorial-competence-select-host" />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
