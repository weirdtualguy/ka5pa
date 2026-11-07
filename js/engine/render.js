/* engine/render.js — A's animation core, behaviour unchanged: shared state, 240 Hz
   spring kinematics, scene application, fast kinematics + glow canvas, motes, and
   the workload model. Modules read `state` and set `state.sceneDirty`; only this
   loop repaints the model. */
import {
  DEG, VB, makeCamera, iso, depthOf, setIsMobile
} from './iso.js';
import { buildScene } from './scene.js';
import { emit, on as onBus } from '../util/events.js';
import { clamp } from '../util/format.js';
import { CAP } from '../data/budgets.js';
import { live } from '../data/api.js';

export const SUB_RATE = 240;
export const QUIET = 0.0006;

/* A's shared state — same fields, same defaults (tourActive is now driven by the
   guided flow, which replaces the Idle Tour). */
export const state = {
  theme: 'dark',
  station: 0,
  tourActive: false,
  tourTimer: 0,
  timeScale: 1.0,
  azimuth: 48,
  covenantTxs: 38,
  activeLanes: 14,
  zkProofs: 2,
  daaScore: 474165582,
  blueScore: 468912044,
  nonceCounter: 0x7f4a9c12,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  hovering: false,
  dragging: false,
  stageVis: true,
  pointerDownX: 0,
  pointerDownY: 0,
  dragStartAzimuth: 48,
  didDragMove: false,
  sceneDirty: true,
  explode: { at: 0, rate: 0, want: 0 },
  pressStroke: { at: 0, rate: 0, want: 0 },
  gaugeNeedle: { at: 0.64, rate: 0, want: 0.64 },
  carriageSlide: { at: 0, rate: 0, want: 0 },
  turretStepAngle: 0,
  turretSweepAngle: 0,
  flywheelAngle: 0,
  stampBurst: 0,
  follow: true,
  liveOn: false,
  parentN: 3,
  era: 2,
  nerd: false,
  solidCount: 0,
  stationCounts: {}
};

setIsMobile(window.matchMedia('(max-width: 768px)').matches);

export let activeCam = makeCamera(state.azimuth, 30, 495, 318, 1.38);
export let cachedZDialTop = 43.2;
export let cachedZTurretTop = 46.2;
export let cachedZCrownTop = 114.2;
export let cachedZBase = -18;

const dom = {};
export function initRenderDom() {
  dom.layerSolids = document.getElementById('layer-solids');
  dom.layerWires = document.getElementById('layer-wires');
  dom.isoStage = document.getElementById('iso-stage');
  dom.partCounter = document.getElementById('part-counter-badge');
  dom.fastDialNeedle = document.getElementById('fast-dial-needle');
  dom.fastDialHub = document.getElementById('fast-dial-hub');
  dom.fastTurretSweep = document.getElementById('fast-turret-sweep');
  dom.fastTurretHub = document.getElementById('fast-turret-hub');
  dom.fastFlywheelSpokes = document.getElementById('fast-flywheel-spokes');
  dom.shaderCanvas = document.getElementById('shader-canvas');
  dom.shaderCtx = dom.shaderCanvas ? dom.shaderCanvas.getContext('2d') : null;
}

/* A's spring integrator (calm mode snaps) */
export function stepSpring(held, want, dt, stiff, drag, calm) {
  if (calm) {
    const changed = held.at !== want;
    held.at = want;
    held.rate = 0;
    return changed;
  }
  if (Math.abs(want - held.at) < QUIET && Math.abs(held.rate) < QUIET) {
    if (held.at !== want || held.rate !== 0) {
      held.at = want;
      held.rate = 0;
      return true;
    }
    return false;
  }
  const steps = Math.max(Math.ceil(dt * SUB_RATE), 1);
  const slice = dt / steps;
  for (let s = 0; s < steps; s++) {
    held.rate += (want - held.at) * stiff * slice - held.rate * drag * slice;
    held.at += held.rate * slice;
  }
  if (Math.abs(want - held.at) < QUIET && Math.abs(held.rate) < QUIET) {
    held.at = want;
    held.rate = 0;
  }
  return true;
}

