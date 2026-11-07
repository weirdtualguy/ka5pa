/* ui/controls.js — A's toolbar & panels, behaviour preserved: station selection,
   inspector readouts, stamp/explode/slow, era flip, nerd mode, sfx synth, themes
   workload sliders. The Idle Tour button toggles the
   guided flow (guided/flow-ui.js). */
import { state, computeModelMetrics } from '../engine/render.js';
import { emit, on as onBus } from '../util/events.js';
import { store, num } from '../util/format.js';
import { live } from '../data/api.js';
import { CAP } from '../data/budgets.js';
import { announce, revealPlate } from './a11y.js';

/* A's STATION_META, verbatim. */
export const STATION_META = [
  {
    id: 0,
    code: 'STATION 00 · COMPLETE INSTRUMENT',
    title: 'Post-Toccata Kaspa BlockDAG Block (Block Version 2 · Tx Version 1)',
    desc: 'Activated on June 30, 2026 at DAA score 474,165,565 — after Crescendo took mainnet to 10 blocks per second (May 5, 2025, DAA 110,165,000) — the Toccata hard fork (Covenants++) sets the block header version to TOCCATA_BLOCK_VERSION = 2 (pre-Toccata: 1) and transaction version to TX_VERSION_TOCCATA = 1 (pre-Toccata: 0), while doubling the transient-mass limit from 500,000 to 1,000,000 grams so large ZK proof payloads fit. Compute and storage mass stay capped at 500,000 each.',
    f1: 'B.header.accepted_id_merkle_root = SeqCommit(B) = H_seq(SeqCommit(parent(B)), SeqStateRoot(B))',
    f2: 'Compute ≤ 500,000g · Transient (4×bytes) ≤ 1,000,000g · Storage ≤ 500,000g — three independent per-block budgets',
    f3: 'RelayFeeFloor(tx) ≈ 100 sompi/g × tx mass // rate is node policy (raised 1 → 100 sompi/g at Toccata)'
  },
  {
    id: 1,
    code: 'STATION 01 · GHOSTDAG PARENT MANIFOLD',
    title: 'Multi-Level DAG Parents (parents_by_level) & Pruning Point',
    desc: 'Unlike a linear chain, a Kaspa block references multiple concurrent parent blocks across compressed DAG levels (≤ 16 direct parents; cumulative uncompressed bound MAX_UNCOMPRESSED_PARENTS = 255 × 2048) under GHOSTDAG k = 124, with the mergeset capped at 248 blocks (2k). The primary Selected Parent conduit anchors the Virtual Selected Parent Chain (VSPC), while mergeset Blue/Red parent pipes contribute transactions and coinbase miner payloads.',
    f1: 'header.parents_by_level: CompressedParents (MAX_UNCOMPRESSED_PARENTS = 522,240)',
    f2: 'Mergeset(B) = [selected_parent(B), ...blue_mergeset_blocks, ...red_mergeset_blocks] · |mergeset| ≤ 248 = 2k',
    f3: 'header.pruning_point: Hash(32B) // IBD anchor · merge depth 36,000 · finality 432,000 · pruning 1,080,000 blue-score blocks'
  },
  {
    id: 2,
    code: 'STATION 02 · TRANSACTION V1 & COVENANT BED',
    title: 'Transaction V1, CovenantBinding (KIP-20) & ZK Precompiles (KIP-16)',
    desc: 'Transaction version 1 (TX_VERSION_TOCCATA = 1; KIP-20 covenants require tx.version ≥ 1) powers native L1 Covenants++ and SilverScript contracts — KIP-17 supplies the introspection and signature-verification opcodes those covenant scripts run on. Inputs carry a priced compute_budget instead of v0 sig_op_count, while outputs carry optional KIP-20 CovenantBinding { authorizing_input, covenant_id } for stable 32-byte lineage across changing P2SH state hashes, plus KIP-16 OpZkPrecompile (Groth16 tag 0x20 / RISC0-Succinct tag 0x21).',
    f1: 'InputV1.mass: TxInputMass = ComputeBudget (tx v1) | SigopCount (v0) — priced script cost in one versioned wire slot',
    f2: 'OutputV1.covenant = Option<CovenantBinding { authorizing_input: u16, covenant_id: Hash }>',
    f3: 'KIP-17 ceilings at Toccata: MAX_SCRIPT_ELEMENT_SIZE 520 → 1,000,000 · MAX_SCRIPTS_SIZE 10,000 → 1,000,000 · MAX_OPS_PER_SCRIPT 201 → 1,000,000'
  },
  {
    id: 3,
    code: 'STATION 03 · THREE-BUDGET MASS BALANCE GAUGE',
    title: 'Three Mass Budgets (500k / 1M / 500k) & 100 sompi/g Fee Meter',
    desc: 'Each block has three independent mass budgets: Compute 500,000g, Transient 1,000,000g (doubled by Toccata so large ZK proof payloads fit) and Storage 500,000g (KIP-9; the tx field is now named storage_mass). Transient mass is 4 × serialized bytes, capping block bodies at 250 KB. The plunger closest to its own limit drives the dial.',
    f1: 'TransientMass = tx_bytes × TRANSIENT_BYTE_TO_MASS_FACTOR (4) -> 250,000B body cap',
    f2: 'StorageMass = max(0, C·(|O|/H(O) − |I|/A(I))), C = 10¹² (KIP-9; H harmonic, A arithmetic mean)',
    f3: 'RelayFeeFloor ≈ 100 sompi/g × tx mass // rate raised 1 → 100 sompi/g at Toccata · node policy, not consensus'
  },
  {
    id: 4,
    code: 'STATION 04 · KIP-21 PARTITIONED SEQUENCING TURRET',
    title: 'SeqCommit(B), 256-Bit Active-Lanes SMT & O(activity) Proving',
    desc: 'KIP-21 replaces monolithic transaction-list commitments with a partitioned 256-bit Sparse Merkle Tree (ActiveLanesRoot) over active application lanes (up to 50 non-coinbase lanes/block, 1B gas/lane). Collapsed single-leaf subtrees (H_collapsed) and an inactivity shortcut (window F) let based ZK apps prove only their own lane slice of the commitment instead of the network-wide stream.',
    f1: 'ActivityRoot(B) = H_activity_root(InactivityShortcut(B), ActiveLanesRoot(B)) — 256-bit SMT, BLAKE3 domain-separated',
    f2: 'PayloadAndContextDigest(B) = H_seq(MergesetContextHash(B), MinerPayloadRoot(B))',
    f3: 'SeqStateRoot(B) = H_seq(ActivityRoot(B), PayloadAndContextDigest(B))'
  },
  {
    id: 5,
    code: 'STATION 05 · CRYPTOGRAPHIC COMMITMENT CYLINDERS',
    title: 'hash_merkle_root (tx merkle) & utxo_commitment (MuHash)',
    desc: 'Flanking the KIP-21 turret are two high-pressure cryptographic cylinders: the left press computes hash_merkle_root over the block’s transaction IDs — each txid a BLAKE2b-256 digest that omits the signature script, with signature coverage living in the separate keyed sighash — while the right drum updates the rolling MuHash utxo_commitment over the unspent output set whose entries now carry their KIP-20 covenant_id.',
    f1: 'header.hash_merkle_root = MerkleRoot([txid(tx) for tx in block.transactions])',
    f2: 'txid omits signature_script (sighash is a separate keyed BLAKE2b-256 digest, domain "TransactionSigningHash")',
    f3: 'header.utxo_commitment = MuHash(UtxoEntry{amount, spk, daa_score, is_coinbase, covenant_id}) // CovenantIDHash = BLAKE2b-256, domain "CovenantID"'
  },
  {
    id: 6,
    code: 'STATION 06 · BLOCK HEADER V2 CROWN & kHEAVYHASH POW',
    title: 'BlockHeader v2 Bridge, 64-Bit Nonce Drum & kHeavyHash Flywheel',
    desc: 'The upper machined bridge clamps the three 32-byte commitment roots together with version = 2 (TOCCATA_BLOCK_VERSION), timestamp, bits, daa_score, blue_score, and blue_work. Above it spins the kHeavyHash Proof-of-Work flywheel: the BLAKE2b-256 pre-PoW hash seeds a 64×64 u16 matrix, and the matrix product is re-hashed through the Keccak-based sponge — network-wide at ≈10 blocks per second (≈100 ms apart).',
    f1: 'BlockHeaderV2 { version: 2, parents_by_level, hash_merkle_root, accepted_id_merkle_root, ... } · block hash = BLAKE2b-256(full header)',
    f2: 'prePoWHash = BLAKE2b-256(header sans nonce) → M (64×64 u16) → kHeavyHash(M·x) ≤ Target(bits)',
    f3: 'MergesetContextHash(B) = H_mergeset_context(le_u64(sp.timestamp) ‖ le_u64(daa_score) ‖ le_u64(blue_score)) // KIP-21, committed via SeqCommit'
  }
];

