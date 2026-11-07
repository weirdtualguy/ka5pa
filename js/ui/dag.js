/* ui/dag.js — A's DAG layer, behaviour unchanged: in-stage neighbour walk, tx
   dissection, mergeset map, live rows, block stream, hash loader. B's paper touches
   (pennant, coins, wax seal) are added inside the tx scene with the sketch pen. */
import {
  makeCamera, iso, isoBoxSvg, isoCubeSvg, beginSheet, outArr, line, fillShape, dot, rule,
  B_INK, B_WAX
} from '../engine/iso.js';
import { state, activeCam, cachedZBase, cachedZCrownTop } from '../engine/render.js';
import { live, applyBlock, fetchBlock, fetchTx, poll, pollNet, API_BASE } from '../data/api.js';
import { esc, sh, num, si, clamp } from '../util/format.js';
import { emit, on } from '../util/events.js';
import { selectStation, sfx } from './controls.js';
import { revealPlate, announce } from './a11y.js';

const stageEl = document.getElementById('iso-stage');
const nbLayer = document.getElementById('layer-neighbors');
const txLayer = document.getElementById('layer-tx');
const zBack = document.getElementById('z-back'), zTip = document.getElementById('z-tip'), zTx = document.getElementById('z-tx');

let openTxIdx = -1;
let txSceneIdx = -1, txSel = null;
const moreOv = document.getElementById('more-ov');
const moreTitle = document.getElementById('more-title');
const moreList = document.getElementById('more-list');

/* ---- HUD sync (A's syncHud) ---- */
export function syncHud() {
  const inTx = txSceneIdx >= 0;
  stageEl.classList.toggle('txview', inTx);
  zBack.hidden = !inTx && !canGoBack();
  zBack.textContent = '‹ back';
  zTip.hidden = !live.pin;
  zTx.hidden = inTx || state.station !== 2;
}

/* ---- tx dissection ---- */
export function openTxScene(idx, nav) {
  const txs = (live.block && live.block.transactions) || [];
  if (!txs.length) return;
  txSceneIdx = clamp(idx | 0, 0, txs.length - 1);
  txSel = null; moreOv.hidden = true;
  if (nav) record(location.hash, { block: live.d && live.d.v.hash, tx: txSceneIdx }, history.state && history.state.tx != null);
  renderTxScene(); syncHud(); sfx.whoosh();
  announce('transaction ' + txSceneIdx + ' opened');
}
export function closeTxScene() {
  if (txSceneIdx < 0) return;
  txSceneIdx = -1; txSel = null; moreOv.hidden = true;
  syncHud(); sfx.whoosh();
}
export const isTxOpen = () => txSceneIdx >= 0;
export const txOpenIndex = () => txSceneIdx;

/* ---- block loader + search ---- */
const HEX64 = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/i;
const setMsg = (t) => { const m = document.getElementById('blk-msg'); if (m) m.textContent = t; };
/* ---- history: every pinned block / opened transaction is a history entry, so the
   browser and Android back button step through them. history.state = { i, block, tx } ---- */
let navI = 0;
let navMode = 'push';                       // 'push' | 'replace' | 'none' (popstate, first load)
export const canGoBack = () => navI > 0;
function record(hash, st, replace) {
  if (navMode === 'none') return;
  const url = hash && hash !== '#' ? (hash[0] === '#' ? hash : '#' + hash) : location.pathname + location.search;
  const doReplace = replace || navMode === 'replace';
  const i = doReplace ? navI : navI + 1;
  try { history[doReplace ? 'replaceState' : 'pushState']({ i, ...st }, '', url); navI = i; } catch (e) { /* sandboxed */ }
}
export function goBack() {
  const st = history.state || {};
  if (txSceneIdx >= 0 && (navI === 0 || st.tx == null)) { closeTxScene(); syncHud(); return; }
  if (navI > 0) history.back();
}
function unpin() {
  live.pin = null; state.follow = true; live.lastHash = '';
  closeTxScene(); setMsg('');
  poll(true); syncHud();
}
export function goTip() {
  if (!live.pin) return;
  record('', {});
  unpin();
}

/** Load and pin a block. Returns 'ok', 'missing' (HTTP 404) or 'error'. */
export async function loadBlock(hash, quiet) {
  const h = (hash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) { if (!quiet) setMsg('Enter a 64-character block hash.'); return 'error'; }
  const pin = (b, isLive) => {
    const same = live.pin === h;
    live.pin = h; state.follow = false;
    closeTxScene();
    if (!same) record(h, { block: h });
    applyBlock(b, isLive);
    syncHud();
  };
  const hit = live.ring.find(x => x.h === h);
  if (hit && hit.b) { pin(hit.b, live.isLive); if (!quiet) setMsg('Block ' + sh(h)); return 'ok'; }
  if (!quiet) setMsg('Loading ' + sh(h) + '…');
  try {
    pin(await fetchBlock(h), true);
    if (!quiet) setMsg('Block ' + sh(h));
    return 'ok';
  } catch (e) {
    const missing = e.status === 404;
    if (!quiet) setMsg(missing ? 'No block with that hash.' : 'Could not reach the Kaspa API.');
    return missing ? 'missing' : 'error';
  }
}

