/* engine/iso.js — one file, two drawing kits:
   §1 A's precision orthographic isometric CAD primitives (makeCamera/iso/extrudePlan/…)
      — unchanged geometry, themes applied later via CSS classes only.
   §2 B's sketchbook kit (seeded wobble pen, ink fills, leader lines, tags, dials,
      coins, pennants, envelopes). Ported from B's generator, not its rendered SVG.
      The pen is based on Kevin T. Ngo's statechart-art (MIT) — see CREDITS.md. */
import { f1, n1 } from '../util/format.js';

/* ── §1 A's CAD kit (v8 vector engine) ──────────────────────────────────── */
export const DEG = Math.PI / 180;
export const VB = { x: 100, y: -30, w: 800, h: 600 };

const UNIT_CIRCLE_CACHE = new Map();
export function getUnitCircle(segs) {
  let cached = UNIT_CIRCLE_CACHE.get(segs);
  if (!cached) {
    cached = new Array(segs);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      cached[i] = [Math.cos(a), Math.sin(a)];
    }
    UNIT_CIRCLE_CACHE.set(segs, cached);
  }
  return cached;
}

export function makeCamera(azimuthDeg, elevationDeg, originX, originY, scale) {
  const a = azimuthDeg * DEG;
  const e = elevationDeg * DEG;
  return {
    azimuth: azimuthDeg, elevation: elevationDeg,
    sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e),
    origin: [originX, originY], k: scale
  };
}

export function iso(pt, P) {
  const x = pt[0], y = pt[1], z = pt[2];
  return [
    f1(P.origin[0] + (x * P.sinA - y * P.cosA) * P.k),
    f1(P.origin[1] + ((x * P.cosA + y * P.sinA) * P.sinE - z * P.cosE) * P.k)
  ];
}

export function depthOf(pt, P) {
  return (pt[0] * P.cosA + pt[1] * P.sinA) * P.cosE + pt[2] * P.sinE;
}

export function shadeIndexForNormal(nx, ny, P) {
  const lit = (nx * (-P.sinA) + ny * P.cosA + 1) * 0.5;
  const idx = (lit * 4) | 0;
  return idx < 0 ? 0 : (idx > 3 ? 3 : idx);
}

export function ptsToPath(pts, closed = true) {
  const len = pts.length;
  if (!len) return '';
  let d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (let i = 1; i < len; i++) d += 'L' + pts[i][0] + ',' + pts[i][1];
  if (closed) d += 'Z';
  return d;
}

export const quadToPath = (p0, p1, p2, p3) =>
  'M' + p0[0] + ',' + p0[1] + 'L' + p1[0] + ',' + p1[1] + 'L' + p2[0] + ',' + p2[1] + 'L' + p3[0] + ',' + p3[1] + 'Z';

export function roundedRectPlan(cx, cy, w, d, r = 3, segsPerCorner = 3) {
  const hw = w * 0.5, hd = d * 0.5;
  const cr = Math.min(r, hw * 0.45, hd * 0.45);
  if (cr <= 0.2) {
    return [[cx - hw, cy - hd], [cx + hw, cy - hd], [cx + hw, cy + hd], [cx - hw, cy + hd]];
  }
  const corners = [
    [cx + hw - cr, cy - hd + cr, -Math.PI * 0.5],
    [cx + hw - cr, cy + hd - cr, 0],
    [cx - hw + cr, cy + hd - cr, Math.PI * 0.5],
    [cx - hw + cr, cy - hd + cr, Math.PI]
  ];
  const pts = [];
  const step = (Math.PI * 0.5) / segsPerCorner;
  for (let c = 0; c < 4; c++) {
    const ox = corners[c][0], oy = corners[c][1], a0 = corners[c][2];
    for (let i = 0; i <= segsPerCorner; i++) {
      const ang = a0 + step * i;
      pts.push([ox + Math.cos(ang) * cr, oy + Math.sin(ang) * cr]);
    }
  }
  return pts;
}

export function circlePlan(cx, cy, radius, segments = 20) {
  const unit = getUnitCircle(segments);
  const pts = new Array(segments);
  for (let i = 0; i < segments; i++) pts[i] = [cx + unit[i][0] * radius, cy + unit[i][1] * radius];
  return pts;
}