const cdom = {};

/* ---- WebAudio SFX synth (A's, off by default) ---- */
const sfx = { on: false, ctx: null };
function tone(f, ms, type = 'sine', g = 0.035, f2 = 0) {
  if (!sfx.on) return;
  try {
    sfx.ctx = sfx.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (sfx.ctx.state === 'suspended') sfx.ctx.resume();
    const t = sfx.ctx.currentTime, o = sfx.ctx.createOscillator(), gn = sfx.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + ms / 1000);
    gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(gn); gn.connect(sfx.ctx.destination); o.start(t); o.stop(t + ms / 1000);
  } catch (e) {}
}
sfx.stamp = () => { tone(92, 110, 'triangle', 0.06, 46); tone(760, 45, 'sine', 0.025, 320); };
sfx.tick = () => tone(520 + state.station * 70, 28, 'sine', 0.02);
sfx.whoosh = () => tone(240, 120, 'sine', 0.025, state.explode.want > 0.5 ? 460 : 150);
export { sfx };

/* ---- station selection (A's selectStation + the v10 wrap: spot sync, sfx, HUD) ---- */
export function selectStation(idx, fromUser = true) {
  const next = (idx + 7) % 7;
  if (state.station !== next) {
    state.station = next;
    state.sceneDirty = true;
  }
  if (fromUser) {
    state.tourActive = false;
    if (cdom.btnTour) { cdom.btnTour.classList.remove('active'); cdom.btnTour.textContent = 'Guided flow: OFF'; }
    emit('guided:auto-off');
  }
  state.carriageSlide.want = state.station === 2 ? 0.85 : (state.station === 4 ? -0.6 : 0);
  syncSpot();
  if (fromUser) sfx.tick();
  updateReadoutAndInspector();
  emit('hud:sync');                              // A's wrapped selectStation ends with syncHud()
  emit('station:selected', { station: state.station, fromUser });
  announce(`${STATION_META[next].code} — ${STATION_META[next].title}`);
}