let searching = false;
/** Search bar: a block hash, a transaction id, or a pasted explorer link. */
export async function searchChain(raw) {
  if (searching) return;
  const m = String(raw || '').match(HEX64);
  if (!m) { setMsg('Enter a 64-character block hash or transaction ID.'); return; }
  const id = m[0].toLowerCase();
  searching = true;
  document.getElementById('search-form').classList.add('busy');
  setMsg('Searching…');
  try {
    const r = await loadBlock(id, true);
    if (r === 'ok') { setMsg('Block ' + sh(id)); revealPlate(); return; }
    if (r === 'error') { setMsg('Could not reach the Kaspa API.'); return; }
    let tx;
    try { tx = await fetchTx(id); }
    catch (e) { setMsg(e.status === 404 ? 'No block or transaction with that ID.' : 'Could not reach the Kaspa API.'); return; }
    const blocks = Array.isArray(tx.block_hash) ? tx.block_hash : [];
    if (!blocks.length) { setMsg('Transaction ' + sh(id) + ' is not in a block yet.'); return; }
    for (const bh of blocks) {
      if (await loadBlock(bh, true) !== 'ok') continue;
      const txs = (live.block && live.block.transactions) || [];
      const idx = txs.findIndex(t => t.verboseData && t.verboseData.transactionId === id);
      if (idx >= 0) {
        openTxIdx = idx; record(id, { block: bh, tx: idx }); openTxScene(idx);
        setMsg('Transaction ' + sh(id) + ' in block ' + sh(bh));
        revealPlate();
        return;
      }
    }
    setMsg('Found the transaction but could not load its block.');
  } finally {
    searching = false;
    document.getElementById('search-form').classList.remove('busy');
  }
}

/** Boot: restore history position and open a search from the URL fragment (#<hash>). */
export function initNav() {
  navI = (history.state && history.state.i) || 0;
  try { history.replaceState({ ...(history.state || {}), i: navI }, ''); } catch (e) { /* sandboxed */ }
  const m = location.hash.slice(1);
  if (HEX64.test(m)) {
    document.getElementById('blk-in').value = m;
    navMode = 'replace';
    searchChain(m).finally(() => { navMode = 'push'; });
  }
  window.addEventListener('popstate', onPop);
}

async function onPop(e) {
  const st = e.state || {};
  navI = st.i || 0;
  navMode = 'none';
  try {
    if (txSceneIdx >= 0 && st.tx == null) closeTxScene();
    const hm = location.hash.slice(1).match(HEX64);
    const target = st.block || (hm && hm[0].toLowerCase()) || '';
    if (target) {
      if (live.pin !== target) await loadBlock(target, true);
      if (st.tx != null && txSceneIdx !== st.tx) { openTxIdx = st.tx; openTxScene(st.tx); }
    } else if (live.pin) unpin();
    setMsg('');
  } finally { navMode = 'push'; syncHud(); }
}

