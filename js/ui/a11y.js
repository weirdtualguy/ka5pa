/* ui/a11y.js — aria-live announcer, plate reveal and focus helpers. */
import { state } from '../engine/render.js';

let announcer = null;

export function initA11y() {
  announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('role', 'status');
  announcer.className = 'visually-hidden';
  document.body.append(announcer);
}

/** Announce a status change to screen readers (deduped). */
export function announce(text) {
  if (!announcer || announcer.textContent === text) return;
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = text; });
}

/** Scroll the figure into view only when less than ~60% of it is visible. */
export function revealPlate() {
  const st = document.getElementById('iso-stage'), p = document.getElementById('anatomy-plate');
  const r = st.getBoundingClientRect();
  const seen = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
  if (r.height && seen / r.height < 0.6)
    p.scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

/** Scroll the byte-anatomy panel into view ([D] and the Bytes/DNA button). */
export function revealDnaPanel() {
  document.getElementById('dna-panel')
    .scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'center' });
}
