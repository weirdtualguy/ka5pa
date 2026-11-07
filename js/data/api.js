/* data/api.js — A's live Kaspa REST API layer with sample fallback, behaviour
   unchanged: same endpoints, same timing, same backoff, same digest. Modules that
   need the result subscribe to 'block:applied'. */
import { clamp } from '../util/format.js';
import { emit } from '../util/events.js';
import { sampleBlock } from './sample.js';

/* Node (tests) has no location; the browser keeps A's behaviour exactly */
const HAS_LOCATION = typeof location !== 'undefined';
export const API_BASE = (HAS_LOCATION
  ? (new URLSearchParams(location.search).get('api') || 'https://api.kaspa.org')
  : 'https://api.kaspa.org').replace(/\/+$/, '');

/** Live layer state — same shape as A's `live`. */
export const live = { isLive: false, block: null, d: null, net: {}, bps: 0, fails: 0, lastHash: '', lastDaa: 0, lastT: 0, ring: [], pin: null };

export async function api(path) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
  try {
    const r = await fetch(API_BASE + path, { signal: c.signal, headers: { accept: 'application/json' } });
    if (!r.ok) { const err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
    return await r.json();
  } finally { clearTimeout(t); }
}

/** A's digest(): normalize an API/sample block into the shape every panel reads. */
export function digest(b) {
  const h = b.header || {}, v = b.verboseData || {}, tx = b.transactions || [];
  const parents = (h.parents && h.parents[0] && h.parents[0].parentHashes) || [];
  const lanes = new Set();
  let v1N = 0, covN = 0, mass = 0, cmass = 0, budget = 0;
  for (const t of tx) {
    if (t.version === 1) v1N++;
    mass += Number(t.mass) || 0;
    cmass += Number(t.verboseData && t.verboseData.computeMass) || 0;
    const sn = t.subnetworkId || '';
    if (sn && !/^0+$/.test(sn) && !/^010*$/.test(sn)) lanes.add(sn);
    for (const o of (t.outputs || [])) if (o.covenant) covN++;
    for (const i of (t.inputs || [])) budget += Number(i.computeBudget) || 0;
  }
  return { h, v, parents, selected: v.selectedParentHash || parents[0], blues: v.mergeSetBluesHashes || [], reds: v.mergeSetRedsHashes || [], children: v.childrenHashes || [], txN: tx.length, v1N, covN, lanes: lanes.size, mass, cmass, budget, miner: (b.extra && b.extra.minerInfo) || '' };
}

/** A's applyBlock(): swap in a block, then notify the scene. State mutations and
    DOM updates happen in subscribers, registered in A's original order by main.js. */
export function applyBlock(b, isLive) {
  live.block = b; live.d = digest(b); live.isLive = isLive;
  emit('block:applied', { d: live.d, isLive, block: b });
}

/** Fetch a block by hash (used by the DAG walk and the search bar). */
export async function fetchBlock(hash) {
  return api('/blocks/' + hash + '?includeTransactions=true');
}

/** Fetch a transaction by id; the response lists the blocks that contain it. */
export async function fetchTx(id) {
  return api('/transactions/' + id + '?inputs=false&outputs=false&resolve_previous_outpoints=no');
}

let pollTimer = 0;
export async function poll(force) {
  let wait = 3000;
  if (!document.hidden) {
    try {
      const dag = await api('/info/blockdag');
      live.net.dag = dag;
      const daa = Number(dag.virtualDaaScore), now = performance.now();
      if (live.lastT && daa >= live.lastDaa) {
        const inst = (daa - live.lastDaa) / ((now - live.lastT) / 1000);
        live.bps = live.bps ? live.bps * 0.6 + inst * 0.4 : inst;
      }
      const advanced = daa !== live.lastDaa;
      live.lastDaa = daa; live.lastT = now;
      const hash = dag.sink || (dag.virtualParentHashes || [])[0] || (dag.tipHashes || [])[0];
      if (hash && hash !== live.lastHash && !live.pin) {
        const b = await fetchBlock(hash);
        if (live.pin) throw Object.assign(new Error('pinned'), { pinned: true });
        applyBlock(b, true);
        live.lastHash = hash;
        if (advanced) emit('block:advanced');
      }
      live.fails = 0;
    } catch (e) {
      if (e.pinned) { clearTimeout(pollTimer); pollTimer = setTimeout(() => poll(), wait); return; }
      live.fails++;
      if (!live.isLive && !live.block) applyBlock(sampleBlock(), false);
      else if (live.fails > 2) { live.isLive = false; emit('live:offline'); }
      wait = 3000 * Math.min(live.fails + 1, 5);
    }
  }
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => poll(), force ? 200 : wait);
}

export async function pollNet() {
  const [hr, fee, rw, hv] = await Promise.allSettled([
    api('/info/hashrate'), api('/info/fee-estimate'), api('/info/blockreward'), api('/info/halving')
  ]);
  const n = live.net;
  if (hr.status === 'fulfilled') n.hr = hr.value.hashrate;
  if (fee.status === 'fulfilled') {
    const f = fee.value, nb = (f.normalBuckets || [])[0] || {};
    n.fee = { priority: f.priorityBucket && f.priorityBucket.feerate, normal: nb.feerate, eta: f.priorityBucket && f.priorityBucket.estimatedSeconds };
  }
  if (rw.status === 'fulfilled') n.reward = rw.value.blockreward;
  if (hv.status === 'fulfilled') { n.halving = hv.value.nextHalvingDate; n.nextReward = hv.value.nextHalvingAmount; }
  if (live.d) emit('net:updated');
}

/** Boot the live layer exactly like A's initLive() data half. */
export function initLiveData() {
  applyBlock(sampleBlock(), false);
  poll(); pollNet();
  setInterval(() => { if (!document.hidden) pollNet(); }, 30000);
}