/* ---- isometric 3D mergeset neighbourhood map (A's drawMap) ---- */
function drawMap(d) {
  const P = d.parents || [], C = d.children || [];
  const n = Math.min(P.length, 6), m = Math.min(C.length, 3);
  const yAt = (i, k) => k === 1 ? 62 : 18 + i * (88 / (k - 1));
  let s = '';
  for (let i = 0; i < n; i++) {
    const y = yAt(i, n), sel = P[i] === d.selected;
    s += `<path d="M54,${y}C102,${y} 112,62 146,62" class="${sel ? 'iso-stroke-lit' : 'iso-stroke-faint'}"/>`;
    s += `<g class="nb" data-map-hash="${esc(P[i])}" style="cursor:pointer"><title>Parent ${esc(P[i])}</title>`;
    s += isoBoxSvg(44, y + 3, 18, 14, sel ? 9 : 6, sel ? 'iso-lit-top' : 'iso-top', sel ? 'iso-lit-side' : 'iso-s1', sel ? 'iso-stroke-lit' : 'iso-stroke-lo');
    s += `<text x="4" y="${y + 4}" class="nodeT">${esc(P[i].slice(0, 4))}</text></g>`;
  }
  if (P.length > 6) s += `<text x="4" y="122" class="nodeT">+${P.length - 6} more</text>`;
  for (let i = 0; i < m; i++) {
    const y = yAt(i, m);
    s += `<path d="M174,62C212,62 222,${y} 266,${y}" class="iso-stroke-faint"/>`;
    s += `<g class="nb" data-map-hash="${esc(C[i])}" style="cursor:pointer"><title>Child ${esc(C[i])}</title>`;
    s += isoBoxSvg(274, y + 3, 16, 12, 6, 'iso-top', 'iso-s1', 'iso-stroke-lo');
    s += `<text x="288" y="${y + 4}" class="nodeT">${esc(C[i].slice(0, 4))}</text></g>`;
  }
  if (!C.length) s += '<text x="312" y="65" class="nodeT" text-anchor="end">tip · no children yet</text>';

  s += isoBoxSvg(160, 66, 28, 22, 14, 'iso-lit-top', 'iso-lit-side', 'iso-stroke-lit');
  s += `<text x="160" y="92" text-anchor="middle" class="nodeTb">${esc(sh(d.v.hash, 6, 4))}</text>`;

  const tiles = (arr, fillVar, x0, dir) => arr.slice(0, 12).map((h, i) => {
    const cx = x0 + dir * i * 11;
    return `<g data-map-hash="${esc(h)}" style="cursor:pointer"><title>${esc(h)}</title><polygon points="${cx},132 ${cx + 5},135.5 ${cx},139 ${cx - 5},135.5" fill="var(${fillVar})" stroke="var(--anatomy-paper)" stroke-width="0.6"/></g>`;
  }).join('');
  s += tiles(d.blues, '--anatomy-blue', 16, 1) + tiles(d.reds, '--anatomy-red', 304, -1);
  s += `<text x="160" y="164" text-anchor="middle" class="nodeT">${d.blues.length} blue · ${d.reds.length} red in mergeset (k = 124)</text>`;
  document.getElementById('live-map').innerHTML = s;
}

/* ---- live rows + net cards (A's renderLive) ---- */
export function renderLive() {
  const d = live.d; if (!d) return;
  const chip = document.getElementById('live-chip');
  chip.classList.toggle('on', live.isLive);
  chip.textContent = live.isLive ? 'Live · ' + num(state.daaScore) : 'Sample data';
  document.getElementById('lv-src').textContent = live.isLive ? new URL(API_BASE).host + ' · sink' : 'sample · not chain data';
  drawMap(d);

  const ver = state.era === 1 ? 1 : (Number(d.h.version) >= 2 ? Number(d.h.version) : 2);
  const rows = [
    ['version', 6, esc(ver) + ' <em>' + (ver >= 2 ? 'Toccata block layout (v2 · KIP-21)' : 'pre-Toccata layout (v1)') + '</em>'],
    ['timestamp', 6, esc(new Date(Number(d.h.timestamp)).toISOString().replace('T', ' ').slice(11, 23) + ' UTC')],
    ['daa_score', 6, esc(num(d.h.daaScore))],
    ['blue_score', 6, esc(num(d.v.blueScore || d.h.blueScore))],
    ['bits / nonce', 6, esc('0x' + (Number(d.h.bits) >>> 0).toString(16) + ' / ' + sh(String(d.h.nonce), 6, 4))],
    ['parents', 1, d.parents.length + ' <em>level 0</em> · sel ' + esc(sh(d.selected))],
    ['mergeset', 1, d.blues.length + ' blue · ' + d.reds.length + ' red'],
    ['pruning_point', 1, esc(sh(d.h.pruningPoint, 8, 6))],
    ['hash_merkle', 5, esc(sh(d.h.hashMerkleRoot, 8, 6))],
    ['utxo_commit', 5, esc(sh(d.h.utxoCommitment, 8, 6))],
    ['accepted_id', 4, esc(sh(d.h.acceptedIdMerkleRoot, 8, 6))],
    ['lanes ≈', 4, d.lanes + ' non-native subnetworks'],
    ['txs', 2, d.txN + ' · ' + d.v1N + ' on tx v1 · ' + d.covN + ' covenant outputs'],
    ['mass', 3, 'Σ ' + num(d.mass) + ' g · compute ' + num(d.cmass) + ' g'],
    ['miner', 6, esc(d.miner.slice(0, 60) || '—')]
  ];
  const box = document.getElementById('live-rows');
  box.innerHTML = rows.map(r => `<div class="lv-row" data-lv-station="${r[1]}" tabindex="0" role="button"><span>${r[0]}</span><b>${r[2]}</b></div>`).join('');
  box.classList.remove('lv-flash'); void box.offsetWidth; box.classList.add('lv-flash');

  const net = live.net, dag = net.dag || {};
  const cards = [
    ['DAA Δ/s', live.bps ? live.bps.toFixed(2) : '—', 'measured ≈ BPS'],
    ['Hashrate', net.hr ? si(net.hr * 1e12) + 'H/s' : '—', 'kHeavyHash'],
    ['Difficulty', dag.difficulty ? si(dag.difficulty) : '—', esc((dag.networkName || '').slice(0, 18))],
    ['Fee · priority', net.fee ? net.fee.priority + ' sompi/g' : '—', net.fee ? 'normal ' + net.fee.normal + (net.fee.eta != null ? ' · ' + (Number(net.fee.eta) < 1 ? '<1s' : '~' + Math.round(Number(net.fee.eta)) + 's') : '') : ''],
    ['Block reward', net.reward ? net.reward.toFixed(3) + ' KAS' : '—', 'chromatic schedule'],
    ['Next halving', net.halving ? esc(String(net.halving).replace('T', ' ').slice(0, 10)) : '—', net.nextReward ? '→ ' + net.nextReward.toFixed(3) + ' KAS' : '']
  ];
  document.getElementById('net-strip').innerHTML = cards.map(c =>
    `<div class="metric-card"><div style="color:var(--anatomy-muted)">${c[0]}</div><div class="metric-val">${c[1]}</div><div class="metric-sub">${c[2]}</div></div>`
  ).join('');
  document.getElementById('corner-top-right').textContent =
    `${live.bps ? live.bps.toFixed(1) + ' BPS measured' : '10 BPS nominal'} · GHOSTDAG k = 124 · block version ${ver} · tx v${d.v1N > 0 ? 1 : 0}`;
}