function syncSpot() {
  const layerSolids = document.getElementById('layer-solids');
  if (state.station > 0) layerSolids.setAttribute('data-spot', state.station);
  else layerSolids.removeAttribute('data-spot');
}

export function triggerBlockStamp(quiet) {
  state.pressStroke.rate = 9.5;
  state.stampBurst = 1.0;
  state.turretStepAngle = (state.turretStepAngle + Math.PI / 6) % (Math.PI * 2);
  if (!state.liveOn || !live.isLive) { state.daaScore += 1; state.blueScore += 1; }
  state.nonceCounter = (state.nonceCounter + 0x103b9) >>> 0;
  state.sceneDirty = true;
  updateReadoutAndInspector();
  if (!quiet) sfx.stamp();
}

export function toggleExplode() {
  const next = state.explode.want > 0.5 ? 0 : 1;
  state.explode.want = next;
  cdom.btnExplode.classList.toggle('active', next > 0.5);
  state.sceneDirty = true;
  updateReadoutAndInspector();
  sfx.whoosh();
  emit('explode:toggled', next > 0.5);
}

export function cycleSlowMotion() {
  if (state.timeScale === 1.0) state.timeScale = 0.2;
  else if (state.timeScale === 0.2) state.timeScale = 0.05;
  else state.timeScale = 1.0;
  const label = state.timeScale === 1.0 ? '1×' : (state.timeScale === 0.2 ? '0.2×' : '0.05×');
  cdom.btnSlow.innerHTML = `<span class="desktop-only">[S] </span>Slow: ${label}`;
  cdom.btnSlow.classList.toggle('active', state.timeScale < 1.0);
}