export function extrudePlan(plan, z0, h, P, opts = {}) {
  const z1 = z0 + h;
  const n = plan.length;
  const bot2d = new Array(n);
  const top2d = new Array(n);
  for (let i = 0; i < n; i++) {
    const px = plan[i][0], py = plan[i][1];
    bot2d[i] = iso([px, py, z0], P);
    top2d[i] = iso([px, py, z1], P);
  }
  const vx = P.cosA, vy = P.sinA;
  const isLit = Boolean(opts.lit);
  const tone = opts.tone || 'lo';
  const strokeClass = isLit ? 'iso-stroke-lit'
    : (tone === 'hi' ? 'iso-stroke-hi' : (tone === 'mid' ? 'iso-stroke-mid' : 'iso-stroke-lo'));
  const topClass = isLit ? 'iso-lit-top' : 'iso-top';
  const sideQuads = [];
  const edgeVisible = new Array(n);
  let visibleBotEdgesD = '';
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = plan[j][0] - plan[i][0];
    const dy = plan[j][1] - plan[i][1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len;
    const dot = nx * vx + ny * vy;
    edgeVisible[i] = dot > -0.01;
    if (dot > -0.02) {
      const shade = shadeIndexForNormal(nx, ny, P);
      const dQuad = quadToPath(bot2d[i], bot2d[j], top2d[j], top2d[i]);
      const midX = (plan[i][0] + plan[j][0]) * 0.5;
      const midY = (plan[i][1] + plan[j][1]) * 0.5;
      const fDepth = depthOf([midX, midY, z0 + h * 0.5], P);
      sideQuads.push({ shade, d: dQuad, fDepth });
    }
    if (edgeVisible[i]) visibleBotEdgesD += 'M' + bot2d[i][0] + ',' + bot2d[i][1] + 'L' + bot2d[j][0] + ',' + bot2d[j][1];
  }
  sideQuads.sort((a, b) => a.fDepth - b.fDepth);
  const topPath = ptsToPath(top2d, true);
  let paperD = '', litSideD = '';
  const shadeBuckets = ['', '', '', ''];
  let faintD = '';
  for (let i = 0; i < sideQuads.length; i++) {
    const sq = sideQuads[i];
    paperD += sq.d;
    if (isLit) litSideD += sq.d;
    else shadeBuckets[sq.shade] += sq.d;
    if (opts.boxSeams) faintD += sq.d;
  }
  paperD += topPath;
  if (opts.insetGroove) {
    const insetPts = opts.insetGroove.map(pt => iso([pt[0], pt[1], z1], P));
    faintD += ptsToPath(insetPts, true);
  }
  let silhouetteVertsD = '';
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const v1 = edgeVisible[prev], v2 = edgeVisible[i];
    if (v1 !== v2 || (opts.sharpCorners && (v1 || v2))) {
      silhouetteVertsD += 'M' + bot2d[i][0] + ',' + bot2d[i][1] + 'L' + top2d[i][0] + ',' + top2d[i][1];
    }
  }
  const stAttr = opts.station ? ` data-station-hit="${opts.station}" class="assembly-hit"` : '';
  let svg = `<g${stAttr}><path class="iso-paper" d="${paperD}"/>`;
  if (isLit) {
    if (litSideD) svg += `<path class="iso-lit-side" d="${litSideD}"/>`;
  } else {
    for (let s = 0; s < 4; s++) if (shadeBuckets[s]) svg += `<path class="iso-s${s}" d="${shadeBuckets[s]}"/>`;
  }
  svg += `<path class="${topClass}" d="${topPath}"/>`;
  if (faintD) svg += `<path class="iso-stroke-faint" d="${faintD}"/>`;
  svg += `<path class="${strokeClass}" d="${topPath + visibleBotEdgesD + silhouetteVertsD}"/></g>`;
  return svg;
}

export function slabOf(cx, cy, w, d, z0, h, P, opts = {}) {
  const r = opts.r !== undefined ? opts.r : 4;
  const segs = opts.segs || ((IS_MOBILE || LOW_DETAIL) ? 2 : 3);
  const plan = roundedRectPlan(cx, cy, w, d, r, segs);
  return {
    depth: depthOf([cx, cy, z0 + h * 0.5], P) + (opts.depthBias || 0),
    station: opts.station || 0,
    svg: extrudePlan(plan, z0, h, P, { ...opts, sharpCorners: r <= 0.5 })
  };
}

