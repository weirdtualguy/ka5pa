/* ui/bytes.js — A's Byte Anatomy panel (wire-byte bar, field list, orbitable field
   CAD, hex grid, DNA helix strand), behaviour unchanged, plus B's to-scale byte
   strip taped to the bottom of the figure. Both views are driven by data/fields.js. */
import {
  makeCamera, slabOf, cylinderOf, pipeRoute, beginSheet, outArr, bText
} from '../engine/iso.js';
import { state } from '../engine/render.js';
import { live, digest } from '../data/api.js';
import { sampleBlock } from '../data/sample.js';
import { byteFields, STRIP_CAPTION } from '../data/fields.js';
import { clamp, esc } from '../util/format.js';
import { on } from '../util/events.js';
import { sfx, selectStation } from './controls.js';
import { announce, revealPlate } from './a11y.js';

let selByteIdx = 0;
let selHexByteIdx = 0;
let fieldIsoAzimuth = 46;

export function currentDigest() { return live.d || digest(sampleBlock(state.era, state.daaScore, state.blueScore)); }
function currentVersion() {
  const h = (live.d && live.d.h) || {};
  return state.era === 1 ? 1 : (Number(h.version) >= 2 ? Number(h.version) : 2);
}

/* ---- interactive isometric CAD sub-assembly for the selected field (A's §8) ---- */
function renderFieldIsoDiagram(field) {
  const svg = document.getElementById('field-iso-svg');
  const azEl = document.getElementById('field-iso-az');
  if (!svg || !field) return;
  if (azEl) azEl.textContent = `${fieldIsoAzimuth}°`;

  const P = makeCamera(fieldIsoAzimuth, 28, 160, 78, 1.1);
  const parts = [];
  const wires = [];
  const addP = (o) => parts.push(o);
  const addW = (w) => wires.push(w);

  addP(slabOf(0, 0, 146, 84, -10, 6, P, { r: 4, tone: 'lo', depthBias: -1e6 }));

  const k = field.key;
  if (k === 'version') {
    addP(slabOf(-24, 0, 44, 46, -4, 14, P, { r: 3, tone: 'mid', lit: selHexByteIdx === 0 }));
    addP(slabOf(24, 0, 44, 46, -4, 14, P, { r: 3, tone: 'lo', lit: selHexByteIdx === 1 }));
    addP(cylinderOf(-24, 0, 12, 10, state.era === 1 ? 8 : 16, P, { tone: 'hi', lit: true, knurl: true, boreRadius: 4 }));
    addP(cylinderOf(24, 0, 9, 10, 5, P, { tone: 'mid' }));
  } else if (k === 'parents' || k === 'pruningPoint') {
    const n = k === 'parents' ? Math.min(5, (live.d && live.d.parents.length) || 4) : 1;
    addP(slabOf(0, 0, 112, 54, -4, 12, P, { r: 4, tone: 'mid' }));
    for (let i = 0; i < n; i++) {
      const px = n === 1 ? 0 : -38 + i * (76 / (n - 1));
      addP(cylinderOf(px, 0, n === 1 ? 18 : 8.5, 8, 16 + (i === 0 ? 8 : 0), P, {
        tone: i === 0 ? 'hi' : 'mid', lit: i === 0, knurl: i === 0, boreRadius: n === 1 ? 7 : 4
      }));
    }
  } else if (k === 'seqCommit') {
    addP(cylinderOf(0, 0, 32, -4, 14, P, { tone: 'mid', knurl: true }));
    addP(cylinderOf(0, 0, 18, 10, 12, P, { tone: 'hi', lit: true, boreRadius: 7 }));
    for (let p = 0; p < 8; p++) {
      const ang = (p / 8) * Math.PI * 2;
      addP(cylinderOf(Math.cos(ang) * 24, Math.sin(ang) * 24, 3.2, 10, p < 5 ? 11 : 4, P, { tone: p < 5 ? 'hi' : 'lo', lit: p === (selHexByteIdx % 8) }));
    }
  } else if (k === 'hashMerkle' || k === 'utxoCommit') {
    addP(slabOf(0, 0, 74, 58, -4, 10, P, { r: 4, tone: 'mid' }));
    addP(cylinderOf(0, 0, 22, 6, 26, P, { tone: 'hi', lit: true, knurl: true, boreRadius: 8 }));
    addP(cylinderOf(-44, -14, 7, -4, 16, P, { tone: 'mid' }));
    addP(cylinderOf(-44, 14, 7, -4, 16, P, { tone: 'mid' }));
    addW(pipeRoute([[-37, -14, 8], [-18, -8, 18]], P, { thick: true, lit: true }));
    addW(pipeRoute([[-37, 14, 8], [-18, 8, 18]], P, { thick: true }));
  } else if (k === 'nonce' || k === 'bits') {
    addP(cylinderOf(-18, 0, 25, -4, 12, P, { tone: 'hi', lit: true, knurl: true, boreRadius: 8 }));
    addP(cylinderOf(32, 0, 14, -4, 22, P, { tone: 'mid', knurl: true, lit: k === 'nonce' }));
    addW(pipeRoute([[7, 0, 4], [18, 0, 8]], P, { thick: true, lit: true }));
  } else {
    const bars = Math.min(8, field.bytes);
    for (let i = 0; i < bars; i++) {
      const bx = -49 + i * 14;
      const byteVal = parseInt((field.hex || '').slice(i * 2, i * 2 + 2) || '40', 16) || 64;
      const bh = 6 + (byteVal / 255) * 22;
      addP(slabOf(bx, 0, 10, 38, -4, bh, P, { r: 1.5, tone: i === (selHexByteIdx % bars) ? 'hi' : 'mid', lit: i === (selHexByteIdx % bars) }));
    }
  }

  parts.sort((a, b) => a.depth - b.depth);
  svg.innerHTML = parts.map(p => p.svg).join('') + wires.map(w => w.svg).join('');
}

