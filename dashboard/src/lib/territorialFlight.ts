export type FlightBox = {
  left: number
  top: number
  width: number
  height: number
}

export type FlightSquare = {
  left: number
  top: number
  size: number
}

export type FlightTransform = {
  x: number
  y: number
  scale: number
}

/** Quadrado em que o viewBox `meet` desenha a geografia, sem esticar o território. */
export function contentSquare(box: FlightBox): FlightSquare {
  const size = Math.min(box.width, box.height)
  return {
    left: box.left + (box.width - size) / 2,
    top: box.top + (box.height - size) / 2,
    size,
  }
}

export function flightStableSize(from: FlightBox, to: FlightBox): number {
  return Math.max(contentSquare(from).size, contentSquare(to).size, 1)
}

/**
 * Transform uniforme de um quadrado estável ancorado em (0, 0), origem no canto superior esquerdo.
 * Um único `scale` — a geografia não é deformada.
 */
export function flightTransform(box: FlightBox, stableSize: number): FlightTransform {
  const square = contentSquare(box)
  const safe = Math.max(stableSize, 0.0001)
  return {
    x: square.left,
    y: square.top,
    scale: square.size / safe,
  }
}