export function cylinderOf(cx, cy, radius, z0, h, P, opts = {}) {
  const low = IS_MOBILE || LOW_DETAIL;
  const defaultSegs = radius > 20 ? (low ? 18 : 22) : (low ? 12 : 16);
  const segs = opts.segs || defaultSegs;
  const plan = circlePlan(cx, cy, radius, segs);
  let innerExtra = '';
  if (opts.knurl) {
    const z1 = z0 + h;
    const vx = P.cosA, vy = P.sinA;
    const unit = getUnitCircle(segs);
    let knurlPaths = '';
    for (let i = 0; i < segs; i += 2) {
      const nx = unit[i][0], ny = unit[i][1];
      if (nx * vx + ny * vy > 0.15) {
        const p0 = iso([cx + nx * radius, cy + ny * radius, z0 + 1], P);
        const p1 = iso([cx + nx * radius, cy + ny * radius, z1 - 1], P);
        knurlPaths += 'M' + p0[0] + ',' + p0[1] + 'L' + p1[0] + ',' + p1[1];
      }
    }
    if (knurlPaths) innerExtra += `<path class="iso-stroke-faint" d="${knurlPaths}"/>`;
  }
  if (opts.boreRadius) {
    const boreSegs = (IS_MOBILE || LOW_DETAIL) ? 12 : 16;
    const borePlan = circlePlan(cx, cy, opts.boreRadius, boreSegs);
    const borePts = new Array(boreSegs);
    for (let i = 0; i < boreSegs; i++) borePts[i] = iso([borePlan[i][0], borePlan[i][1], z0 + h], P);
    const boreD = ptsToPath(borePts, true);
    innerExtra += `<path class="iso-s0" d="${boreD}"/><path class="iso-stroke-lo" d="${boreD}"/>`;
  }
  const baseSvg = extrudePlan(plan, z0, h, P, opts);
  const svg = innerExtra ? baseSvg.slice(0, -4) + innerExtra + '</g>' : baseSvg;
  return {
    depth: depthOf([cx, cy, z0 + h * 0.5], P) + (opts.depthBias || 0),
    station: opts.station || 0,
    svg
  };
}

export function splitCoilSpring(cx, cy, radius, z0, z1, turns, P, opts = {}) {
  const ptsPerTurn = (IS_MOBILE || LOW_DETAIL) ? 10 : 14;
  const totalPts = turns * ptsPerTurn;
  const vx = P.cosA, vy = P.sinA;
  let backD = '', frontD = '';
  for (let i = 0; i < totalPts; i++) {
    const t0 = i / totalPts, t1 = (i + 1) / totalPts;
    const a0 = t0 * turns * Math.PI * 2, a1 = t1 * turns * Math.PI * 2;
    const s0 = iso([cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, z0 + (z1 - z0) * t0], P);
    const s1 = iso([cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, z0 + (z1 - z0) * t1], P);
    const midA = (a0 + a1) * 0.5;
    const seg = 'M' + s0[0] + ',' + s0[1] + 'L' + s1[0] + ',' + s1[1];
    if (Math.cos(midA) * vx + Math.sin(midA) * vy >= 0) frontD += seg;
    else backD += seg;
  }
  const strokeCls = opts.lit ? 'iso-stroke-lit' : 'iso-stroke-mid';
  const baseDepth = depthOf([cx, cy, (z0 + z1) * 0.5], P);
  const st = opts.station || 0;
  return [
    { depth: baseDepth - 4, station: st, svg: `<path class="iso-stroke-lo" d="${backD}"/>` },
    { depth: baseDepth + 4, station: st, svg: `<path class="${strokeCls}" d="${frontD}"/>` }
  ];
}

