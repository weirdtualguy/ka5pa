# kaspa-block

Interactive anatomy of a Kaspa block (Block v2, Tx v1): live mainnet data, a to-scale wire-byte map, DAG walks, transaction dissection and a guided peel of the block. Plain HTML, CSS and ES modules. No dependencies, no build step needed to run.

## Search

Paste a block hash or transaction ID into the search bar (or a link that contains one). A block is pinned in the figure; a transaction opens in its block, in the transaction view. Searches are linkable: `index.html#<hash>`.

## Run

```sh
node scripts/serve.mjs     # http://localhost:4173/
```

Any static server works, including a sub-path such as `https://user.github.io/kaspa-block/`. To open from `file://`, use the single-file build:

```sh
node scripts/build.mjs     # writes dist/kaspa-block.html
```

## Test

```sh
npm test                   # state machine + byte map
node scripts/verify.mjs    # headless browser checks (needs Chromium; set CHROME_PATH)
```

## Deploy to GitHub Pages

Push the repo, then Settings → Pages → deploy from the branch root. Nothing to build.

## Controls

- Arrow keys: station. **E** peel apart. **M** / Space stamp a block. **S** slow. **+ / − / 0** zoom. **T** era. **N** nerd mode. **D** bytes/DNA. **P** share card. **Esc** back.
- Touch: drag to orbit, pinch to zoom, tap a part or a neighbouring block.

## Adding a theme

1. Add a `[data-theme="name"]` block in `css/tokens.css` (the `--anatomy-*` variables, panel colours and `--bs-*` strip colours) and add the name to the remap selector list at the bottom of that file.
2. Add a `data-set-theme="name"` button in `index.html` and its colour to `THEME_COLORS` in `js/ui/controls.js`.
3. Optional overrides go in `css/themes.css`.

## Layout

```
index.html        shell
css/              tokens, base, components, themes
js/data/          API client, sample block, byte map, mass budgets
js/engine/        projection, scene, camera, render loop
js/ui/            controls, callouts, bytes/DNA, DAG + search, share card
js/guided/        verified state machine and its UI
scripts/          serve, build, verify
tests/            node:test suites
```

See [CREDITS.md](CREDITS.md).
