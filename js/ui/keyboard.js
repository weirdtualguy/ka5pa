/* ui/keyboard.js — A's key map, unchanged:
   ←/→ station · E explode · M/Space stamp · S slow · +/−/0 zoom · T era · N nerd
   · D Bytes/DNA · P share · Esc back/reset. Guard conditions preserved:
   ctrl/meta/alt ignored, INPUT/TEXTAREA/SELECT ignored, data-strip arrow keys
   ignored, Space/Enter on buttons left to the browser. */
import { state } from '../engine/render.js';
import { selectStation, toggleExplode, triggerBlockStamp, cycleSlowMotion, setEra, setNerd } from './controls.js';
import { zoomAt, resetCam, camZ } from '../engine/camera.js';
import { revealDnaPanel } from './a11y.js';
import { isTxOpen, goBack, canGoBack } from './dag.js';
import { emit } from '../util/events.js';

export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target && e.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tg)) return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.matches && e.target.matches('[data-strip]')) return;
    if ((e.key === ' ' || e.key === 'Enter') &&
        (['BUTTON', 'SUMMARY', 'A', 'TR'].includes(tg) ||
         (e.target.closest && e.target.closest('[role="button"], [role="option"], [data-jump-station]')))) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectStation(state.station + 1, true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectStation(state.station - 1, true);
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      toggleExplode();
    } else if (e.key === 'm' || e.key === 'M' || e.key === ' ') {
      e.preventDefault();
      triggerBlockStamp();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      cycleSlowMotion();
    } else if (e.key === 'Escape') {
      /* "The logic" open? Escape only closes the modal, leaving the stage alone. */
      const lg = document.getElementById('lg');
      if (lg && !lg.hidden) { lg.hidden = true; return; }
      /* unwind one level per press: transaction view → station/peel → previous block */
      if (isTxOpen()) { goBack(); return; }
      if (state.explode.want > 0 || state.station !== 0) {
        state.explode.want = 0;
        document.getElementById('btn-explode').classList.remove('active');
        selectStation(0, true);
      } else if (canGoBack()) goBack();
    } else if (e.key === '/') {
      e.preventDefault();
      const inp = document.getElementById('blk-in');
      inp.scrollIntoView({ block: 'center' }); inp.focus(); inp.select();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomAt(camZ() * 1.25);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomAt(camZ() / 1.25);
    } else if (e.key === '0') {
      e.preventDefault();
      resetCam();
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      setEra(state.era === 2 ? 1 : 2);
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      setNerd(!state.nerd);
    } else if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      revealDnaPanel();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      emit('share:card');
    }
  });
}