export function pipeRoute(points3d, P, opts = {}) {
  const pts2d = points3d.map(pt => iso(pt, P));
  const d = ptsToPath(pts2d, false);
  const isLit = Boolean(opts.lit);
  const toneCls = isLit ? 'iso-stroke-lit' : (opts.tone === 'hi' ? 'iso-stroke-hi' : 'iso-stroke-mid');
  const start = pts2d[0], end = pts2d[pts2d.length - 1];
  const dotCls = isLit ? 'iso-dot-lit' : 'iso-dot';
  const r = opts.thick ? 2.3 : 1.7;
  const midPt = points3d[points3d.length >> 1];
  return {
    depth: depthOf(midPt, P) + (opts.depthBias || 0),
    station: opts.station || 0,
    svg: `<path class="iso-pipe-paper" d="${d}"/><path class="${toneCls}" style="stroke-width:${opts.thick ? '2.1px' : '1.35px'};" d="${d}"/><circle class="${dotCls}" cx="${start[0]}" cy="${start[1]}" r="${r}"/><circle class="${dotCls}" cx="${end[0]}" cy="${end[1]}" r="${r}"/>`
  };
}

/** Flat iso cube for DAG neighbour tiles & the tx scene (A's §7/§8 helpers). */
export function isoBoxSvg(cx, cy, w, d, h, clsTop, clsSide, strokeCls) {
  const x0 = cx - w * 0.5, x1 = cx + w * 0.5;
  const y0 = cy - d * 0.35, y1 = cy + d * 0.35;
  const top = `M${cx},${y0 - h}L${x1},${cy - h}L${cx},${y1 - h}L${x0},${cy - h}Z`;
  const left = `M${x0},${cy - h}L${cx},${y1 - h}L${cx},${y1}L${x0},${cy}Z`;
  const right = `M${cx},${y1 - h}L${x1},${cy - h}L${x1},${cy}L${cx},${y1}Z`;
  return `<path class="${clsSide}" d="${left}${right}"/><path class="${clsTop}" d="${top}"/><path class="${strokeCls}" d="${top}${left}${right}"/>`;
}

export function isoCubeSvg(cx, cy, z0, w, d, h, P, topCls, sideCls) {
  const hw = w / 2, hd = d / 2, z1 = z0 + h;
  const pl = [[cx - hw, cy - hd], [cx + hw, cy - hd], [cx + hw, cy + hd], [cx - hw, cy + hd]];
  const b = pl.map(p => iso([p[0], p[1], z0], P)), t = pl.map(p => iso([p[0], p[1], z1], P));
  const vx = P.cosA, vy = P.sinA;
  let sides = '';
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, dx = pl[j][0] - pl[i][0], dy = pl[j][1] - pl[i][1];
    if (dy * vx - dx * vy > 0) sides += quadToPath(b[i], b[j], t[j], t[i]);
  }
  const top = ptsToPath(t, true), c = iso([cx, cy, z0 + h * 0.5], P);
  return { d: depthOf([cx, cy, z0 + h * 0.5], P), c, t: iso([cx, cy, z1], P), svg: `<path class="${sideCls}" d="${sides}"/><path class="${topCls}" d="${top}"/>` };
}

/* Mobile/LOD flags — set at boot (A kept these module-global too). */
export let IS_MOBILE = false;
export let LOW_DETAIL = false;
export function setIsMobile(v) { IS_MOBILE = v; }
export function setLowDetail(v) { LOW_DETAIL = v; }

/* ── §2 B's sketch kit: seeded hand-drawn 2-D pen (ink lines, marker fills,
      leader lines, hand lettering) in screen space. Stage-space callers project
      with A's iso() first; sheet-space callers use their own viewBox. The pen is
      based on Kevin T. Ngo's statechart-art (MIT) — see CREDITS.md. ──── */
let rnd = Math.random;
let out = [];

export const seedWith = a => { rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
/** Start (or restart) a sheet: reset the output buffer, optionally re-seed the pen. */
export const beginSheet = (seed) => { out = []; if (seed !== undefined) seedWith(seed); return out; };
export const outArr = () => out;

export function resample(pts, step = 8) {
  const o = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(d / step));
    for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  o.push(pts[pts.length - 1]); return o;
}

export const sway = (lo, hi, n) => {
  const A = [], W = [], P = []; let m = 0;
  for (let i = 0; i < n; i++) { const l = lo * Math.pow(hi / lo, (i + rnd() * .8) / n), v = Math.pow(l / hi, .35) * (.6 + .8 * rnd()); A.push(v); W.push(2 * Math.PI / l); P.push(rnd() * 6.28); m += v * v; }
  m = 1 / Math.sqrt(m / 2);
  return s => { let v = 0; for (let i = 0; i < n; i++) v += A[i] * Math.sin(s * W[i] + P[i]); return v * m * .5; };
};

