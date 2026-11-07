/* engine/camera.js — A's stage camera, behaviour unchanged: azimuth orbit drag
   (32°–64°), wheel/pinch zoom (0.55×–3.5×), pan-when-zoomed, LOD classes, the
   tap-vs-drag split (>10px vertical = page scroll, a pinch is never a tap).
   Emits 'stage:tap' with the hit assembly for controls.js. */
import { makeCamera, VB, setLowDetail } from './iso.js';
import { clamp } from '../util/format.js';
import { emit } from '../util/events.js';
import { state } from './render.js';

const stage = document.getElementById('iso-stage');
const BASE = { x: 100, y: -30, w: 800, h: 600 };
const cam = { z: 1, x: BASE.x, y: BASE.y };
const zLbl = document.getElementById('zoom-lbl');

export function applyCam() {
  const w = BASE.w / cam.z, h = BASE.h / cam.z;
  const padX = w * 0.75, padY = h * 0.75;
  cam.x = clamp(cam.x, BASE.x - padX, BASE.x + BASE.w - w + padX);
  cam.y = clamp(cam.y, BASE.y - padY, BASE.y + BASE.h - h + padY);
  VB.x = cam.x; VB.y = cam.y; VB.w = w; VB.h = h;
  stage.setAttribute('viewBox', `${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  stage.classList.toggle('zoomed', cam.z > 1.02);
  stage.classList.toggle('lod-low', cam.z < 0.72);
  stage.classList.toggle('nb-far', cam.z > 2.3);
  zLbl.textContent = cam.z.toFixed(1) + '×';
  emit('camera:zoom', cam.z);
}

export function zoomAt(nz, fx = 0.5, fy = 0.5) {
  const z = clamp(nz, 0.55, 3.5), w0 = BASE.w / cam.z, h0 = BASE.h / cam.z, w1 = BASE.w / z, h1 = BASE.h / z;
  cam.x += (w0 - w1) * fx; cam.y += (h0 - h1) * fy; cam.z = z; applyCam();
}

export function resetCam() { cam.z = 1; cam.x = BASE.x; cam.y = BASE.y; applyCam(); }
export const camZ = () => cam.z;

/** Focus a model point (used by the guided flow and callouts). */
export function focusPoint(wx, wy, wz, z = 1.5) {
  // project with the default framing camera, then zoom there
  const P = makeCamera(state.azimuth, 30, 495, 318, 1.38);
  const vx = P.origin[0] + (wx * P.sinA - wy * P.cosA) * P.k;
  const vy = P.origin[1] + ((wx * P.cosA + wy * P.sinA) * P.sinE - wz * P.cosE) * P.k;
  const w = BASE.w / z;
  cam.x = vx - w / 2; cam.y = vy - (BASE.h / z) / 2;
  cam.z = clamp(z, 0.55, 3.5);
  applyCam();
}

/* ---- orbit drag + tap selection (A's initControls stage handlers) ---- */
let downHit = null;

stage.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  state.dragging = true;
  state.didDragMove = false;
  state.pointerDownX = e.clientX;
  state.pointerDownY = e.clientY;
  state.dragStartAzimuth = state.azimuth;
  downHit = e.target.closest ? e.target.closest('[data-station-hit]') : null;
  try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  camDown(e);
});

stage.addEventListener('pointermove', (e) => {
  if (camMove(e)) return;
  if (!state.dragging) return;
  const dx = e.clientX - state.pointerDownX;
  const dy = e.clientY - state.pointerDownY;
  if (!state.didDragMove && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
    state.dragging = false;
    return;
  }
  if (Math.abs(dx) > 5) {
    state.didDragMove = true;
    setLowDetail(true);
    const nextAz = Math.min(64, Math.max(32, Math.round(state.dragStartAzimuth + dx * 0.12)));
    if (nextAz !== state.azimuth) {
      const bucketChanged = Math.round(nextAz / 2) !== Math.round(state.azimuth / 2);
      state.azimuth = nextAz;
      if (bucketChanged) state.sceneDirty = true;
    }
  }
});

const endPointer = (e) => {
  camUp(e);
  if (!state.dragging) return;
  state.dragging = false;
  try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
  if (!state.didDragMove) {
    if (downHit) {
      const hitStation = Number(downHit.getAttribute('data-station-hit'));
      emit('stage:tap', hitStation);
    }
  } else {
    setLowDetail(false); state.sceneDirty = true;
  }
};

stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', (e) => {
  camUp(e);
  state.dragging = false;
  setLowDetail(false); state.sceneDirty = true;
});

/* ---- real multi-touch camera (A's §8) ---- */
const ptrs = new Map();
let pinch = null, panLast = null;

export function camDown(e) {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  panLast = { x: e.clientX, y: e.clientY };
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    state.didDragMove = true; // a pinch is never a tap
  }
}

export function camMove(e) {
  if (!ptrs.has(e.pointerId)) return false;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const r = stage.getBoundingClientRect();
  if (ptrs.size >= 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const k = (BASE.w / cam.z) / r.width;
    cam.x -= (mx - pinch.mx) * k; cam.y -= (my - pinch.my) * k;
    pinch.mx = mx; pinch.my = my;
    zoomAt(pinch.z * d / pinch.d, (mx - r.left) / r.width, (my - r.top) / r.height);
    return true;
  }
  if (cam.z > 1.05 && state.dragging && panLast) {
    const moved = Math.abs(e.clientX - state.pointerDownX) + Math.abs(e.clientY - state.pointerDownY);
    if (moved > 6) state.didDragMove = true;
    if (state.didDragMove) {
      const k = (BASE.w / cam.z) / r.width;
      cam.x -= (e.clientX - panLast.x) * k; cam.y -= (e.clientY - panLast.y) * k;
      applyCam();
    }
    panLast = { x: e.clientX, y: e.clientY };
    return true;
  }
  panLast = { x: e.clientX, y: e.clientY };
  return false;
}

export function camUp(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; panLast = null; }

/* ---- HUD zoom buttons & tilt ---- */
document.getElementById('z-in').onclick = () => zoomAt(cam.z * 1.3);
document.getElementById('z-out').onclick = () => zoomAt(cam.z / 1.3);
document.getElementById('z-home').onclick = () => { resetCam(); state.azimuth = 48; state.sceneDirty = true; };
document.getElementById('z-tilt').onclick = () => {
  const presets = [36, 48, 60];
  const cur = presets.findIndex(a => Math.abs(a - state.azimuth) < 5);
  state.azimuth = presets[(cur + 1) % presets.length];
  state.sceneDirty = true; emit('camera:tilt');
};

stage.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey && cam.z === 1) return;
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  zoomAt(cam.z * (e.deltaY < 0 ? 1.15 : 0.87), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
}, { passive: false });

/* keyboard zoom keys live in ui/keyboard.js (A's map) */

applyCam();
