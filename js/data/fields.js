/* data/fields.js — the serialized BlockHeader v2 wire map: single source of truth
   for the Bytes/DNA bar, field list/CAD, helix view and B's to-scale byte strip.
   Order and widths follow the kHeavyHash preimage (rusty-kaspa hashing/header.rs):
   version u16 · parents (len-prefixed) · 3×32B roots · timestamp u64 · bits u32 ·
   nonce u64 · daa_score u64 · blue_score u64 · blue_work · pruning_point. A/B
   model the parents prefixes as 1+4 B and blue_work as a fixed 24 B; the true
   preimage uses 8-byte LE length prefixes. Pure: runs under Node. */
import { num, sh, u16leHex, u32leHex, u64leHex } from '../util/format.js';

export const SEG_COLORS = ['#ea580c', '#2563eb', '#0d9488', '#7c3aed', '#0284c7', '#b45309', '#4f46e5', '#059669', '#d97706', '#dc2626', '#475569', '#6366f1'];

/** Serialized byte width of the parents segment for pCount direct level-0 parents (A's model). */
export const parentsBytes = (pCount) => 1 + 4 + pCount * 32;

/** Total serialized header bytes for pCount direct parents (323 B for the 4-parent sample). */
export const headerTotalBytes = (pCount) => {
  let t = 0;
  for (const f of HEADER_FIELD_SPECS) t += (typeof f.bytes === 'function') ? f.bytes(pCount) : f.bytes;
  return t;
}

