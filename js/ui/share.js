/* ui/share.js — A's share-card PNG export with one repair: the serialized stage
   is loaded as an <img>, where external stylesheets do not apply, so A's original
   exported the geometry as unstyled black silhouettes. This version also embeds a
   small <style> block, computed from the live stage (theme-aware, url(#…) ids kept),
   and resolves B's sketch tokens in the inline styles. Card layout, data rows and
   flow are A's, unchanged. */
import { state } from '../engine/render.js';
import { live } from '../data/api.js';
import { on as onBus } from '../util/events.js';
import { num, sh } from '../util/format.js';

const NS = 'http://www.w3.org/2000/svg';

/* presentation properties captured per class — fills, inks and label halo */
const SHAPE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'stroke-dasharray', 'opacity', 'paint-order'];
const TEXT_PROPS = ['font-family', 'font-size', 'font-weight', 'text-anchor', 'letter-spacing'];

/* element specs: [tag, class, optional outer [tag, class]] — compound rules
   (.nb-sel .nb-top, .txm.sel .nb-side, .co-note.on .co-title) resolve through the
   real cascade instead of guessing which theme block wins. The CSS selector is
   derived from the spec, leading dots included. */
const STAGE_CLASSES = [
  ['path', 'iso-paper'], ['path', 'iso-s0'], ['path', 'iso-s1'],
  ['path', 'iso-s2'], ['path', 'iso-s3'], ['path', 'iso-top'],
  ['path', 'iso-lit-top'], ['path', 'iso-lit-side'],
  ['path', 'iso-stroke-hi'], ['path', 'iso-stroke-mid'],
  ['path', 'iso-stroke-lo'], ['path', 'iso-stroke-lit'], ['path', 'iso-stroke-faint'],
  ['path', 'iso-pipe-paper'],
  ['circle', 'iso-dot'], ['circle', 'iso-dot-lit'],
  ['path', 'nb-top'], ['path', 'nb-side'], ['path', 'nb-blue'],
  ['path', 'nb-red'], ['circle', 'nb-dot'], ['circle', 'nb-dot-b'],
  ['circle', 'nb-dot-r'], ['text', 'nb-lbl'], ['rect', 'nb-chip-r'],
  ['path', 'nb-top', ['g', 'nb-sel']], ['path', 'nb-side', ['g', 'nb-sel']],
  ['text', 'nb-lbl', ['g', 'nb-sel']],
  ['path', 'nb-top', ['g', 'txm sel']], ['path', 'nb-side', ['g', 'txm sel']],
  ['text', 'tx-lbl'], ['text', 'tx-title'], ['text', 'tx-note'],
  ['text', 'tx-note dim'], ['path', 'cov-line'], ['circle', 'cov-dot'],
  ['text', 'co-title'], ['text', 'co-note-line'],
  ['text', 'co-title', ['g', 'co-note on']]
];