/* A's workload model — formulas unchanged; CAP comes from data/budgets.js. */
export function computeModelMetrics() {
  const cov = state.covenantTxs, lanes = state.activeLanes, zk = state.zkProofs;
  const computeMass = (live.d && state.follow) ? Math.min(CAP.compute, live.d.cmass) : Math.min(CAP.compute, Math.round(18000 + cov * 5400 + lanes * 4800 + zk * 68000));
  const scriptUnits = computeMass * 100;
  const txBytes = Math.min(250000, Math.round(1200 + cov * 2150 + lanes * 1450 + zk * 24000));
  const transientMass = Math.min(CAP.transient, txBytes * 4);
  const storageMass = Math.min(CAP.storage, Math.round(12000 + cov * 4900 + lanes * 6200 + zk * 12000));
  const uC = computeMass / CAP.compute, uT = transientMass / CAP.transient, uS = storageMass / CAP.storage;
  const blockUtil = Math.max(uC, uT, uS);
  const dominantBudget = blockUtil === uT ? 'TRANSIENT' : (blockUtil === uC ? 'COMPUTE' : 'STORAGE');
  const feeSompi = 100 * Math.max(computeMass, 2 * txBytes);
  const feeKas = (feeSompi / 1e8).toFixed(4);
  return { computeMass, scriptUnits, txBytes, transientMass, storageMass, blockUtil, uC, uT, uS, dominantBudget, feeSompi, feeKas };
}

/* ---- scene application (A's renderStaticAndSpringSolids, DOM half) ---- */
let sceneItems = [];
let sceneWires = [];
const poseBake = { e: 0, p: 0, s: 0 };
export let lastAnchors = null;

export function renderStaticAndSpringSolids() {
  const P = makeCamera(state.azimuth, 30, 495, 318, 1.38);
  activeCam = P;
  const m = computeModelMetrics();
  const built = buildScene(P, state, m);
  const { items, wires, anchors, solidCount, stationCounts } = built;

  let solidsHtml = '';
  for (let i = 0; i < items.length; i++) solidsHtml += '<g>' + items[i].svg + '</g>';
  let wiresHtml = '';
  for (let i = 0; i < wires.length; i++) wiresHtml += '<g>' + wires[i].svg + '</g>';

  dom.layerSolids.innerHTML = solidsHtml;
  dom.layerWires.innerHTML = wiresHtml;
  const solidKids = dom.layerSolids.children, wireKids = dom.layerWires.children;
  for (let i = 0; i < items.length; i++) items[i].el = solidKids[i];
  for (let i = 0; i < wires.length; i++) wires[i].el = wireKids[i];
  sceneItems = items; sceneWires = wires;
  poseBake.e = state.explode.at; poseBake.p = state.pressStroke.at; poseBake.s = state.carriageSlide.at;
  if (dom.partCounter) dom.partCounter.textContent = `${solidCount} Solids · 6 Assemblies`;
  state.solidCount = solidCount; state.stationCounts = stationCounts;
  state.sceneDirty = false;
  lastAnchors = anchors;
  emit('scene:rendered', { anchors, m, P });
}

export function updatePoseTransforms() {
  const dE = state.explode.at - poseBake.e;
  const dP = state.pressStroke.at - poseBake.p;
  const dS = state.carriageSlide.at - poseBake.s;
  if (!dE && !dP && !dS) return;
  const P = activeCam;
  const slideX = dS * 12;
  const tX = slideX * P.sinA * P.k;
  const tYx = slideX * P.cosA * P.sinE * P.k;
  const cZ = P.cosE * P.k;

  let prev = -Infinity;
  for (let i = 0; i < sceneItems.length; i++) {
    const it = sceneItems[i];
    const dd = it.depth + (it.dzv.e * dE + it.dzv.p * dP) * P.sinE;
    if (dd < prev - 1) { state.sceneDirty = true; return; }
    if (dd > prev) prev = dd;
  }
  for (let i = 0; i < sceneItems.length; i++) {
    const it = sceneItems[i];
    const dz = it.zv.e * dE + it.zv.p * dP;
    const dx = it.zv.x * tX;
    const dy = -(dz * cZ) + it.zv.x * tYx;
    if (dx || dy) it.el.setAttribute('transform', 'translate(' + dx.toFixed(2) + ',' + dy.toFixed(2) + ')');
    else if (it.el) it.el.removeAttribute('transform');
    if (it.regen) it.el.innerHTML = it.regen();
  }
  for (let i = 0; i < sceneWires.length; i++) {
    const w = sceneWires[i];
    const dz = w.zv.e * dE + w.zv.p * dP;
    const dx = w.zv.x * tX;
    const dy = -(dz * cZ) + w.zv.x * tYx;
    if (dx || dy) w.el.setAttribute('transform', 'translate(' + dx.toFixed(2) + ',' + dy.toFixed(2) + ')');
    else if (w.el) w.el.removeAttribute('transform');
    if (w.regen) w.el.innerHTML = w.regen();
  }
  const e = state.explode.at, p = state.pressStroke.at;
  cachedZBase = -18 - 16 * e;
  cachedZDialTop = 2 * e + 43.2;
  cachedZTurretTop = 30 * e + 46.2;
  cachedZCrownTop = 84 + 78 * e - 18 * p + 30.2;
  emit('pose:changed', { e, p });
}

