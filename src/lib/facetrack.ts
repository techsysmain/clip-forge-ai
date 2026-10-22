/** A tracked subject position inside a clip. `t` is seconds from the clip start; cx/cy are 0..1 of the source frame. */
export interface FacePoint {
  t: number;
  cx: number;
  cy: number;
}

export interface FaceBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const even = (n: number) => Math.ceil(n / 2) * 2;
const median3 = (a: number, b: number, c: number) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/** The main subject is the largest detected face. */
export function primaryFace(faces: FaceBox[]): FaceBox | null {
  let best: FaceBox | null = null;
  for (const f of faces) if (!best || f.w * f.h > best.w * best.h) best = f;
  return best;
}

/**
 * Turns per-frame detections (null = no face) into a stable camera path: outliers are median-filtered,
 * small movements are ignored (dead-zone) so the crop does not jitter, and the path spans the whole clip.
 * Returns null when no face was found anywhere.
 */
export function buildTrack(samples: { t: number; face: FaceBox | null }[], clipDuration: number): FacePoint[] | null {
  const found = samples.filter((s): s is { t: number; face: FaceBox } => s.face !== null).sort((a, b) => a.t - b.t);
  if (found.length === 0) return null;

  const xs = found.map((s) => s.face.cx);
  const ys = found.map((s) => s.face.cy);
  const fx = xs.map((_, i) => median3(xs[Math.max(0, i - 1)], xs[i], xs[Math.min(xs.length - 1, i + 1)]));
  const fy = ys.map((_, i) => median3(ys[Math.max(0, i - 1)], ys[i], ys[Math.min(ys.length - 1, i + 1)]));

  const DEAD_ZONE = 0.04;
  const points: FacePoint[] = [];
  let cx = fx[0];
  let cy = fy[0];
  found.forEach((s, i) => {
    if (Math.abs(fx[i] - cx) > DEAD_ZONE) cx = fx[i];
    if (Math.abs(fy[i] - cy) > DEAD_ZONE) cy = fy[i];
    points.push({ t: s.t, cx, cy });
  });

  // Hold the first/last known position at the clip boundaries.
  const first = points[0];
  const last = points[points.length - 1];
  if (first.t > 0) points.unshift({ t: 0, cx: first.cx, cy: first.cy });
  if (last.t < clipDuration) points.push({ t: clipDuration, cx: last.cx, cy: last.cy });
  return points;
}

/** FFmpeg expression of `t` that linearly interpolates between keyframes (constant when only one value). */
export function lerpExpression(keys: { t: number; v: number }[]): string {
  const k = keys.map((p) => ({ t: Math.round(p.t * 1000) / 1000, v: Math.round(p.v * 10) / 10 }));
  // Merge keyframes that are not strictly increasing in time
  const keyed = k.filter((p, i) => i === 0 || p.t > k[i - 1].t);
  if (keyed.every((p) => p.v === keyed[0].v)) return String(keyed[0].v);
  let expr = String(keyed[keyed.length - 1].v);
  for (let i = keyed.length - 2; i >= 0; i--) {
    const a = keyed[i];
    const b = keyed[i + 1];
    const dv = Number((b.v - a.v).toFixed(3));
    const dt = Number((b.t - a.t).toFixed(3));
    expr = `if(lt(t,${b.t}),${a.v}+(${dv})*(t-${a.t})/${dt},${expr})`;
  }
  return expr;
}

export interface TrackFilterOptions {
  srcWidth: number;
  srcHeight: number;
  width: number;
  height: number;
  points: FacePoint[];
  assFile: string;
}

/** Filter graph that scales to cover the output and pans a crop window along the tracked subject. */
export function trackCropFilter(o: TrackFilterOptions): string {
  const f = Math.max(o.width / o.srcWidth, o.height / o.srcHeight);
  const sw = even(Math.max(o.width, Math.ceil(o.srcWidth * f)));
  const sh = even(Math.max(o.height, Math.ceil(o.srcHeight * f)));
  const maxX = sw - o.width;
  const maxY = sh - o.height;
  const x = lerpExpression(o.points.map((p) => ({ t: p.t, v: clamp(p.cx * sw - o.width / 2, 0, maxX) })));
  const y = lerpExpression(o.points.map((p) => ({ t: p.t, v: clamp(p.cy * sh - o.height / 2, 0, maxY) })));
  return `[0:v]scale=${sw}:${sh},crop=${o.width}:${o.height}:'${x}':'${y}',setsar=1,ass=${o.assFile}[v]`;
}
