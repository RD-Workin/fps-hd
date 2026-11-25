// Set dressing of the grand map's new districts (grand.js): Vieille-Ville (west) and Gare de triage (east).
// Same rules as zones.js: each site has a default plant spot behind hard cover, every entrance has a defender angle and
// an attacker foothold, long lines are broken (here mostly by parked freight trains with gaps between the wagons).
import * as THREE from 'three';
import { DECAL } from './textures.js';

export function dressGrand(K) {
  const { G, F, col, mat4, r, solid, lift, wire, laundry, wallDecal, fountain, vine, lantern, container,
    Crate, Stack, Barrel, Sandbags, Jersey, LowWall, Container, Car, Truck, Stall, Palm, Lamp, GDecal,
    Cypress, Bush, Hedge, Planter, Pot, Tree, Bench, CafeTable, Bollard, Dumpster, Pallets, Tyres, Cart, Kiosk, Well, Statue, Pergola, Flag,
    Boat, NetPile, Rack, Counter, Pillar, Tent, Floor, Rug, Shelf } = K;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), R = Math.PI / 2;
  const BLUE = 0x3f6b8c, RUST = 0x9a4a2a, OCHRE = 0xc9852f, GREEN = 0x3d7a4a, RED = 0xa2412f, GREY = 0x6d6f70;

  // ============================================================================ VIEILLE-VILLE (v6)
  // Big squares packed with cover: every 6-10 m something to hide behind, nothing lines up for long. Spawns kept clear:
  // ATK x[-160,-141] z[49,52] (quay), DEF x[-166,-147] z[-45,-43] (Place Haute).
  // --- Port de pêche (0): quay, boats, containers, fish crates
  Floor(-176, -80, 44, 56, 'concrete', 0xddd5c6);
  for (let x = -172; x <= -84; x += 8) if (x < -162 || x > -138) Bollard(x, 55.5);
  for (const [x, c, ry] of [[-170, 0x2f6f9a, 0.1], [-150, 0xe8e2d2, -0.2], [-130, 0x3d7a4a, 0.15], [-110, 0xb04a3a, -0.1], [-92, 0xd9a230, 0.2]]) Boat(x, 60.5, ry, c, -0.75, false);
  Boat(-171, 49, 0.25, 0xe8e2d2); Boat(-128, 50.5, -0.1, 0x2f6f9a); Boat(-103, 49.5, 0.15, 0xb04a3a);              // boats hauled up on the quay
  Container(-121, 45.2, true, OCHRE); Container(-96, 52.4, true, RED); Container(-89, 45.4, false, BLUE);
  Stack(-136, 46.2, 2); Crate(-134.8, 46.2); Crate(-135.4, 47.4, 1.0); NetPile(-113, 51); NetPile(-139, 53.6, 0.8); Pallets(-108, 46, 3, 0.3);
  Barrel(-117, 54, BLUE); Barrel(-116.3, 54.7, RUST); Barrel(-163.6, 46.4, OCHRE); Crate(-165, 46.4, 1.0); Truck(-82.6, 50);
  for (const x of [-168, -132, -100]) Lamp(x, 44.6, 0);
  // waterfront (z 40-44): carts, fish crates, a low wall to hide the halle doors from the quay
  Cart(-170, 41.6, 0); Stack(-153, 41.8, 1, 1.0); Crate(-151.8, 42, 0.9); LowWall(-131, 41.6, -125, 42.2, 1.1); LowWall(-123, 41.6, -119, 42.2, 1.1);
  Barrel(-114.6, 41.2, BLUE); Dumpster(-86.4, 42.4, true); Pot(-142.6, 40.6, 1.2);
  // --- Cour des Pêcheurs (0): big courtyard, a boat on trestles, well, nets, parked van, laundry
  Floor(-160, -138, 26, 40, 'stone', 0xd2c5ae);
  Well(-149, 33); Boat(-155.5, 28.4, 0, 0x3d7a4a, 0.9); NetPile(-142, 28, 1.2); NetPile(-158.6, 37.6);
  Car(-142.4, 37.4, true, 0xd8d4cc); Stack(-152.5, 37.6, 2, 1.1); Crate(-151.3, 37.6, 1.0); Tyres(-139.4, 31.6, 3); Pallets(-156, 33.6, 2, R);
  LowWall(-146, 29.2, -143, 29.8, 1.1); Tree(-139.8, 27.6, 5.5, 2.2);
  for (const z of [29, 35]) laundry(V(-160, 4.6, z), V(-138, 4.9, z + 0.6));
  // west passage (0): dumpster, cart, barrels
  Dumpster(-172.6, 30.4, false); Cart(-166.4, 36.4, R); Barrel(-173, 38.6, RUST); Barrel(-172.3, 39.2, BLUE); Crate(-166, 30.8, 1.0); Pot(-164.6, 33.4);
  // Halle aux poissons ('c', 0): fish counters in rows, ice crates, pillars
  Floor(-134, -118, 30, 38, 'tile', 0xcfd6d2);
  Counter(-131.5, 31.6, -127.5, 32.6, 1.0, 0x8a9aa0); Counter(-124.5, 31.6, -120.5, 32.6, 1.0, 0x8a9aa0); Counter(-131.5, 35.4, -127.5, 36.4, 1.0, 0x8a9aa0);
  Counter(-124.5, 35.4, -120.5, 36.4, 1.0, 0x8a9aa0); Stack(-119.3, 37.2, 2, 1.0); Crate(-133.2, 30.8, 0.9); Barrel(-126, 37.4, BLUE);
  for (const x of [-130, -126, -122]) Pillar(x, 34, 3.6, 0.45);
  // Cour du Four (0): bakery oven, café terrace, parked car, planters
  Floor(-116, -96, 28, 36, 'stone', 0xd8cbb2);
  Kiosk(-114, 30, 0x7a3a2a); Car(-102.5, 29.6, true, 0x3f6b8c); CafeTable(-109, 33, 0); CafeTable(-106, 34.2, 1); Planter(-99, 33, -96.6, 34.2);
  Stack(-97.4, 29.2, 1, 1.1); Barrel(-115.2, 35.2, OCHRE); laundry(V(-116, 4.8, 31), V(-96, 5.0, 31.6));
  Cart(-89, 31.5, 0); Crate(-87.4, 37.6); Pot(-91.4, 38.6, 1.2);

  // --- Grande Place du Marché (+1.5) = SITE D (-136, 10): covered market hall over the site, stalls, cars, trees
  Floor(-160, -112, -4, 22, 'stone', 0xd9ccb3);
  marketHall(-144, -128, 3, 17);                                             // roof on pillars: shade, cover from the houses' windows
  fountain(-136, 10);                                                        // centre: hard cover, plant behind it
  Stall(-142.6, 5.6, 1, 0); Stall(-142.6, 14.4, 1, 1); Stall(-129.4, 5.6, -1, 2); Stall(-129.4, 14.4, -1, 3);   // stalls along the hall's pillars
  Stack(-139, 15.6, 2, 1.0); Crate(-133, 4.6); Crate(-133, 5.8, 1.0); Cart(-138.8, 4.4, R); Sandbags(-134.6, 15.8, -131.6, 15.8, 1.05);
  GDecal(DECAL.D, -136, 13.6, 3.2, 3.2, 0); GDecal(DECAL.HAZARD, -136, 6.4, 4.4, 1.1, 0);
  // around the hall: west stalls, kiosk, cars along the south edge, trees and planters to break the long lines
  Stall(-151.6, 7, 1, 1); Stall(-151.6, 11, 1, 2); Tent(-148, 17.5, true); Kiosk(-146, 3.6, 0x2f5f4a);
  Car(-140.5, 19.6, true, 0xa2412f); Car(-120, 9.5, false, 0xd8d4cc); Car(-140.4, -2.4, true, 0x3d7a4a);
  Tree(-122, 18.2, 6, 2.6); Tree(-147, -1.4, 6, 2.4); Tree(-117.2, 5.8, 5.5, 2.2);
  Planter(-142.5, -2.6, -140.6, -0.6); Planter(-131.4, -2.6, -129.5, -0.6);               // either side of the monumental stairs
  LowWall(-125, 12.4, -122, 13, 1.1); LowWall(-147.6, 4, -145, 4.6, 1.1); Jersey(-131, 20.4, true, 3);
  Pallets(-157, 12, 2, R); Stack(-158.4, 8.2, 1, 1.1); Barrel(-157.6, 14.6, BLUE); Barrel(-156.9, 15.3, RUST); Bench(-136, -2.8, 0);
  wallDecal(DECAL.D, 'x', 1, -160, 10, 4.4, 2.2, 2.2); wallDecal(DECAL.S_MARCHE, 'z', 1, -4, -150, 4.8, 4, 1);
  for (const [x, z] of [[-156, 20], [-114, 14], [-150.6, -3]]) Lamp(x, z, 0);
  for (const z of [1, 19]) wire(V(z < 10 ? -151.6 : -160, 7.4, z), V(z < 10 ? -126.6 : -112, 7.6, z + 1.0), 0.8);
  // Place du Tisserand (+1.5, west): market tents, loom crates, a delivery van
  Floor(-174, -160, 4, 22, 'stone', 0xd2c4aa);
  Tent(-169.5, 8.4, false); Tent(-165, 18.4, true); Car(-171.4, 16.8, false, 0xe8e2d2); Stack(-163.2, 13.4, 2, 1.0); Crate(-162, 14.4, 0.9);
  Cart(-166.6, 4.6, 0); Barrel(-173, 21, OCHRE); Pot(-160.6, 21.2, 1.2); Pot(-173.2, 4.8);
  Dumpster(-170.6, -4.6, true); Crate(-163, -5, 1.0); Barrel(-170.6, 2.6, BLUE);           // west stairs landing
  // Café du Marché ('e', +1.5): tables, counter, shelves
  Floor(-110, -102, 2, 14, 'wood', 0xa8855e); Counter(-103.6, 3, -102.6, 9, 1.05); CafeTable(-108, 4.6); CafeTable(-107.6, 9.6); CafeTable(-105, 12.4);
  Shelf('x', -1, -102, 10, 13.6, 2.2); // café east wall
  // east street + Placette du Four (+1.5): café terrace, tree, carts
  Dumpster(-95.6, -2.6, false); Crate(-98.6, 2.6); Crate(-98.6, 3.8, 1.0); Barrel(-95.4, 7.2, RUST);
  CafeTable(-110, 16.4, 0); CafeTable(-106.4, 17.8, 2); Tree(-101, 19.4, 5.5, 2.4); Planter(-97.6, 15.4, -95.4, 17.6); Cart(-112, 20.6, R);
  // Cour du Pressoir (+1.5): the east street widens into a working yard (well, van, wine press shed, low walls, crates)
  Floor(-94, -84, -2, 18, 'stone', 0xcfc0a4); Well(-89.4, 5.6); Car(-86.4, -0.2, false, 0x5c6f7a); Stack(-92.6, -0.6, 2, 1.1); Barrel(-93, 1.4, RUST);
  LowWall(-92.4, 10, -88.4, 10.6, 1.1); Sandbags(-86.6, 6.4, -85, 9.4, 1.0); Tent(-90.4, 14.6, true); Crate(-85.4, 13.4, 1.0); Stack(-85.6, 15.4, 1, 1.0);
  Pergola(-99.6, 8.6, -95.6, 12.6); CafeTable(-97.6, 10.6, 1); Lamp(-84.6, 3.6, 0); Pot(-93.4, 17.2, 1.1);
  Cart(-86, 19.4, 0); Barrel(-82.8, 22.6, BLUE); Car(-91.5, 22.4, true, 0xc9852f);           // Rue du Marché
  laundry(V(-112, 6.6, 16), V(-94, 6.8, 17)); laundry(V(-174, 6.2, 12), V(-160, 6.4, 12.8));

  // --- Haute-Ville (+3)
  // Parvis Saint-Roch: statue, plane trees, parked cars, café pergola, kiosk
  Floor(-150, -118, -34, -10, 'stone', 0xd8cbb2);
  Statue(-134, -22); Tree(-142, -16, 6.5, 2.8); Tree(-124, -29, 6, 2.6); Tree(-146, -27, 5.5, 2.2);
  Car(-125.5, -13.6, true, 0x3f6b8c); Car(-143.5, -31.2, true, 0x6d6f70); Kiosk(-120.6, -20, 0x7a3a2a);
  Pergola(-132, -33.4, -126, -30.4); CafeTable(-130.6, -32); CafeTable(-127.4, -31.8, 1);
  Planter(-138.6, -12.6, -136.6, -10.8); Planter(-131.4, -12.6, -129.4, -10.8); Bench(-140, -21, R); Bench(-128, -21, R);
  LowWall(-148.4, -19.4, -145.6, -18.8, 1.1); Cart(-121, -32.4, 0); Barrel(-149, -11.4, OCHRE); Crate(-119.4, -11.8, 1.0);
  // Jardins du Cloître: hedges (crouch cover, block movement), cypresses, a well and a pergola
  Floor(-174, -156, -40, -10, 'concrete', 0x8e9a68);
  Hedge(-172, -34, -166, -33.2, 1.2); Hedge(-163, -30, -158, -29.2, 1.2); Hedge(-172, -24, -168, -23.2, 1.2); Hedge(-170, -18, -164, -17.2, 1.2);
  Hedge(-161, -14.8, -157, -14, 1.2); Hedge(-166, -38.6, -165.2, -35, 1.2);
  Well(-165, -27); Pergola(-160, -39, -156.4, -34.8); Bench(-158.2, -37, R);
  for (const [x, z] of [[-173, -36.6], [-173, -28.6], [-173, -20.6], [-157, -12], [-162, -21]]) Cypress(x, z, 6.5);
  // Place Haute (DEF post, keep z -46..-42 clear): truck, crates, barrels
  Truck(-152.5, -50.2); Stack(-166.6, -50.6, 2, 1.1); Crate(-160, -50.8, 1.0); Barrel(-143.4, -50.4, BLUE); Barrel(-142.7, -51, RUST);
  Car(-160.5, -40.6, true, 0xa2412f); Crate(-145.6, -40.4, 1.0); Lamp(-170, -46, 0);
  // Rue Haute (jogs): parked cars, carts, a builders' skip
  Car(-124, -46.6, true, 0xe8e2d2); Cart(-118.8, -39.4, 0); Dumpster(-110, -45.2, true); Car(-97, -35.2, true, 0x3d7a4a); Barrel(-88.6, -45.2, OCHRE);
  for (const x of [-138, -112, -94]) Lamp(x, x < -120 ? -44.6 : -38.6, 0);
  // Maison du Notable ('C', +3)
  Floor(-116, -104, -34, -22, 'wood', 0x9c7b56); Rug(-113, -107, -31, -25, 1);
  Counter(-114.6, -33.4, -110, -32.4, 0.95, 0x7d5a36); Shelf('z', 1, -34, -109, -105, 2.4); Rack(-106.2, -24.6, -104.4, -22.8, 2.2); CafeTable(-110, -27.4);
  // east lane + Rue de l'Église
  Crate(-96, -19.6); Crate(-96, -18.4, 1.0); Barrel(-99.2, -15.2, BLUE); Cart(-92, -11.2, 0); Pot(-102.4, -13); Barrel(-84.6, -9.4, BLUE);
  for (const x of [-100, -86]) Lamp(x, -13.6, 0);
  // Cour de l'Église (+3): old churchyard behind the hoarding (tombs, cypresses, an ossuary shed, builders' stacks)
  Floor(-94, -84, -24, -14, 'concrete', 0x8e9a68);
  for (const [x, z] of [[-92.4, -22.6], [-90, -22.6], [-87.6, -22.6], [-91.2, -16.2], [-88.4, -16.2]]) LowWall(x - 0.5, z - 0.18, x + 0.5, z + 0.18, 0.95);
  Cypress(-85.4, -23, 6.5); Cypress(-93.2, -14.8, 6); Counter(-86.4, -17.6, -84.6, -15.2, 1.2, 0x8b8578); Stack(-96.4, -22.6, 2, 1.1); Sandbags(-99.6, -16.6, -97.6, -15.6, 1.0);
  for (const z of [-50, -38, -16]) laundry(V(-170, 7.4, z), V(-150, 7.6, z + 0.6));
  vine('x', 1, -150, -26, -20, 3.2, 7.6); vine('z', -1, -38, -116, -110, 3.3, 7.4, 0xe07a2a); vine('x', -1, -112, 4, 10, 1.6, 5.8); // (ax = the wall's normal axis: these were swapped and sat 60-110 m north of the map)
  for (const [x, z] of [[-168.6, -52], [-118.6, -33.4], [-150, 21.2], [-127, -0.8]]) Pot(x, z);

  function marketHall(x0, x1, z0, z1) { // open market hall: stone pillars every ~4 m, timber roof out of reach (5.3 m)
    const Y = F((x0 + x1) / 2, (z0 + z1) / 2), H = 5.3;
    const ps = []; for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 4) { ps.push([x, z0]); ps.push([x, z1]); }
    for (let z = z0 + (z1 - z0) / 3; z < z1 - 0.01; z += (z1 - z0) / 3) { ps.push([x0, z]); ps.push([x1, z]); }
    for (const [x, z] of ps) { G.stone.box(x - 0.28, Y, z - 0.28, x + 0.28, Y + H, z + 0.28, col(0xe2d3b8), 'ny'); solid(x - 0.28, Y, z - 0.28, x + 0.28, Y + H, z + 0.28, 'concrete'); }
    G.wood.box(x0 - 0.6, Y + H, z0 - 0.6, x1 + 0.6, Y + H + 0.35, z1 + 0.6, col(0x6d4b2e));                       // beams
    G.roof.box(x0 - 1.2, Y + H + 0.35, z0 - 1.2, x1 + 1.2, Y + H + 0.6, z1 + 1.2, col(0xb8664a), 'ny');            // tiles
    for (let x = x0 + 2; x < x1; x += 4) G.wood.box(x - 0.1, Y + H - 0.3, z0, x + 0.1, Y + H, z1, col(0x5b3f26), 'py');
  }

  // ============================================================================ GARE DE TRIAGE
  // --- quai de fret + cour (0): containers, trucks, pallets. ATK insertion x[134,153] z[49,52] kept clear
  Floor(80, 174, 44, 56, 'concrete', 0xd6d0c4);
  for (let x = 84; x <= 172; x += 8) if (x < 130 || x > 156) Bollard(x, 55.5);
  Container(84, 45.5, true, RED); Container(84, 45.5, true, BLUE, 2.6); Container(92, 49.6, true, GREEN);
  Container(104, 38.6, false, OCHRE); Container(107, 38.6, false, GREY); Container(107, 38.6, false, RED, 2.6);
  Container(122, 46, true, BLUE); Container(160, 45.5, true, GREEN); Container(160, 48.3, true, OCHRE); Container(166.6, 38, false, RED);
  Truck(136.4, 39.4, 0x5d6b4a); Truck(142, 39, 0x6a5a3a); Pallets(150, 40.6, 3); Stack(97, 42.4, 2); Crate(98.2, 42.4); Barrel(118.6, 42.8, RUST); Tyres(171, 42, 3);
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
  for (const zc of TRACKS) track(zc < -20 ? 92 : 82, 174, zc); // -22.5 starts after the Poste d'aiguillage
  // wagons: [x0, track z, kind]. Gaps between wagons (>= 2 m) are the ways across.
  const W = [
    [84, 17, 'cont'], [99, 17, 'hopper'], [123, 17, 'cont'], [139, 17, 'tank'], [155, 17, 'cont'],
    [86, 6, 'flat'], [125, 6, 'cont'], [148, 6, 'hopper'], [163, 6, 'flat'],
    [84, -6, 'hopper'], [97, -6, 'cont'], [127, -6, 'tank'], [152, -6, 'cont'],
    [90, -17, 'cont'], [105, -17, 'cont'], [124, -17, 'hopper'], [138, -17, 'cont'], [158, -17, 'tank'],
    [94, -22.5, 'tank'], [132, -22.5, 'cont'], [150, -22.5, 'flat'],
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
  for (let x = 100; x <= 170; x += 20) { G.metal.box(x - 0.08, 0, -26.6, x + 0.08, 6.8, -26.4, col(0x4b4f52)); } // catenary poles
  wire(V(92, 6.6, -26.5), V(174, 6.6, -26.5), 0.4);

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
