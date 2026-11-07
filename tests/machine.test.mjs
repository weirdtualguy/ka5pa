/* tests/machine.test.mjs — plain node:test over the pure guided modules. Asserts
   the verified model: 27 states, 46 steps, 4 rules, live guards (no peel before a
   grind, no fifth proof). The counts are recomputed here — change the mmd and these
   must be re-verified, not edited. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { verify } from '../js/guided/check.js';
import {
  MMD, STATES, ARROWS, START, moves, MUTANTS, EFFECT, STATE_TO_TRAY
} from '../js/guided/machine.js';

test('the mmd is the machine: five states, thirteen real arrows, a title', () => {
  assert.equal(STATES.length, 5, 'five named states');
  assert.deepEqual(STATES, ['sealed', 'commitments', 'body', 'tx', 'parents']);
  assert.equal(ARROWS.filter(a => a.from !== '[*]' && a.to !== '[*]').length, 13, 'thirteen real arrows');
  assert.equal(ARROWS.filter(a => a.from === '[*]').length, 1, 'one start arrow');
  assert.equal(ARROWS.length, 14, 'fourteen edges including the start');
  assert.ok(MMD.includes('One Kaspa block'));
});

test('BFS recomputes 27 states and 46 steps', () => {
  const v = verify();
  assert.equal(v.states, 27, '27 reachable states');
  assert.equal(v.steps, 46, '46 BFS steps');
  assert.ok(v.checked.includes('Every reachable state checked (27 states, 46 steps). All 4 rules hold.'));
});

test('all four rules hold, with their failing-guard demos', () => {
  const v = verify();
  assert.equal(v.rules.length, 4);
  const names = v.rules.map(r => r.rule);
  assert.ok(names.includes('Every step can happen, and none is a dead end'));
  assert.ok(names.includes('Never dissect an unmined block'));
  assert.ok(names.includes('The body hangs from its roots'));
  assert.ok(names.includes('The transient budget never overflows'));
  for (const r of v.rules) assert.ok(r.path && r.says, `${r.rule} has says + path`);
  assert.ok(v.rules[3].path.includes('breaks in 4 steps'), 'the budget guard demo breaks in exactly 4 steps');
});

test('guards are real: no peel before the grind, no fifth proof', () => {
  const startMoves = moves(START).map(([l]) => l);
  assert.ok(!startMoves.includes('peel the header [hash below target]'), 'cannot peel an unmined block');
  assert.ok(startMoves.includes('grind a nonce [hash still above target]'), 'can grind');
  /* after peeling, the machine carries pow + seenRoots into the body */
  const ground = moves(START).find(([l]) => l.startsWith('grind'))[1];
  const peeled = moves(ground).find(([l]) => l.startsWith('peel'))[1];
  assert.equal(peeled.at, 'commitments');
  assert.equal(peeled.seenRoots, true, 'peeling exposes the roots');
  const body = moves(peeled).find(([l]) => l === 'lift the roots')[1];
  let cur = body, guardHits = 0;
  for (let i = 0; i < 10; i++) {
    const add = moves(cur).find(([l]) => l.startsWith('add'));
    if (!add) break;
    guardHits++;
    cur = add[1];
  }
  assert.equal(guardHits, 4, 'exactly four ZK proofs fit the 1,000,000 g cap');
  assert.equal(cur.proofs, 4);
  assert.ok(!moves(cur).some(([l]) => l.startsWith('add')), 'a fifth proof is refused');
  assert.ok(cur.proofs <= 4, 'the transient budget never overflows');
});

test('mutants break their rules (each guard is needed)', () => {
  const v = verify(); // also throws if a mutant does NOT break its rule
  assert.equal(Object.keys(MUTANTS).length, 3);
  assert.ok(v.rules[1].path.includes('peel it, unmined'));
  assert.ok(v.rules[2].path.includes('reach straight to the body'));
  assert.ok(v.rules[3].path.includes('cram in a fifth'));
});

test('every effect is an arrow and every arrow has an effect (consistency)', () => {
  for (const a of ARROWS.filter(x => x.from !== '[*]' && x.to !== '[*]')) {
    assert.ok(EFFECT[a.label], `arrow "${a.label}" has an EFFECT entry`);
  }
  for (const label of Object.keys(EFFECT)) {
    assert.ok(ARROWS.some(a => a.label === label), `EFFECT "${label}" is an arrow in the mmd`);
  }
});

test('machine states map onto the five trays', () => {
  assert.deepEqual(
    Object.keys(STATE_TO_TRAY).sort(),
    ['body', 'commitments', 'parents', 'sealed', 'tx'].sort()
  );
  assert.equal(STATE_TO_TRAY.sealed, 1);
  assert.equal(STATE_TO_TRAY.parents, 5);
});