/* ---- block stream ticker (A's renderTicker) ---- */
export function renderTicker(isNew) {
  if (!live.d) return;
  const h = live.d.v.hash, daa = Number(live.d.h.daaScore) || state.daaScore;
  if (h) {
    const i = live.ring.findIndex(x => x.h === h);
    if (i !== 0) {
      if (i > 0) live.ring.splice(i, 1);
      live.ring.unshift({ h, daa, b: live.block });
      if (live.ring.length > 24) live.ring.pop();
    }
  }
  document.getElementById('tk-meta').textContent = live.pin ? 'pinned ' + sh(live.pin) : (live.ring.length ? live.ring.length + ' recent' : '');
  document.getElementById('tk-cells').innerHTML = live.ring.map((x, i) =>
    `<button type="button" class="tk${i === 0 && isNew ? ' new' : ''}" data-tk="${i}" title="${esc(x.h)} · DAA ${num(x.daa)}">${esc(x.h.slice(0, 5))}</button>`
  ).join('');
}

/* ---- tx list (A's renderTxList) ---- */
export function renderTxList() {
  const txs = (live.block && live.block.transactions) || [];
  document.getElementById('tx-meta').textContent = txs.length + ' in block · tap to dissect in-stage';
  document.getElementById('tx-list').innerHTML = txs.slice(0, 60).map((t, i) => {
    const id = (t.verboseData && t.verboseData.transactionId) || 'tx#' + i;
    const ins = (t.inputs || []).length, outs = (t.outputs || []).length;
    const sum = (t.outputs || []).reduce((a, o) => a + (Number(o.amount) || 0), 0) / 1e8;
    const cov = (t.outputs || []).some(o => o.covenant);
    return `<div class="tx-row" data-tx="${i}" tabindex="0" role="button"><b>#${i} ${esc(sh(id, 8, 6))}</b><span>v${t.version ?? 0} · ${ins}→${outs} · ${sum.toFixed(2)} KAS · ${t.mass || 0}g</span>${cov ? '<em>covenant</em>' : ''}${i === 0 ? '<em>coinbase</em>' : ''}</div>`;
  }).join('');
}

