// Set dressing of the grand map's new districts (grand.js): Vieille-Ville (west) and Gare de triage (east).
// Same rules as zones.js: each site has a default plant spot behind hard cover, every entrance has a defender angle and
// an attacker foothold, long lines are broken (here mostly by parked freight trains with gaps between the wagons).
import * as THREE from 'three';
import { DECAL } from './textures.js';

export function dressGrand(K) {
  const { G, F, col, mat4, r, solid, lift, wire, laundry, wallDecal, fountain, vine, lantern, container,
    Crate, Stack, Barrel, Sandbags, Jersey, LowWall, Container, Car, Truck, Stall, Palm, Lamp, GDecal,
    Cypress, Bush, Planter, Pot, Tree, Bench, CafeTable, Bollard, Dumpster, Pallets, Tyres, Cart, Kiosk, Well, Statue, Flag,
    Boat, NetPile, Rack, Counter, Pillar, Floor, Rug, Shelf } = K;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), R = Math.PI / 2;
  const BLUE = 0x3f6b8c, RUST = 0x9a4a2a, OCHRE = 0xc9852f, GREEN = 0x3d7a4a, RED = 0xa2412f, GREY = 0x6d6f70;

  // ============================================================================ VIEILLE-VILLE
  // --- Port de pêche (0): boats, nets, crates; ATK insertion x[-160,-141] z[49,52] kept clear
  Floor(-174, -80, 44, 56, 'concrete', 0xddd5c6);
  for (let x = -170; x <= -84; x += 8) if (x < -162 || x > -138) Bollard(x, 55.5);
  for (const x of [-168, -132, -96]) Lamp(x, 45, 0);
  Boat(-170, 50, 0.2, 0xe8e2d2); Boat(-126, 47.5, 0, 0x2f6f9a); Boat(-100, 51, -0.1, 0xb04a3a); NetPile(-121, 50); NetPile(-104, 46.2, 0.8);
  Stack(-134, 46, 2); Crate(-132.8, 46); Crate(-133.4, 47.2, 1.0); Barrel(-118, 53.5, BLUE); Barrel(-117.3, 54.2, RUST); Pallets(-92, 47, 3);
  Container(-90, 49, false, RED); Container(-112, 44.6, true, OCHRE);
  for (const [x, c, ry] of [[-170, 0x2f6f9a, 0.1], [-150, 0xe8e2d2, -0.2], [-130, 0x3d7a4a, 0.15], [-110, 0xb04a3a, -0.1], [-92, 0xd9a230, 0.2]]) Boat(x, 60.5, ry, c, -0.75, false);
  // Remise des pêcheurs (room 0): racks, boat on trestles inside, door to the lane, gate on the quay
  Floor(-160, -146, 36, 44, 'wood', 0xb8a27e); Rack(-159.6, 36.6, -157.6, 39.6, 2.4); NetPile(-150, 38.5); Crate(-147.4, 42.6); Crate(-148.6, 42.6, 1.0); Barrel(-158.6, 42.8, BLUE);
  Counter(-155, 40, -151, 41);
  // Saurisserie (room 0): counters and crates
  Floor(-130, -118, 36, 44, 'tile', 0xcfd6d2); Counter(-128.5, 38.2, -124, 39.2, 1.0, 0x8a9aa0); Counter(-123, 41.2, -119.5, 42.2); Stack(-119.2, 37.4, 2, 1.0);
  // lanes up from the harbour: steps, laundry, pots
  for (const z of [31, 39]) laundry(V(-170, 4.6, z), V(-168, 4.8, z + 0.4));
  for (const z of [32, 40]) laundry(V(-140, 4.8, z), V(-136, 4.9, z + 0.3));
  Pot(-169.4, 33); Pot(-136.6, 31.4, 1.2); Pot(-113.4, 32.6); Crate(-111, 42.6, 1.0); Barrel(-99, 42.8, OCHRE); Dumpster(-97.8, 37.6, false);
  vine('z', 1, -140, 30, 34, 0.3, 4.4); vine('x', -1, 34, -160, -154, 0.4, 3.6, 0xe07a2a);

  // --- Rue du Marché (+1.5) and Place du Marché = SITE D (-136, 10), r 7
  Floor(-150, -122, 2, 18, 'stone', 0xd9ccb3);
  fountain(-136, 10);                                                         // centre: low hard cover, plant behind it
  Stall(-149, 4, 1, 0); Stall(-149, 7.2, 1, 1); Stall(-123, 15.6, -1, 2);      // stalls on the west / east walls
  Cart(-142.5, 15.2, 0); Cart(-129, 4.4, R); Crate(-141, 4.2); Crate(-141, 5.4, 1.0); Stack(-127.4, 16.6, 2, 1.0);
  Kiosk(-146, 15.6, 0x7a3a2a);                                               // NW corner: full cover facing the Tanneurs stairs
  LowWall(-133.2, 3.0, -130.6, 3.6, 1.1);                                    // defender angle on the north stairs
  Sandbags(-139.6, 17.0, -136.4, 17.0, 1.05);                                // foothold at the south entry
  GDecal(DECAL.D, -136, 13.8, 3.4, 3.4, 0); GDecal(DECAL.HAZARD, -136, 6.2, 5, 1.2, 0);
  wallDecal(DECAL.D, 'x', -1, -150, 10, 4.6, 2.2, 2.2); wallDecal(DECAL.S_MARCHE, 'z', 1, 2, -136, 5.0, 4, 1);
  for (const x of [-148, -124]) Lamp(x, 17.4, 0);
  for (const z of [4.5, 15.5]) wire(V(-150, 6.2, z), V(-122, 6.4, z + 1.2), 0.8);
  // Café du Marché (+1.5 room): tables, counter
  Floor(-122, -114, 4, 14, 'wood', 0xa8855e); Counter(-116.4, 5, -115.4, 9.6, 1.05); CafeTable(-120, 6.6); CafeTable(-119.6, 11.4); CafeTable(-117.6, 12.6);
  Shelf('z', -1, -114, 5, 9.4, 2.2);
  // Atelier du Tisserand (+1.5 room): looms = racks, cloth bales
  Floor(-168, -150, 6, 14, 'wood', 0xb39a76); Rack(-166, 7, -161, 8.2, 2.0); Rack(-158, 11.6, -153, 12.8, 2.0); Stack(-152.6, 7.2, 2, 1.0); Crate(-163, 12.6, 1.0);
  Rug(-160, -156, 8.6, 10.8, 2);
  // Rue du Marché: café terraces, carts, stairs to the harbour
  CafeTable(-104, 21, 0); CafeTable(-101, 22.8, 1); Cart(-158, 22.6, 0); Crate(-126, 20.6); Barrel(-87, 20.8, BLUE); Pot(-172.6, 23.2, 1.2); Pot(-82.6, 20.6);
  for (const x of [-160, -120, -84]) Lamp(x, 20.4, 0);
  laundry(V(-112, 6.6, 20), V(-112, 6.6, 24)); laundry(V(-150, 6.4, 20), V(-148, 6.6, 24));
  Bench(-111, 9.5, R); Pot(-95.4, 13.4, 1.2); Barrel(-109.6, 11.4, RUST);

  // --- Haute-Ville (+3): Placette du Puits, Maison du Notable, Rue Haute, Rue de l'Église
  Floor(-136, -118, -36, -22, 'stone', 0xd8cbb2);
  Well(-127, -29); Tree(-121, -25, 6, 2.6); Bench(-133, -33.5, 0); Pot(-135.4, -22.6, 1.2); Pot(-118.6, -35.4);
  Cart(-131.5, -24.2, R); Crate(-121.6, -34.4); Crate(-122.8, -34.4, 1.0);
  Floor(-110, -96, -36, -24, 'wood', 0x9c7b56); Rug(-106, -100, -33, -27, 1);   // Maison du Notable
  Counter(-108.6, -34.6, -104, -33.6, 0.95, 0x7d5a36); Shelf('x', 1, -36, -103, -98, 2.4); Rack(-99.2, -26.6, -97, -24.6, 2.2); CafeTable(-102.6, -30.4);
  for (const x of [-160, -138, -104, -86]) Lamp(x, -42.4, 0);
  for (const x of [-150, -116, -90]) Lamp(x, -9.6, 0);
  Cart(-156, -44, 0); Barrel(-140.6, -45.4, OCHRE); Crate(-120.6, -45.4); Pot(-131.4, -42.6, 1.2); Pot(-97, -45.4);
  Dumpster(-163, -8, true); Crate(-128.6, -9.6, 1.0); Barrel(-86.6, -9.4, BLUE); Pot(-168.6, -26.6); Pot(-146.6, -26.4, 1.2);
  for (const z of [-50, -36, -20, -14]) laundry(V(-150, 7.2, z), V(-146, 7.4, z + 0.5));
  for (const z of [-50, -18]) laundry(V(-170, 6.8, z), V(-168, 7.0, z + 0.4));
  for (const z of [-38, -22]) laundry(V(-114, 7.0, z), V(-110, 7.2, z + 0.5));
  vine('x', -1, -42, -140, -132, 3.2, 7.4); vine('z', 1, -92, -40, -34, 3.3, 7.6, 0xe07a2a); vine('z', -1, -170, -54, -48, 3.3, 7.2);
  for (const [x, z] of [[-168.6, -56.6], [-148.6, -56.4], [-113, -56.6]]) Pot(x, z);

  // ============================================================================ GARE DE TRIAGE
  // --- quai de fret + cour (0): containers, trucks, pallets. ATK insertion x[134,153] z[49,52] kept clear
  Floor(80, 174, 44, 56, 'concrete', 0xd6d0c4);
  for (let x = 84; x <= 172; x += 8) if (x < 130 || x > 156) Bollard(x, 55.5);
  Container(84, 45.5, true, RED); Container(84, 45.5, true, BLUE, 2.6); Container(92, 49.6, true, GREEN);
  Container(104, 38.6, false, OCHRE); Container(107, 38.6, false, GREY); Container(107, 38.6, false, RED, 2.6);
  Container(122, 46, true, BLUE); Container(160, 45.5, true, GREEN); Container(160, 48.3, true, OCHRE); Container(166.6, 38, false, RED);
  Truck(126, 38.6, 0x5d6b4a); Truck(142, 39, 0x6a5a3a); Pallets(150, 40.6, 3); Stack(97, 42.4, 2); Crate(98.2, 42.4); Barrel(118.6, 42.8, RUST); Tyres(171, 42, 3);
  for (const x of [88, 118, 148, 170]) Lamp(x, 43.6, 0);
  for (const [x, c, ry] of [[96, 0x6d6f70, 0.1], [126, 0x2f6f9a, -0.1], [166, 0xb04a3a, 0.15]]) Boat(x, 60.5, ry, c, -0.75, false);
  // Entrepôts (rooms 0): shelving racks = tall cover, a forklift-sized crate stack
  Floor(86, 104, 24, 36, 'concrete', 0xb9b3a6); Floor(146, 166, 24, 36, 'concrete', 0xb9b3a6);
  Rack(88, 26.4, 96, 27.4); Rack(88, 31, 96, 32); Rack(98.6, 26.4, 99.6, 32.4); Stack(101.6, 33.6, 3); Pallets(92, 34.2, 2);
  Rack(148, 26.4, 156, 27.4); Rack(158, 26.4, 164, 27.4); Rack(149, 31.2, 157, 32.2); Stack(162.6, 32.6, 2); Container(158.4, 29.6, true, GREY);
  // Rue du Triage (0) between the warehouses and the tracks: low cover, the level crossing
  Jersey(100, 21.6, true, 3); Jersey(140, 22.4, true, 3); Dumpster(126.4, 21.4, true); Car(156, 21.8, true, 0x4a5a6a); Barrel(85, 22.6, BLUE);

  // --- faisceau de voies (0) with platforms (+1.5): tracks along x, parked freight trains (gaps = crossings)
  const TRACKS = [17, 6, -6, -17, -22.5];
  for (const zc of TRACKS) track(82, 174, zc);
  // wagons: [x0, track z, kind]. Gaps between wagons (>= 2 m) are the ways across.
  const W = [
    [84, 17, 'cont'], [99, 17, 'hopper'], [123, 17, 'cont'], [139, 17, 'tank'], [155, 17, 'cont'],
    [86, 6, 'flat'], [125, 6, 'cont'], [148, 6, 'hopper'], [163, 6, 'flat'],
    [84, -6, 'hopper'], [97, -6, 'cont'], [127, -6, 'tank'], [152, -6, 'cont'],
    [90, -17, 'cont'], [105, -17, 'cont'], [124, -17, 'hopper'], [138, -17, 'cont'], [158, -17, 'tank'],
    [86, -22.5, 'tank'], [132, -22.5, 'cont'], [150, -22.5, 'flat'],
  ];
  for (const [x0, zc, kind] of W) wagon(x0, zc, kind);
  // platform furniture: canopies over the platforms, benches, lamps, luggage carts; SITE C (140, 0) on the central platform
  for (const [z0, z1] of [[10, 14], [-2, 2], [-14, -10]]) {
    canopy(124, 164, z0, z1); canopy(94, 108, z0, z1);
    for (const x of [100, 130, 158]) Bench(x, (z0 + z1) / 2, 0);
    edgeLine(92, 110, z0, z1); edgeLine(122, 166, z0, z1);
  }
  Kiosk(133, 0, 0x2f5f4a);                                                    // site C west cover
  Cart(146.5, -0.6, 0); Stack(137.2, 0.6, 2, 1.0); Crate(138.4, -0.6, 1.0); Crate(144, 1.1, 0.9);
  LowWall(150.6, -1.3, 151.2, 1.3, 1.1);                                     // east angle
  GDecal(DECAL.C, 140.8, 0, 2.6, 2.6, R); GDecal(DECAL.HAZARD, 126, 0, 3.4, 1.0, R);
  wallDecal(DECAL.C, 'x', 1, -28, 143, 2.4, 2.6, 2.6);                        // on the station's south facade
  Sandbags(118.4, -8, 118.4, -4, 1.05); Sandbags(121.6, 4, 121.6, 8, 1.05);   // level crossing footholds
  Jersey(116, -25.6, true, 3); Jersey(116, 25, true, 3);
  // signal gantries over the yard (decor, out of reach)
  for (const x of [114, 172]) { G.metal.box(x - 0.2, 0, -25.4, x + 0.2, 7.4, -25, col(0x5a5e60)); G.metal.box(x - 0.2, 0, 21, x + 0.2, 7.4, 21.4, col(0x5a5e60));
    G.metal.box(x - 0.25, 7, -25.4, x + 0.25, 7.5, 21.4, col(0x5a5e60)); solid(x - 0.2, 0, -25.4, x + 0.2, 7.4, -25, 'metal'); solid(x - 0.2, 0, 21, x + 0.2, 7.4, 21.4, 'metal'); }
  for (let x = 90; x <= 170; x += 20) { G.metal.box(x - 0.08, 0, -26.6, x + 0.08, 6.8, -26.4, col(0x4b4f52)); } // catenary poles
  wire(V(82, 6.6, -26.5), V(174, 6.6, -26.5), 0.4);

  // --- Hall de la Gare (H, 7 m): pillars, benches, ticket counter, newsstand, departures board
  Floor(120, 166, -40, -28, 'tile', 0xd8d2c4);
  for (const x of [128, 136, 144, 152, 160]) for (const z of [-36.6, -31.4]) Pillar(x, z, 7, 0.7, 'stone');
  Counter(122.6, -38.8, 127.6, -37.8, 1.15, 0x7d5a36); Kiosk(156, -34, 0x7a3a2a);
  for (const x of [132, 140, 148]) { Bench(x, -35.2, 0); Bench(x, -32.8, 0); }
  G.paint.box(138, 4.4, -39.7, 148, 5.6, -39.55, col(0x1c2a30)); // departures board on the north wall
  for (let i = 0; i < 6; i++) G.glow.box(138.4 + i * 1.6, 4.9, -39.56, 139.4 + i * 1.6, 5.1, -39.5, col(0xffd070));
  // --- Place de la Gare (0): DEF post x[130,149] z[-50,-46] kept clear. Taxis, bus shelter, planters, flag
  Floor(100, 174, -54, -40, 'stone', 0xd5c9b0);
  Planter(104, -52.6, 110, -51.6, 'flowers'); Planter(162, -52.6, 168, -51.6, 'flowers'); Palm(120, -52, 7); Palm(124, -52, 6.4); Palm(170, -44, 7);
  Car(108, -44.6, true, 0xd9a230); Car(162, -43.2, true, 0x2f5f8f); Truck(103, -47, 0x5d6b4a); Kiosk(156.6, -52, 0x2f5f4a);
  Flag(152, -41.2, 9, 0); Flag(128, -41.2, 9, 1); for (const x of [104, 126, 150, 172]) Lamp(x, -53.4, 0);
  Bench(96, -37, R); Crate(94.2, -29.4); Barrel(98.8, -29.2, GREY); Dumpster(108.2, -29.6, true);
  // descente du Bastion
  Pot(81.4, -39.4, 1.2); Pot(81.4, -34.6);

  // ---------------------------------------------------------------- helpers
  function track(x0, x1, zc) { // ballast strip + sleepers + two rails (decor, walkable)
    G.stone.box(x0, 0, zc - 1.6, x1, 0.05, zc + 1.6, col(0x8d877c), 'ny', 1.5);
    for (let x = x0 + 0.4; x < x1; x += 1.2) G.wood.box(x, 0.04, zc - 1.25, x + 0.24, 0.13, zc + 1.25, col(0x5b4a38, 0.85 + r() * 0.2), 'ny');
    for (const s of [-1, 1]) G.metal.box(x0, 0.13, zc + s * 0.72 - 0.04, x1, 0.25, zc + s * 0.72 + 0.04, col(0x6e6a64), 'ny');
  }
  function wagon(x0, zc, kind) { // 13 m freight wagon on two bogies; underframe is solid (no crawling under)
    const L = 13, x1 = x0 + L, H = 1.15, dark = col(0x2c2a28);
    for (const bx of [x0 + 2.2, x1 - 2.2]) { G.metal.box(bx - 1.3, 0.25, zc - 1.0, bx + 1.3, 0.85, zc + 1.0, dark); for (const s of [-1, 1]) for (const d of [-0.8, 0.8]) G.paint.add(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 12), mat4(bx + d, 0.42, zc + s * 0.72, 0, 1, 1, 1).multiply(new THREE.Matrix4().makeRotationX(R)), dark); }
    G.metal.box(x0, 0.85, zc - 1.35, x1, H, zc + 1.35, col(0x3d3a36)); G.metal.box(x0 - 0.5, 0.75, zc - 0.15, x0, 0.95, zc + 0.15, dark); G.metal.box(x1, 0.75, zc - 0.15, x1 + 0.5, 0.95, zc + 0.15, dark);
    solid(x0, 0, zc - 1.35, x1, H, zc + 1.35, 'metal');
    if (kind === 'cont') { const c = [RED, BLUE, GREEN, OCHRE, GREY]; container(x0 + 0.3, zc - 1.22, true, c[(r() * 5) | 0], H); container(x1 - 6.4, zc - 1.22, true, c[(r() * 5) | 0], H); }
    else if (kind === 'hopper') { const c = col([0x7a4a32, 0x5d6b4a, 0x6a6e70][(r() * 3) | 0]); G.corr.box(x0 + 0.4, H, zc - 1.4, x1 - 0.4, H + 2.6, zc + 1.4, c, '', 2.4); G.metal.box(x0 + 0.3, H + 2.6, zc - 1.45, x1 - 0.3, H + 2.75, zc + 1.45, col(0x4a4846)); solid(x0 + 0.4, H, zc - 1.4, x1 - 0.4, H + 2.75, zc + 1.4, 'metal'); }
    else if (kind === 'tank') { G.paint.add(new THREE.CylinderGeometry(1.3, 1.3, L - 1.4, 18), mat4((x0 + x1) / 2, H + 1.35, zc, 0, 1, 1, 1).multiply(new THREE.Matrix4().makeRotationZ(R)), col([0xd8d4cc, 0x2c2c2c, 0x9a3a2a][(r() * 3) | 0])); G.metal.box((x0 + x1) / 2 - 0.5, H + 2.6, zc - 0.5, (x0 + x1) / 2 + 0.5, H + 2.85, zc + 0.5, dark); solid(x0 + 0.7, H, zc - 1.3, x1 - 0.7, H + 2.65, zc + 1.3, 'metal'); }
    else { Crate(x0 + 3, zc, 1.2, 0, H); Crate(x0 + 4.3, zc + 0.2, 1.0, 0, H); Pallets(x1 - 3, zc, 2); } // flat: a few crates (pallets lifted by the floor, fine at 0)
  }
  function canopy(x0, x1, z0, z1) { // platform roof on a row of columns (columns collide, roof out of reach)
    const Y = 1.5, zc = (z0 + z1) / 2;
    for (let x = x0 + 2; x <= x1 - 2; x += 8) { G.metal.box(x - 0.12, Y, zc - 0.12, x + 0.12, Y + 3.5, zc + 0.12, col(0x4a5a52)); solid(x - 0.12, Y, zc - 0.12, x + 0.12, Y + 3.5, zc + 0.12, 'metal'); }
    G.metal.box(x0, Y + 3.5, z0 - 0.6, x1, Y + 3.62, z1 + 0.6, col(0x5c6a62)); G.metal.box(x0, Y + 3.3, zc - 0.1, x1, Y + 3.5, zc + 0.1, col(0x4a5a52));
  }
  function edgeLine(x0, x1, z0, z1) { for (const z of [z0 + 0.35, z1 - 0.35]) G.paint.box(x0 + 0.2, 1.5, z - 0.12, x1 - 0.2, 1.512, z + 0.12, col(0xe8c23a), 'ny px nx pz nz'); }
}
