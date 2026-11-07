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

/** A's revealPlate(): scroll the figure into view when needed. */
export function revealPlate() {
  const p = document.getElementById('anatomy-plate'), r = p.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight * 0.9)
    p.scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

/** Scroll the byte-anatomy panel into view ([D] and the Bytes/DNA button). */
export function revealDnaPanel() {
  document.getElementById('dna-panel')
    .scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'center' });
}
