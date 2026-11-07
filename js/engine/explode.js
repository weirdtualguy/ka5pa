/* engine/explode.js — B's five trays mapped onto A's six assemblies so nothing is
   lost (merge rule 3):
     header        → 06 (kHeavyHash crown)
     three roots   → 05 + 04 (commitment cylinders + KIP-21 turret)
     body          → 02 (Tx V1 & covenant carriage)
     one tx        → 02 opened (A's in-stage "Open tx" anatomy)
     floor         → 01 + 03 (DAG intake baseplate + mass gauge base)
   Station selection (00–06) highlights the matching tray; the guided flow walks
   trays in Kaspa order. */

export const TRAYS = [
  { n: 1, key: 'header',    title: '1 · THE HEADER',        note: 'v2 · the seal is the hash',        stations: [6] },
  { n: 2, key: 'roots',     title: '2 · THREE ROOTS',       note: 'merkle · SeqCommit · MuHash',      stations: [5, 4] },
  { n: 3, key: 'body',      title: '3 · THE BODY',          note: 'tx v1 · one coinbase',            stations: [2] },
  { n: 4, key: 'tx',        title: '4 · ONE TRANSACTION',   note: 'inputs spend · outputs bind',     stations: [2] },
  { n: 5, key: 'floor',     title: '5 · THE FLOOR',          note: 'blue & red · ≤ 248 = 2k',         stations: [1, 3] }
];

/** Tray (1–5) for a station id (0–6). Station 0 = whole block → null (all trays). */
export function trayOfStation(station, txOpen = false) {
  if (txOpen) return 4;                       // the opened transaction wins
  for (const t of TRAYS) if (t.stations.includes(station)) return t.n;
  return null;
}

/** Which trays light up for a station id: station 0 → all, else the matching tray. */
export function litTrays(station, txOpen = false) {
  if (txOpen) return [4];
  if (!station) return [1, 2, 3, 5];
  const n = trayOfStation(station);
  return n ? [n] : [];
}

/* A's explode Z factors per assembly (units along the model Z axis, × explode.at):
   the trays separate downward; at 0 they are pressed together (B's SHIFT). */
export const EXPLODE_Z = {
  base: -16,        // baseplate drops 16
  manifold: 8,
  rails: 22,
  gauge: 18,
  turret: 46,
  cylinders: 38,
  crown: 78,
  press: -18        // the press stroke compacts the crown when stamping
};

/** B's subtitle lines, shown under the figure caption. */
export const FIGURE_SUBTITLE = 'Block v2 · Tx v1 · GHOSTDAG k = 124 · 10 blocks/s.';
export const FIGURE_PEEL = 'Peel it: header, roots, body, one tx, the floor.';
