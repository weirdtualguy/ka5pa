/* tests/fields.test.mjs — plain node:test over data/fields.js (pure module): the
   wire map is contiguous and sums to the stated header size, and every small-field
   width matches its consensus type (rusty-kaspa: version u16, timestamp u64, bits
   u32, nonce u64, daa/blue_score u64, blue_work Uint192 = 24 B, hashes 32 B). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  byteFields, headerTotalBytes, parentsBytes, HEADER_FIELD_SPECS, SEG_COLORS
} from '../js/data/fields.js';
import { sampleBlock } from '../js/data/sample.js';
import { digest } from '../js/data/api.js';

const d = digest(sampleBlock(2, 474165582, 468912044));
const fields = byteFields(d, 2);

test('the sample has four direct parents, so the header is 323 B', () => {
  assert.equal(d.parents.length, 4);
  assert.equal(parentsBytes(4), 133, 'parents segment: 1 + 4 + 4×32');
  assert.equal(headerTotalBytes(4), 323, 'A/B model: 323 B serialized header');
});

test('offsets are contiguous and end exactly at the total', () => {
  let expect = 0;
  for (const f of fields) {
    assert.equal(f.offset, expect, `${f.name} starts where ${fields[f.idx - 1]?.name || 'the strip'} ended`);
    expect += f.bytes;
    assert.equal(f.end, expect);
  }
  assert.equal(expect, fields.reduce((s, f) => s + f.bytes, 0));
  assert.equal(expect, 323);
});

test('small-field widths match the consensus types (rusty-kaspa)', () => {
  const byKey = Object.fromEntries(fields.map(f => [f.key, f]));
  assert.equal(byKey.version.bytes, 2, 'version u16');
  assert.equal(byKey.timestamp.bytes, 8, 'timestamp u64 ms');
  assert.equal(byKey.bits.bytes, 4, 'bits u32');
  assert.equal(byKey.nonce.bytes, 8, 'nonce u64');
  assert.equal(byKey.daaScore.bytes, 8, 'daa_score u64');
  assert.equal(byKey.blueScore.bytes, 8, 'blue_score u64');
  assert.equal(byKey.blueWork.bytes, 24, 'blue_work Uint192');
  assert.equal(byKey.hashMerkle.bytes, 32, 'hash_merkle_root');
  assert.equal(byKey.seqCommit.bytes, 32, 'accepted_id_merkle_root (KIP-21)');
  assert.equal(byKey.utxoCommit.bytes, 32, 'utxo_commitment (MuHash)');
  assert.equal(byKey.pruningPoint.bytes, 32, 'pruning_point');
});

test('field order matches the kHeavyHash preimage order', () => {
  assert.deepEqual(
    HEADER_FIELD_SPECS.map(f => f.key),
    ['version', 'parents', 'hashMerkle', 'seqCommit', 'utxoCommit',
     'timestamp', 'bits', 'nonce', 'daaScore', 'blueScore', 'blueWork', 'pruningPoint']
  );
});

test('every field carries a KIP ref, a station and a note', () => {
  for (const f of fields) {
    assert.ok(f.kip, `${f.key} names its KIP`);
    assert.ok(f.st >= 1 && f.st <= 6, `${f.key} jumps to a station`);
    assert.ok(f.note.length > 40, `${f.key} has a substantive note`);
    assert.ok(f.hex.length > 0, `${f.key} has hex`);
  }
});

test('the pre-Toccata era pins version 1 and keeps the layout', () => {
  const f1 = byteFields(d, 1);
  assert.equal(f1[0].hex, '0100', 'version bytes little-endian 1');
  assert.equal(f1[0].bytes, 2);
  assert.equal(f1.reduce((s, f) => s + f.bytes, 0), 323, 'size unchanged');
});

test('segment colors cover the twelve fields', () => {
  assert.equal(SEG_COLORS.length, 12);
  assert.equal(new Set(fields.map(f => f.color)).size, 12, 'each field has its own colour');
});