export function chase(t, L, ds, z = .72) {
  const m = t.length; if (m < 3) return t;
  const w = Math.min(.5, ds / L), k = w * w, c = 2 * z * w, lag = Math.round(2 * z / w);
  let x = t[0][0], y = t[0][1], vx = t[1][0] - x, vy = t[1][1] - y;
  const o = [[x, y]];
  for (let i = 1, n = m - 1 + lag + Math.round(.35 / w); i <= n; i++) {
    const q = t[Math.min(m - 1, i + lag - 1)];
    vx += k * (q[0] - x) - c * vx; vy += k * (q[1] - y) - c * vy; x += vx; y += vy; o.push([x, y]);
  }
  return o;
}

export const ease = (x, l) => { const t = Math.max(0, Math.min(1, x / l)); return t * t * (3 - 2 * t); };

/* Colors are CSS variable references (var(--ink), var(--lead), var(--wax),
   var(--paper-lit)…); inline style= supports var(), presentation attributes do not,
   so every shape below emits style="fill:…"/"stroke:…". Literal hex also works. */
export const B_INK = 'var(--ink)';
export const B_LEAD = 'var(--lead)';
export const B_WAX = 'var(--wax)';
export const B_PAPER_LIT = 'var(--paper-lit)';

/* the pen: a filled outline whose width varies with pressure along the way */
export function line(pts, { w = 1.5, col = B_INK, amp = .7, over = 2.2 } = {}) {
  w *= .8; amp = LOOSE; over = Math.min(over, 2.4);
  if (over) {
    const a = pts[0], b = pts[1], y = pts[pts.length - 1], z = pts[pts.length - 2];
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, lz = Math.hypot(y[0] - z[0], y[1] - z[1]) || 1;
    const oa = over * rnd(), oz = over * rnd();
    pts = [[a[0] + (a[0] - b[0]) / la * oa, a[1] + (a[1] - b[1]) / la * oa], ...pts.slice(1, -1), [y[0] + (y[0] - z[0]) / lz * oz, y[1] + (y[1] - z[1]) / lz * oz]];
  }
  const t = chase(resample(pts, 2.5), 2.2, 2.5), c = [0];
  for (let i = 1; i < t.length; i++) c.push(c[i - 1] + Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]));
  const len = c[c.length - 1] || .1, trem = amp / .7 + .25;
  const bow = sway(Math.max(45, len * .9), Math.max(150, len * 3.5), 2), mid = sway(19, 108, 3), fine = sway(4, 20, 3), press = sway(38, 300, 3), rad = sway(12, 92, 3);
  const bowA = Math.min(1.6, len * .0042) * trem, midA = .34 * trem, hiA = .1 * trem, swell = rnd() < .3 ? .38 : .2;
  const step = Math.max(1.4, Math.min(6, len / 7)), L = [], R = [];
  for (let s = 0, j = 0; ; s = Math.min(len, s + step)) {
    while (j < t.length - 2 && c[j + 1] < s) j++;
    const u = Math.min(1, (s - c[j]) / ((c[j + 1] - c[j]) || 1e-6)), a = t[Math.max(0, j - 1)], b = t[Math.min(t.length - 1, j + 2)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const off = bowA * bow(s) + midA * mid(s) + hiA * fine(s);
    const x = t[j][0] + (t[j + 1][0] - t[j][0]) * u - dy * off, y = t[j][1] + (t[j + 1][1] - t[j][1]) * u + dx * off;
    const h2 = w / 2 * (1 + .12 * press(s) + .09 * rad(s)) * (.5 + .5 * Math.min(ease(s, 3.6), ease(len - s, 4.6))) * (1 + swell * Math.exp(-s / 3.5));
    L.push([x - dy * h2, y + dx * h2]); R.unshift([x + dy * h2, y - dx * h2]);
    if (s >= len) break;
  }
  out.push(`<path style="fill:${col}" d="M${[...L, ...R].map(p => n1(p[0]) + ' ' + n1(p[1])).join('L')}Z"/>`);
}

export function fillShape(pts, col, { dx = 0, dy = 0, amp = 0 } = {}) {
  const r = resample([...pts, pts[0]], 8).map(p => [p[0] + dx + amp * (rnd() - .5) * 2, p[1] + dy + amp * (rnd() - .5) * 2]);
  out.push(`<path style="fill:${col}" d="M${r.map(p => n1(p[0]) + ' ' + n1(p[1])).join('L')}Z"/>`);
}