/* ---- in-stage DAG neighbour blocks (A's renderNeighborBlocks) ---- */
export function renderNeighborBlocks() {
  const d = live.d;
  if (!d || !nbLayer) return;
  const P = activeCam, zB = cachedZBase;
  const parents = d.parents || [], children = d.children || [];
  const blues = (d.blues || []).filter(h => !parents.includes(h));
  const reds = d.reds || [];
  const out = [], pipes = [];
  const curve = (a, b, cls) => {
    const p0 = iso(a, P), p3 = iso(b, P);
    const mx = (p0[0] + p3[0]) * 0.5, my = Math.min(p0[1], p3[1]) - 14;
    return `<path class="${cls}" d="M${p0[0]},${p0[1]}Q${mx},${my} ${p3[0]},${p3[1]}"/>`;
  };
  const chip = (x, y, txt, kind) => {
    const w = txt.length * 5.4 + 12;
    return `<g class="nb" data-more="${kind}" tabindex="0" role="button"><rect class="nb-chip-r" x="${x - w / 2}" y="${y - 8}" width="${w}" height="15" rx="3"/><text class="nb-lbl" x="${x}" y="${y + 2}" text-anchor="middle">${esc(txt)}</text></g>`;
  };

  const pShow = Math.min(parents.length, 6);
  for (let i = 0; i < pShow; i++) {
    const h = parents[i], sel = h === d.selected;
    const x = -282 - (i % 2) * 30, y = pShow === 1 ? -16 : -104 + i * (176 / (pShow - 1)), z = zB + 8 + (pShow - i) * 3;
    const bx = isoCubeSvg(x, y, z, sel ? 34 : 26, sel ? 26 : 20, sel ? 18 : 13, P, 'nb-top', 'nb-side');
    const py = pShow === 1 ? -4 : -30 + Math.min(i, (state.parentN || 3) - 1) * (52 / Math.max(1, (state.parentN || 3) - 1));
    pipes.push(curve([x + 14, y, z + 10], [-164, sel ? -64 : py, zB + 38], sel ? 'iso-stroke-lit' : 'iso-stroke-faint'));
    out.push({
      d: bx.d,
      svg: `<g class="nb${sel ? ' nb-sel' : ''}" data-nb-hash="${esc(h)}" tabindex="0" role="button" aria-label="${sel ? 'Selected parent ' : 'Parent '}block ${esc(sh(h))}"><title>${sel ? 'Selected parent · ' : 'Parent · '}${esc(h)}</title>${bx.svg}<circle class="nb-dot" cx="${bx.c[0]}" cy="${bx.c[1]}" r="${sel ? 5.5 : 4}"/><text class="nb-lbl" x="${bx.t[0]}" y="${bx.t[1] - 4}" text-anchor="middle">${esc(h.slice(0, 5))}</text></g>`
    });
  }
  if (parents.length > 6) { const p = iso([-296, 98, zB + 12], P); out.push({ d: 999, svg: chip(p[0], p[1], `+${parents.length - 6} parents`, 'parents') }); }

  const bShow = Math.min(blues.length, 8);
  for (let i = 0; i < bShow; i++) {
    const h = blues[i], x = -148 + i * 32, y = -152 - (i % 2) * 18, z = zB + 4;
    const bx = isoCubeSvg(x, y, z, 16, 14, 9, P, 'nb-blue', 'nb-side');
    pipes.push(curve([x, y + 7, z + 6], [-164, -36, zB + 26], 'iso-stroke-faint'));
    out.push({ d: bx.d, svg: `<g class="nb" data-nb-hash="${esc(h)}" tabindex="0" role="button"><title>Mergeset blue · ${esc(h)}</title>${bx.svg}<circle class="nb-dot nb-dot-b" cx="${bx.c[0]}" cy="${bx.c[1]}" r="3.2"/></g>` });
  }

  const rShow = Math.min(reds.length, 4);
  for (let i = 0; i < rShow; i++) {
    const h = reds[i], x = -140 + i * 34, y = 148 + (i % 2) * 16, z = zB + 2;
    const bx = isoCubeSvg(x, y, z, 15, 13, 8, P, 'nb-red', 'nb-side');
    pipes.push(curve([x, y - 6, z + 5], [-164, 10, zB + 22], 'iso-stroke-faint'));
    out.push({ d: bx.d, svg: `<g class="nb" data-nb-hash="${esc(h)}" tabindex="0" role="button"><title>Mergeset red · ${esc(h)}</title>${bx.svg}<circle class="nb-dot nb-dot-r" cx="${bx.c[0]}" cy="${bx.c[1]}" r="3.2"/></g>` });
  }

  const cShow = Math.min(children.length, 4);
  for (let i = 0; i < cShow; i++) {
    const h = children[i], x = 266 + (i % 2) * 28, y = cShow === 1 ? -12 : -72 + i * (136 / (cShow - 1)), z = zB + 14;
    const bx = isoCubeSvg(x, y, z, 28, 22, 14, P, 'nb-top', 'nb-side');
    pipes.push(curve([156, -16, cachedZCrownTop - 12], [x - 14, y, z + 9], 'iso-stroke-mid'));
    out.push({
      d: bx.d,
      svg: `<g class="nb" data-nb-hash="${esc(h)}" tabindex="0" role="button"><title>Child · ${esc(h)}</title>${bx.svg}<circle class="nb-dot" cx="${bx.c[0]}" cy="${bx.c[1]}" r="4.2"/><text class="nb-lbl" x="${bx.t[0]}" y="${bx.t[1] - 4}" text-anchor="middle">${esc(h.slice(0, 5))}</text></g>`
    });
  }

  out.sort((a, b) => a.d - b.d);
  nbLayer.innerHTML = pipes.join('') + out.map(o => o.svg).join('');
}