/* url(#id) references must stay local — absolute urls break inside a data: image */
const localizeUrls = (s) => s.replace(/url\((['"]?)([^'")]*)\1?\)/g, (m, _q, body) => 'url(#' + body.split('#').pop() + ')');

/** Flatten the stage's classes into a self-contained style block for the <img>. */
export function stageStyleCss() {
  const stage = document.getElementById('iso-stage');
  if (!stage) return '';
  const rules = [];
  for (const [tag, cls, outer] of STAGE_CLASSES) {
    const sel = (outer ? '.' + outer[1].split(' ').join('.') + ' ' : '') + '.' + cls.split(' ').join('.');
    let host = stage;
    if (outer) {
      const o = document.createElementNS(NS, outer[0]);
      o.setAttribute('class', outer[1]);
      stage.appendChild(o);
      host = o;
    }
    const el = document.createElementNS(NS, tag);
    el.setAttribute('class', cls);
    if (tag === 'text') { el.setAttribute('x', '0'); el.setAttribute('y', '0'); el.textContent = 'x'; }
    host.appendChild(el);
    const cs = getComputedStyle(el);
    const props = tag === 'text' ? [...SHAPE_PROPS, ...TEXT_PROPS] : SHAPE_PROPS;
    const decls = [];
    for (const p of props) {
      const v = cs.getPropertyValue(p).trim();
      if (!v) continue;
      decls.push(`${p}:${localizeUrls(v)}`);
    }
    el.remove();
    if (outer) host.remove();
    if (decls.length) rules.push(`${sel}{${decls.join(';')}}`);
  }
  return rules.join('\n');
}

export function makeShareCard() {
  const d = live.d; if (!d) return;
  const stage = document.getElementById('iso-stage');
  const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630;
  const g = cv.getContext('2d'), cs = getComputedStyle(document.documentElement);
  const pick = (v) => cs.getPropertyValue(v).trim();
  g.fillStyle = pick('--anatomy-card'); g.fillRect(0, 0, 1200, 630);
  g.strokeStyle = pick('--panel-border'); g.strokeRect(18, 18, 1164, 594);
  let xml = new XMLSerializer().serializeToString(stage);
  ['--anatomy-paper','--anatomy-top','--anatomy-shade-0','--anatomy-shade-1','--anatomy-shade-2','--anatomy-shade-3','--anatomy-lit-top','--anatomy-lit-shade','--anatomy-hi','--anatomy-mid','--anatomy-lo','--anatomy-faint','--anatomy-dot','--anatomy-lit','--anatomy-weight',
   /* B's sketch tokens, used by the pen's inline styles */
   '--ink','--lead','--wax','--red','--gold','--teal','--plum','--paper','--paper-lit','--marker-paper','--marker-gold','--marker-teal','--marker-plum','--tray','--desk','--blue','--rose','--steel','--steel-dark','--brass'].forEach(v => {
    xml = xml.split(`var(${v})`).join(pick(v));
  });
  /* embed the flattened class styles — an <img> sees no document stylesheets */
  const styleCss = stageStyleCss();
  if (styleCss) xml = xml.replace(/(<svg[^>]*>)/, (open) => open + '<style>' + styleCss + '</style>');
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, 24, 34, 700, 525);
    g.fillStyle = pick('--anatomy-lit'); g.font = '600 13px monospace';
    g.fillText('KASPA BLOCKDAG · POST-TOCCATA (BLOCK v2 · TX v1)', 748, 72);
    g.fillStyle = pick('--anatomy-strong'); g.font = '28px Georgia, serif';
    g.fillText('Anatomy of a Kaspa Block', 748, 108);
    g.font = '14px monospace';
    const ver = state.era === 1 ? 1 : (Number(d.h.version) >= 2 ? Number(d.h.version) : 2);
    [['block', sh(d.v.hash, 12, 10)], ['header.version', 'v' + ver + ' (Toccata)'], ['daa_score', num(d.h.daaScore)], ['blue_score', num(d.v.blueScore || d.h.blueScore)], ['parents', d.parents.length + ' · sel ' + sh(d.selected, 8, 6)], ['mergeset', d.blues.length + ' blue · ' + d.reds.length + ' red'], ['txs', d.txN + ' (' + d.v1N + ' v1 · ' + d.covN + ' cov)'], ['mass', num(d.mass) + ' g']].forEach((r, i) => {
      const y = 158 + i * 36;
      g.fillStyle = pick('--anatomy-muted'); g.fillText(r[0], 748, y);
      g.fillStyle = pick('--anatomy-strong'); g.fillText(String(r[1]), 900, y);
    });
    cv.toBlob(bl => {
      if (!bl) return;
      const u = URL.createObjectURL(bl), a = document.createElement('a');
      a.href = u; a.download = 'kaspa-block-v10-' + (d.v.hash || 'sample').slice(0, 10) + '.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}

export function initShare() {
  document.getElementById('btn-share').onclick = makeShareCard;
  onBus('share:card', makeShareCard);
}
