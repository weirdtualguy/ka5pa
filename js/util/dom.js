/* util/dom.js — tiny DOM helpers, no dependencies. One job: query & build. */
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const byId = (id) => document.getElementById(id);

/** Create an element with attrs and children in one call. */
export function make(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(
    (String(tag).toLowerCase() === 'svg' || attrs.ns) ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml',
    tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'ns') continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid != null) el.append(kid);
  return el;
}

/** Remove all children of a node (cheaper innerHTML = ''). */
export function clear(el) { if (el) while (el.firstChild) el.removeChild(el.firstChild); return el; }
