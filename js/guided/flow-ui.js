/* guided/flow-ui.js — B's guided flow driving A's stage: "Play all", a "Pick one"
   row of the currently legal pills, "Next step →", an aria-live caption. Guards are
   real: no peel before a grind lands the hash under target, no fifth ZK proof.
   Machine states map to A's assemblies (merge rule 3) and B's tray order. */
import { moves, START, SAY, NEXT_SAYS, SEAT_SAYS, STATE_TO_TRAY } from './machine.js';
import { verify } from './check.js';
import { state, lastAnchors } from '../engine/render.js';
import { zoomAt, resetCam, focusPoint } from '../engine/camera.js';
import { selectStation, triggerBlockStamp, sfx } from '../ui/controls.js';
import { openTxScene, closeTxScene, isTxOpen } from '../ui/dag.js';
import { PROOF_MASS_GRAMS, MACHINE_BASE_TRANSIENT, CAP } from '../data/budgets.js';
import { on, emit } from '../util/events.js';

const bar = document.getElementById('guided-bar');
const caption = document.getElementById('gf-caption');
const pillsBox = document.getElementById('gf-pills');
const pickLabel = document.getElementById('gf-pick');
const powChip = document.getElementById('gf-pow');
const btnPlay = document.getElementById('gf-play');
const btnNext = document.getElementById('gf-next');
const btnLogic = document.getElementById('gf-logic');

let cur = { ...START };
let run = 0;
let playing = false;

/* deterministic verification at page load — "27 states, 46 steps" is computed */
let model = null;
export function verifiedModel() { return model; }

const stripGuard = (label) => label.replace(/\s*\[[^\]]*\]/, '');

function say(text) { caption.textContent = text; emit('guided:caption', text); }

function powPaint() {
  powChip.classList.toggle('on', cur.pow);
  powChip.textContent = cur.pow ? 'hash ≤ target ✓' : 'hash > target';
}

function pillsPaint() {
  const list = moves(cur);
  pillsBox.innerHTML = '';
  for (const [label] of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gf-pill';
    b.dataset.label = label;
    b.textContent = stripGuard(label);
    b.addEventListener('click', () => act(label));
    pillsBox.append(b);
  }
  const count = list.length;
  pillsBox.classList.toggle('many', count > 1);
  if (pickLabel) pickLabel.hidden = count < 2;
}

/* ---- stage effects for the machine states (A's assemblies, B's trays) ---- */
function stageFor(at, up = false) {
  emit('guided:tray', STATE_TO_TRAY[at]);
  if (at === 'sealed') {
    if (up || !isTxOpen()) closeTxScene();
    state.explode.want = 0;
    document.getElementById('btn-explode').classList.remove('active');
    selectStation(0, false);
    resetCam();
    return;
  }
  if (at === 'tx') {
    state.explode.want = 1;
    document.getElementById('btn-explode').classList.add('active');
    if (!isTxOpen()) openTxScene(1);
    return;
  }
  closeTxScene();
  state.explode.want = 1;
  document.getElementById('btn-explode').classList.add('active');
  if (at === 'commitments') selectStation(5, false);
  else if (at === 'body') selectStation(2, false);
  else if (at === 'parents') selectStation(1, false);
  const a = lastAnchors;
  if (a) {
    if (at === 'commitments') focusPoint((a.turret[0] + a.roots[0]) / 2, (a.turret[1] + a.roots[1]) / 2, a.turret[2] - 10, 1.4);
    else if (at === 'body') focusPoint(a.body[0], a.body[1], a.body[2] - 8, 1.4);
    else if (at === 'parents') focusPoint(a.floor[0], a.floor[1], a.floor[2] + 30, 1.3);
  }
}

function enter(to, text) {
  cur = to;
  stageFor(to.at);
  powPaint();
  pillsPaint();
  if (text) say(text);
  emit('guided:proofs', to.proofs);
  emit('guided:state', to);
}

