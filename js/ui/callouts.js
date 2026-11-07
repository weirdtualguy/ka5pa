/* ui/callouts.js — B's numbered left callouts ("1 · THE HEADER" …) with thin
   leader lines (sketch pen), the mobile pill row that stacks the same callouts
   above the figure on narrow screens, and the guided-flow ZK-proof envelopes in
   the body tray. Leaders track the settled explode pose; the lit tray follows
   station selection and the machine. */
import { iso, beginSheet, outArr, noteLabel, dash, fillShape, dot, rule, B_INK, B_LEAD } from '../engine/iso.js';
import { state, activeCam, lastAnchors } from '../engine/render.js';
import { TRAYS, trayOfStation } from '../engine/explode.js';
import { on } from '../util/events.js';
import { selectStation, sfx } from './controls.js';
import { revealPlate, announce } from './a11y.js';
import { isTxOpen, openTxScene } from './dag.js';

const sketchLayer = document.getElementById('layer-sketch');
const pillRow = document.getElementById('callout-row');

let litTray = 0;
let proofCount = 0;

/* vertical slots for the five tray notes, in stage viewBox units (desktop).
   Tray 4 (the opened transaction) has no on-stage solid: its leader lands on the
   body carriage and the note says to open the tx — the same tray list everywhere. */
const SLOTS = { 1: [108, 44], 2: [108, 136], 3: [108, 254], 4: [108, 372], 5: [108, 476] };
const ON_STAGE = [1, 2, 3, 5];
const NOTE4 = { title: '4 · ONE TRANSACTION', note: 'inputs spend · outputs bind · Open tx' };

function drawCallouts() {
  const anchors = lastAnchors; if (!anchors) return;
  const P = activeCam;
  beginSheet(47);
  /* tray 2 points between the commitment cylinders and the KIP-21 turret */
  const rootsMid = [
    (anchors.turret[0] + anchors.roots[0]) / 2,
    (anchors.turret[1] + anchors.roots[1]) / 2,
    (anchors.turret[2] + anchors.roots[2]) / 2
  ];
  const anchorOf = { 1: anchors.header, 2: rootsMid, 3: anchors.body, 5: anchors.floor };
  for (const t of TRAYS) {
    const [tx, ty] = SLOTS[t.n];
    const anchor = t.n === 4 ? [anchors.body[0] - 26, anchors.body[1] + 46, anchors.body[2] - 14] : anchorOf[t.n];
    const label = t.n === 4 ? NOTE4 : t;
    noteLabel(tx, ty, label.title, label.note, iso(anchor, P), 'start');
  }
  /* dashed construction guides between the trays, as on B's exploded sheet */
  if (state.explode.want > 0.5) {
    const pairs = [
      [anchors.header, anchors.turret],
      [anchors.turret, anchors.roots],
      [anchors.roots, anchors.body],
      [anchors.body, anchors.floor]
    ];
    for (const [a, b] of pairs) {
      const pa = iso([a[0], a[1], a[2] - 6], P), pb = iso([b[0], b[1], b[2] + 6], P);
      dash(pb, pa, B_INK);
    }
  }
  /* ZK proof envelopes in the body tray (guided flow model) */
  if (proofCount > 0 && state.explode.want > 0.5) {
    const zr = anchors.body[2] - 32;
    for (let i = 0; i < proofCount; i++) {
      const ex = -66 + i * 26, ey = 74 + (i % 2) * 8;
      const c = [
        iso([ex, ey, zr], P), iso([ex + 20, ey, zr], P),
        iso([ex + 20, ey + 14, zr], P), iso([ex, ey + 14, zr], P)
      ];
      const m = iso([ex + 10, ey + 7, zr], P);
      fillShape(c, 'var(--marker-paper)');
      rule([[c[0], m], [c[1], m], [c[2], m], [c[3], m]], B_INK, .45, .6);
      dot(m[0], m[1], 2.6, 'var(--wax)', .8);
    }
  }
  sketchLayer.innerHTML = outArr().join('');
  paintLit();
}

function paintLit() {
  const notes = sketchLayer.querySelectorAll('.co-note');
  notes.forEach((g, i) => g.classList.toggle('on', ALL_TRAYS[i] === litTray));
  pillRow.querySelectorAll('.callout-pill').forEach(p => {
    p.classList.toggle('on', Number(p.dataset.tray) === litTray);
  });
}
const ALL_TRAYS = [1, 2, 3, 4, 5];

/* ---- tray jumps (shared by desktop callouts and mobile pills) ---- */
export function jumpToTray(n) {
  if (n === 4) {
    const rows = document.querySelectorAll('#tx-list [data-tx]');
    openTxScene(rows.length > 1 ? 1 : 0);
    revealPlate();
    sfx.tick();
    announce('one transaction open');
    return;
  }
  const t = TRAYS.find(x => x.n === n);
  if (!t) return;
  state.explode.want = 1;
  document.getElementById('btn-explode').classList.add('active');
  selectStation(t.stations[0], true);
  revealPlate();
  sfx.tick();
  announce(t.title);
}

/* ---- init ---- */
export function initCallouts() {
  for (const t of TRAYS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'callout-pill';
    b.dataset.tray = t.n;
    b.innerHTML = `<b>${t.n}</b><span>${t.title.replace(/^\d+ · /, '')}</span><small>${t.note}</small>`;
    b.addEventListener('click', () => jumpToTray(t.n));
    pillRow.append(b);
  }

  sketchLayer.addEventListener('click', (e) => {
    const note = e.target.closest('.co-note');
    if (!note) return;
    const i = Array.from(sketchLayer.querySelectorAll('.co-note')).indexOf(note);
    jumpToTray([1, 2, 3, 4, 5][i]);
  });

  let lastKey = '';
  on('tick:frame', () => {
    const open = state.explode.want > 0.5;
    const settled = Math.abs(state.explode.at - state.explode.want) < 0.05;
    const key = [open && settled, state.azimuth, litTray, proofCount, isTxOpen()].join('|');
    if (key !== lastKey) {
      lastKey = key;
      if (open && settled && !isTxOpen()) drawCallouts();
      else sketchLayer.innerHTML = '';
    }
  });
  on('station:selected', ({ station }) => {
    litTray = trayOfStation(station, isTxOpen()) || 0;
    paintLit();
  });
  on('guided:tray', (n) => { litTray = n; paintLit(); });
  on('guided:proofs', (n) => { proofCount = n; });
}