/* ---- inspector readouts (A's updateReadoutAndInspector + renderInspLive) ---- */
export function updateReadoutAndInspector() {
  const m = computeModelMetrics();
  const meta = STATION_META[state.station] || STATION_META[0];

  const stationTag = String(state.station).padStart(2, '0');
  const modeTag = state.explode.want > 0.5 ? 'Apart' : 'Assembled';
  cdom.liveReadout.textContent =
    `${stationTag} · ${modeTag} · Load ${Math.round(m.blockUtil * 100)}% (${m.dominantBudget}) · ${state.activeLanes} ${state.activeLanes === 1 ? 'Lane' : 'Lanes'} · DAA ${state.daaScore.toLocaleString()} (${live.isLive ? 'live' : 'sample'})`;

  cdom.metricCompute.textContent = `${m.computeMass.toLocaleString()} g`;
  const lv = live.d && state.follow;
  cdom.metricSu.textContent = `${(m.scriptUnits / 1e6).toFixed(2)}M script units · ${Math.round(m.uC * 100)}%${lv ? ' · block' : ''}`;
  cdom.barC.style.width = (m.uC * 100) + '%';
  cdom.barT.style.width = (m.uT * 100) + '%';
  cdom.barS.style.width = (m.uS * 100) + '%';
  cdom.metricTransient.textContent = `${m.transientMass.toLocaleString()} g`;
  cdom.metricBytes.textContent = `${(m.txBytes / 1000).toFixed(1)} KB / 250 KB · ${Math.round(m.uT * 100)}%${lv ? ' · est.' : ''}`;
  cdom.metricStorage.textContent = `${m.storageMass.toLocaleString()} g`;
  cdom.metricFee.textContent = `${Math.round(m.uS * 100)}%${lv ? ' est.' : ''} · relay floor Σ ${m.feeKas} KAS`;
  cdom.feeFloorBadge.textContent = `Fee floor Σ ${m.feeKas} KAS (100 sompi/g)`;

  cdom.inspCode.textContent = meta.code;
  cdom.inspTitle.textContent = meta.title;
  const nParts = state.station === 0 ? state.solidCount : (state.stationCounts || {})[state.station];
  cdom.inspParts.textContent = nParts ? `${nParts} solids in view` : '';
  if (state.solidCount) cdom.pill0.textContent = `${state.solidCount} solids · 6 assemblies`;
  cdom.inspDesc.textContent = meta.desc;
  cdom.inspF1.textContent = meta.f1;
  cdom.inspF2.textContent = meta.f2;
  cdom.inspF3.textContent = meta.f3;

  cdom.stationButtons.forEach(btn => {
    const id = Number(btn.getAttribute('data-station'));
    btn.classList.toggle('active', id === state.station);
  });
  renderInspLive();
}

function renderInspLive() {
  const el = document.getElementById('insp-live'), d = live.d;
  if (!el || !d) return;
  const h = d.h, tag = live.isLive ? 'live' : 'sample';
  const ver = state.era === 1 ? 1 : (Number(h.version) >= 2 ? Number(h.version) : 2);
  const t = {
    0: `${tag} · block ${sh8(d.v.hash, 8, 6)} · header v${ver} · DAA ${num(h.daaScore)} · ${d.txN} txs · ${num(d.mass)} g mass`,
    1: `${tag} · ${d.parents.length} parents · selected ${sh8(d.selected)} · pruning point ${sh8(h.pruningPoint)}`,
    2: `${tag} · ${d.txN} txs · ${d.v1N} on tx v1 · ${d.covN} covenant outputs · Σ compute_budget ${num(d.budget)}`,
    3: `${tag} · Σ mass ${num(d.mass)} g · Σ computeMass ${num(d.cmass)} g of 500,000 g`,
    4: `${tag} · accepted_id_merkle_root ${sh8(h.acceptedIdMerkleRoot, 10, 8)} · ${d.lanes} non-native subnetworks`,
    5: `${tag} · hash_merkle_root ${sh8(h.hashMerkleRoot, 8, 6)} · utxo_commitment ${sh8(h.utxoCommitment, 8, 6)}`,
    6: `${tag} · header.version ${ver} · bits 0x${(Number(h.bits) >>> 0).toString(16)} · nonce ${sh8(String(h.nonce), 6, 4)} · ${live.bps ? live.bps.toFixed(1) : '10'} blk/s`
  };
  el.textContent = t[state.station] || t[0];
}
const sh8 = (h, a = 6, b = 4) => (h && h.length > a + b + 1) ? h.slice(0, a) + '…' + h.slice(-b) : (h || '—');

