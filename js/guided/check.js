/* guided/check.js — B's in-browser BFS checker (a plain breadth-first search,
   not a model checker), ported from kaspa.check.mjs. Runs at page load so
   "27 states, 46 steps" is computed, never hard-coded. Pure: same under Node. */
import {
  ARROWS, STATES, START, START_AT, RULES, MUTANTS, EFFECT, moves
} from './machine.js';

const key = s => JSON.stringify(s);

/** BFS over the reachable state space (optionally with one guard mutated away). */
function search(mutant = '') {
  const seen = new Map([[key(START), null]]), q = [START];
  let steps = 0;
  const bad = {};
  while (q.length) {
    const s = q.shift();
    for (const [r, R] of Object.entries(RULES)) if (!R.ok(s) && !bad[r]) bad[r] = s;
    for (const [ev, t] of moves(s, mutant)) {
      steps++;
      if (!seen.has(key(t))) { seen.set(key(t), [s, ev]); q.push(t); }
    }
  }
  const trail = s => { const p = []; for (let c = s; seen.get(key(c)); c = seen.get(key(c))[0]) p.unshift(seen.get(key(c))[1]); return p; };
  return { states: seen.size, steps, seen, bad: Object.fromEntries(Object.entries(bad).map(([r, s]) => [r, trail(s)])) };
}

/** Recompute the checked model: counts, the four rules and their failing-guard demos. */
export function verify() {
  const ok = search();
  if (Object.keys(ok.bad).length) throw new Error('a rule breaks as built: ' + JSON.stringify(ok.bad));

  /* every guard can be false somewhere it applies (a guard that is always true guards nothing) */
  for (const a of ARROWS) {
    const e = EFFECT[a.label];
    if (!e || !e.when) continue;
    const here = [...ok.seen.keys()].map(k => JSON.parse(k)).filter(s => s.at === a.from);
    if (here.length && here.every(s => e.when(s))) throw new Error(`the guard on "${a.label}" is true in every reachable ${a.from}: it guards nothing`);
  }

  /* every state is reached, and from every reachable state an end (or, for a cycle, the start) can be reached */
  const reached = new Set([...ok.seen.keys()].map(k => JSON.parse(k).at));
  const missing = STATES.filter(s => !reached.has(s));
  if (missing.length) throw new Error('never reached: ' + missing.join(', '));
  const GOAL = new Set([START_AT]);
  for (const k of ok.seen.keys()) {
    const s0 = JSON.parse(k);
    const f = moves(s0).map(([, t]) => t), v = new Set(f.map(key));
    let done = GOAL.has(s0.at);
    while (f.length && !done) {
      const s = f.shift();
      done = GOAL.has(s.at);
      for (const [, t] of moves(s)) if (!v.has(key(t))) { v.add(key(t)); f.push(t); }
    }
    if (!done) throw new Error('stuck: no way on from ' + k);
  }
  const shape = 'from every state it comes back round to the start';
  const rules = [
    {
      rule: 'Every step can happen, and none is a dead end',
      says: `Each of the ${STATES.length} states is reached from the start, and ${shape}.`,
      path: `Holds: all ${STATES.length} reached, none stuck.`
    },
    ...Object.entries(RULES).map(([rule, R]) => {
      const no = search(R.guard).bad[rule];
      if (!no) throw new Error(`adding the "${R.guard}" mutant does not break "${rule}": the guard may not be needed`);
      return { rule, says: R.says, path: `Take away the ${R.guard} guard and it breaks in ${no.length} step${no.length > 1 ? 's' : ''}: ${no.join(', ')}.` };
    })
  ];
  return {
    title: 'One Kaspa block',
    checked: `Every reachable state checked (${ok.states} states, ${ok.steps} steps). All ${rules.length} rules hold.`,
    rules,
    states: ok.states,
    steps: ok.steps,
    edges: ARROWS.filter(a => a.from !== '[*]').map(a => [a.from, a.to])
  };
}
