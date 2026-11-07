/* guided/machine.js — B's state machine, data-driven from an inline copy of
   kaspa.mmd ("One Kaspa block"). Pure: no DOM, runs in the browser and under Node
   (tests/machine.test.mjs). Data beside the state: pow (the seal is under target),
   seenRoots (the three commitments are exposed), proofs (ZK payloads; each adds
   200,000 g on top of 200,000 g of ordinary mass — the 1,000,000 g cap fits four). */

export const MMD = `---
title: "One Kaspa block"
---
stateDiagram-v2
  [*] --> sealed
  sealed: Sealed - only the hash shows
  commitments: Roots exposed
  body: Body of transactions
  tx: One transaction open
  parents: The mergeset floor
  sealed --> sealed: grind a nonce [hash still above target]
  sealed --> commitments: peel the header [hash below target]
  commitments --> body: lift the roots
  body --> tx: open a transaction
  tx --> parents: follow an input down
  parents --> tx: climb back up
  tx --> body: close the transaction
  body --> commitments: seat the roots
  commitments --> sealed: press the seal
  body --> body: add a zk proof [room for a first]
  body --> body: add another [room for a second]
  body --> body: add a third [room for a third]
  body --> body: add a fourth [fills the budget exactly]
`;

const BODY = MMD.slice(MMD.indexOf('stateDiagram'));
export const TITLE = (MMD.match(/title:\s*"?([^"\n]+)"?/) || [, 'Untitled'])[1];
export const STATES = [...BODY.matchAll(/^\s*(\w+):\s/gm)].map(m => m[1]);
export const ARROWS = [...BODY.matchAll(/^\s*(\w+|\[\*\])\s*-->\s*(\w+|\[\*\])(?::\s*(.+))?$/gm)]
  .map(m => ({ from: m[1], to: m[2], label: (m[3] || '').trim() }));
export const START_AT = ARROWS.find(a => a.from === '[*]').to;

/* the data the states don't hold on their own */
export const START = { at: START_AT, pow: false, seenRoots: false, proofs: 0 };

/* one entry per arrow label in the mmd: `when` is its guard, `set` changes the data */
export const EFFECT = {
  'grind a nonce [hash still above target]': { when: s => !s.pow, set: { pow: true } },
  'peel the header [hash below target]': { when: s => s.pow, set: { seenRoots: true } },
  'lift the roots': {},
  'open a transaction': {},
  'follow an input down': {},
  'climb back up': {},
  'close the transaction': {},
  'seat the roots': {},
  'press the seal': {},
  'add a zk proof [room for a first]': { when: s => s.proofs === 0, set: { proofs: 1 } },
  'add another [room for a second]': { when: s => s.proofs === 1, set: { proofs: 2 } },
  'add a third [room for a third]': { when: s => s.proofs === 2, set: { proofs: 3 } },
  'add a fourth [fills the budget exactly]': { when: s => s.proofs === 3, set: { proofs: 4 } },
};

/* the rules: each must hold in every reachable state, and names the guard it depends on */
export const RULES = {
  'Never dissect an unmined block': { says: 'The header is peeled only after its kHeavyHash output falls under the target in bits.', ok: s => s.at === 'sealed' || s.pow, guard: 'hash below target' },
  'The body hangs from its roots': { says: 'Every path to the transactions passes the three commitments — Merkle, KIP-21 SeqCommit, MuHash.', ok: s => !['body', 'tx', 'parents'].includes(s.at) || s.seenRoots, guard: 'roots first' },
  'The transient budget never overflows': { says: 'Toccata doubled transient mass to 1,000,000 g (4 x serialized bytes, a 250 KB body); the ZK proofs still stop at the cap.', ok: s => s.proofs <= 4, guard: 'room in the budget' },
};

/* for each guard: the arrow the chart would have without it. Never part of the chart. */
export const MUTANTS = {
  'hash below target': [{ from: 'sealed', to: 'commitments', label: 'peel it, unmined' }],
  'roots first': [{ from: 'sealed', to: 'body', label: 'reach straight to the body' }],
  'room in the budget': [{ from: 'body', to: 'body', label: 'cram in a fifth', set: { proofs: 5 } }],
};

/* consistency: every mmd arrow has an effect and vice versa; no mutant is a real arrow */
for (const a of ARROWS.filter(a => a.from !== '[*]' && a.to !== '[*]')) if (!EFFECT[a.label]) throw new Error(`.mmd arrow "${a.from} --> ${a.to}: ${a.label}" has no EFFECT`);
for (const l of Object.keys(EFFECT)) if (!ARROWS.some(a => a.label === l)) throw new Error(`EFFECT "${l}" is not an arrow in the .mmd`);
for (const [, ms] of Object.entries(MUTANTS)) for (const m of ms) if (ARROWS.some(a => a.from === m.from && a.to === m.to && a.label === m.label)) throw new Error(`mutant "${m.label}" is a real arrow in the .mmd`);

/** The currently legal moves from a state (optionally with one guard mutated away). */
export function moves(s, mutant = '') {
  const m = [];
  for (const a of ARROWS) {
    if (a.from === s.at && a.to !== '[*]') {
      const e = EFFECT[a.label];
      if (!e.when || e.when(s)) m.push([a.label, { ...s, ...(e.set || {}), at: a.to }]);
    }
  }
  for (const a of (MUTANTS[mutant] || [])) if (a.from === s.at) m.push([a.label, { ...s, ...(a.set || {}), at: a.to }]);
  return m;
}

/* Kaspa narration, ported from B's init(): what each state and step says */
export const SAY = {
  sealed: 'A sealed Kaspa block — one of ten a second. Press Grind a nonce, then Next step.',
  commitments: 'The header lifts — three 32-byte roots tie it to the body.',
  body: 'The roots lift — transactions in the tray, one of them the coinbase.',
  tx: 'One transaction opens — inputs spend, outputs bind.',
  parents: 'Down an input — the block stands on its parents: selected, blue and red.'
};
export const NEXT_SAYS = {
  commitments: 'The header lifts — three 32-byte roots tie it to the body.',
  body: 'The roots lift — transactions in the tray, one of them the coinbase.',
  tx: 'One transaction opens — inputs spend, outputs bind.',
  parents: 'Down an input — the block stands on its parents: selected, blue and red.'
};
export const SEAT_SAYS = {
  tx: 'Back up the input — one transaction open again.',
  body: 'The transaction closes.',
  commitments: 'The roots seat back on the body.',
  sealed: 'The header presses down — the hash seals it again.'
};
export const STATE_TO_TRAY = { sealed: 1, commitments: 2, body: 3, tx: 4, parents: 5 };