/* order, widths, labels, KIP refs — everything the two byte views share */
export const HEADER_FIELD_SPECS = [
  { key: 'version', name: 'header.version', type: 'u16', bytes: 2, st: 6, kip: 'KIP-16',
    note: (d, v) => `<b>u16 little-endian = ${v}.</b> Post-Toccata sets <code>TOCCATA_BLOCK_VERSION = 2</code> (pre-Toccata = 1) to flag the KIP-21 sequencing commitment. Transactions use <code>TX_VERSION_TOCCATA = 1</code>.`,
    hex: (d, v) => u16leHex(v) },
  { key: 'parents', name: 'header.parents_by_level', type: (n) => `CompressedParents (${n} L0)`, bytes: parentsBytes, st: 1, kip: 'GHOSTDAG',
    note: (d) => `<b>${(d.parents || []).length} direct parent hash(es)</b> at level 0 (32 B each) under GHOSTDAG k = 124 (mergeset ≤ 248). Selected parent: <code>${sh(d.selected, 10, 8)}</code>.`,
    hex: (d) => (d.parents || []).slice(0, 2).join('') || '00'.repeat(32) },
  { key: 'hashMerkle', name: 'header.hash_merkle_root', type: 'Hash (32B)', bytes: 32, st: 5, kip: 'KIP-16',
    note: () => `<b>32 B BLAKE2b-256 Merkle root</b> over the block's transaction IDs. Each <code>txid</code> omits <code>signature_script</code>; signatures are covered by the keyed sighash.`,
    hex: (d) => d.h.hashMerkleRoot || '00'.repeat(32) },
  { key: 'seqCommit', name: 'header.accepted_id_merkle_root', type: 'SeqCommit (32B)', bytes: 32, st: 4, kip: 'KIP-21',
    note: () => `<b>32 B KIP-21 SeqCommit(B)</b> = <code>H_seq(SeqCommit(parent), SeqStateRoot(B))</code> computed over the 256-bit ActiveLanes Sparse Merkle Tree.`,
    hex: (d) => d.h.acceptedIdMerkleRoot || '00'.repeat(32) },
  { key: 'utxoCommit', name: 'header.utxo_commitment', type: 'MuHash (32B)', bytes: 32, st: 5, kip: 'KIP-20',
    note: () => `<b>32 B rolling MuHash</b> over the active UTXO set. Post-Toccata UTXO entries include their KIP-20 <code>covenant_id</code> lineage digest.`,
    hex: (d) => d.h.utxoCommitment || '00'.repeat(32) },
  { key: 'timestamp', name: 'header.timestamp', type: 'u64 (ms)', bytes: 8, st: 6, kip: 'KIP-16',
    note: (d) => `<b>u64 Unix timestamp in ms</b> (${new Date(Number(d.h.timestamp) || Date.now()).toISOString()}). Also committed inside KIP-21 <code>MergesetContextHash(B)</code>.`,
    hex: (d) => u64leHex(d.h.timestamp) },
  { key: 'bits', name: 'header.bits', type: 'u32', bytes: 4, st: 6, kip: 'PoW',
    note: (d) => `<b>u32 compact difficulty target</b> (<code>0x${(Number(d.h.bits) >>> 0).toString(16)}</code>) that the kHeavyHash output must fall below.`,
    hex: (d) => u32leHex(d.h.bits) },
  { key: 'nonce', name: 'header.nonce', type: 'u64', bytes: 8, st: 6, kip: 'PoW',
    note: () => `<b>u64 PoW nonce</b> iterated by miners and multiplied through the 64×64 u16 matrix in kHeavyHash.`,
    hex: (d) => u64leHex(d.h.nonce) },
  { key: 'daaScore', name: 'header.daa_score', type: 'u64', bytes: 8, st: 6, kip: 'DAA',
    note: (d) => `<b>u64 Difficulty Adjustment score</b> (${num(d.h.daaScore)}). Toccata activated at DAA <code>474,165,565</code>.`,
    hex: (d) => u64leHex(d.h.daaScore) },
  { key: 'blueScore', name: 'header.blue_score', type: 'u64', bytes: 8, st: 6, kip: 'GHOSTDAG',
    note: (d) => `<b>u64 GHOSTDAG blue score</b> (${num(d.v.blueScore || d.h.blueScore)}) — drives merge depth (36k), finality (432k), and pruning (1.08M).`,
    hex: (d) => u64leHex(d.v.blueScore || d.h.blueScore) },
  { key: 'blueWork', name: 'header.blue_work', type: 'Uint192 (24B)', bytes: 24, st: 6, kip: 'GHOSTDAG',
    note: () => `<b>24 B Uint192 cumulative blue proof-of-work</b> used by GHOSTDAG to select the highest-work parent chain.`,
    hex: (d) => String(d.h.blueWork || '0').padStart(48, '0') },
  { key: 'pruningPoint', name: 'header.pruning_point', type: 'Hash (32B)', bytes: 32, st: 1, kip: 'IBD',
    note: () => `<b>32 B pruning point hash</b> anchoring IBD header/UTXO sync (~30 hours of 10-BPS history).`,
    hex: (d) => d.h.pruningPoint || '00'.repeat(32) }
];

/** Enrich the specs with a digest: offsets, hex, notes, colors (A's buildByteFields, pure). */
export function byteFields(d, ver, segColors = SEG_COLORS) {
  const pCount = (d.parents || []).length || 1;
  let offset = 0;
  return HEADER_FIELD_SPECS.map((f, i) => {
    const bytes = (typeof f.bytes === 'function') ? f.bytes(pCount) : f.bytes;
    const start = offset;
    offset += bytes;
    return {
      ...f,
      type: (typeof f.type === 'function') ? f.type(pCount) : f.type,
      bytes, idx: i, offset: start, end: offset,
      color: segColors[i % segColors.length],
      hex: f.hex(d, ver), note: f.note(d, ver)
    };
  });
}

/* B's to-scale byte strip annotations (kaspa.js byteStrip), driven by the same data */
export const STRIP_ROWS = [
  { at: 'parents', label: (n) => `parents ${n} · 4 shown` },
  { at: 'roots', label: () => 'three roots · 32 B each' },
  { at: 'blueWork', label: () => 'work 24' },
  { at: 'pruningPoint', label: () => 'pruning 32', second: true }
];
export const STRIP_CAPTION = 'small fields: version 2 · timestamp 8 · bits 4 · nonce 8 · daa 8 · blue 8 B';