/* ---- "+N parents" overflow chips → the more-ov sheet (the overlay existed in
   A's markup but was never filled; the chips were role=button no-ops). The rows
   load their block, exactly like tapping the neighbour cubes themselves. ---- */
function openMore(kind) {
  const d = live.d; if (!d) return;
  const sets = { parents: d.parents, children: d.children, blues: d.blues, reds: d.reds };
  const list = sets[kind] || [];
  const label = { parents: 'parents', children: 'children', blues: 'mergeset blues', reds: 'mergeset reds' }[kind] || kind;
  moreTitle.textContent = `${label} · ${list.length} · tap one to load it`;
  moreList.innerHTML = list.map(h =>
    `<button type="button" class="ov-row mono" data-more-hash="${esc(h)}"><span>${esc(sh(h, 12, 6))}</span><em>→ load</em></button>`
  ).join('');
  moreOv.hidden = false;
  const first = moreList.querySelector('button');
  if (first) first.focus();
}

/* ---- the opened transaction (A's renderTxScene + B's paper touches) ---- */
function sketchCoin(P, cx, cy, z, r) {
  const top = [];
  for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2; top.push(iso([cx + r * Math.cos(t), cy + r * Math.sin(t), z], P)); }
  fillShape(top, 'var(--marker-gold)');
  line([...top, top[0], top[1]], { w: 1, amp: .2, over: 0 });
  const inn = [];
  for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; inn.push(iso([cx + r * .55 * Math.cos(t), cy + r * .55 * Math.sin(t), z], P)); }
  line([...inn, inn[0], inn[1]], { w: .55, amp: .15, over: 0 });
}
function sketchPennant(P, x, y, z) {
  const b = iso([x, y, z], P), t = iso([x, y, z + 17], P), p2 = iso([x + 14, y + 5, z + 13], P), p3 = iso([x, y, z + 9], P);
  line([b, t], { w: 1.4, amp: .2, over: 0 });
  fillShape([t, p2, p3], 'var(--marker-teal)');
  line([t, p2, p3, t], { w: .7, amp: .15, over: 0 });
}

