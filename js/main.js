/* Entry point. Subscription order matters: render (state) → dag (live surfaces) → controls → bytes. */
import { initRenderDom, initRenderSubscriptions, startMainLoop, startAmbientLoop, state } from './engine/render.js';
import { initLiveData } from './data/api.js';
import { initControls, setNerd, setEra, sfx } from './ui/controls.js';
import { initKeyboard } from './ui/keyboard.js';
import { initDag, renderNeighborBlocks, syncHud, searchFromUrl } from './ui/dag.js';
import { initBytes, sizeDna, drawDna } from './ui/bytes.js';
import { initShare } from './ui/share.js';
import { initCallouts } from './ui/callouts.js';
import { initFlow } from './guided/flow-ui.js';
import { initLogicPanel } from './guided/logic-panel.js';
import { initA11y } from './ui/a11y.js';
import { store } from './util/format.js';

function boot() {
  initA11y();

  /* engine + data */
  initRenderDom();
  initRenderSubscriptions();      // subscribes 'block:applied' FIRST (state mutations)
  initDag();                      // live surfaces subscribe second
  initControls();                 // sliders/readouts subscribe third
  initBytes();                    // byte anatomy + DNA subscribe fourth
  initCallouts();
  initFlow();
  initLogicPanel();
  initShare();
  initKeyboard();

  /* theme from the boot script / storage */
  state.theme = document.documentElement.getAttribute('data-theme') || 'sketchbook';

  /* A's bootstrap sequence */
  const nerdOn = store.get('kba-nerd') === '1';
  setNerd(nerdOn);
  setEra(2, true);
  initLiveData();                 // applyBlock(sample) → subscribers fire in order

  startAmbientLoop(sizeDna, drawDna);
  startMainLoop();

  renderNeighborBlocks();         // A calls this once at the end of initV10Hybrid
  syncHud();
  searchFromUrl();
}

boot();