/* ---- 60fps fast-kinematics + half-res halo canvas (A's §4) ---- */
const GLOW_SPRITES = {};
function glowSprite(dark, base) {
  const key = (dark ? 'd' : 'l') + (base ? 'b' : 'p');
  let cv = GLOW_SPRITES[key];
  if (!cv) {
    const R = base ? 128 : 64;
    cv = document.createElement('canvas'); cv.width = cv.height = R * 2;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(R, R, 1, R, R, R);
    if (base) {
      if (dark) {
        gr.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        gr.addColorStop(0.7, 'rgba(0, 0, 0, 0.22)');
        gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        gr.addColorStop(0, 'rgba(160, 154, 142, 0.28)');
        gr.addColorStop(0.7, 'rgba(160, 154, 142, 0.11)');
        gr.addColorStop(1, 'rgba(160, 154, 142, 0)');
      }
    } else if (dark) {
      gr.addColorStop(0, 'rgba(45, 212, 191, 1)');
      gr.addColorStop(0.5, 'rgba(45, 212, 191, 0.35)');
      gr.addColorStop(1, 'rgba(45, 212, 191, 0)');
    } else {
      gr.addColorStop(0, 'rgba(234, 88, 12, 0.55)');
      gr.addColorStop(0.5, 'rgba(251, 146, 60, 0.22)');
      gr.addColorStop(1, 'rgba(251, 146, 60, 0)');
    }
    g.fillStyle = gr;
    g.beginPath();
    g.arc(R, R, R, 0, Math.PI * 2);
    g.fill();
    GLOW_SPRITES[key] = cv;
  }
  return cv;
}

export function updateFastKinematicsAndCanvas(now) {
  if (dom.isoStage && dom.isoStage.classList.contains('txview')) return;
  const P = activeCam;

  const needleAng = (-0.75 + state.gaugeNeedle.at * 1.5) * Math.PI;
  const cosN = Math.cos(needleAng), sinN = Math.sin(needleAng);
  const nCenter = iso([18, 80, cachedZDialTop + 0.5], P);
  const nTip = iso([18 + cosN * 17, 80 + sinN * 17, cachedZDialTop + 0.5], P);
  const nTail = iso([18 - cosN * 5, 80 - sinN * 5, cachedZDialTop + 0.5], P);
  dom.fastDialNeedle.setAttribute('d', 'M' + nTail[0] + ',' + nTail[1] + 'L' + nTip[0] + ',' + nTip[1]);
  dom.fastDialHub.setAttribute('cx', nCenter[0]);
  dom.fastDialHub.setAttribute('cy', nCenter[1]);

  const cosT = Math.cos(state.turretSweepAngle), sinT = Math.sin(state.turretSweepAngle);
  const tCenter = iso([108, -4, cachedZTurretTop], P);
  const tTip = iso([108 + cosT * 19, -4 + sinT * 19, cachedZTurretTop], P);
  const tOpp = iso([108 - cosT * 7, -4 - sinT * 7, cachedZTurretTop], P);
  dom.fastTurretSweep.setAttribute('d', 'M' + tOpp[0] + ',' + tOpp[1] + 'L' + tTip[0] + ',' + tTip[1]);
  dom.fastTurretHub.setAttribute('cx', tCenter[0]);
  dom.fastTurretHub.setAttribute('cy', tCenter[1]);

  let spokeD = '';
  for (let s = 0; s < 6; s++) {
    const ang = state.flywheelAngle + (s / 6) * Math.PI * 2;
    const c = Math.cos(ang), sn = Math.sin(ang);
    const pIn = iso([26 + c * 19, -16 + sn * 19, cachedZCrownTop], P);
    const pOut = iso([26 + c * 35, -16 + sn * 35, cachedZCrownTop], P);
    spokeD += 'M' + pIn[0] + ',' + pIn[1] + 'L' + pOut[0] + ',' + pOut[1];
  }
  dom.fastFlywheelSpokes.setAttribute('d', spokeD);
  dom.fastFlywheelSpokes.setAttribute('class', state.station === 6 ? 'iso-stroke-lit' : 'iso-stroke-mid');

  const canvas = dom.shaderCanvas, ctx = dom.shaderCtx;
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sx = canvas.width / VB.w, sy = canvas.height / VB.h, ox = VB.x, oy = VB.y;
  const isDark = state.theme === 'dark';
  const baseSprite = glowSprite(isDark, true);
  const pulseSprite = glowSprite(isDark, false);

  const baseCenter = iso([0, 0, cachedZBase - 12], P);
  const bx = (baseCenter[0] - ox) * sx, by = (baseCenter[1] - oy) * sy;
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(1.85, 0.95);
  ctx.drawImage(baseSprite, -125, -125, 250, 250);
  ctx.restore();

  const turretPt = iso([108, -4, cachedZTurretTop - 16], P);
  const crownPt = iso([26, -16, cachedZCrownTop - 4], P);

  const pulse = 0.22 + 0.16 * Math.sin(now * 0.004) + state.stampBurst * 0.45;
  ctx.globalAlpha = Math.min(1, pulse);
  ctx.drawImage(pulseSprite, (turretPt[0] - ox) * sx - 44, (turretPt[1] - oy) * sy - 44, 88, 88);
  ctx.globalAlpha = Math.min(1, pulse * 0.9);
  ctx.drawImage(pulseSprite, (crownPt[0] - ox) * sx - 48, (crownPt[1] - oy) * sy - 48, 96, 96);
  ctx.globalAlpha = 1;
}