export function renderTxScene() {
  if (txSceneIdx < 0 || !txLayer) return;
  const txs = (live.block && live.block.transactions) || [];
  const t = txs[txSceneIdx]; if (!t) return;
  const P = makeCamera(state.azimuth, 30, 495, 305, 1.38);
  const ins = t.inputs || [], outs = t.outputs || [], isCb = txSceneIdx === 0 && !ins.length;
  const txid = (t.verboseData && t.verboseData.transactionId) || 'tx#' + txSceneIdx;
  const sn = t.subnetworkId || '0'.repeat(40);
  const isNative = /^0+$/.test(sn), isCbSub = /^010*$/.test(sn);
  const laneStr = isCbSub ? '0x01… coinbase' : (isNative ? '0x00… native' : '0x' + sn.slice(0, 8) + '… lane');
  const parts = [], wires = [], labels = [];

  beginSheet(11); // deterministic wobble for B's paper touches

  parts.push(isoCubeSvg(0, 0, -22, 420, 214, 12, P, 'nb-top', 'nb-side'));
  const body = isoCubeSvg(0, 0, -10, 126, 114, 26, P, 'iso-lit-top', 'iso-lit-side');
  parts.push({ d: body.d, svg: `<g class="txm${txSel && txSel.k === 'body' ? ' sel' : ''}" data-txm="body:0" tabindex="0" role="button">${body.svg}</g>` });
  const bTop = iso([0, -28, 17], P), bMid = iso([0, 4, 17], P), bBot = iso([0, 34, 17], P);
  labels.push(`<text class="tx-lbl" x="${bTop[0]}" y="${bTop[1]}" text-anchor="middle">v${t.version ?? 0} · ${laneStr}</text>`);
  labels.push(`<text class="tx-lbl" x="${bMid[0]}" y="${bMid[1]}" text-anchor="middle">mass ${num(t.mass || 0)} g · compute ${num((t.verboseData && t.verboseData.computeMass) || 0)} g</text>`);
  labels.push(`<text class="tx-lbl" x="${bBot[0]}" y="${bBot[1]}" text-anchor="middle">lock ${t.lockTime || 0} · gas ${t.gas || 0} · payload ${((t.payload || '').length >> 1)} B</text>`);
  /* B's envelope: the tx body carries a wax dot, flaps folded to the centre */
  {
    const c0 = iso([-63, -57, 16], P), c1 = iso([63, -57, 16], P), c2 = iso([63, 57, 16], P), c3 = iso([-63, 57, 16], P), cm = iso([0, 0, 16], P);
    wires.push(`<path class="cov-line" d="M${c0[0]},${c0[1]}L${cm[0]},${cm[1]}M${c1[0]},${c1[1]}L${cm[0]},${cm[1]}M${c2[0]},${c2[1]}L${cm[0]},${cm[1]}M${c3[0]},${c3[1]}L${cm[0]},${cm[1]}" opacity=".55"/>`);
    dot(cm[0], cm[1], 6.5, B_WAX, 1);
    rule([[c0, cm], [c1, cm], [c2, cm], [c3, cm]], B_INK, .45, .6);
  }

  const inShow = Math.min(ins.length, 6), inAnchors = {};
  if (isCb) {
    const cb = isoCubeSvg(-148, 0, -10, 68, 56, 20, P, 'nb-top', 'nb-side');
    parts.push({ d: cb.d, svg: `<g class="txm" data-txm="cb:0" tabindex="0" role="button">${cb.svg}</g>` });
    const p0 = iso([-114, 0, 2], P), p1 = iso([-63, 0, 4], P);
    wires.push(`<path class="iso-stroke-lit" d="M${p0[0]},${p0[1]}L${p1[0]},${p1[1]}"/>`);
    labels.push(`<text class="tx-lbl" x="${cb.t[0]}" y="${cb.t[1] - 4}" text-anchor="middle">coinbase · payload ${(t.payload || '').length >> 1}B</text>`);
    sketchCoin(P, -148, 0, 10, 12);
  }
  for (let i = 0; i < inShow; i++) {
    const x = ins[i], op = x.previousOutpoint || {};
    const y = inShow === 1 ? 0 : -76 + i * (152 / (inShow - 1));
    const sel = txSel && txSel.k === 'in' && txSel.i === i;
    const bx = isoCubeSvg(-148, y, -10, 66, 22, 16, P, 'nb-top', 'nb-side');
    inAnchors[i] = [-115, y, 2];
    const p0 = iso([-115, y, 2], P), p1 = iso([-63, y * 0.45, 4], P);
    wires.push(`<path class="${sel ? 'iso-stroke-lit' : 'iso-stroke-mid'}" d="M${p0[0]},${p0[1]}L${p1[0]},${p1[1]}"/>`);
    parts.push({
      d: bx.d,
      svg: `<g class="txm${sel ? ' sel' : ''}" data-txm="in:${i}" tabindex="0" role="button">${bx.svg}<text class="tx-lbl" x="${bx.t[0]}" y="${bx.t[1] - 3}" text-anchor="middle">in#${i} ${esc(sh(op.transactionId, 4, 3))}:${op.index ?? 0}</text></g>`
    });
    sketchCoin(P, -175, y, 6, 8);
    if (i === 0) sketchPennant(P, -158, y - 12, 16);
  }

  const outShow = Math.min(outs.length, 6);
  for (let i = 0; i < outShow; i++) {
    const o = outs[i], kas = ((Number(o.amount) || 0) / 1e8).toFixed(2);
    const y = outShow === 1 ? 0 : -76 + i * (152 / (outShow - 1));
    const cov = o.covenant, sel = txSel && txSel.k === 'out' && txSel.i === i;
    const bx = isoCubeSvg(148, y, -10, 72, 22, cov ? 20 : 15, P, cov ? 'iso-lit-top' : 'nb-top', cov ? 'iso-lit-side' : 'nb-side');
    const p0 = iso([63, y * 0.45, 4], P), p1 = iso([112, y, 2], P);
    wires.push(`<path class="${cov || sel ? 'iso-stroke-lit' : 'iso-stroke-mid'}" d="M${p0[0]},${p0[1]}L${p1[0]},${p1[1]}"/>`);
    if (cov) {
      const ai = Number(cov.authorizingInput) || 0, aPt = inAnchors[ai] || [-115, 0, 2];
      const c0 = iso([148, y, 12], P), c1 = iso(aPt, P), mx = (c0[0] + c1[0]) * 0.5, my = Math.min(c0[1], c1[1]) - 36;
      wires.push(`<path class="cov-line" d="M${c0[0]},${c0[1]}Q${mx},${my} ${c1[0]},${c1[1]}"/><circle class="cov-dot" cx="${c0[0]}" cy="${c0[1]}" r="2.2"/><circle class="cov-dot" cx="${c1[0]}" cy="${c1[1]}" r="2.2"/>`);
    }
    parts.push({
      d: bx.d,
      svg: `<g class="txm${sel ? ' sel' : ''}" data-txm="out:${i}" tabindex="0" role="button">${bx.svg}<text class="tx-lbl" x="${bx.t[0]}" y="${bx.t[1] - 3}" text-anchor="middle">out#${i} ${kas} KAS${cov ? ' · cov' : ''}</text></g>`
    });
    sketchCoin(P, 175, y, cov ? 20 : 15, 8);
  }

  parts.sort((a, b) => a.d - b.d);
  const head = `<text class="tx-title" x="495" y="34" text-anchor="middle">TX #${txSceneIdx} · ${esc(sh(txid, 10, 8))} · v${t.version ?? 0} · ${ins.length} in → ${outs.length} out</text>` +
    `<text class="tx-note dim" x="495" y="49" text-anchor="middle">tap an input, the body, or an output to inspect · dashed arcs = KIP-20 CovenantBinding → authorizing_input</text>`;
  txLayer.innerHTML = parts.map(p => p.svg).join('') + wires.join('') + outArr().join('') + labels.join('') + head;
}

