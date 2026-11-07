/* engine/scene.js — A's six mechanical assemblies, geometry unchanged (rule 1).
   buildScene() is pure: camera P + state + metrics → sorted items/wires and tray
   anchors. DOM application lives in render.js. */
import {
  makeCamera, iso, depthOf, roundedRectPlan, slabOf, cylinderOf, splitCoilSpring, pipeRoute
} from './iso.js';
import { EXPLODE_Z } from './explode.js';

export function buildScene(P, state, m) {
  const exp = state.explode.at;
  const press = state.pressStroke.at;
  const st = state.station;

  const items = [], wires = [];
  let solidCount = 0;
  const stationCounts = {};
  let ZV = { e: 0, p: 0, x: 0 };
  const setZ = (e, p, x) => { ZV = { e: e || 0, p: p || 0, x: x || 0 }; };

  const addSolid = (obj) => {
    if (state.era === 1 && obj.station === 4) return;
    solidCount++;
    stationCounts[obj.station | 0] = (stationCounts[obj.station | 0] || 0) + 1;
    obj.zv = obj.zv || ZV;
    obj.dzv = obj.dzv || obj.zv;
    items.push(obj);
  };
  const addWire = (w) => {
    if (state.era === 1 && w.station === 4) return;
    w.zv = w.zv || ZV;
    wires.push(w);
  };

  const isLit = (stationId) => st === stationId;
  const stationTone = (stationId, defaultTone = 'mid') => {
    if (st === 0) return stationId === 4 || stationId === 6 ? 'hi' : defaultTone;
    return st === stationId ? 'hi' : 'lo';
  };

  /* ASSEMBLY 01: BASEPLATE & GHOSTDAG PARENT MANIFOLD */
  setZ(-16, 0, 0);
  const zBase = -18 - exp * 16;

  const footCoords = [[-195, -102], [195, -102], [195, 102], [-195, 102]];
  for (let i = 0; i < 4; i++) {
    const fx = footCoords[i][0], fy = footCoords[i][1];
    addSolid(cylinderOf(fx, fy, 11, zBase - 14, 6, P, { tone: 'lo', station: 1 }));
    addSolid(cylinderOf(fx, fy, 8.5, zBase - 8, 8, P, { tone: 'lo', station: 1 }));
  }

  const groovePlan = roundedRectPlan(0, 0, 412, 218, 8, 3);
  addSolid(slabOf(0, 0, 430, 236, zBase, 18, P, { r: 10, tone: 'lo', insetGroove: groovePlan, station: 1 }));

  const screwCoords = [[-198, -104], [198, -104], [198, 104], [-198, 104]];
  for (let i = 0; i < 4; i++) {
    addSolid(cylinderOf(screwCoords[i][0], screwCoords[i][1], 4.2, zBase + 18, 1.8, P, { tone: 'lo', station: 1 }));
  }

  addSolid(slabOf(-15, 103, 310, 14, zBase + 18, 3, P, { r: 2, tone: stationTone(3, 'mid'), lit: isLit(3), station: 3 }));
  let tickMarks = '';
  for (let i = 0; i <= 35; i++) {
    const tx = -155 + i * 8.8;
    const isMajor = i % 5 === 0;
    const p0 = iso([tx, 110, zBase + 21], P);
    const p1 = iso([tx, isMajor ? 101 : 105, zBase + 21], P);
    tickMarks += 'M' + p0[0] + ',' + p0[1] + 'L' + p1[0] + ',' + p1[1];
  }
  addWire({ depth: depthOf([-15, 106, zBase + 22], P), svg: `<path class="iso-stroke-mid" d="${tickMarks}"/>` });

  addSolid(slabOf(168, 102, 54, 15, zBase + 18, 2.2, P, { r: 1.5, tone: 'mid', station: 1 }));
  const lp1 = iso([148, 99, zBase + 20.4], P), lp2 = iso([188, 99, zBase + 20.4], P);
  const lp3 = iso([148, 103, zBase + 20.4], P), lp4 = iso([184, 103, zBase + 20.4], P);
  const lp5 = iso([148, 107, zBase + 20.4], P), lp6 = iso([178, 107, zBase + 20.4], P);
  addWire({
    depth: depthOf([168, 103, zBase + 21], P),
    svg: `<path class="iso-stroke-mid" d="M${lp1[0]},${lp1[1]}L${lp2[0]},${lp2[1]}M${lp3[0]},${lp3[1]}L${lp4[0]},${lp4[1]}M${lp5[0]},${lp5[1]}L${lp6[0]},${lp6[1]}"/>`
  });

  setZ(-8, 0, 0);
  const zManifold = zBase + 18 + exp * 8;
  addSolid(slabOf(-164, -36, 62, 118, zManifold, 24, P, { r: 5, tone: stationTone(1, 'mid'), lit: isLit(1), station: 1 }));
  addSolid(cylinderOf(-164, -64, 16, zManifold + 24, 18, P, { tone: stationTone(1, 'hi'), lit: isLit(1), boreRadius: 8, knurl: true, station: 1 }));
  const pn = state.parentN || 3;
  const pr = pn <= 3 ? 9.5 : Math.max(3.2, 26 / (pn - 1) - 1.2);
  for (let i = 0; i < pn; i++) {
    const py = pn === 1 ? -4 : -30 + i * (52 / (pn - 1));
    addSolid(cylinderOf(-164, py, pr, zManifold + 24, 12 + (pn - 1 - i) * 3, P, {
      tone: stationTone(1, 'mid'), lit: isLit(1), boreRadius: pr * 0.47, station: 1, segs: pn > 5 ? 10 : undefined
    }));
  }
  addSolid(slabOf(-164, 62, 46, 42, zManifold, 16, P, { r: 4, tone: stationTone(1, 'mid'), lit: isLit(1), station: 1 }));
  addSolid(cylinderOf(-164, 62, 11, zManifold + 16, 26, P, { tone: stationTone(1, 'hi'), lit: isLit(1), knurl: true, boreRadius: 5, station: 1 }));

  /* ASSEMBLY 02: TRANSACTION V1 & COVENANT CARRIAGE */
  setZ(6, 0, 0);
  const zRails = zBase + 18 + exp * 22;
  const slideX = state.carriageSlide.at * 12;

  const railY = [-68, 52];
  for (let i = 0; i < 2; i++) {
    const ry = railY[i];
    addSolid(slabOf(-112, ry, 18, 18, zRails, 14, P, { r: 2, tone: 'lo', station: 2 }));
    addSolid(slabOf(28, ry, 18, 18, zRails, 14, P, { r: 2, tone: 'lo', station: 2 }));
    addSolid(slabOf(-42, ry, 132, 6, zRails + 6, 5, P, { r: 1, tone: 'mid', station: 2 }));
  }

  setZ(6, 0, 12);
  const cxCarriage = -42 + slideX;
  addSolid(slabOf(cxCarriage, -8, 116, 134, zRails + 11, 14, P, { r: 5, tone: stationTone(2, 'mid'), lit: isLit(2), station: 2 }));
  addSolid(slabOf(cxCarriage - 40, -8, 20, 112, zRails + 25, 16, P, { r: 3, tone: stationTone(2, 'hi'), lit: isLit(2), station: 2 }));
  addSolid(cylinderOf(cxCarriage - 40, -38, 6.5, zRails + 41, 11, P, { tone: stationTone(2, 'hi'), lit: isLit(2), knurl: true, station: 2 }));

  const covHeight = 14 + (state.covenantTxs / 120) * 14;
  for (let c = 0; c < 4; c++) {
    const txX = cxCarriage - 14 + c * 21;
    addSolid(slabOf(txX, -36, 16, 46, zRails + 25, covHeight, P, { r: 2.5, tone: stationTone(2, 'mid'), lit: isLit(2), station: 2 }));
    addSolid(cylinderOf(txX, -44, 4.8, zRails + 25 + covHeight, 6 + (c % 2) * 3, P, { tone: stationTone(2, 'hi'), lit: isLit(2), knurl: true, station: 2 }));
    addSolid(slabOf(txX, 22, 16, 48, zRails + 25, covHeight, P, { r: 2.5, tone: stationTone(2, 'hi'), lit: isLit(2), station: 2 }));
    if (c < state.zkProofs) {
      addSolid(cylinderOf(txX, 22, 5.5, zRails + 25 + covHeight, 10, P, { tone: 'hi', lit: isLit(2) || st === 0, boreRadius: 2.4, station: 2 }));
    }
    addWire(pipeRoute([[txX, -18, zRails + 25 + covHeight], [txX, 4, zRails + 25 + covHeight]], P, { lit: isLit(2), station: 2 }));
  }

  /* ASSEMBLY 03: THREE-BUDGET MASS BALANCE GAUGE */
  setZ(2, 0, 0);
  const zGaugeBase = zBase + 18 + exp * 18;
  addSolid(slabOf(-58, 80, 86, 30, zGaugeBase, 12, P, { r: 4, tone: stationTone(3, 'mid'), lit: isLit(3), station: 3 }));

  const hCompute = 8 + (m.computeMass / 1000000) * 34;
  const hTransient = 8 + (m.transientMass / 1000000) * 34;
  const hStorage = 8 + (m.storageMass / 1000000) * 34;

  addSolid(cylinderOf(-82, 80, 7.5, zGaugeBase + 12, hCompute, P, { tone: m.dominantBudget === 'COMPUTE' ? 'hi' : 'mid', lit: isLit(3) && m.dominantBudget === 'COMPUTE', knurl: true, station: 3 }));
  addSolid(cylinderOf(-58, 80, 7.5, zGaugeBase + 12, hTransient, P, { tone: m.dominantBudget === 'TRANSIENT' ? 'hi' : 'mid', lit: isLit(3) && m.dominantBudget === 'TRANSIENT', knurl: true, station: 3 }));
  addSolid(cylinderOf(-34, 80, 7.5, zGaugeBase + 12, hStorage, P, { tone: m.dominantBudget === 'STORAGE' ? 'hi' : 'mid', lit: isLit(3) && m.dominantBudget === 'STORAGE', knurl: true, station: 3 }));
  /* B's glass-tube touch on A's real liquid levels: meniscus + side ticks, bound to the same m */
  {
    let tubeD = '';
    for (const [gx, gh] of [[-82, hCompute], [-58, hTransient], [-34, hStorage]]) {
      const fx = gx + 7.5 * Math.cos(P.azimuth * Math.PI / 180), fy = 80 + 7.5 * Math.sin(P.azimuth * Math.PI / 180);
      for (let k = 0; k <= 4; k++) {
        const t0 = iso([fx, fy, zGaugeBase + 12 + gh * k / 4], P);
        const t1 = iso([fx + (k % 2 ? 2.2 : 3.4), fy, zGaugeBase + 12 + gh * k / 4], P);
        tubeD += 'M' + t0[0] + ',' + t0[1] + 'L' + t1[0] + ',' + t1[1];
      }
    }
    addWire({ depth: depthOf([-58, 80, zGaugeBase + 60], P), svg: `<path class="iso-stroke-mid" d="${tubeD}"/>` });
  }

  addSolid(cylinderOf(18, 80, 9, zGaugeBase, 34, P, { tone: stationTone(3, 'mid'), lit: isLit(3), station: 3 }));
  addSolid(cylinderOf(18, 80, 22, zGaugeBase + 34, 9, P, { tone: stationTone(3, 'hi'), lit: isLit(3), station: 3 }));

  const zDialTop = zGaugeBase + 43.2;
  let dialTicks = '';
  for (let t = 0; t <= 16; t++) {
    const ang = (-0.75 + (t / 16) * 1.5) * Math.PI;
    const rIn = t % 4 === 0 ? 13.5 : 16, rOut = 19.2;
    const p0 = iso([18 + Math.cos(ang) * rIn, 80 + Math.sin(ang) * rIn, zDialTop], P);
    const p1 = iso([18 + Math.cos(ang) * rOut, 80 + Math.sin(ang) * rOut, zDialTop], P);
    dialTicks += 'M' + p0[0] + ',' + p0[1] + 'L' + p1[0] + ',' + p1[1];
  }
  addWire({ depth: depthOf([18, 80, zDialTop + 2], P), svg: `<path class="iso-stroke-mid" d="${dialTicks}"/>` });

  /* ASSEMBLY 04: KIP-21 PARTITIONED SEQUENCING TURRET */
  setZ(30, 0, 0);
  const zTurret = zBase + 18 + exp * 46;
  const cxTurret = 108, cyTurret = -4;

  addSolid(slabOf(cxTurret, cyTurret, 92, 92, zTurret, 14, P, { r: 8, tone: stationTone(4, 'mid'), lit: isLit(4), station: 4 }));
  addSolid(cylinderOf(cxTurret, cyTurret, 36, zTurret + 14, 18, P, { tone: stationTone(4, 'hi'), lit: isLit(4), knurl: true, station: 4 }));
  addSolid(cylinderOf(cxTurret, cyTurret, 22, zTurret + 32, 14, P, { tone: stationTone(4, 'hi'), lit: isLit(4), boreRadius: 9, station: 4 }));

  const activePins = Math.max(1, Math.min(12, Math.ceil((state.activeLanes / 50) * 12)));
  for (let p = 0; p < 12; p++) {
    const ang = state.turretStepAngle + (p / 12) * Math.PI * 2;
    const px = cxTurret + Math.cos(ang) * 29, py = cyTurret + Math.sin(ang) * 29;
    const isActiveLane = p < activePins;
    const pinH = isActiveLane ? 11 + (p % 3) * 2.5 : 3.5;
    addSolid(cylinderOf(px, py, 3.4, zTurret + 32, pinH, P, {
      tone: isActiveLane ? 'hi' : 'lo', lit: isLit(4) && isActiveLane, station: 4, segs: 10
    }));
  }

  addSolid(slabOf(cxTurret + 56, cyTurret + 26, 26, 36, zTurret, 24, P, { r: 3, tone: stationTone(4, 'mid'), lit: isLit(4), station: 4 }));
  addSolid(cylinderOf(cxTurret + 56, cyTurret + 26, 6.5, zTurret + 24, 10, P, { tone: stationTone(4, 'hi'), lit: isLit(4), knurl: true, station: 4 }));
  addSolid(slabOf(cxTurret + 56, cyTurret - 26, 26, 38, zTurret, 28, P, { r: 3, tone: stationTone(4, 'mid'), lit: isLit(4), station: 4 }));
  addSolid(cylinderOf(cxTurret + 56, cyTurret - 26, 7, zTurret + 28, 12, P, { tone: stationTone(4, 'hi'), lit: isLit(4), boreRadius: 3, station: 4 }));

  /* ASSEMBLY 05: CRYPTOGRAPHIC COMMITMENT CYLINDERS */
  setZ(22, 0, 0);
  const zCyl = zBase + 18 + exp * 38;
  addSolid(slabOf(28, -74, 44, 44, zCyl, 12, P, { r: 5, tone: stationTone(5, 'mid'), lit: isLit(5), station: 5 }));
  addSolid(cylinderOf(28, -74, 16, zCyl + 12, 34, P, { tone: stationTone(5, 'hi'), lit: isLit(5), knurl: true, boreRadius: 6, station: 5 }));
  addSolid(slabOf(108, -78, 44, 44, zCyl, 12, P, { r: 5, tone: stationTone(5, 'mid'), lit: isLit(5), station: 5 }));
  addSolid(cylinderOf(108, -78, 16, zCyl + 12, 34, P, { tone: stationTone(5, 'hi'), lit: isLit(5), knurl: true, boreRadius: 6, station: 5 }));

  /* ASSEMBLY 06: BLOCK HEADER V2 CROWN & kHEAVYHASH POW FLYWHEEL */
  const zCrown = 84 + exp * 78 - press * 18;

  const pillarCoords = [[-96, -84], [156, -84], [156, 52], [-96, 52]];
  for (let i = 0; i < 4; i++) {
    const px = pillarCoords[i][0], py = pillarCoords[i][1];
    setZ(-16, 0, 0);
    addSolid(cylinderOf(px, py, 6.5, zBase + 18, 10, P, { tone: 'lo', station: 6, segs: 10 }));
    addSolid(Object.assign(cylinderOf(px, py, 3.2, zBase + 28, zCrown - (zBase + 18), P, { tone: 'mid', station: 6, segs: 10 }), {
      zv: { e: 0, p: 0, x: 0 },
      dzv: { e: 31, p: -9 },
      regen: () => cylinderOf(px, py, 3.2, 10 - 16 * state.explode.at, 74 + 94 * state.explode.at - 18 * state.pressStroke.at, makeCamera(state.azimuth, 30, 495, 318, 1.38), { tone: 'mid', station: 6, segs: 10 }).svg
    }));
    setZ(78, -18, 0);
    const springHalves = splitCoilSpring(px, py, 6.2, zCrown - 32, zCrown, 5, P, { lit: isLit(6), station: 6 });
    addSolid(springHalves[0]);
    addSolid(springHalves[1]);
  }

  const crownGroove = roundedRectPlan(30, -16, 254, 134, 7, 3);
  addSolid(slabOf(30, -16, 272, 152, zCrown, 18, P, { r: 9, tone: stationTone(6, 'hi'), lit: isLit(6), insetGroove: crownGroove, station: 6 }));
  addSolid(cylinderOf(-42, -16, 14, zCrown + 18, 9, P, { tone: stationTone(6, 'mid'), lit: isLit(6), boreRadius: 6, station: 6 }));
  addSolid(cylinderOf(108, -4, 18, zCrown + 18, 11, P, { tone: stationTone(6, 'hi'), lit: isLit(6), boreRadius: 7, station: 6 }));
  addSolid(cylinderOf(108, -52, 13, zCrown + 18, 9, P, { tone: stationTone(6, 'mid'), lit: isLit(6), boreRadius: 5, station: 6 }));
  addSolid(cylinderOf(26, -16, 38, zCrown + 18, 12, P, { tone: stationTone(6, 'hi'), lit: isLit(6), knurl: true, station: 6 }));
  addSolid(cylinderOf(26, -16, 19, zCrown + 30, 14, P, { tone: stationTone(6, 'hi'), lit: isLit(6), boreRadius: 7, knurl: true, station: 6 }));

  /* RESOLVED PIPES & CONDUITS */
  addWire(Object.assign(pipeRoute([[-148, -64, zManifold + 32], [-75, -88, zManifold + 32], [108, -42, zTurret + 22]], P, { thick: true, lit: isLit(1) || isLit(4), station: 4 }), {
    zv: { e: 0, p: 0, x: 0 },
    regen: () => pipeRoute([[-148, -64, -8 * state.explode.at + 32], [-75, -88, -8 * state.explode.at + 32], [108, -42, 30 * state.explode.at + 22]], makeCamera(state.azimuth, 30, 495, 318, 1.38), { thick: true, lit: isLit(1) || isLit(4), station: 4 }).svg
  }));
  addWire(Object.assign(pipeRoute([[cxCarriage + 18, -42, zRails + 34], [28, -58, zCyl + 26]], P, { thick: true, lit: isLit(2) || isLit(5), station: 5 }), {
    zv: { e: 0, p: 0, x: 0 },
    regen: () => pipeRoute([[-24 + 12 * state.carriageSlide.at, -42, 6 * state.explode.at + 34], [28, -58, 22 * state.explode.at + 26]], makeCamera(state.azimuth, 30, 495, 318, 1.38), { thick: true, lit: isLit(2) || isLit(5), station: 5 }).svg
  }));
  addWire(Object.assign(pipeRoute([[cxCarriage + 56, -8, zRails + 30], [cxTurret - 34, cyTurret, zTurret + 22]], P, { thick: true, lit: isLit(2) || isLit(4), station: 4 }), {
    zv: { e: 0, p: 0, x: 0 },
    regen: () => pipeRoute([[14 + 12 * state.carriageSlide.at, -8, 6 * state.explode.at + 30], [74, -4, 30 * state.explode.at + 22]], makeCamera(state.azimuth, 30, 495, 318, 1.38), { thick: true, lit: isLit(2) || isLit(4), station: 4 }).svg
  }));
  addWire(Object.assign(pipeRoute([[28, -74, zCyl + 46], [28, -74, zCrown]], P, { thick: true, lit: isLit(5) || isLit(6), station: 5 }), {
    zv: { e: 0, p: 0, x: 0 },
    regen: () => pipeRoute([[28, -74, 22 * state.explode.at + 46], [28, -74, 84 + 78 * state.explode.at - 18 * state.pressStroke.at]], makeCamera(state.azimuth, 30, 495, 318, 1.38), { thick: true, lit: isLit(5) || isLit(6), station: 5 }).svg
  }));
  addWire(Object.assign(pipeRoute([[108, -78, zCyl + 46], [108, -78, zCrown]], P, { thick: true, lit: isLit(5) || isLit(6), station: 5 }), {
    zv: { e: 0, p: 0, x: 0 },
    regen: () => pipeRoute([[108, -78, 22 * state.explode.at + 46], [108, -78, 84 + 78 * state.explode.at - 18 * state.pressStroke.at]], makeCamera(state.azimuth, 30, 495, 318, 1.38), { thick: true, lit: isLit(5) || isLit(6), station: 5 }).svg
  }));
  addWire(Object.assign(pipeRoute([[cxTurret, cyTurret, zTurret + 46], [cxTurret, cyTurret, zCrown]], P, { thick: true, lit: isLit(4) || isLit(6), station: 4 }), {
    zv: { e: 0, p: 0, x: 0 },
    regen: () => pipeRoute([[108, -4, 30 * state.explode.at + 46], [108, -4, 84 + 78 * state.explode.at - 18 * state.pressStroke.at]], makeCamera(state.azimuth, 30, 495, 318, 1.38), { thick: true, lit: isLit(4) || isLit(6), station: 4 }).svg
  }));

  items.sort((a, b) => a.depth - b.depth);
  wires.sort((a, b) => a.depth - b.depth);

  /* Tray anchors (3-D) for B's numbered callouts: leader lines land on these. */
  const anchors = {
    header: [30, -16, zCrown + 27],
    roots: [108, -78, zCyl + 34],
    turret: [108, -4, zTurret + 30],
    body: [-42 + slideX, -8, zRails + 32],
    floor: [0, 0, zBase + 8],
    manifold: [-164, -36, zManifold + 30],
    gauge: [18, 80, zGaugeBase + 43]
  };

  return { items, wires, anchors, solidCount, stationCounts };
}
