/* scripts/build.mjs — zero-dependency build (Node 18+, built-ins only).
   dist/kaspa-block.html: stylesheets inlined, the ES-module graph scope-hoisted
   into one classic <script> (native modules do not load from file://), assets as
   data URIs. Minifies whitespace and comments only. Duplicate top-level names are
   rejected loudly — the bundle relies on one-job modules with named exports. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
mkdirSync(DIST, { recursive: true });

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ---------- tiny CSS minifier: comments + leading whitespace + blank lines ---------- */
function css(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

/* ---------- JS: strip comments (line + block at line starts), keep strings intact ---------- */
function js(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (inBlock) { if (t.includes('*/')) inBlock = t.split('*/').pop().trim() && false || t.endsWith('*/') && false; if (t.includes('*/')) { inBlock = false; const rest = t.slice(t.indexOf('*/') + 2); if (rest.trim()) out.push(rest); } continue; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; else { const rest = t.slice(t.indexOf('*/') + 2); if (rest.trim()) out.push(rest); } continue; }
    if (t.startsWith('//')) continue;
    out.push(line.replace(/\s+$/, ''));
  }
  return out.join('\n');
}

/* ---------- module graph: parse, order, scope-hoist ---------- */
function parseImports(src) {
  const imports = [];
  const re = /^\s*import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}\s*|(\*\s+as\s+[\w$]+)\s*|([\w$]+)\s*)?from\s*['"]([^'"]+)['"]\s*;?/gm;
  let m;
  while ((m = re.exec(src))) {
    const spec = [];
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const bit = part.trim();
        if (!bit) continue;
        const asMatch = bit.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
        spec.push(asMatch ? { name: asMatch[1], alias: asMatch[2] } : { name: bit, alias: bit });
      }
    } else if (m[4]) spec.push({ name: 'default', alias: m[4] });
    else if (m[1]) spec.push({ name: 'default', alias: m[1] });
    imports.push({ spec, source: m[5] });
  }
  return imports;
}

const seen = new Map();
const order = [];
const toplevelNames = new Map(); // name -> module (collision guard)

function loadModule(rel) {
  if (seen.has(rel)) return;
  seen.set(rel, true);
  let src = read(rel);
  const imports = parseImports(src);
  /* strip every import statement */
  src = src.replace(/^\s*import\s+(?:[\s\S]*?)from\s*['"][^'"]+['"]\s*;?\s*$/gm, '');
  src = src.replace(/^\s*import\s*['"][^'"]+['"]\s*;?\s*$/gm, '');
  /* apply aliases in the module body (onBus -> on etc.) so scope hoisting is safe */
  for (const im of imports) for (const s of im.spec) {
    if (s.alias !== s.name) src = src.replace(new RegExp(`\\b${s.alias}\\b`, 'g'), s.name);
  }
  /* strip export keywords; drop bare re-export statements */
  src = src.replace(/^\s*export\s+\{/gm, '__BARE_EXPORT__{');
  src = src.replace(/(^|\n)\s*export\s+/g, '$1');
  src = src.replace(/__BARE_EXPORT__\{[^}]*\};?\s*/g, '');
  const mod = { rel, src, imports };
  for (const im of imports) loadModule(join(dirname(rel), im.source).replace(/\\/g, '/'));
  order.push(mod);

  /* collect top-level names for collision detection */
  /* module-level only: declarations at column 0 */
  const names = [...src.matchAll(/^(?:async )?(?:function ([\w$]+)|const ([\w$]+)|let ([\w$]+)|class ([\w$]+))/gm)]
    .map(mm => mm[1] || mm[2] || mm[3] || mm[4]).filter(n => n);
  for (const n of names) {
    if (toplevelNames.has(n)) throw new Error(`top-level name "${n}" declared in both ${toplevelNames.get(n)} and ${rel}`);
    toplevelNames.set(n, rel);
  }
}

loadModule('js/main.js');
/* the served version is a deferred module; this classic inline script runs in
   <head>, so everything waits for DOMContentLoaded (parity with module timing) */
const bundleSrc = order.map(m => `/* ── ${m.rel} ── */\n${m.src}`).join('\n')
  .replace(/\nboot\(\);\s*$/, '\n');
const bundle = 'document.addEventListener(\'DOMContentLoaded\', function () {\n'
  + bundleSrc + '\nboot();\n});\n';

/* ---------- assemble the single file ---------- */
let html = read('index.html');

/* inline stylesheets (paper-grain via data URI so the file works from file://) */
const grainUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(read('assets/paper-grain.svg').trim());
html = html.replace(/<link rel="stylesheet" href="css\/([^"]+)"\s*\/>/g, (_, f) =>
  `<style>\n${css(read('css/' + f).replace(/\.\.\/assets\/paper-grain\.svg/g, grainUri))}\n</style>`);

/* inline the module entry as one classic script */
html = html.replace(/<script type="module" src="js\/main\.js"><\/script>/, `<script>\n${js(bundle)}\n</script>`);

/* strip HTML comments except the doctype banner and trim blank runs */
html = html.replace(/<!--(?!\s*kaspa-block)[\s\S]*?-->/g, '');
html = html.replace(/\n{3,}/g, '\n\n');

writeFileSync(join(DIST, 'kaspa-block.html'), html);
const bytes = Buffer.byteLength(html);
console.log(`dist/kaspa-block.html written: ${(bytes / 1024).toFixed(1)} KB (${(bytes / 1024 / 1024).toFixed(3)} MB), ${order.length} modules inlined, ${(html.match(/<style>/g) || []).length} style blocks`);