/* ---- init: wire everything A wired ---- */
export function initDag() {
  const rows = document.getElementById('live-rows');
  const act = (e) => {
    const r = e.target.closest('[data-lv-station]');
    if (r) { selectStation(Number(r.getAttribute('data-lv-station')), true); revealPlate(); }
  };
  rows.addEventListener('click', act);
  rows.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
  document.getElementById('live-chip').addEventListener('click', () => {
    if (live.pin) { goTip(); return; }
    state.follow = true; live.lastHash = ''; poll(true); pollNet();
  });
  document.getElementById('live-map').addEventListener('click', (e) => {
    const g = e.target.closest('[data-map-hash]');
    if (g) loadBlock(g.getAttribute('data-map-hash'));
  });
  ['rng-covenants', 'rng-lanes', 'rng-zk'].forEach(id =>
    document.getElementById(id).addEventListener('input', () => { state.follow = false; })
  );

  zBack.onclick = goBack;
  zTip.onclick = goTip;
  zTx.onclick = () => openTxScene(openTxIdx >= 0 ? openTxIdx : (live.block && live.block.transactions && live.block.transactions.length > 1 ? 1 : 0), true);
  document.getElementById('z-dna').onclick = () => {
    document.getElementById('dna-panel').scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'center' });
  };
  document.getElementById('more-close').onclick = () => { moreOv.hidden = true; };
  document.getElementById('more-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-more-hash]');
    if (!row) return;
    moreOv.hidden = true;
    loadBlock(row.getAttribute('data-more-hash'));
    sfx.tick();
  });
  /* keyboard: the focusable in-stage chips/cubes/rows activate on Enter/Space */
  stageEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const chip = e.target.closest ? e.target.closest('[data-more], [data-nb-hash]') : null;
    if (chip) {
      e.preventDefault();
      if (chip.hasAttribute('data-more')) openMore(chip.getAttribute('data-more'));
      else loadBlock(chip.getAttribute('data-nb-hash'));
    }
  });

  /* in-stage clicks: neighbour walk + tx-part inspection (A's actStage) */
  stageEl.addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (more) {
      e.stopPropagation();
      openMore(more.getAttribute('data-more'));
      sfx.tick();
      return;
    }
    const nb = e.target.closest('[data-nb-hash]');
    if (nb) {
      e.stopPropagation();
      nbLayer.classList.add('swap');
      setTimeout(() => nbLayer.classList.remove('swap'), 260);
      sfx.whoosh();
      loadBlock(nb.getAttribute('data-nb-hash'));
      syncHud();
      return;
    }
    const txm = e.target.closest('[data-txm]');
    if (txm) {
      e.stopPropagation();
      const [k, i] = txm.getAttribute('data-txm').split(':');
      txSel = { k, i: Number(i) };
      renderTxScene(); sfx.tick();
    }
  });

  /* block stream + hash input + tx list */
  document.getElementById('tk-cells').onclick = (e) => {
    const b = e.target.closest('[data-tk]'); if (!b) return;
    const x = live.ring[Number(b.getAttribute('data-tk'))];
    if (x) loadBlock(x.h, true).then(() => sfx.tick());
  };
  document.getElementById('blk-in').addEventListener('paste', () => {
    setTimeout(() => {
      const inp = document.getElementById('blk-in');
      if (HEX64.test(inp.value)) { inp.blur(); searchChain(inp.value); }
    }, 0);
  });
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = document.getElementById('blk-in');
    inp.blur();
    searchChain(inp.value);
  });
  document.getElementById('tx-list').onclick = (e) => {
    const r = e.target.closest('[data-tx]');
    if (r) { openTxIdx = Number(r.getAttribute('data-tx')); openTxScene(openTxIdx, true); revealPlate(); }
  };

  /* scene repaints also refresh neighbours + the open tx (A's wrapper) */
  on('scene:rendered', () => {
    renderNeighborBlocks();
    if (txSceneIdx >= 0) renderTxScene();
  });
  on('block:applied', () => {
    renderLive();
    renderTicker(true);
    renderTxList();
    syncHud();
  });
  on('net:updated', renderLive);
  on('live:offline', renderLive);
  on('hud:sync', syncHud);
}
