/* guided/logic-panel.js — "The logic": a paper modal with two tabs. Rules: the
   four verified rules recomputed at load by check.js (BFS) — counts and
   failing-guard demos are computed, never hard-coded. Flow chart: kaspa.mmd
   hand-drawn with the sketch pen; tap a state or arrow to see that tray on the
   stage. Footer keeps B's credit: statechart-art (Kevin T. Ngo), /statechart (poteto). */
import { beginSheet, outArr, line, fillShape, bText } from '../engine/iso.js';
import { ARROWS, STATES, STATE_TO_TRAY } from './machine.js';
import { verifiedModel } from './flow-ui.js';
import { selectStation } from '../ui/controls.js';
import { state } from '../engine/render.js';
import { on, emit } from '../util/events.js';
import { revealPlate } from '../ui/a11y.js';

const BOX = { sealed: [320, 84], commitments: [320, 196], body: [320, 320], tx: [320, 456], parents: [320, 592] };
const W = 224, H = 58;
const boxPts = (cx, cy) => [[cx - W / 2, cy - H / 2], [cx + W / 2, cy - H / 2], [cx + W / 2, cy + H / 2], [cx - W / 2, cy + H / 2]];
const STATE_LABEL = { sealed: 'Sealed — only the hash shows', commitments: 'Roots exposed', body: 'Body of transactions', tx: 'One transaction open', parents: 'The mergeset floor' };

/** Draw the statechart into an SVG string with clickable state/edge groups. */
export function drawChart() {
  beginSheet(53);
  /* boxes */
  for (const s of STATES) {
    const [cx, cy] = BOX[s];
    const pts = boxPts(cx, cy);
    outArr().push(`<g class="lg-state" data-id="${s}">`);
    fillShape(pts, 'var(--paper-lit)', { dx: .6, dy: .5, amp: .35 });
    line([...pts, pts[0], pts[1]], { w: 1.5, amp: .3, over: 1.5 });
    bText(cx, cy + 5, STATE_LABEL[s], 'lg-state-label', { size: 15, anchor: 'middle', track: .3 });
    outArr().push('</g>');
  }
  /* arrows between states (skip self-loops and the start marker) */
  const rail = {
    'sealed→commitments': [252, 0], 'commitments→body': [252, 0], 'body→tx': [252, 0], 'tx→parents': [252, 0],
    'parents→tx': [-252, 0], 'tx→body': [-252, 0], 'body→commitments': [-252, 0], 'commitments→sealed': [-252, 0]
  };
  for (const a of ARROWS) {
    if (a.from === '[*]') {
      const [cx, cy] = BOX[a.to];
      outArr().push(`<g class="lg-edge" data-from="[*]" data-to="${a.to}">`);
      /* tail kept inside the viewBox (top edge is y = 0) */
      line([[cx, cy - H / 2 - 50], [cx, cy - H / 2 - 8]], { w: 1.7, col: 'var(--red)', amp: .4, over: 0 });
      const tip = [cx, cy - H / 2 - 2], bl = [cx - 5.5, cy - H / 2 - 14], br = [cx + 5.5, cy - H / 2 - 14];
      fillShape([tip, bl, br], 'var(--red)', { amp: .2 });
      outArr().push('</g>');
      continue;
    }
    if (a.from === a.to) continue; // self-loops drawn separately below
    const k = a.from + '→' + a.to;
    const off = rail[k] ? rail[k][0] : 0;
    const [fx, fy] = BOX[a.from], [tx, ty] = BOX[a.to];
    const down = ty > fy;
    const x0 = fx + off, x1 = tx + off;
    const y0 = down ? fy + H / 2 : fy - H / 2;
    const y1 = down ? ty - H / 2 : ty + H / 2;
    outArr().push(`<g class="lg-edge" data-from="${a.from}" data-to="${a.to}">`);
    line([[x0, y0 + 6], [x1, y1 - 12]], { w: 1.5, col: 'var(--red)', amp: .35, over: 0 });
    const dir = down ? 1 : -1;
    fillShape([[x1, y1 - 2 * dir], [x1 - 5.5, y1 - 16 * dir], [x1 + 5.5, y1 - 16 * dir]], 'var(--red)', { amp: .2 });
    /* labels sit in the gap between the boxes, on the rail side they belong to,
       so they never cross the viewBox edge (they used to run off 640 on phones) */
    bText(x1 + (off > 0 ? -8 : 8), (y0 + y1) / 2 + 4, a.label.replace(/\s*\[[^\]]*\]/, ''), 'lg-edge-label', {
      size: 12, anchor: off > 0 ? 'end' : 'start', track: .2, col: 'var(--lead)'
    });
    outArr().push('</g>');
  }
  /* self-loops: the nonce grind (sealed) and the four ZK proofs (body), fanned
     out so no two rings or labels collide */
  const loops = [
    ['sealed', 'grind a nonce [hash still above target]', 0],
    ['body', 'add a zk proof [room for a first]', 0],
    ['body', 'add another [room for a second]', 1],
    ['body', 'add a third [room for a third]', 2],
    ['body', 'add a fourth [fills the budget exactly]', 3]
  ];
  for (const [st, label, i] of loops) {
    const [cx, cy] = BOX[st];
    const r = 12;
    const lx = cx + W / 2 + (st === 'sealed' ? 34 : 30) + (st === 'body' ? i * 26 : 0);
    const ly = st === 'sealed' ? cy - H / 2 + 2 : cy - 8 + (i - 1.5) * 22;
    outArr().push(`<g class="lg-edge" data-from="${st}" data-to="${st}">`);
    const ring = [];
    for (let k2 = 0; k2 <= 14; k2++) { const t = -0.6 + k2 / 14 * 5.2; ring.push([lx + r * Math.cos(t), ly + r * Math.sin(t)]); }
    line(ring, { w: 1.3, col: 'var(--red)', amp: .3, over: 0 });
    const tip = [lx + r * Math.cos(-0.6), ly + r * Math.sin(-0.6)];
    fillShape([[tip[0] + 7, tip[1] - 2], [tip[0] - 4, tip[1] - 6], [tip[0] + 1, tip[1] + 5]], 'var(--red)', { amp: .2 });
    bText(lx + 15, ly + 4, label.replace(/\s*\[[^\]]*\]/, ''), 'lg-edge-label', { size: 12, track: .2, col: 'var(--lead)', anchor: 'start' });
    outArr().push('</g>');
  }
  return outArr().join('');
}