export const inkLoop = (pts, o) => line([...pts, pts[0], pts[1]], o);
export const pathOf = pts => 'M' + pts.map(p => n1(p[0]) + ' ' + n1(p[1])).join('L');
export const rim = (pts, w, col = B_INK, o = 1) => out.push(`<path d="${pathOf(pts)}Z" fill="none" style="stroke:${col}" stroke-width="${w}" opacity="${o}"/>`);
export const flat = (pts, col) => fillShape(pts, col);
export const rule = (pairs, col = B_INK, w = .6, o = 1) => { if (pairs.length) out.push(`<path d="${pairs.map(([a, b]) => `M${n1(a[0])} ${n1(a[1])}L${n1(b[0])} ${n1(b[1])}`).join('')}" fill="none" style="stroke:${col}" stroke-width="${w}" opacity="${o}" stroke-linecap="round"/>`); };
export const dot = (x, y, r, col = B_WAX, ink = 1.2) => { const c = ringAt((a, b) => [x + r * a, y + r * b], 22); fillShape(c, col, { dx: .5, dy: .4, amp: .3 }); inkLoop(c, { w: ink, amp: .35, over: 0 }); };
export const ringAt = (fn, n = 30) => Array.from({ length: n }, (_, i) => { const t = i / n * 2 * Math.PI; return fn(Math.cos(t), Math.sin(t)); });
export const plus = (x, y, r = 7) => { line([[x - r, y], [x + r, y]], { w: .95, amp: .1, over: 0 }); line([[x, y - r], [x, y + r]], { w: .95, amp: .1, over: 0 }); };
export const dash = (a, b, col = B_LEAD) => { const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 13); for (let i = 0; i < n; i++) if (i % 2 === 0) line([[a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n]], { w: .9, col, amp: .1, over: 0 }); };

/* notes are written by hand: the leader wavers, the rings are not quite round */
export let LOOSE = 0;
export const loose = fn => { LOOSE = .9; fn(); LOOSE = 0; };
export const handRing = (c, r, col = B_LEAD, w, paper = B_PAPER_LIT) => { const p = ringAt((a, b) => [c[0] + r * a, c[1] + r * b], 14); if (paper) out.push(`<path d="${pathOf(p)}Z" style="fill:${paper}"/>`); line([...p, p[0], p[1]], { w, col, over: 0 }); };
export function leader(a, b, sx, col = B_LEAD) {
  const dy = b[1] - a[1], run = Math.abs(dy) * .58, ex = b[0] - sx * run;
  const e = sx * (ex - a[0]) > 0 ? [ex, a[1]] : a;
  loose(() => { line(e === a ? [a, b] : [a, e, b], { w: 1.05, col, over: 0 }); handRing(a, 3.8, col, 1); handRing(b, 3.8, col, 1); });
  out.push(`<circle cx="${n1(b[0])}" cy="${n1(b[1])}" r="1.2" style="fill:${col}"/>`);
}
/** B's label(), in screen space: a numbered marker-paper note with a leader line
    to `to2d` (already projected by the caller). */
export function noteLabel(tx, ty, title, note, to2d, side = 'start') {
  const q = to2d, s = side === 'start' ? 1 : -1, w = Math.max(title.length * 13, note.length * 8.5) + 12, a = [tx + s * w, ty + 20];
  out.push(`<g class="co-note" data-to="${n1(q[0])},${n1(q[1])}">`);
  leader(a, q, Math.sign(q[0] - a[0]) || s);
  out.push(`<text x="${tx}" y="${ty + 24}" text-anchor="${side}" class="co-title">${title.toUpperCase()}</text><text x="${tx}" y="${ty + 50}" text-anchor="${side}" class="co-note-line">${note}</text></g>`);
}
export const bText = (x, y, s, cls, { size = 14, col = B_INK, anchor = 'start', track = .2 } = {}) =>
  out.push(`<text x="${n1(x)}" y="${n1(y)}" class="${cls}" font-size="${size}" style="fill:${col}" text-anchor="${anchor}" letter-spacing="${track}">${s}</text>`);
