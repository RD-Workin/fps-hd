// Headless navigation test (not imported by the game). Run: node src/bots/navtest.mjs
import { NavGrid } from './nav.js';

const B = (x, z, w, d, h = 3, y0 = 0) => ({ box: { min: { x: x - w / 2, y: y0, z: z - d / 2 }, max: { x: x + w / 2, y: y0 + h, z: z + d / 2 } } });
const colliders = [
  B(0, -45, 100, 1), B(0, 45, 100, 1), B(-50, 0, 1, 90), B(50, 0, 1, 90), // outer walls
  B(0, 0, 8, 8), B(-20, -10, 4, 4, 1.2),
  B(-15, 10, 30, 1), B(20, 10, 30, 1),          // long wall with gap at x ~ 1..5
  B(30, -20, 1.2, 1.2, 0.3),                    // low step (walkable)
  B(0, 25, 4, 4, 2, 2.5),                       // overhead (not blocking)
  B(-30, -25, 20, 1), B(-40, -20, 1, 10),        // L corner
];
const bounds = { minX: -50, maxX: 50, minZ: -45, maxZ: 45 };
let t0 = performance.now();
const nav = new NavGrid(colliders, bounds, { cell: 0.5, radius: 0.4 });
console.log(`grid ${nav.w}x${nav.h} built in ${(performance.now() - t0).toFixed(1)} ms, walkable=${nav.walkableCount}`);

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) fails++; };

check('wall blocked', !nav.isWalkable(-15, 10));
check('step walkable', nav.isWalkable(30, -20));
check('overhead not blocking', nav.isWalkable(0, 25));
check('inside crate blocked', !nav.isWalkable(0, 0));
check('inflated edge blocked', !nav.isWalkable(4.2, 0));

// path from south spawn to site A through the gap
t0 = performance.now();
const p = nav.findPath(-10, 38, -30, -20);
const dt = performance.now() - t0;
check(`path found (${dt.toFixed(2)} ms, ${p?.length} pts)`, !!p);
// verify every segment is walkable
let prev = { x: -10, z: 38 }, segOk = true, len = 0;
for (const q of p) { if (!nav.los(prev.x, prev.z, q.x, q.z)) segOk = false; len += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q; }
check('all smoothed segments walkable', segOk);
check(`path length reasonable (${len.toFixed(1)})`, len < 80 && len > 58);
check('ends at goal', Math.hypot(prev.x + 30, prev.z + 20) < 0.01);
console.log(p.map(q => `(${q.x.toFixed(1)},${q.z.toFixed(1)})`).join(' '));

// goal inside an obstacle -> nearest walkable
const p2 = nav.findPath(10, 30, 0, 0);
check('goal in obstacle -> nearest', !!p2 && !nav.blocked[nav.index(p2.at(-1).x, p2.at(-1).z)]);

// benchmark
t0 = performance.now();
let n = 0;
for (let k = 0; k < 200; k++) { const r = nav.findPath(-45 + Math.random() * 90, -40 + Math.random() * 80, -45 + Math.random() * 90, -40 + Math.random() * 80); if (r) n++; }
console.log(`200 random paths: ${(performance.now() - t0).toFixed(1)} ms total, ${n} found`);

// ascii map
const rows = [];
for (let z = 0; z < nav.h; z += 2) { let s = ''; for (let x = 0; x < nav.w; x += 2) s += nav.blocked[z * nav.w + x] ? '#' : '.'; rows.push(s); }
if (process.argv.includes('--map')) console.log(rows.join('\n'));
process.exit(fails ? 1 : 0);