/* ---- main byte view (A's renderByteAnatomy) ---- */
export function renderByteAnatomy() {
  const bar = document.getElementById('byte-bar');
  const list = document.getElementById('field-list');
  const totalEl = document.getElementById('byte-total');
  const srcEl = document.getElementById('byte-src');
  if (!bar || !list) return;

  const d = currentDigest();
  const fields = byteFields(d, currentVersion());
  const totalBytes = fields.reduce((s, f) => s + f.bytes, 0);
  if (selByteIdx >= fields.length) selByteIdx = 0;

  if (srcEl) srcEl.textContent = (live.isLive ? 'live header · ' : 'sample header · ') + totalBytes + ' B';
  if (totalEl) totalEl.textContent = `Σ ${totalBytes} B serialized header`;

  bar.innerHTML = fields.map(f => {
    const pct = ((f.bytes / totalBytes) * 100).toFixed(2);
    const shortLbl = (f.bytes / totalBytes) >= 0.13 ? f.name.replace('header.', '') : '';
    return `<div class="byte-seg${f.idx === selByteIdx ? ' sel' : ''}" data-bidx="${f.idx}" style="width:${pct}%;background:${f.color}" title="${f.name} (${f.bytes} B)"><span>${shortLbl}</span></div>`;
  }).join('');

  list.innerHTML = fields.map(f => `
    <div class="fl-row${f.idx === selByteIdx ? ' sel' : ''}" data-bidx="${f.idx}" data-st="${f.st}">
      <span class="fn"><i class="sw" style="background:${f.color}"></i><span>${f.name}<small>${f.type}</small></span></span>
      <span class="fb">${f.bytes} B</span>
      <span class="fo">@${f.offset}..${f.end}</span>
    </div>
  `).join('');

  const sf = fields[selByteIdx] || fields[0];
  document.getElementById('fd-title').textContent = sf.name;
  document.getElementById('fd-sub').textContent = `${sf.type} · ${sf.bytes} bytes · wire offset ${sf.offset}..${sf.end}`;
  const jumpBtn = document.getElementById('fd-jump-btn');
  if (jumpBtn) {
    jumpBtn.textContent = `Station 0${sf.st} →`;
    jumpBtn.onclick = () => { selectStation(sf.st, true); revealPlate(); };
  }
  document.getElementById('field-note').innerHTML = sf.note;

  const cleanHex = String(sf.hex || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  const bytePairs = [];
  for (let i = 0; i < Math.min(cleanHex.length, 128); i += 2) bytePairs.push(cleanHex.slice(i, i + 2));
  if (selHexByteIdx >= bytePairs.length) selHexByteIdx = 0;
  document.getElementById('hex-grid').innerHTML = bytePairs.map((b, idx) =>
    `<span class="hex-cell${idx === selHexByteIdx ? ' sel' : ''}" data-hbyte="${idx}" title="wire offset +${idx} (0x${b} = ${parseInt(b, 16)})">${b}</span>`
  ).join('') + (sf.bytes > 64 ? `<span class="hex-cell">+${sf.bytes - 64} B…</span>` : '');

  renderFieldIsoDiagram(sf);
  renderByteStrip();
}

/* ---- B's to-scale byte strip, taped under the figure (kaspa.js byteStrip) ---- */
export function renderByteStrip() {
  const svg = document.getElementById('byte-strip-svg');
  if (!svg) return;
  const d = currentDigest();
  const fields = byteFields(d, currentVersion());
  const total = fields.reduce((s, f) => s + f.bytes, 0);
  const W = 640, x0 = 10, y0 = 30, H = 22, u = (W - 20) / total;

  beginSheet(31);
  bText(x0, 16, `THE SERIALIZED HEADER · ${total} B · TO SCALE`, 'bs-cap', { size: 13, track: 1.4 });
  let x = x0;
  for (const f of fields) {
    const r = [[x, y0], [x + f.bytes * u, y0], [x + f.bytes * u, y0 + H], [x, y0 + H]];
    /* one path per field: fill + ink edging come from the .bs-{key} class so every theme restyles it */
    outArr().push(`<path class="bs-seg bs-${f.key}" data-bidx="${f.idx}" d="M${r.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')}Z"/>`);
    x += f.bytes * u;
  }
  const row = (y, s, cx) => outArr().push(`<text x="${cx.toFixed(1)}" y="${y}" text-anchor="middle" class="bs-note">${s}</text>`);
  const y1 = y0 + H + 14, y2 = y0 + H + 27;
  const at = (key) => {
    const f = fields.find(q => q.key === key);
    return x0 + (f.offset + f.bytes / 2) * u;
  };
  row(y1, `parents ${(d.parents || []).length} · 4 shown`, at('parents'));
  row(y1, 'three roots · 32 B each', at('utxoCommit'));
  row(y1, 'work 24', at('blueWork'));
  row(y2, 'pruning 32', at('pruningPoint'));
  bText(x0, y2 + 20, STRIP_CAPTION, 'bs-small', { size: 11 });
  svg.innerHTML = outArr().join('');
}

/* ---- DNA helix (A's v8 secondary view) ---- */
let dnaIdx = 0, dnaPhase = 0, dnaDrag = false, dnaX = 0, dnaHover = null, dnaRect = null;
const dnaCv = document.getElementById('dna-cv');
const dnaCtx = dnaCv.getContext('2d');
const dnaInfo = document.getElementById('dna-info'), dnaChips = document.getElementById('dna-chips'), dnaComp = document.getElementById('dna-comp');

function sizeDna() { dnaCv.width = dnaCv.clientWidth || 600; dnaCv.height = 176; dnaRect = null; }
export { sizeDna };

function dnaFields() {
  const d = currentDigest();
  const fields = byteFields(d, currentVersion());
  return fields.map(f => ({ k: f.name.replace('header.', ''), hex: f.hex, st: f.st, desc: f.note.replace(/<[^>]+>/g, '') }));
}

export function setDnaField(i) {
  const F = dnaFields(); if (!F.length) return;
  dnaIdx = ((i % F.length) + F.length) % F.length;
  const f = F[dnaIdx];
  dnaChips.innerHTML = F.map((x, j) =>
    `<button type="button" class="ctrl-btn mono${j === dnaIdx ? ' active' : ''}" data-dna="${j}">${esc(x.k)}</button>`
  ).join('');
  const hx = String(f.hex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const cnt = [0, 0, 0, 0];
  for (let k = 0; k < hx.length; k++) { const v = parseInt(hx[k], 16) || 0; cnt[(v >> 2) & 3]++; cnt[v & 3]++; }
  const tot = Math.max(1, hx.length * 2);
  const pal = ['--anatomy-lit', '--anatomy-blue', '--anatomy-green', '--anatomy-mid'];
  dnaComp.innerHTML = cnt.map((c, b) => `<i style="width:${(c / tot * 100).toFixed(1)}%;background:var(${pal[b]})"></i>`).join('');
  dnaInfo.innerHTML = `<span style="color:var(--anatomy-lit)">${esc(f.k)}</span> · ${hx.length >> 1} B · ${hx.length * 4} bits · <span style="color:var(--anatomy-muted)">${esc(f.desc)}</span><br>${esc(f.hex)}`;
}

function drawDna(dt) {
  const viewHelix = document.getElementById('view-helix');
  if (viewHelix.hidden) return;
  const F = dnaFields(); if (!F.length) return;
  const f = F[dnaIdx] || F[0], h = String(f.hex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const W = dnaCv.width, H = dnaCv.height, cy = H * 0.46, amp = H * 0.29;
  dnaCtx.clearRect(0, 0, W, H);
  if (!state.reducedMotion && !dnaDrag) dnaPhase = (dnaPhase + dt * 1.1) % (Math.PI * 2);
  const cs = getComputedStyle(document.documentElement);
  const col = [cs.getPropertyValue('--anatomy-lit').trim() || '#ea580c', cs.getPropertyValue('--anatomy-blue').trim() || '#2563eb', cs.getPropertyValue('--anatomy-green').trim() || '#0d9488', cs.getPropertyValue('--anatomy-mid').trim() || '#666'];
  const n = Math.min(Math.max(h.length * 2, 16), 128), step = (W - 36) / n;
  for (let i = 0; i < n; i++) {
    const nib = parseInt(h[i >> 1] || '0', 16) || 0;
    const base = (i & 1) ? (nib & 3) : ((nib >> 2) & 3);
    const x = 18 + (i + 0.5) * step, a = dnaPhase + i * 0.28;
    const s = Math.sin(a), y1 = cy + s * amp, y2 = cy - s * amp;
    dnaCtx.strokeStyle = col[base]; dnaCtx.lineWidth = 1.6;
    dnaCtx.beginPath(); dnaCtx.moveTo(x, y1); dnaCtx.lineTo(x, y2); dnaCtx.stroke();
    dnaCtx.fillStyle = col[base];
    dnaCtx.beginPath(); dnaCtx.arc(x, y1, 2.8, 0, Math.PI * 2); dnaCtx.fill();
    dnaCtx.fillStyle = col[base ^ 3];
    dnaCtx.beginPath(); dnaCtx.arc(x, y2, 2.4, 0, Math.PI * 2); dnaCtx.fill();
  }
}

/* ---- init ---- */
export function initBytes() {
  const viewBytes = document.getElementById('view-bytes');
  const viewHelix = document.getElementById('view-helix');
  const btnModeBytes = document.getElementById('btn-mode-bytes');
  const btnModeHelix = document.getElementById('btn-mode-helix');

  viewBytes.addEventListener('click', (e) => {
    const hb = e.target.closest('[data-hbyte]');
    if (hb) {
      selHexByteIdx = Number(hb.getAttribute('data-hbyte')) || 0;
      renderByteAnatomy();
      sfx.tick();
      return;
    }
    const el = e.target.closest('[data-bidx]');
    if (!el) return;
    selByteIdx = Number(el.getAttribute('data-bidx')) || 0;
    selHexByteIdx = 0;
    renderByteAnatomy();
    sfx.tick();
    announce(byteFields(currentDigest(), currentVersion())[selByteIdx]?.name || 'field');
  });

  /* byte strip segments select the field in the Bytes view */
  const stripSvg = document.getElementById('byte-strip-svg');
  stripSvg.addEventListener('click', (e) => {
    const seg = e.target.closest('[data-bidx]');
    if (!seg) return;
    selByteIdx = Number(seg.getAttribute('data-bidx')) || 0;
    selHexByteIdx = 0;
    renderByteAnatomy();
    document.getElementById('dna-panel').scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'center' });
    sfx.tick();
  });

  /* drag-to-orbit on the mini field CAD */
  const fSvg = document.getElementById('field-iso-svg');
  let fDrag = false, fStartX = 0, fStartAz = 46;
  fSvg.addEventListener('pointerdown', (e) => {
    fDrag = true; fStartX = e.clientX; fStartAz = fieldIsoAzimuth;
    try { fSvg.setPointerCapture(e.pointerId); } catch (_) {}
  });
  fSvg.addEventListener('pointermove', (e) => {
    if (!fDrag) return;
    fieldIsoAzimuth = clamp(Math.round(fStartAz + (e.clientX - fStartX) * 0.35), 20, 74);
    renderFieldIsoDiagram(byteFields(currentDigest(), currentVersion())[selByteIdx]);
  });
  const endFDrag = () => { fDrag = false; };
  fSvg.addEventListener('pointerup', endFDrag);
  fSvg.addEventListener('pointercancel', endFDrag);

  /* mode toggle */
  btnModeBytes.onclick = () => {
    viewBytes.hidden = false; viewHelix.hidden = true;
    btnModeBytes.classList.add('active'); btnModeHelix.classList.remove('active');
    renderByteAnatomy();
  };
  btnModeHelix.onclick = () => {
    viewBytes.hidden = true; viewHelix.hidden = false;
    btnModeHelix.classList.add('active'); btnModeBytes.classList.remove('active');
    sizeDna(); setDnaField(dnaIdx);
  };

  dnaChips.onclick = (e) => {
    const b = e.target.closest('[data-dna]'); if (!b) return;
    setDnaField(Number(b.getAttribute('data-dna'))); sfx.tick();
  };
  dnaCv.addEventListener('pointerdown', (e) => { dnaDrag = true; dnaX = e.clientX; try { dnaCv.setPointerCapture(e.pointerId); } catch (_) {} });
  dnaCv.addEventListener('pointermove', (e) => {
    if (!dnaRect) dnaRect = dnaCv.getBoundingClientRect();
    dnaHover = (e.clientX - dnaRect.left) / dnaRect.width;
    if (dnaDrag) { dnaPhase += (e.clientX - dnaX) * 0.025; dnaX = e.clientX; }
  });
  dnaCv.addEventListener('pointerup', () => { dnaDrag = false; });

  on('block:applied', () => { renderByteAnatomy(); setDnaField(dnaIdx); });
  on('era:changed', renderByteAnatomy);
  on('theme:changed', () => renderFieldIsoDiagram(byteFields(currentDigest(), currentVersion())[selByteIdx]));

  sizeDna();
  setDnaField(0);
  renderByteAnatomy();
}

export { drawDna };