/* ---- era flip (A's setEra) ---- */
let eraNote = null;
export function setEra(e, quiet) {
  state.era = e;
  document.body.classList.toggle('era1', e === 1);
  const b = document.getElementById('btn-era');
  b.classList.toggle('active', e === 1);
  b.innerHTML = '<span class="desktop-only">[T] </span>' + (e === 2 ? 'Era: v2 Toccata' : 'Era: v1 pre-Toccata');
  CAP.transient = e === 1 ? 500000 : 1000000;
  if (!eraNote) {
    eraNote = document.createElement('div');
    eraNote.id = 'era-note'; eraNote.className = 'era-note mono';
    document.getElementById('insp-title').after(eraNote);
  }
  eraNote.textContent = e === 1
    ? 'PRE-TOCCATA MODEL (post-Crescendo · 10 BPS since May 5, 2025) · header v1 / tx v0 · transient cap 500,000 g · no KIP-21 turret · no tx v1 covenants or ZK proofs'
    : '';
  if (e === 1 && state.station === 4) state.station = 0;
  if (live.block && !live.isLive) live.block.header.version = e === 1 ? 1 : 2;
  state.sceneDirty = true;
  updateReadoutAndInspector();
  emit('era:changed', e);
  if (!quiet) sfx.whoosh();
}

/* ---- nerd mode ---- */
export function setNerd(on) {
  state.nerd = on;
  document.body.classList.toggle('nerd', on);
  const b = document.getElementById('btn-nerd');
  b.classList.toggle('active', on);
  b.textContent = on ? 'nerd: ON' : 'nerd mode';
  store.set('kba-nerd', on ? '1' : '0');
}

