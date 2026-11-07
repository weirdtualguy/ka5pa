/* util/format.js — number / string formatting helpers shared by every layer.
   Pure functions only: safe under Node (tests) and in the browser. */
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** A's f1: one-decimal rounding via half-up, returns a number. */
export function f1(n) { return ((n * 10 + (n >= 0 ? 0.5 : -0.5)) | 0) * 0.1; }

/** B's n1: one-decimal trimming for SVG path data. */
export const n1 = (v) => +v.toFixed(1);

export const num = (n) => Number(n).toLocaleString('en-US');

export function si(n) {
  const u = ['', 'K', 'M', 'G', 'T', 'P', 'E']; let i = 0; n = Number(n);
  if (!isFinite(n)) return '—';
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(n >= 100 ? 0 : 2) + ' ' + u[i];
}

/** HTML-escape for innerHTML-built strings (A's esc). */
export const esc = (s) => String(s == null ? '—' : s)
  .replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');

/** Short hash ellipsis (A's sh). */
export const sh = (h, a = 6, b = 4) =>
  (h && h.length > a + b + 1) ? h.slice(0, a) + '…' + h.slice(-b) : (h || '—');

/* --- little-endian hex encoders for the byte map (A's §8, unchanged) --- */
export function u16leHex(n) {
  const v = Number(n) & 0xffff;
  return [v & 0xff, (v >> 8) & 0xff].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function u32leHex(n) {
  const v = Number(n) >>> 0;
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function u64leHex(n) {
  try {
    let v = BigInt(n || 0);
    const out = [];
    for (let i = 0; i < 8; i++) { out.push(Number(v & 0xffn).toString(16).padStart(2, '0')); v >>= 8n; }
    return out.join('');
  } catch (_) { return '00'.repeat(8); }
}

/** Deterministic pseudo-hash hex for sample data (A's hex()). */
export function hexGen(seed) {
  let s = seed >>> 0, o = '';
  for (let i = 0; i < 64; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; o += (s >>> 28).toString(16); }
  return o;
}

/** localStorage wrapper that never throws (A's store). */
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
};