/* ---- the actions ---- */
function act(label) {
  run++;
  const found = moves(cur).find(([l]) => l === label);
  if (!found) return;
  const to = found[1];

  if (label.startsWith('grind')) {
    triggerBlockStamp();
    sfx.tick();
    enter(to, 'kHeavyHash lands the hash under the target — the seal is good.');
    return;
  }
  if (label.startsWith('add')) {
    const read = (MACHINE_BASE_TRANSIENT + to.proofs * PROOF_MASS_GRAMS).toLocaleString('en-US');
    sfx.tick();
    enter(to, `A ZK proof joins the body — another ${PROOF_MASS_GRAMS.toLocaleString('en-US')} g of transient mass. The machine budget reads ${read} of ${CAP.transient.toLocaleString('en-US')} g.`);
    return;
  }
  sfx.whoosh();
  enter(to, NEXT_SAYS[to.at] || SEAT_SAYS[to.at] || SAY[to.at]);
}

export function nextStep() {
  if (cur.at === 'sealed') {
    if (!cur.pow) { say('Not yet: grind a nonce first — the hash is still above the target.'); return; }
    act('peel the header [hash below target]');
    return;
  }
  if (cur.at === 'parents') { say('That is the floor — the mergeset, at most 248 blocks, holds every layer up.'); return; }
  const order = { commitments: 'lift the roots', body: 'open a transaction', tx: 'follow an input down' };
  act(order[cur.at]);
}

export function playAll() {
  const my = ++run;
  playing = true;
  const step = (fn, ms) => setTimeout(() => { if (run === my) fn(); }, ms);
  if (!cur.pow) {
    step(() => { triggerBlockStamp(); enter({ ...cur, pow: true }, 'kHeavyHash lands the hash under the target — the seal is good.'); }, 60);
  } else say('The seal is good — peeling the block apart.');
  let t = 900;
  const down = [['peel the header [hash below target]', 'commitments'], ['lift the roots', 'body'], ['open a transaction', 'tx'], ['follow an input down', 'parents']];
  for (const [label, to] of down) {
    step(() => act(label), t);
    t += 1700;
  }
  const up = [['climb back up', 'tx'], ['close the transaction', 'body'], ['seat the roots', 'commitments'], ['press the seal', 'sealed']];
  for (const [label, to] of up) {
    step(() => act(label), t);
    t += 800;
  }
  step(() => {
    playing = false;
    say('One Kaspa block — one of ten a second. Press Next step to peel it yourself.');
    if (!state.explode.want) zoomAt(1);
  }, t);
}

/* ---- the guided auto-tour (replaces A's Idle Tour; toggle from the dock) ---- */
let tourTimer = 0;
export function initFlow() {
  model = verify();
  say(`${SAY.sealed} Every reachable state checked (${model.states} states, ${model.steps} steps) — all ${model.rules.length} rules hold.`);

  btnPlay.addEventListener('click', () => { run++; playAll(); });
  btnNext.addEventListener('click', () => { run++; playing = false; nextStep(); });
  btnLogic.addEventListener('click', () => { emit('logic:open'); });

  powPaint();
  pillsPaint();

  on('tick:frame', ({ dt, calm }) => {
    if (!state.tourActive || state.hovering || state.dragging || calm || playing) return;
    tourTimer += dt;
    if (tourTimer > 3.8) {
      tourTimer = 0;
      playAll();
    }
  });
  on('guided:toggle', () => {
    state.tourActive = !state.tourActive;
    tourTimer = 0;
    const b = document.getElementById('btn-tour');
    b.classList.toggle('active', state.tourActive);
    b.textContent = state.tourActive ? 'Guided flow: ON' : 'Guided flow: OFF';
    say(state.tourActive ? 'Guided flow on — playing the block in order, every few seconds.' : 'Guided flow paused.');
  });
  on('guided:auto-off', () => { if (playing) { run++; playing = false; } });
  on('station:selected', () => { if (playing) { run++; playing = false; } });
}

/* B's guard messages, for the logic panel demo and tests */
export { cur as machineState };
export function resetMachine() { cur = { ...START }; powPaint(); pillsPaint(); emit('guided:proofs', cur.proofs); }