/* ---- boot ---- */
export function initControls() {
  cdom.liveReadout = document.getElementById('live-readout');
  cdom.metricCompute = document.getElementById('metric-compute');
  cdom.metricSu = document.getElementById('metric-su');
  cdom.metricTransient = document.getElementById('metric-transient');
  cdom.metricBytes = document.getElementById('metric-bytes');
  cdom.metricStorage = document.getElementById('metric-storage');
  cdom.metricFee = document.getElementById('metric-fee');
  cdom.feeFloorBadge = document.getElementById('fee-floor-badge');
  cdom.inspCode = document.getElementById('insp-code');
  cdom.inspTitle = document.getElementById('insp-title');
  cdom.inspParts = document.getElementById('insp-parts');
  cdom.inspDesc = document.getElementById('insp-desc');
  cdom.inspF1 = document.getElementById('insp-formula-1');
  cdom.inspF2 = document.getElementById('insp-formula-2');
  cdom.inspF3 = document.getElementById('insp-formula-3');
  cdom.btnExplode = document.getElementById('btn-explode');
  cdom.btnMine = document.getElementById('btn-mine');
  cdom.btnSlow = document.getElementById('btn-slow');
  cdom.btnTour = document.getElementById('btn-tour');
  cdom.rngCovenants = document.getElementById('rng-covenants');
  cdom.lblCovenants = document.getElementById('lbl-covenants');
  cdom.rngLanes = document.getElementById('rng-lanes');
  cdom.lblLanes = document.getElementById('lbl-lanes');
  cdom.rngZk = document.getElementById('rng-zk');
  cdom.lblZk = document.getElementById('lbl-zk');
  cdom.barC = document.getElementById('bar-c');
  cdom.barT = document.getElementById('bar-t');
  cdom.barS = document.getElementById('bar-s');
  cdom.btnPrev = document.getElementById('btn-prev');
  cdom.btnNext = document.getElementById('btn-next');
  cdom.pill0 = document.getElementById('pill-sub-0');
  cdom.stationButtons = Array.from(document.querySelectorAll('[data-station]'));
  cdom.themeButtons = Array.from(document.querySelectorAll('[data-set-theme]'));

  /* themes: reflect the theme the boot script chose (stored or system) */
  const bootTheme = document.documentElement.getAttribute('data-theme');
  cdom.themeButtons.forEach(b => {
    const on = b.getAttribute('data-set-theme') === bootTheme;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  cdom.themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-set-theme');
      state.theme = t;
      document.documentElement.setAttribute('data-theme', t);
      store.set('kba-theme', t);
      const tc = document.querySelector('meta[name="theme-color"]');
      if (tc) tc.setAttribute('content', THEME_COLORS[t] || THEME_COLORS.dark);
      cdom.themeButtons.forEach(b => {
        const on = b.getAttribute('data-set-theme') === t;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      state.sceneDirty = true;
      emit('theme:changed', t);
      announce('theme ' + t);
    });
  });

  cdom.stationButtons.forEach(btn => {
    btn.addEventListener('click', () => { selectStation(Number(btn.getAttribute('data-station')), true); revealPlate(); });
  });

  document.querySelectorAll('[data-jump-station]').forEach(row => {
    const st = Number(row.getAttribute('data-jump-station'));
    row.addEventListener('click', () => { selectStation(st, true); revealPlate(); });
    const first = row.querySelector('td');
    if (first && !first.querySelector('button')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row-jump';
      btn.setAttribute('aria-label', 'Inspect ' + (first.textContent || '').trim());
      while (first.firstChild) btn.appendChild(first.firstChild);
      first.appendChild(btn);
    }
  });

  cdom.btnPrev.addEventListener('click', () => { selectStation(state.station - 1, true); revealPlate(); });
  cdom.btnNext.addEventListener('click', () => { selectStation(state.station + 1, true); revealPlate(); });
  cdom.btnExplode.addEventListener('click', toggleExplode);
  cdom.btnMine.addEventListener('click', () => triggerBlockStamp());
  cdom.btnSlow.addEventListener('click', cycleSlowMotion);
  cdom.btnTour.addEventListener('click', () => emit('guided:toggle'));

  /* workload sliders */
  const updateWorkload = () => {
    state.covenantTxs = Number(cdom.rngCovenants.value);
    state.activeLanes = Number(cdom.rngLanes.value);
    state.zkProofs = Number(cdom.rngZk.value);
    cdom.lblCovenants.textContent = `${state.covenantTxs} txs`;
    cdom.lblLanes.textContent = `${state.activeLanes} / 50`;
    cdom.lblZk.textContent = `${state.zkProofs} proofs`;
    const m = computeModelMetrics();
    state.gaugeNeedle.want = m.blockUtil;
    state.sceneDirty = true;
    updateReadoutAndInspector();
  };
  cdom.rngCovenants.addEventListener('input', updateWorkload);
  cdom.rngLanes.addEventListener('input', updateWorkload);
  cdom.rngZk.addEventListener('input', updateWorkload);

  /* plate hover (pauses auto-guided flow) */
  const plate = document.getElementById('anatomy-plate');
  plate.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') state.hovering = true; });
  plate.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') state.hovering = false; });

  /* era, nerd, sfx buttons */
  document.getElementById('btn-era').onclick = () => setEra(state.era === 2 ? 1 : 2);
  document.getElementById('btn-nerd').onclick = () => setNerd(!state.nerd);
  const btnSfx = document.getElementById('btn-sfx');
  function paintSfx() {
    btnSfx.classList.toggle('active', sfx.on);
    btnSfx.textContent = sfx.on ? 'sfx: ON' : 'sfx';
  }
  btnSfx.onclick = () => { sfx.on = !sfx.on; paintSfx(); sfx.tick(); };

  /* block application: keep sliders and readouts in sync (A's applyBlock half).
     Registered here so it runs after render.js's state mutations (order = A's). */
  onBus('block:applied', ({ d }) => {
    if (state.follow) {
      cdom.rngCovenants.value = state.covenantTxs;
      cdom.rngLanes.value = state.activeLanes;
      cdom.lblCovenants.textContent = d.txN + ' txs';
      cdom.lblLanes.textContent = d.lanes + ' / 50';
    }
    updateReadoutAndInspector();
  });
  onBus('block:advanced', () => triggerBlockStamp());
  onBus('stage:tap', (hitStation) => {
    if (hitStation >= 1 && hitStation <= 6) selectStation(state.station === hitStation ? 0 : hitStation, true);
  });
  onBus('live:offline', () => updateReadoutAndInspector());

  return { paintSfx };
}

const THEME_COLORS = { dark: '#0a0b0d', sepia: '#e6dccf' };
