import type { InkTool } from "../types";

/**
 * Pure geometry for ink. A stroke's points are a flat `[x0, y0, x1, y1, …]` array in board
 * coordinates, the shape the API stores and an SVG path wants.
 */

/** A pointer move within this many screen pixels of the last kept point is not worth keeping. */
export const MIN_SAMPLE_PX = 3;
/** On release, a point that lies within this many screen pixels of the line between its neighbours goes. */
export const SIMPLIFY_PX = 0.75;
/** How far past a stroke's edge the Eraser still touches it, in screen pixels. */
export const ERASE_SLOP_PX = 6;

const tenth = (n: number) => Math.round(n * 10) / 10;

/**
 * Adds a pointer position to a stroke, unless it hasn't moved `minDistance` board units from the
 * last point kept (then it returns the same array: nothing to render, nothing to store). Positions
 * are rounded to a tenth of a board unit, which is far below a pixel and halves what is sent.
 */
export function appendPoint(points: number[], x: number, y: number, minDistance: number): number[] {
  const px = tenth(x);
  const py = tenth(y);
  if (points.length === 0) return [px, py];
  const lastX = points[points.length - 2]!;
  const lastY = points[points.length - 1]!;
  if (Math.hypot(px - lastX, py - lastY) < minDistance) return points;
  return [...points, px, py];
}

/** How far point `i` lies from the segment between points `a` and `b`. */
function offSegment(points: number[], i: number, a: number, b: number): number {
  return distanceToSegment(points[2 * i]!, points[2 * i + 1]!, points[2 * a]!, points[2 * a + 1]!, points[2 * b]!, points[2 * b + 1]!);
}

/**
 * Ramer–Douglas–Peucker: drops every point that sits within `epsilon` of the line its neighbours
 * make, keeping both ends. A straight drag, however finely it was sampled, becomes two points; a
 * circle becomes a few dozen. Iterative, so a very long stroke can't overflow the stack.
 */
export function simplify(points: number[], epsilon: number): number[] {
  const count = points.length / 2;
  if (count <= 2) return points;
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const ranges: Array<[number, number]> = [[0, count - 1]];
  while (ranges.length > 0) {
    const [a, b] = ranges.pop()!;
    let farthest = -1;
    let distance = 0;
    for (let i = a + 1; i < b; i++) {
      const d = offSegment(points, i, a, b);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest !== -1 && distance > epsilon) {
      keep[farthest] = 1;
      ranges.push([a, farthest], [farthest, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) out.push(points[2 * i]!, points[2 * i + 1]!);
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * An SVG path for a stroke: straight for two points (a dot is a zero-length line, which a round cap
 * draws as a dot), otherwise quadratic curves through the midpoints so a hand-drawn line has no corners.
 */
export function smoothPath(points: number[]): string {
  const count = points.length / 2;
  if (count === 0) return "";
  const at = (i: number) => [round(points[2 * i]!), round(points[2 * i + 1]!)] as const;
  const [x0, y0] = at(0);
  if (count < 3) {
    const [x1, y1] = at(count - 1);
    return `M${x0} ${y0} L${x1} ${y1}`;
  }
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < count - 1; i++) {
    const [cx, cy] = at(i);
    const [nx, ny] = at(i + 1);
    d += ` Q${cx} ${cy} ${round((cx + nx) / 2)} ${round((cy + ny) / 2)}`;
  }
  const [lx, ly] = at(count - 1);
  return `${d} L${lx} ${ly}`;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The distance from a point to the nearest part of a stroke's line. A dot is a point. */
export function distanceToStroke(points: number[], x: number, y: number): number {
  const count = points.length / 2;
  if (count === 0) return Infinity;
  if (count === 1) return Math.hypot(x - points[0]!, y - points[1]!);
  let best = Infinity;
  for (let i = 0; i < count - 1; i++) {
    const d = distanceToSegment(x, y, points[2 * i]!, points[2 * i + 1]!, points[2 * i + 2]!, points[2 * i + 3]!);
    if (d < best) best = d;
  }
  return best;
}

/** Whether a point touches a stroke: within half its drawn width, plus `slop` of forgiveness. */
export function strokeHit(stroke: { tool: InkTool; width: number; points: number[] }, x: number, y: number, slop: number): boolean {
  return distanceToStroke(stroke.points, x, y) <= stroke.width / 2 + slop;
}
