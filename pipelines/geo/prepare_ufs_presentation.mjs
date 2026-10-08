/**
 * Gera a malha de apresentação do Brasil.
 *
 * Não altera `dashboard/public/geo/ufs.geojson`.
 * O frontend só lê o GeoJSON já gerado.
 *
 * Tolerância de referência: 0,20 px de tela num stage de 831 px,
 * viewBox 1000×1000. No plano do renderer (escala uniforme, padding 36):
 *
 *   tolerância = 0,20 × (1000 / 831) unidades de viewBox
 *
 * Cada fronteira compartilhada vira um arco e é simplificada uma vez.
 * Os vértices mantidos conservam a longitude/latitude original, para as
 * UFs vizinhas continuarem no mesmo ponto. Se um anel se autointercepta,
 * só o vértice original mais próximo do cruzamento volta ao arco — dos
 * dois lados da fronteira.
 *
 * Na raiz do repositório:
 *
 *   node pipelines/geo/prepare_ufs_presentation.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE = path.join(ROOT, 'dashboard/public/geo/ufs.geojson')
const OUTPUT = path.join(ROOT, 'dashboard/public/geo/ufs.presentation.geojson')
const METADATA = path.join(ROOT, 'dashboard/public/geo/ufs.presentation.metadata.json')

const VIEW_SIZE = 1000
const VIEW_PADDING = 36
const MIN_LON = -74
const MAX_LON = -34.5
const MIN_LAT = -34
const MAX_LAT = 5.5
const REFERENCE_STAGE_PX = 831
const REFERENCE_TOLERANCE_PX = 0.2
const CHECK_STAGE_PX = [831, 1080, 1440]

const LON_SPAN = MAX_LON - MIN_LON
const LAT_SPAN = MAX_LAT - MIN_LAT
const SCALE = Math.min((VIEW_SIZE - VIEW_PADDING * 2) / LON_SPAN, (VIEW_SIZE - VIEW_PADDING * 2) / LAT_SPAN)
const OFFSET_X = (VIEW_SIZE - LON_SPAN * SCALE) / 2
const OFFSET_Y = (VIEW_SIZE - LAT_SPAN * SCALE) / 2
const VIEWBOX_TOLERANCE = REFERENCE_TOLERANCE_PX * (VIEW_SIZE / REFERENCE_STAGE_PX)
const SHARED_SNAP_VIEWBOX = 0.02

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function projectRenderer(lon, lat) {
  return [OFFSET_X + (lon - MIN_LON) * SCALE, OFFSET_Y + (MAX_LAT - lat) * SCALE]
}

function keyOf(lon, lat) {
  return `${Number(lon).toFixed(6)},${Number(lat).toFixed(6)}`
}

function dist2(point, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) {
    const ex = point[0] - a[0]
    const ey = point[1] - a[1]
    return ex * ex + ey * ey
  }
  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const ex = point[0] - (a[0] + t * dx)
  const ey = point[1] - (a[1] + t * dy)
  return ex * ex + ey * ey
}

function dpOpenIndices(points, tol2) {
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let max = 0
    let at = -1
    for (let i = a + 1; i < b; i += 1) {
      const d = dist2(points[i], points[a], points[b])
      if (d > max) {
        max = d
        at = i
      }
    }
    if (at >= 0 && max > tol2) {
      keep[at] = 1
      stack.push([a, at], [at, b])
    }
  }
  const out = []
  for (let i = 0; i < points.length; i += 1) if (keep[i]) out.push(i)
  return out
}

function dpClosedIndices(points, tol2) {
  if (points.length <= 4) return points.map((_, index) => index)
  let far = 1
  let max = -1
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i][0] - points[0][0]
    const dy = points[i][1] - points[0][1]
    const d = dx * dx + dy * dy
    if (d > max) {
      max = d
      far = i
    }
  }
  const head = dpOpenIndices(points.slice(0, far + 1), tol2)
  const tailPoints = points.slice(far).concat([points[0]])
  const tail = dpOpenIndices(tailPoints, tol2)
  const merged = head.slice()
  for (const index of tail.slice(1, -1)) merged.push(far + index)
  return merged
}

function loadFeatures(geo) {
  return geo.features.map((feature) => {
    const geometry = feature.geometry
    assert(geometry.type === 'Polygon' || geometry.type === 'MultiPolygon', 'geometria inesperada')
    const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    const rings = parts.map((part) => {
      assert(part.length === 1, 'anel interno inesperado')
      const ring = part[0]
      assert(ring.length >= 4, 'anel curto demais')
      const open = ring.slice(0, -1).map((position) => [position[0], position[1]])
      return { source: ring.map((position) => [position[0], position[1]]), open }
    })
    return { properties: feature.properties, type: geometry.type, rings }
  })
}

function buildTopology(features) {
  const adj = new Map()
  const coord = new Map()
  const edgeOwners = new Map()
  const link = (a, b, uf) => {
    if (a === b) return
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a).add(b)
    adj.get(b).add(a)
    const edge = a < b ? `${a}|${b}` : `${b}|${a}`
    if (!edgeOwners.has(edge)) edgeOwners.set(edge, new Set())
    edgeOwners.get(edge).add(uf)
  }
  const ringKeys = features.map((feature) =>
    feature.rings.map((ring) => {
      const keys = []
      for (let i = 0; i < ring.open.length; i += 1) {
        const [lon, lat] = ring.open[i]
        const key = keyOf(lon, lat)
        if (!coord.has(key)) coord.set(key, { xy: projectRenderer(lon, lat), lonlat: [lon, lat] })
        if (keys[keys.length - 1] !== key) keys.push(key)
      }
      if (keys.length > 1 && keys[0] === keys[keys.length - 1]) keys.pop()
      const uf = feature.properties.uf_sigla
      for (let i = 0; i < keys.length; i += 1) link(keys[i], keys[(i + 1) % keys.length], uf)
      return keys
    }),
  )
  return { adj, coord, edgeOwners, ringKeys }
}

function snapSharedVertices(features, ringKeys, coord, snap) {
  const owners = new Map()
  features.forEach((feature, featureIndex) => {
    const uf = feature.properties.uf_sigla
    ringKeys[featureIndex].forEach((keys) => {
      for (const key of keys) {
        if (!owners.has(key)) owners.set(key, new Set())
        owners.get(key).add(uf)
      }
    })
  })
  const parent = new Map()
  for (const key of coord.keys()) parent.set(key, key)
  const find = (key) => {
    let root = key
    while (parent.get(root) !== root) root = parent.get(root)
    let cursor = key
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }
  const prefer = (left, right) => {
    const leftCount = owners.get(left)?.size || 0
    const rightCount = owners.get(right)?.size || 0
    if (leftCount !== rightCount) return leftCount > rightCount ? left : right
    return left < right ? left : right
  }
  const unite = (left, right) => {
    const a = find(left)
    const b = find(right)
    if (a === b) return
    const keep = prefer(a, b)
    parent.set(keep === a ? b : a, keep)
  }
  const cell = snap
  const grid = new Map()
  for (const key of coord.keys()) {
    const [x, y] = coord.get(key).xy
    const id = `${Math.floor(x / cell)},${Math.floor(y / cell)}`
    if (!grid.has(id)) grid.set(id, [])
    grid.get(id).push(key)
  }
  let snapped = 0
  const keys = [...coord.keys()].sort()
  for (const key of keys) {
    const [x, y] = coord.get(key).xy
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = grid.get(`${cx + dx},${cy + dy}`)
        if (!bucket) continue
        for (const other of bucket) {
          if (other <= key) continue
          const leftOwners = owners.get(key)
          const rightOwners = owners.get(other)
          if (!leftOwners || !rightOwners) continue
          let differs = false
          for (const uf of leftOwners) {
            if (!rightOwners.has(uf)) differs = true
          }
          for (const uf of rightOwners) {
            if (!leftOwners.has(uf)) differs = true
          }
          if (!differs) continue
          const [ox, oy] = coord.get(other).xy
          const ddx = ox - x
          const ddy = oy - y
          if (ddx * ddx + ddy * ddy <= snap * snap) {
            unite(key, other)
            snapped += 1
          }
        }
      }
    }
  }
  const snappedRings = ringKeys.map((rings) =>
    rings.map((ring) => {
      const next = []
      const used = new Set()
      for (const key of ring) {
        let root = find(key)
        if (used.has(root)) root = key
        if (used.has(root) || next[next.length - 1] === root) continue
        next.push(root)
        used.add(root)
      }
      if (next.length > 1 && next[0] === next[next.length - 1]) next.pop()
      return next
    }),
  )
  const adj = new Map()
  const edgeOwners = new Map()
  const link = (a, b, uf) => {
    if (a === b) return
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a).add(b)
    adj.get(b).add(a)
    const edge = a < b ? `${a}|${b}` : `${b}|${a}`
    if (!edgeOwners.has(edge)) edgeOwners.set(edge, new Set())
    edgeOwners.get(edge).add(uf)
  }
  features.forEach((feature, featureIndex) => {
    const uf = feature.properties.uf_sigla
    for (const ring of snappedRings[featureIndex]) {
      for (let i = 0; i < ring.length; i += 1) link(ring[i], ring[(i + 1) % ring.length], uf)
    }
  })
  return { ringKeys: snappedRings, adj, edgeOwners, snapped }
}

function extractArcs(adj, coord, tol2) {
  const degree = (key) => adj.get(key)?.size || 0
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const used = new Set()
  const arcs = new Map()
  const makeArc = (keys) => {
    const closed = keys.length > 2 && keys[0] === keys[keys.length - 1]
    const openKeys = closed ? keys.slice(0, -1) : keys
    const points = openKeys.map((key) => coord.get(key).xy)
    let index = closed ? dpClosedIndices(points, tol2) : dpOpenIndices(points, tol2)
    if (index.length < 2) index = openKeys.map((_, item) => item)
    return { keys: openKeys, index }
  }
  const storeArc = (keys) => {
    if (keys.length < 2) return null
    const fwd = keys.join(';')
    const rev = keys.slice().reverse().join(';')
    const sig = fwd <= rev ? fwd : rev
    if (!arcs.has(sig)) arcs.set(sig, makeArc(fwd <= rev ? keys : keys.slice().reverse()))
    return arcs.get(sig)
  }
  const walk = (start, next) => {
    const keys = [start, next]
    used.add(edgeKey(start, next))
    let prev = start
    let cur = next
    const seen = new Set([edgeKey(start, next)])
    while (degree(cur) === 2 && cur !== start) {
      const neigh = [...adj.get(cur)].find((item) => item !== prev)
      if (!neigh) break
      const mark = edgeKey(cur, neigh)
      if (seen.has(mark) || used.has(mark)) break
      seen.add(mark)
      used.add(mark)
      prev = cur
      cur = neigh
      keys.push(cur)
    }
    return keys
  }
  for (const [key, neighbors] of adj) {
    if (degree(key) === 2) continue
    for (const next of neighbors) {
      if (!used.has(edgeKey(key, next))) storeArc(walk(key, next))
    }
  }
  for (const [key, neighbors] of adj) {
    for (const next of neighbors) {
      if (!used.has(edgeKey(key, next))) storeArc(walk(key, next))
    }
  }
  return { arcs, degree }
}

function planRings(features, ringKeys, degree, coord, arcs, edgeOwners, tol2) {
  let keptOriginal = 0
  let localSpurs = 0
  const plans = features.map((feature, featureIndex) =>
    feature.rings.map((ring, ringIndex) => {
      const keys = ringKeys[featureIndex][ringIndex]
      const junctions = []
      for (let i = 0; i < keys.length; i += 1) if (degree(keys[i]) !== 2) junctions.push(i)
      if (junctions.length === 0) {
        const points = keys.map((key) => coord.get(key).xy)
        const index = points.length >= 3 ? dpClosedIndices(points, tol2) : points.map((_, item) => item)
        if (index.length < 3) {
          keptOriginal += 1
          return { kind: 'source' }
        }
        return { kind: 'chain', parts: [{ type: 'arc', arc: { keys, index }, reverse: false }] }
      }
      const parts = []
      for (let j = 0; j < junctions.length; j += 1) {
        const from = junctions[j]
        const to = junctions[(j + 1) % junctions.length]
        const segment = []
        if (to > from) {
          for (let i = from; i <= to; i += 1) segment.push(keys[i])
        } else {
          for (let i = from; i < keys.length; i += 1) segment.push(keys[i])
          for (let i = 0; i <= to; i += 1) segment.push(keys[i])
        }
        const distinct = segment.filter((key, index) => index === 0 || key !== segment[index - 1])
        if (distinct.length < 2) continue
        const fwd = segment.join(';')
        const rev = segment.slice().reverse().join(';')
        const sig = fwd <= rev ? fwd : rev
        const arc = arcs.get(sig)
        if (!arc) {
          for (let i = 0; i < segment.length - 1; i += 1) {
            const a = segment[i]
            const b = segment[i + 1]
            if (a === b) continue
            const edge = a < b ? `${a}|${b}` : `${b}|${a}`
            assert((edgeOwners.get(edge)?.size || 0) < 2, `fronteira compartilhada sem arco (${feature.properties.uf_sigla})`)
          }
          parts.push({ type: 'keys', keys: segment })
          localSpurs += 1
          continue
        }
        parts.push({ type: 'arc', arc, reverse: fwd > rev })
      }
      if (parts.length === 0) {
        keptOriginal += 1
        return { kind: 'source' }
      }
      return { kind: 'chain', parts }
    }),
  )
  return { plans, keptOriginal, localSpurs }
}

function emitClosed(feature, ring, plan, coord) {
  if (plan.kind === 'source') return ring.source.map((position) => [position[0], position[1]])
  const open = []
  const pushKey = (key) => {
    const lonlat = coord.get(key).lonlat
    const prev = open[open.length - 1]
    if (prev && prev[0] === lonlat[0] && prev[1] === lonlat[1]) return
    open.push([lonlat[0], lonlat[1]])
  }
  for (const part of plan.parts) {
    if (part.type === 'keys') {
      for (const key of part.keys) pushKey(key)
    } else {
      const order = part.reverse ? [...part.arc.index].reverse() : part.arc.index
      for (const index of order) pushKey(part.arc.keys[index])
    }
  }
  if (open.length < 3) return null
  const first = open[0]
  const last = open[open.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) open.push([first[0], first[1]])
  return open
}

function stabilizeShortRings(features, plans, coord) {
  let promoted = 0
  for (let f = 0; f < features.length; f += 1) {
    for (let r = 0; r < features[f].rings.length; r += 1) {
      const plan = plans[f][r]
      if (plan.kind !== 'chain') continue
      if (emitClosed(features[f], features[f].rings[r], plan, coord)) continue
      for (const part of plan.parts) {
        if (part.type === 'arc') part.arc.index = part.arc.keys.map((_, index) => index)
      }
      if (emitClosed(features[f], features[f].rings[r], plan, coord)) {
        promoted += 1
        continue
      }
      plans[f][r] = { kind: 'source' }
      promoted += 1
    }
  }
  return promoted
}

function buildCollection(source, features, plans, coord) {
  return {
    type: 'FeatureCollection',
    name: source.name,
    crs: source.crs,
    features: features.map((feature, featureIndex) => {
      const parts = feature.rings.map((ring, ringIndex) => {
        const closed = emitClosed(feature, ring, plans[featureIndex][ringIndex], coord)
        assert(closed, `anel sem coordenadas (${feature.properties.uf_sigla})`)
        return [closed]
      })
      const geometry =
        feature.type === 'Polygon'
          ? { type: 'Polygon', coordinates: parts[0] }
          : { type: 'MultiPolygon', coordinates: parts }
      return { type: 'Feature', properties: feature.properties, geometry }
    }),
  }
}

function pythonBin() {
  const candidates = [path.join(ROOT, '.venv/Scripts/python.exe'), path.join(ROOT, '.venv/bin/python')]
  return candidates.find((item) => fs.existsSync(item)) ?? 'python'
}

function runPython(script, input, args = []) {
  const result = spawnSync(pythonBin(), ['-c', script, ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`Python falhou\n${result.stdout}\n${result.stderr}`)
  return result.stdout.trim()
}

function invalidFeatures(collection) {
  const script = `
import json, sys
from shapely.geometry import shape
from shapely.validation import explain_validity
data = json.load(sys.stdin)
bad = []
for feature in data["features"]:
    geom = shape(feature["geometry"])
    if geom.is_valid and geom.area > 0:
        continue
    msg = explain_validity(geom)
    lon = lat = None
    if "[" in msg and "]" in msg:
        parts = msg[msg.find("[") + 1:msg.find("]")].replace(",", " ").split()
        if len(parts) >= 2:
            lon, lat = float(parts[0]), float(parts[1])
    bad.append({"uf": feature["properties"].get("uf_sigla"), "reason": msg.split("[")[0].strip(), "lon": lon, "lat": lat})
print(json.dumps(bad))
`
  return JSON.parse(runPython(script, JSON.stringify(collection)))
}

function refineGap(arc, gapIndex, target) {
  const start = arc.index[gapIndex]
  const end = arc.index[gapIndex + 1]
  if (end <= start + 1) return 0
  let chosen = start + Math.floor((end - start) / 2)
  if (target) {
    let best = Infinity
    for (let index = start + 1; index < end; index += 1) {
      const point = coordRef.get(arc.keys[index]).lonlat
      const dx = point[0] - target[0]
      const dy = point[1] - target[1]
      const distance = dx * dx + dy * dy
      if (distance < best) {
        best = distance
        chosen = index
      }
    }
  }
  arc.index.splice(gapIndex + 1, 0, chosen)
  return 1
}

function bestGap(plan, target) {
  let best = null
  for (const ring of plan) {
    if (ring.kind !== 'chain') continue
    for (const part of ring.parts) {
      if (part.type !== 'arc') continue
      const { arc } = part
      for (let i = 0; i < arc.index.length - 1; i += 1) {
        if (arc.index[i + 1] <= arc.index[i] + 1) continue
        const a = arc.keys[arc.index[i]]
        const b = arc.keys[arc.index[i + 1]]
        const span = arc.index[i + 1] - arc.index[i]
        const d = target ? dist2(target, coordXy(a), coordXy(b)) : -span
        if (!best || d < best.d) best = { arc, i, d }
      }
    }
  }
  return best
}

let coordRef = null
function coordXy(key) {
  return coordRef.get(key).xy
}

function signedArea(coords) {
  let area = 0
  for (let i = 0; i < coords.length - 1; i += 1) {
    area += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1]
  }
  return Math.abs(area) / 2
}

function isDegenerate(coords) {
  if (!coords || coords.length < 4) return true
  const unique = new Set(coords.slice(0, -1).map((position) => `${position[0].toFixed(7)},${position[1].toFixed(7)}`))
  return unique.size < 3 || signedArea(coords) < 1e-12
}

function orient(a, b, c) {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  if (Math.abs(value) < 1e-8) return 0
  return value > 0 ? 1 : -1
}

function segmentsCross(a, b, c, d) {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4
}

function segmentIntersection(a, b, c, d) {
  const denominator = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0])
  if (Math.abs(denominator) < 1e-18) return null
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / denominator
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
}

function expandCrossings(ring) {
  if (!ring || ring.kind !== 'chain') return 0
  const segments = []
  const points = []
  for (const part of ring.parts) {
    if (part.type === 'keys') {
      for (const key of part.keys) points.push(coordRef.get(key).lonlat)
      continue
    }
    const { arc, reverse } = part
    const seq = reverse ? [...arc.index].reverse() : arc.index
    for (let i = 0; i < seq.length; i += 1) {
      points.push(coordRef.get(arc.keys[seq[i]]).lonlat)
      if (i === seq.length - 1) continue
      const gap = reverse ? arc.index.length - 2 - i : i
      segments.push({
        arc,
        gap,
        expandable: arc.index[gap + 1] > arc.index[gap] + 1,
        a: points[points.length - 1],
        b: coordRef.get(arc.keys[seq[i + 1]]).lonlat,
      })
    }
  }
  const hits = new Map()
  const mark = (segment, target) => {
    if (!segment.expandable || !target) return
    if (!hits.has(segment.arc)) hits.set(segment.arc, new Map())
    const gaps = hits.get(segment.arc)
    if (!gaps.has(segment.gap)) gaps.set(segment.gap, target)
  }
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (!segmentsCross(segments[i].a, segments[i].b, segments[j].a, segments[j].b)) continue
      const target = segmentIntersection(segments[i].a, segments[i].b, segments[j].a, segments[j].b)
      mark(segments[i], target)
      mark(segments[j], target)
    }
    if (!segments[i].expandable) continue
    for (const point of points) {
      if (point === segments[i].a || point === segments[i].b) continue
      if (dist2(point, segments[i].a, segments[i].b) <= 1e-16) mark(segments[i], point)
    }
  }
  let added = 0
  for (const [arc, gaps] of hits) {
    const ordered = [...gaps.keys()].sort((a, b) => b - a)
    for (const gap of ordered) added += refineGap(arc, gap, gaps.get(gap))
  }
  return added
}

function restoreArc(arc) {
  const before = arc.index.length
  if (before === arc.keys.length) return 0
  arc.index = arc.keys.map((_, index) => index)
  return arc.index.length - before
}

function promoteDegenerateRings(features, plans, coord) {
  let changed = 0
  for (let f = 0; f < features.length; f += 1) {
    for (let r = 0; r < features[f].rings.length; r += 1) {
      const plan = plans[f][r]
      if (plan.kind !== 'chain') continue
      const emitted = emitClosed(features[f], features[f].rings[r], plan, coord)
      if (!isDegenerate(emitted)) continue
      for (const part of plan.parts) {
        if (part.type === 'arc') changed += restoreArc(part.arc)
      }
      const again = emitClosed(features[f], features[f].rings[r], plan, coord)
      if (isDegenerate(again)) {
        plans[f][r] = { kind: 'source' }
        changed += 1
      }
    }
  }
  return changed
}

function repairInvalid(source, features, plans, coord) {
  coordRef = coord
  const indexBySigla = new Map(features.map((feature, index) => [feature.properties.uf_sigla, index]))
  let restored = 0
  let passes = 0
  let lastBad = []
  let previousKey = ''
  let stuck = 0
  for (let pass = 0; pass < 48; pass += 1) {
    restored += promoteDegenerateRings(features, plans, coord)
    const bad = invalidFeatures(buildCollection(source, features, plans, coord))
    if (bad.length === 0) return { restored, passes }
    lastBad = bad
    passes += 1
    const key = bad
      .map((item) => `${item.uf}:${item.reason}`)
      .sort()
      .join(',')
    stuck = key === previousKey ? stuck + 1 : 0
    previousKey = key
    const rings = invalidRingIndexes(buildCollection(source, features, plans, coord))
    let added = 0
    for (const item of rings) {
      const ring = plans[indexBySigla.get(item.uf)]?.[item.ring]
      if (!ring || ring.kind !== 'chain') continue
      const crossed = expandCrossings(ring)
      if (crossed > 0) {
        added += crossed
        continue
      }
      if (stuck < 6) continue
      for (const part of ring.parts) {
        if (part.type === 'arc') added += restoreArc(part.arc)
      }
    }
    if (added === 0) {
      for (const issue of bad) {
        const target = Number.isFinite(issue.lon) ? projectRenderer(issue.lon, issue.lat) : null
        const gap = bestGap(plans[indexBySigla.get(issue.uf)], target)
        if (gap) added += stuck >= 6 ? restoreArc(gap.arc) : refineGap(gap.arc, gap.i, Number.isFinite(issue.lon) ? [issue.lon, issue.lat] : null)
      }
    }
    restored += added
    if (added === 0) {
      throw new Error(`geometria inválida sem trecho para restaurar: ${bad.map((item) => `${item.uf}:${item.reason}`).join(', ')}`)
    }
  }
  throw new Error(`a reparação topológica não convergiu: ${lastBad.map((item) => `${item.uf}:${item.reason}`).join('; ')}`)
}

function invalidRingIndexes(collection) {
  const script = `
import json, sys
from shapely.geometry import Polygon
data = json.load(sys.stdin)
found = []
for feature in data["features"]:
    parts = [feature["geometry"]["coordinates"]] if feature["geometry"]["type"] == "Polygon" else feature["geometry"]["coordinates"]
    valid = []
    for index, part in enumerate(parts):
        try:
            poly = Polygon(part[0])
        except Exception:
            found.append({"uf": feature["properties"].get("uf_sigla"), "ring": index, "lon": part[0][0][0], "lat": part[0][0][1]})
            continue
        if not poly.is_valid or poly.area <= 0:
            point = poly.representative_point() if not poly.is_empty else None
            found.append({"uf": feature["properties"].get("uf_sigla"), "ring": index, "lon": point.x if point else part[0][0][0], "lat": point.y if point else part[0][0][1]})
            continue
        valid.append((index, poly))
    for a in range(len(valid)):
        for b in range(a + 1, len(valid)):
            left, right = valid[a][1], valid[b][1]
            if left.intersection(right).area <= 1e-12:
                continue
            small = valid[a] if left.area <= right.area else valid[b]
            point = left.intersection(right).representative_point()
            found.append({"uf": feature["properties"].get("uf_sigla"), "ring": small[0], "lon": point.x, "lat": point.y})
print(json.dumps(found))
`
  return JSON.parse(runPython(script, JSON.stringify(collection)))
}

function excessOverlaps(collection) {
  const script = `
import json, sys
from shapely.geometry import shape
data = json.load(sys.stdin)
original = json.load(open(sys.argv[1], encoding="utf-8"))
geoms = [shape(feature["geometry"]) for feature in data["features"]]
base = [shape(feature["geometry"]) for feature in original["features"]]
found = []
for i, left in enumerate(geoms):
    for j in range(i + 1, len(geoms)):
        area = left.intersection(geoms[j]).area
        grown = area - base[i].intersection(base[j]).area
        if grown <= 1e-6:
            continue
        point = left.intersection(geoms[j]).representative_point()
        found.append({
            "ufA": data["features"][i]["properties"].get("uf_sigla"),
            "ufB": data["features"][j]["properties"].get("uf_sigla"),
            "lon": point.x,
            "lat": point.y,
            "grown": grown,
        })
print(json.dumps(found))
`
  return JSON.parse(runPython(script, JSON.stringify(collection), [SOURCE]))
}

function repairOverlaps(source, features, plans, coord) {
  coordRef = coord
  const indexBySigla = new Map(features.map((feature, index) => [feature.properties.uf_sigla, index]))
  let restored = 0
  let passes = 0
  for (let pass = 0; pass < 24; pass += 1) {
    const extras = excessOverlaps(buildCollection(source, features, plans, coord))
    if (extras.length === 0) return { restored, passes }
    passes += 1
    const jobs = new Map()
    for (const extra of extras) {
      const target = projectRenderer(extra.lon, extra.lat)
      for (const uf of [extra.ufA, extra.ufB]) {
        const gap = bestGap(plans[indexBySigla.get(uf)], target)
        if (!gap) continue
        const prev = jobs.get(gap.arc)
        if (!prev || gap.d < prev.d) jobs.set(gap.arc, { ...gap, lonlat: [extra.lon, extra.lat], restore: pass >= 16 })
      }
    }
    let added = 0
    for (const gap of jobs.values()) {
      added += gap.restore ? restoreArc(gap.arc) : refineGap(gap.arc, gap.i, gap.lonlat)
    }
    restored += added
    if (added === 0) break
  }
  return { restored, passes }
}

function countVertices(features, plans, coord) {
  let count = 0
  for (let f = 0; f < features.length; f += 1) {
    for (let r = 0; r < features[f].rings.length; r += 1) {
      const ring = emitClosed(features[f], features[f].rings[r], plans[f][r], coord)
      count += ring.length - 1
    }
  }
  return count
}

function neighborPairsFromLonLat(features, plans, coord) {
  const pairs = new Set()
  const owners = new Map()
  for (let f = 0; f < features.length; f += 1) {
    const uf = features[f].properties.uf_sigla
    for (let r = 0; r < features[f].rings.length; r += 1) {
      const ring = emitClosed(features[f], features[f].rings[r], plans[f][r], coord)
      for (let i = 0; i < ring.length - 1; i += 1) {
        const a = keyOf(ring[i][0], ring[i][1])
        const b = keyOf(ring[i + 1][0], ring[i + 1][1])
        if (a === b) continue
        const edge = a < b ? `${a}|${b}` : `${b}|${a}`
        if (!owners.has(edge)) owners.set(edge, new Set())
        owners.get(edge).add(uf)
      }
    }
  }
  for (const owner of owners.values()) {
    assert(owner.size <= 2, 'aresta de mais de duas UFs')
    if (owner.size === 2) {
      const [a, b] = [...owner].sort()
      pairs.add(`${a}|${b}`)
    }
  }
  return pairs
}

function originalNeighborPairs(edgeOwners) {
  const pairs = new Set()
  for (const owners of edgeOwners.values()) {
    if (owners.size === 2) {
      const [a, b] = [...owners].sort()
      pairs.add(`${a}|${b}`)
    }
  }
  return pairs
}

function measureDeviation(features, plans, coord) {
  let max = 0
  for (let f = 0; f < features.length; f += 1) {
    for (let r = 0; r < features[f].rings.length; r += 1) {
      const emitted = emitClosed(features[f], features[f].rings[r], plans[f][r], coord)
      const simplified = emitted.slice(0, -1).map((position) => projectRenderer(position[0], position[1]))
      for (const position of features[f].rings[r].open) {
        const point = projectRenderer(position[0], position[1])
        let best = Infinity
        for (let i = 0; i < simplified.length; i += 1) {
          const d = dist2(point, simplified[i], simplified[(i + 1) % simplified.length])
          if (d < best) best = d
        }
        if (best > max) max = best
      }
    }
  }
  return Math.sqrt(max)
}

function validateFinal(file) {
  const script = `
import json, sys
from shapely.geometry import shape
data = json.load(open(sys.argv[1], encoding="utf-8"))
original = json.load(open(sys.argv[2], encoding="utf-8"))
assert len(data["features"]) == 27
geoms = []
worst = (0, None)
for feature, src in zip(data["features"], original["features"]):
    assert feature["properties"] == src["properties"]
    geom = shape(feature["geometry"])
    assert geom.is_valid, feature["properties"].get("uf_sigla")
    assert geom.area > 0
    src_geom = shape(src["geometry"])
    ratio = abs(geom.area - src_geom.area) / src_geom.area
    if ratio > worst[0]:
        worst = (ratio, feature["properties"].get("uf_sigla"))
    assert ratio < 0.05, (feature["properties"].get("uf_sigla"), ratio)
    geoms.append(geom)
orig = [shape(feature["geometry"]) for feature in original["features"]]
extra = (0, None)
for i, left in enumerate(geoms):
    for j in range(i + 1, len(geoms)):
        area = left.intersection(geoms[j]).area
        base = orig[i].intersection(orig[j]).area
        grown = area - base
        if grown > extra[0]:
            extra = (grown, data["features"][i]["properties"].get("uf_sigla") + "-" + data["features"][j]["properties"].get("uf_sigla"))
        assert grown <= 1e-6, (data["features"][i]["properties"].get("uf_sigla"), data["features"][j]["properties"].get("uf_sigla"), area, base)
print("shapely-ok", len(geoms), "worst-area-ratio", worst[0], worst[1], "extra-overlap", extra[0], extra[1])
`
  return runPython(script, '', [file, SOURCE])
}

function main() {
  assert(path.resolve(SOURCE) !== path.resolve(OUTPUT), 'recusa sobrescrever a fonte')
  const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
  assert(source.features.length === 27, 'a fonte não tem 27 UFs')
  const features = loadFeatures(source)
  const tol2 = VIEWBOX_TOLERANCE * VIEWBOX_TOLERANCE
  const built = buildTopology(features)
  const exactPairs = originalNeighborPairs(built.edgeOwners)
  const snapped = snapSharedVertices(features, built.ringKeys, built.coord, SHARED_SNAP_VIEWBOX)
  const { coord } = built
  const { arcs, degree } = extractArcs(snapped.adj, coord, tol2)
  const { plans, keptOriginal, localSpurs } = planRings(
    features,
    snapped.ringKeys,
    degree,
    coord,
    arcs,
    snapped.edgeOwners,
    tol2,
  )
  const promoted = stabilizeShortRings(features, plans, coord)
  const repair = repairInvalid(source, features, plans, coord)
  const overlaps = repairOverlaps(source, features, plans, coord)
  const afterPairs = neighborPairsFromLonLat(features, plans, coord)
  for (const pair of exactPairs) assert(afterPairs.has(pair), `vizinhança perdida: ${pair}`)
  const maxDeviation = measureDeviation(features, plans, coord)
  // O snap de fronteiras quase coincidentes soma-se à tolerância do Douglas-Peucker.
  const deviationBudget = VIEWBOX_TOLERANCE + SHARED_SNAP_VIEWBOX + 0.01
  assert(maxDeviation <= deviationBudget, `desvio ${maxDeviation} acima da tolerância`)
  const collection = buildCollection(source, features, plans, coord)
  fs.writeFileSync(OUTPUT, `${JSON.stringify(collection)}\n`)
  const verticesBefore = features.reduce((sum, feature) => sum + feature.rings.reduce((inner, ring) => inner + ring.open.length, 0), 0)
  const deviationPx = Object.fromEntries(CHECK_STAGE_PX.map((stage) => [String(stage), (maxDeviation * stage) / VIEW_SIZE]))
  const metadata = {
    source: 'dashboard/public/geo/ufs.geojson',
    method: 'topological-douglas-peucker',
    referenceStagePx: REFERENCE_STAGE_PX,
    referenceTolerancePx: REFERENCE_TOLERANCE_PX,
    viewBoxSize: VIEW_SIZE,
    viewBoxTolerance: VIEWBOX_TOLERANCE,
    sharedSnapViewBox: SHARED_SNAP_VIEWBOX,
    snappedVertexPairs: snapped.snapped,
    projection: {
      minLon: MIN_LON,
      maxLon: MAX_LON,
      minLat: MIN_LAT,
      maxLat: MAX_LAT,
      padding: VIEW_PADDING,
      scale: SCALE,
    },
    features: 27,
    arcs: arcs.size,
    verticesBefore,
    verticesAfter: countVertices(features, plans, coord),
    keptOriginalRings: keptOriginal + promoted,
    localSpurs,
    restoredVertices: repair.restored + overlaps.restored,
    repairPasses: repair.passes + overlaps.passes,
    neighborPairs: afterPairs.size,
    maxDeviationViewBox: maxDeviation,
    maxDeviationPx: deviationPx,
  }
  fs.writeFileSync(METADATA, `${JSON.stringify(metadata, null, 2)}\n`)
  const shapely = validateFinal(OUTPUT)
  console.log(JSON.stringify({ ...metadata, shapely }, null, 2))
}

main()