/* ---- main loop (A's tick; the Idle Tour block is replaced by the guided flow) ---- */
let lastTime = performance.now();
export function startMainLoop() {
  requestAnimationFrame(function tick(now) {
    requestAnimationFrame(tick);
    const rawDt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    if (state.stageVis === false) return;
    const dt = rawDt * state.timeScale;
    const calm = state.reducedMotion;

    emit('tick:frame', { dt, rawDt, calm, now });

    const m = computeModelMetrics();
    state.gaugeNeedle.want = m.blockUtil;

    const movedExplode = stepSpring(state.explode, state.explode.want, dt, 140, 18, calm);
    const movedPress = stepSpring(state.pressStroke, 0, dt, 220, 16, calm);
    const movedNeedle = stepSpring(state.gaugeNeedle, state.gaugeNeedle.want, dt, 180, 15, calm);
    const movedCarriage = stepSpring(state.carriageSlide, state.carriageSlide.want, dt, 150, 17, calm);

    if (movedExplode || movedPress || movedCarriage) updatePoseTransforms();

    if (!calm) {
      state.turretSweepAngle = (state.turretSweepAngle + dt * 0.85) % (Math.PI * 2);
      state.flywheelAngle = (state.flywheelAngle + dt * 1.85 * (live.bps ? Math.min(2.5, live.bps / 10) : 1)) % (Math.PI * 2);
      state.stampBurst = Math.max(0, state.stampBurst - dt * 2.2);
    } else {
      state.stampBurst = 0;
    }

    if (state.sceneDirty) renderStaticAndSpringSolids();
    if ((!calm || movedNeedle || state.sceneDirty) && (!state.lite || now - (state.lastFast || 0) > 33)) {
      state.lastFast = now;
      updateFastKinematicsAndCanvas(now);
    }
  });
}

/* ---- ambient motes + DNA helix loop (A's §8 secondary rAF loop) ---- */
let moteCol = '#ea580c';
export function startAmbientLoop(sizeDnaFn, drawDnaFn) {
  const mcv = document.getElementById('mote-cv'), mctx = mcv.getContext('2d');
  const motes = Array.from({ length: 22 }, (_, i) => ({ x: (i * 37) % 100 / 100, y: (i * 61) % 100 / 100, s: 0.6 + (i % 3) * 0.4, v: 0.02 + (i % 5) * 0.008 }));
  function sizeMotes() { mcv.width = mcv.clientWidth || 360; mcv.height = mcv.clientHeight || 270; }
  sizeMotes();
  window.addEventListener('resize', sizeMotes);
  let t0 = performance.now();
  (function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - t0) / 1000, 0.05); t0 = now;
    if (!state.reducedMotion && state.stageVis !== false) {
      mctx.clearRect(0, 0, mcv.width, mcv.height);
      mctx.fillStyle = moteCol;
      for (const p of motes) {
        p.y -= p.v * dt * (live.bps ? clamp(live.bps / 10, 0.5, 2) : 1);
        if (p.y < 0) p.y = 1;
        mctx.globalAlpha = (1 - Math.abs(p.y - 0.5) * 1.8) * 0.45;
        mctx.beginPath(); mctx.arc(p.x * mcv.width, p.y * mcv.height, p.s * 1.6, 0, Math.PI * 2); mctx.fill();
      }
    }
    if (drawDnaFn) drawDnaFn(dt);
  })(t0);
}

/* ---- block application: A's state mutations on every applyBlock ---- */
export function initRenderSubscriptions() {
  onBus('block:applied', ({ d, isLive }) => {
    state.liveOn = true;
    if (isLive) {
      state.daaScore = Number(d.h.daaScore) || state.daaScore;
      state.blueScore = Number(d.v.blueScore || d.h.blueScore) || state.blueScore;
    }
    state.parentN = clamp(d.parents.length || 3, 1, 8);
    if (state.follow) {
      state.covenantTxs = clamp(d.txN, 1, 120);
      state.activeLanes = clamp(d.lanes, 1, 50);
    }
    state.sceneDirty = true;
  });
  onBus('theme:changed', () => {
    moteCol = getComputedStyle(document.documentElement).getPropertyValue('--anatomy-lit').trim() || '#ea580c';
  });
}
