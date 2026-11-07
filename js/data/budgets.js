/* data/budgets.js — the post-Toccata consensus numbers, one source of truth.
   Every value verified against rusty-kaspa master (checked 2026-11; exact
   checked against rusty-kaspa). PROOF_MASS_GRAMS is NOT consensus: it is
   B's statechart model (kaspa.mmd) — ordinary traffic holds 200,000 g, each ZK
   proof adds 200,000 g, so at most four fit the 1,000,000 g cap; the verified
   machine (27 states / 46 steps / 4 rules) is computed with it. */

export const CAP = { compute: 500000, transient: 1000000, storage: 500000 };

export const TRANSIENT_GRAMS_PER_BYTE = 4;              // 4 g per serialized byte
export const BODY_CAP_BYTES = CAP.transient / TRANSIENT_GRAMS_PER_BYTE; // 250,000 B
export const SCRIPT_UNITS_PER_GRAM = 100;               // mass/units.rs
export const MIN_FEE_SOMPI_PER_GRAM = 100;              // toccata-guide.md

export const PROOF_MASS_GRAMS = 200000;                 // B's machine model (see header)
export const MACHINE_BASE_TRANSIENT = 200000;           // ordinary tx mass in the machine
export const MAX_PROOFS = 4;                            // 1,000,000 / 200,000 exactly

export const GHOSTDAG_K = 124;
export const MERGESET_CAP = 2 * GHOSTDAG_K;             // 248
export const MAX_DIRECT_PARENTS = 16;                  // bps.rs caps k/2 at 16
export const MAX_UNCOMPRESSED_PARENTS = 255 * 2048;
export const PRUNING_BLUE_SCORE = 1080000;
export const MERGE_DEPTH = 36000;
export const FINALITY_DEPTH = 432000;

export const LANES_PER_BLOCK = 50;
export const GAS_PER_LANE = 1_000_000_000;

export const TOCCATA_BLOCK_VERSION = 2;                // pre-Toccata: 1
export const TX_VERSION_TOCCATA = 1;                   // pre-Toccata: 0
export const TOCCATA_DAA = 474165565;

/** Era-aware transient cap (A's era flip mutates CAP.transient; kept as a function too). */
export function transientCapFor(era) { return era === 1 ? 500000 : 1000000; }