/* ---- the modal ---- */
export function initLogicPanel() {
  const wrap = document.createElement('div');
  wrap.id = 'lg';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div id="lg-card" role="dialog" aria-modal="true" aria-label="The logic">
      <div id="lg-head"><b>The logic</b><button id="lg-x" aria-label="Close">✕</button></div>
      <p id="lg-checked"></p>
      <div id="lg-tabs" role="tablist">
        <button data-t="rules" role="tab" aria-selected="true">Rules</button>
        <button data-t="chart" role="tab" aria-selected="false">Flow chart</button>
      </div>
      <div id="lg-rules"></div>
      <div id="lg-chart" hidden><p class="lg-tip">Tap a state or an arrow to see it in the picture.</p>
        <svg id="lg-chart-svg" viewBox="0 0 700 660" role="img" aria-label="Statechart of the guided flow"></svg>
        <p id="lg-note"></p>
      </div>
      <p id="lg-credit">Inspired by <a href="https://github.com/kevintngo/statechart-art" rel="noopener" target="_blank">statechart-art</a> by Kevin T. Ngo. Rules checked with <a href="https://github.com/cursor/plugins/tree/main/pstack" rel="noopener" target="_blank">/statechart</a> by poteto.</p>
    </div>`;
  document.body.append(wrap);

  const show = () => {
    const m = verifiedModel();
    if (!m) return;
    wrap.querySelector('#lg-checked').textContent = m.checked + ' Checked by a small search over the model, not by TLC.';
    wrap.querySelector('#lg-rules').innerHTML = m.rules.map(r =>
      `<div class="lg-rule"><b>${r.rule}</b><p>${r.says}</p><p class="p">${r.path}</p></div>`).join('');
    wrap.querySelector('#lg-chart-svg').innerHTML = drawChart();
    wrap.hidden = false;
    tab('rules');
  };
  const tab = (t) => {
    wrap.querySelectorAll('#lg-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
    wrap.querySelector('#lg-rules').hidden = t !== 'rules';
    wrap.querySelector('#lg-chart').hidden = t !== 'chart';
  };
  wrap.querySelectorAll('#lg-tabs button').forEach(b => b.addEventListener('click', () => tab(b.dataset.t)));
  wrap.querySelector('#lg-x').addEventListener('click', () => { wrap.hidden = true; });
  wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.hidden = true; });

  wrap.querySelector('#lg-chart-svg').addEventListener('click', (e) => {
    const st = e.target.closest('.lg-state');
    const edge = e.target.closest('.lg-edge');
    if (st) {
      const id = st.dataset.id;
      const tray = STATE_TO_TRAY[id];
      state.explode.want = id === 'sealed' ? 0 : 1;
      document.getElementById('btn-explode').classList.toggle('active', id !== 'sealed');
      const stationOf = { sealed: 6, commitments: 5, body: 2, tx: 2, parents: 1 };
      selectStation(stationOf[id], false);
      emit('guided:tray', tray);
      if (id === 'tx') import('../ui/dag.js').then(d => d.openTxScene(1));
      wrap.hidden = true;
      revealPlate();
    } else if (edge) {
      const to = edge.dataset.to;
      if (to && to !== '[*]') {
        const stationOf = { sealed: 6, commitments: 5, body: 2, tx: 2, parents: 1 };
        state.explode.want = to === 'sealed' ? 0 : 1;
        document.getElementById('btn-explode').classList.toggle('active', to !== 'sealed');
        selectStation(stationOf[to], false);
        emit('guided:tray', STATE_TO_TRAY[to]);
        wrap.hidden = true;
        revealPlate();
      }
    }
  });

  on('logic:open', show);
  /* Escape closes the modal via ui/keyboard.js (A's key handler owns the key map) */
}
