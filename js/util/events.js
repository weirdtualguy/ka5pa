/* util/events.js — a small explicit event bus. Modules never import each other
   for notification; they emit here. No globals, no circular imports. */
const subs = new Map();

export function on(type, fn) {
  let list = subs.get(type);
  if (!list) subs.set(type, list = []);
  list.push(fn);
  return () => off(type, fn);
}

export function off(type, fn) {
  const list = subs.get(type);
  if (list) {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
}

/** Emit an event; subscribers run in registration order (boot order matters). */
export function emit(type, payload) {
  const list = subs.get(type);
  if (!list) return;
  for (const fn of list.slice()) {
    try { fn(payload); } catch (err) { console.error('[bus:' + type + ']', err); }
  }
}
