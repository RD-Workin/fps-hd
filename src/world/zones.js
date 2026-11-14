// Set dressing per zone: cover, landmarks, decor. Every zone has its own palette and hero piece so callouts are obvious.
// Cover is placed for the game mode: sites get a default plant spot behind hard cover, each entrance has a defender angle
// and an attacker foothold, long lines are broken every 25-35 m. Blocking props register AABBs through the kit.
import * as THREE from 'three';
import { DECAL } from './textures.js';
import { nearSolid } from './props.js';

export function dressZones(K) {
  const { G, T, col, mat4, r, solid, lift, physics, scene, wire, bunting, laundry, wallDecal, fountain, vine, lantern, buoy,
    Crate, Stack, Barrel, Sandbags, Jersey, LowWall, Container, Car, Truck, Stall, Palm, Lamp, GDecal,
    Cypress, Bush, Hedge, Planter, Pot, Tree, Bench, CafeTable, Bollard, Dumpster, Pallets, Tyres, Cart, Kiosk, Well, Statue, Pergola, Flag,
    Cannon, Balls, Boat, NetPile, Rack, Counter, Pillar, Tent, Floor, Rug, Shelf } = K;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), R = Math.PI / 2;
  const BLUE = 0x3f6b8c, RUST = 0x9a4a2a, OCHRE = 0xc9852f, GREY = 0x6d6f70;

  // =====================================================================================================
  // PORT (0) — ATK spawn x[-22,14] z[47,55] kept clear; landing ship ramp at x[-7,7]
  // =====================================================================================================
  Floor(-76, 76, 42, 56, 'concrete');
  for (let x = -72; x <= 72; x += 8) if (Math.abs(x) > 12) Bollard(x, 55.5);
  for (const x of [-66, -30, 34, 60]) Lamp(x, 43, 0);
  // west quay: container yard + boat on trestles
  Container(-72, 44, true, 0xa2412f); Container(-72, 44, true, 0x2f5f8f, 2.6); Container(-64.5, 50, false, OCHRE);
  Boat(-55, 51.5, 0, 0xb04a3a); NetPile(-58, 47); Pallets(-50.5, 45, 4); Barrel(-49, 53.6); Barrel(-48.3, 54.2, RUST);
  // Criée (open fish-market shed): pillars, counters, crates
  Floor(-46, -34, 46, 54, 'tile', 0xcfd6d2);
  for (const x of [-45.6, -34.4]) for (const z of [46.4, 53.6]) Pillar(x, z, 3.6, 0.45, 'concrete');
  Counter(-43, 48, -37, 49); Counter(-43, 51.4, -39.5, 52.4, 0.9, 0x8a9aa0); Crate(-36, 52.6, 0.9); Crate(-36, 51.6, 0.9); NetPile(-41, 53.2, 0.8);
  wallDecal(DECAL.S_MARCHE, 'z', 1, 54, -40, 3.75, 4, 1);
  // between the Halle and the Grand-Rue
  Crate(-27, 44.2); Crate(-25.8, 44.2); Crate(-26.4, 44.2, 1.2, 1); Tyres(-30.5, 43.6, 3); Planter(-12, 42.6, -6, 43.6, 'flowers'); Planter(6, 42.6, 12, 43.6, 'flowers');
  Bench(-9, 44.6, 0); Bench(9, 44.6, 0);
  // Capitainerie block: flag, parked car, pallets
  Flag(25.5, 45, 9, 1); Car(19, 50.2, true, 0x7a8a6a); Pallets(26.5, 43.2, 3); Barrel(13, 44.6, OCHRE);
  // east quay: containers in front of the Hangar, boat, truck
  Container(48, 44.5, true, 0x3d7a4a); Container(49, 51, true, 0xa2412f); Container(49, 51, true, OCHRE, 2.6);
  Boat(60, 52, 0, 0x3d7a4a); NetPile(63.6, 48.6); Stack(57, 45, 2); Crate(58.2, 45); Truck(73, 49, 0x5d6b4a); Tyres(65, 54, 2);
  GDecal(DECAL.ARROW, -56, 45, 1.8, 1.8, 0); GDecal(DECAL.ARROW, 0, 44, 1.8, 1.8, 0); GDecal(DECAL.ARROW, 71, 44.5, 1.8, 1.8, 0);
  // moored boats and buoys (decor, in the water)
  for (const [x, c, ry] of [[-66, 0x2f6f9a, 0.2], [-52, 0xe8e2d2, -0.15], [-36, 0xb04a3a, 0.1], [-24, 0x3d7a4a, -0.2], [24, 0x2f6f9a, 0.15], [38, 0xd9a230, -0.1], [54, 0xe8e2d2, 0.2], [68, 0xb04a3a, -0.2]]) Boat(x, 60.5, ry, c, -0.75, false);
  for (const [x, z] of [[-44, 70], [30, 74], [-80, 66], [78, 68]]) buoy(x, -1.0, z, x % 4 ? 0xd84a2a : 0xf0c030);

  // =====================================================================================================
  // LEFT LANE — Montée, Cour des Pêcheurs (+1.5), Escalier de l'Église
  // =====================================================================================================
  Pot(-59.4, 41); Pot(-52.6, 38.6, 1.2); Crate(-58.8, 37.4, 1.0); Barrel(-53, 41.2, BLUE);
  for (const z of [33, 39]) laundry(V(-60, 5.2, z), V(-52, 5.4, z + 0.5));
  vine('x', 1, -60, 36, 41, 0.3, 4.2); vine('x', -1, -52, 31, 35, 1.6, 5, 0xe07a2a);
  // Cour: plane tree in a planter (centre cover), boat under repair, fishermen's clutter
  Planter(-58.4, 20.6, -55.6, 23.4, 'bush', 0.7); Tree(-57, 22, 6.5, 3.0);
  Boat(-63.5, 26.5, 0, 0xe8e2d2); NetPile(-66.5, 23); Pallets(-66.6, 16.2, 3); Barrel(-47.6, 15, RUST); Barrel(-48.3, 15.6, BLUE);
  Dumpster(-51, 29.2, true); Bench(-47, 19, R); Crate(-52.2, 15.2); Crate(-52.2, 16.4, 1.0); Lamp(-67.4, 29.4, 2.4);
  LowWall(-57.6, 14.6, -54, 15.2, 1.1);                                   // defender angle on the stair foot / attacker foothold
  Pot(-58.6, 14.6); Pot(-66.6, 14.6, 1.2); vine('z', -1, 30, -67, -61, 1.6, 5);
  GDecal(DECAL.ARROW, -62, 17, 1.6, 1.6, 0);
  // landing (+3)
  Crate(-57, 6.9, 1.0); Pot(-67.4, 7.2, 1.2); Pot(-67.4, 1, 1.0);

  // =====================================================================================================
  // RUE DES FILETS (0) + HALLE (covered market)
  // =====================================================================================================
  Stall(-42, 22.3, 1, 0); Cart(-36, 26.6, 0); Crate(-31.5, 22.8, 1.0); Barrel(-32.6, 22.6, OCHRE); Pot(-45.4, 27.4); Pot(-17, 22.6, 1.2);
  Planter(-40.5, 27, -37.5, 27.7, 'flowers'); Bench(-23, 22.5, 0);
  bunting(V(-44, 5.4, 22.2), V(-30, 5.4, 27.8)); bunting(V(-30, 5.4, 22.2), V(-17, 5.4, 27.8));
  Lamp(-34, 22.3, 0);
  Floor(-28, -14, 28, 42, 'tile', 0xd9cdb6);
  for (const x of [-23.4, -18.6]) for (const z of [32.5, 37.5]) Pillar(x, z, 3.6, 0.55);
  Counter(-27.6, 31, -26.6, 35); Counter(-27.6, 37, -26.6, 40.6, 0.95, 0x8a6440); Counter(-15.4, 31.6, -14.4, 35.4, 0.95, 0x8a6440);
  Cart(-21, 35, R); Crate(-15.2, 39.6, 1.0); Crate(-15.2, 38.5, 1.0); Barrel(-25.6, 29.4, RUST);
  for (const [x, z] of [[-21, 31], [-21, 39]]) lantern(x, 3.3, z);
  wallDecal(DECAL.S_MARCHE, 'z', 1, 42.2, -21, 3.7, 4.4, 1.1);
  // A-short steps + back alley (+1.5)
  Crate(-26.6, 20.6, 1.0); Pot(-29.6, 15); Dumpster(-21, 9.3, true, 0x3a5f7a); Crate(-28.6, 6.8); Barrel(-17, 6.6, GREY); Pot(-25, 6.5);
  laundry(V(-27, 5.8, 6), V(-26.6, 5.9, 10)); laundry(V(-20, 5.8, 6), V(-19.6, 5.9, 10));

  // =====================================================================================================
  // GRAND-RUE + PLACE RONDE (0) + CAFÉ (+1.5) + GRAND ESCALIER
  // =====================================================================================================
  Planter(-3.8, 39, -3.0, 41.6, 'cypress'); Planter(3.0, 39, 3.8, 41.6, 'cypress'); Car(2.6, 34.5, false, 0x8a4a3a); Pot(-3.4, 31.2, 1.2); Lamp(3.6, 30.6, -R);
  bunting(V(-4, 5.6, 38), V(4, 5.6, 36)); bunting(V(-4, 5.6, 32), V(4, 5.6, 34));
  fountain(1.5, 21.5); Bench(1.5, 25.2, 0); Bench(1.5, 17.8, 0); Bench(5.2, 21.5, R);
  Kiosk(10, 26.5); Palm(-13, 27.5, 7); Palm(11.6, 16, 6.5); Stall(14, 22.5, -1, 2); Cart(-9.5, 26, 0); Planter(-15.6, 22, -14.8, 25, 'flowers');
  Lamp(-15.4, 29.4, 2.4); Lamp(13.4, 13, -2.4); Crate(12.8, 28.6); Crate(12.8, 27.4, 1.0); Barrel(7.2, 29.2, BLUE);
  Planter(2.6, 12.4, 3.6, 15.4, 'bush', 0.9);                               // foot of the Grand Escalier: attacker foothold
  LowWall(14.4, 12.4, 15, 15.6, 1.1);
  bunting(V(-16, 6.2, 21), V(14, 6.2, 24)); bunting(V(-16, 6.4, 29), V(14, 6.4, 27));
  GDecal(DECAL.ARROW, 0, 30.5, 1.8, 1.8, 0); GDecal(DECAL.ARROW, 9, 13.5, 1.8, 1.8, 0);
  // café terrace (+1.5): parasols are soft cover, planters on the edge are low cover
  Floor(-16, -6, 12, 20, 'tile', 0xe9dcc2);
  CafeTable(-13.6, 14.2, 0); CafeTable(-13.4, 17.6, 1); CafeTable(-8.4, 18, 0);
  Planter(-11.6, 19.2, -8.4, 19.9, 'flowers'); Planter(-6.9, 12.4, -6.2, 13.6, 'bush');
  wallDecal(DECAL.S_CAFE, 'z', 1, 12.2, -11.4, 4.2, 3.6, 0.9);
  // Café interior (+1.5): bar along the back wall, shelves, tables
  Floor(-16, -6, 4, 12, 'wood'); Rug(-12.4, -9.6, 7.4, 9.4, 1);
  Counter(-13.6, 4.5, -7.2, 5.4, 1.1); Shelf('z', 1, 4.02, -13.4, -7.4, 2.3); CafeTable(-8, 9.4); CafeTable(-13.6, 10.2); Crate(-6.7, 6.5, 0.9);
  lantern(-11, 4.9, 8); lantern(-8, 4.9, 6.4);
  // Grand Escalier: lamps and planters on the cheeks
  Pot(4.5, 12.6, 1.2); Pot(13.5, 12.6, 1.2);

  // =====================================================================================================
  // PASSAGE (+3) + MAISON A (room, +3) -> site A
  // =====================================================================================================
  Barrel(-38.6, 9.2, RUST); Pot(-43.4, 9.2, 1.2); Crate(-43.3, -5.2, 1.0); Pot(-38.6, -5.4);
  vine('x', -1, -38, -4, 4, 3.4, 7.5); laundry(V(-44, 7.4, 5), V(-38, 7.6, 5.5));
  Floor(-56, -44, 0, 6, 'wood', 0x9a7248); Rug(-52, -48.6, 2.2, 4.4, 2);
  Counter(-53.6, 4.9, -50, 5.7, 0.8, 0x7a5a3a); Shelf('z', -1, 5.98, -49, -45.6, 2.2); Crate(-55.2, 5.2, 0.9); Crate(-48.2, 1.2, 1.0);
  lantern(-50, 6.3, 3);

  // =====================================================================================================
  // SITE A — PLACE DE L'ÉGLISE (+3). Church + bell tower NW, DEF balcony N (+4.5), default plant behind the statue.
  // =====================================================================================================
  Floor(-74, -44, -28, 0, 'stone');
  Statue(-56, -12);                                                         // centre of the site: plant on either side
  Truck(-50.4, -15, 0x5d6b4a);                                              // hard cover east of the statue
  Crate(-60.4, -15.2); Crate(-61.6, -15.2); Crate(-61, -15.2, 1.2, 1); Crate(-60.6, -8.6, 1.0);
  LowWall(-66.5, -3.2, -62.5, -2.6, 1.1);                                   // faces the Escalier landing
  LowWall(-49.6, -6.4, -49, -2.6, 1.1);                                     // faces the Maison door / Passage
  Stall(-74, -6, 1, 0); Stall(-74, -10.5, 1, 3); Cart(-69, -3, 0);
  Planter(-61.4, -21.6, -60.6, -18.6, 'cypress'); Planter(-61.4, -27.6, -60.6, -24.6, 'cypress');
  Bench(-66, -13.2, 0); Bench(-70.5, -13.2, 0); Palm(-72, -2, 7); Palm(-46, -20.4, 6.5); Lamp(-73.4, -13.2, R); Lamp(-44.6, -8.6, -R);
  Barrel(-45, -1, BLUE); Barrel(-45.7, -1.7, RUST); Pot(-57, -0.8, 1.2); Pot(-63.4, -0.8, 1.2);
  Sandbags(-54.5, -22.5, -50, -22.5);                                       // balcony edge (+4.5): DEF overwatch
  lift(4.5, () => { K.crate(-45.4, -26.6); K.barrel(-55, -27, GREY); });
  Crate(-57, -23.4); Crate(-57, -24.6, 1.0);                                // jump-up onto the balcony from the corridor
  GDecal(DECAL.A, -56, -8.2, 3.4, 3.4, 0); GDecal(DECAL.HAZARD, -56, -16.5, 6, 1.4, 0);
  wallDecal(DECAL.A, 'x', 1, -74, -8.2, 4.8, 2.4, 2.4); wallDecal(DECAL.A, 'z', -1, 0, -59, 4.6, 2.2, 2.2);
  bunting(V(-74, 8.4, -4), V(-56, 7.6, -0.2)); bunting(V(-62, 8, -14.2), V(-44, 7.8, -9));
  // church: bell tower on the SE corner of the block, portal on the east face
  {
    const sc = col(0xf0e2c8), tr = col(0xd8cbb4), X0 = -68.2, X1 = -61.86, Z0 = -20.2, Z1 = -13.86, B = 3, TOP = 23;
    G.stone.box(X0, B, Z0, X1, TOP, Z1, sc, 'ny');
    for (const y of [12.5, 17.2, TOP - 0.3]) G.stone.box(X0 - 0.15, y, Z0 - 0.15, X1 + 0.15, y + 0.3, Z1 + 0.15, tr, '');
    const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
    for (const [ax, p, s] of [['x', X1, 1], ['x', X0, -1], ['z', Z1, 1], ['z', Z0, -1]]) { // belfry openings + clock face
      if (ax === 'x') { G.glass.box(p + s * 0.02 - 0.02, 18.2, cz - 1.1, p + s * 0.02 + 0.02, 21.4, cz + 1.1, col(0x1c1a18), ''); G.paint.add(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 20), mat4(p + s * 0.05, 14.9, cz, 0, 1, 1, 1, 0, R), col(0xf4efe2)); }
      else { G.glass.box(cx - 1.1, 18.2, p + s * 0.02 - 0.02, cx + 1.1, 21.4, p + s * 0.02 + 0.02, col(0x1c1a18), ''); G.paint.add(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 20), mat4(cx, 14.9, p + s * 0.05, 0, 1, 1, 1, R), col(0xf4efe2)); }
    }
    G.metal.add(new THREE.CylinderGeometry(0.5, 0.75, 0.9, 12), mat4(cx, 19.6, cz), col(0x8a6a2a));                         // bell
    G.roof.add(new THREE.ConeGeometry(5.0, 5.5, 4), mat4(cx, TOP + 2.75, cz, Math.PI / 4), [1, 1, 1], 3);
    G.metal.box(cx - 0.06, TOP + 5.4, cz - 0.06, cx + 0.06, TOP + 7.2, cz + 0.06, col(0x2b2d2e), ''); G.metal.box(cx - 0.5, TOP + 6.4, cz - 0.06, cx + 0.5, TOP + 6.52, cz + 0.06, col(0x2b2d2e), '');
    // portal on the east face (x = -62) + rose window
    G.stone.box(-62.0, B, -26.6, -61.7, B + 4.6, -21.4, tr, 'ny'); G.wood.box(-61.72, B, -25.9, -61.62, B + 3.6, -22.1, col(0x5a3a22), 'ny');
    G.stone.add(new THREE.CylinderGeometry(2.2, 2.2, 0.3, 20, 1, false, 0, Math.PI), mat4(-61.85, B + 3.6, -24, 0, 0.86, 1, 1, R, R), tr);
    G.glass.add(new THREE.CylinderGeometry(1.3, 1.3, 0.08, 16), mat4(-61.95, B + 7.2, -24, 0, 1, 1, 1, 0, R), col(0x3f6b8c));
    G.stone.add(new THREE.TorusGeometry(1.35, 0.14, 6, 20), mat4(-61.95, B + 7.2, -24, R), tr);
    for (const z of [-27.2, -20.8]) G.stone.box(-62.0, B, z - 0.3, -61.6, B + 8.6, z + 0.3, tr, 'ny');
    for (let k = 0; k < 3; k++) G.stone.box(-62, B, -26.4 + k * 0.01, -61.3 + (2 - k) * 0.3, B + 0.15 * (k + 1), -21.6, tr, 'ny');
  }

  // =====================================================================================================
  // GALERIE DE L'ABBAYE (+3) + cloister garden
  // =====================================================================================================
  Floor(-44, -24, -16, -10, 'tile', 0xe2d6bf);
  Bench(-33, -10.6, 0); Crate(-27.4, -10.9, 1.0); Crate(-40.6, -10.9, 1.0); Pot(-24.6, -15.4, 1.2); Pot(-43.4, -10.6, 1.2);
  for (const x of [-39.5, -33.5, -28]) lantern(x, 6.3, -13);
  Tree(-34, -20, 5.5, 2.4); Hedge(-40.5, -21.2, -37, -20.4, 1.2); Hedge(-31, -19.4, -27.5, -18.6, 1.2); Well(-38, -17.9 - 0.3 + 0.3);
  Bush(-41.2, -23.2, 0.7); Bush(-26.8, -23, 0.8); Pot(-26.8, -17, 1.2); Bench(-29, -23.4, 0);
  vine('z', 1, -24, -42, -36, 3.3, 7); vine('x', 1, -42, -24, -18, 3.3, 6.5, 0xe07a2a);

  // =====================================================================================================
  // MÉDINA (+3) — white walls, blue shutters, kiosk perch (+4.5) in the middle
  // =====================================================================================================
  Floor(-24, 24, -26, 2, 'stone', 0xf0e8d6);
  // top of the Grand Escalier: defender cover, attacker cover once up
  LowWall(5, -1.6, 8.4, -1, 1.1); Stack(14.8, -0.6, 2); Crate(13.6, -0.6); Planter(-7.6, -5.4, -6.8, -2, 'bush', 0.9);
  // kiosk perch: pergola on the raised platform, jump up from any side
  lift(4.5, () => { K.pergola(-1.7, -15.7, 1.7, -12.3); });
  Crate(3.2, -14, 1.0);                                                      // easy hop onto the perch
  Well(0, -6.6); Bench(-4, -20.8, 0); Bench(4, -20.8, 0);
  Stall(-10, -17, 1, 1); Stall(10, -17, -1, 2); Cart(-13, -9.2, 0); Crate(-22.6, -4.6, 1.0); Barrel(21, -9.6, BLUE); Barrel(21.6, -10.4, OCHRE);
  Crate(-21.4, -24.6); Crate(-21.4, -23.4, 1.0); Crate(21.6, -24.6); Stack(22.6, -1.2, 2); Pot(-9.4, -22.6, 1.2); Pot(9.4, -22.6, 1.2); Pot(-8.4, -6.6); Pot(15.4, -6.6);
  Palm(-6.5, -24, 6.5); Palm(7, -24, 6); Lamp(-23.4, -18, R); Lamp(23.4, -20, -R);
  Jersey(-2.2, -24.4, true, 3);                                              // DEF cover at the foot of the citadel stairs
  for (const z of [-17, -9]) laundry(V(-8, 8, z), V(8, 8.2, z + 0.4));
  bunting(V(-10, 8, -12), V(10, 8, -12.5)); bunting(V(-8, 7.6, -2), V(16, 7.6, -5.8));
  vine('x', 1, -8, -5, 1, 3.3, 7.5); vine('x', -1, 10, -21, -14, 3.3, 7, 0xe07a2a); vine('z', 1, -12, 11, 19, 3.3, 7.4);
  GDecal(DECAL.ARROW, -21, -13, 1.6, 1.6, -R); GDecal(DECAL.ARROW, 21, -10, 1.6, 1.6, R);

  // =====================================================================================================
  // CORNICHE (+3) above site B, alley to the Bastion
  // =====================================================================================================
  Crate(30, -6.9, 1.0); Planter(32, -13.7, 36, -12.9, 'flowers'); Bench(28, -13.3, 0); Barrel(25, -6.6, RUST);
  LowWall(40.4, -11.6, 41, -8.6, 1.1);                                       // cover at the head of the stairs
  Pot(43.2, -6.8, 1.2); Lamp(34, -6.4, Math.PI); Crate(36.8, -20, 1.0); Pot(41.4, -26.6); Barrel(36.7, -15.2, GREY);
  vine('z', -1, -6, 25, 33, 3.3, 7.2); laundry(V(36, 7.6, -22), V(42, 7.8, -21.6));

  // =====================================================================================================
  // SITE B — CHANTIER NAVAL (0). Boat on the slipway E, gantry crane, dock N (+1.5), Corniche W above.
  // =====================================================================================================
  Floor(44, 76, -22, 8, 'concrete', 0xa9a399);
  { // hull on its cradle, keel along z (x[67.4,72.6] z[-12.8,6.6])
    const hx = 70, o = -2, c0 = col(0x7a2f26), c1 = col(0xd8d2c4), c2 = col(0x2b3a45), w = col(0x6d4b2e);
    const parts = [[G.wood, -2.6, 0, -9, 2.6, 0.6, -7.8, w, 'wood'], [G.wood, -2.6, 0, 3, 2.6, 0.6, 4.2, w, 'wood'], [G.hull, -1.2, 0.6, -10, 1.2, 1.6, 6, c0, 'metal'], [G.hull, -2.2, 1.6, -10.5, 2.2, 2.8, 6.5, c0, 'metal'],
      [G.paint, -2.6, 2.8, -10.8, 2.6, 3.6, 6.8, c1, 'metal'], [G.paint, -1.6, 3.6, -6, 1.6, 5.4, 0, c2, 'metal'], [G.hull, -0.9, 0.6, 6, 0.9, 3.2, 8.2, c0, 'metal'], [G.paint, -0.5, 3.2, 6.8, 0.5, 3.7, 8.6, c1, 'metal']];
    for (const [g, x0, y0, z0, x1, y1, z1, c, m] of parts) { g.box(hx + x0, y0, z0 + o, hx + x1, y1, z1 + o, c); solid(hx + x0, y0, z0 + o, hx + x1, y1, z1 + o, m); }
    G.glass.box(hx - 1.62, 4.3, -5.4 + o, hx + 1.62, 5.0, -0.6 + o, col(0x2a3238), 'ny py');
    for (const x of [hx - 3.3, hx + 3.3]) G.metal.box(x - 0.08, 0, -13 + o, x + 0.08, 0.14, 9 + o, col(0x55504a), 'ny');         // slipway rails
    for (let z = -12; z < 9; z += 1.4) G.wood.box(hx - 3.6, 0, z + o, hx + 3.6, 0.07, z + o + 0.25, col(0x5a4632), 'ny');
  }
  { // gantry crane over the hull: four legs (hard cover), beams, trolley, hook
    const y = col(0xd9a230), d = col(0x2b2d2e), LX = [65.6, 74.6], LZ = [-15.4, 5.4], H = 11;
    for (const x of LX) for (const z of LZ) { G.hull.box(x - 0.4, 0, z - 0.4, x + 0.4, H, z + 0.4, y, 'ny'); solid(x - 0.4, 0, z - 0.4, x + 0.4, H, z + 0.4, 'metal'); G.metal.box(x - 0.7, 0, z - 0.7, x + 0.7, 0.3, z + 0.7, d, 'ny'); }
    for (const x of LX) G.hull.box(x - 0.45, H, LZ[0] - 1, x + 0.45, H + 1.0, LZ[1] + 1, y, '');
    for (const z of LZ) G.hull.box(LX[0], H - 1.6, z - 0.15, LX[1], H - 1.3, z + 0.15, y, '');
    G.hull.box(LX[0] - 0.6, H + 1.0, -6.2, LX[1] + 0.6, H + 1.7, -4.6, y, ''); G.metal.box(69.2, H + 1.7, -6.4, 71.2, H + 2.6, -4.4, d, '');
    G.metal.box(70.16, 6.6, -5.44, 70.24, H + 1.0, -5.36, d, ''); G.metal.box(69.9, 6.0, -5.7, 70.5, 6.6, -5.1, y, '');
    for (const x of LX) for (let k = 0; k < 6; k++) G.paint.box(x - 0.42, 0.3 + k * 0.35, LZ[0] - 0.42, x + 0.42, 0.3 + k * 0.35 + 0.17, LZ[0] + 0.42, d, 'ny py');
  }
  // default plant: between the containers, west of the hull
  Container(54.6, -9.4, false, 0xa2412f); Container(58.4, -13.4, true, 0x2f5f8f); Container(58.4, -13.4, true, OCHRE, 2.6);
  Crate(61, -3.2); Crate(62.2, -3.2); Crate(61.6, -3.2, 1.2, 1); Crate(58.2, -1.4, 1.0); Pallets(63.6, -8.6, 4);
  Jersey(52, 1.6, true, 3); Jersey(57.5, 3.4, true, 3);                       // attacker footholds inside the gate
  Sandbags(48.4, -5.4, 48.4, -1.4); Dumpster(45.6, 0.4, false); Tyres(45, -6.6, 4); Pallets(46, -20, 3); Barrel(53.6, -20.6, RUST); Barrel(54.4, -21, GREY);
  Stack(74.6, 6.4, 2); Crate(74.6, 5.2, 1.0); Barrel(66.6, 7, OCHRE); Lamp(60, 7.2, 0); Lamp(44.6, -18, R);
  // dock (+1.5): DEF back-site position
  Sandbags(65, -14.5, 70, -14.5); Crate(74.6, -20.6); Crate(74.6, -19.4); Crate(74.6, -20, 1.2, 1); Barrel(71, -21, BLUE); Pallets(66.4, -20.6, 2);
  Crate(63.2, -15, 1.0);                                                      // hop onto the dock
  GDecal(DECAL.B, 60, -6.4, 3.4, 3.4, 0); GDecal(DECAL.HAZARD, 52, 5, 7, 1.4, 0); GDecal(DECAL.OIL, 62, 0, 3.5, 3.5, 2); GDecal(DECAL.OIL, 50, -14, 3, 3, 1);
  wallDecal(DECAL.B, 'x', -1, 76, -3, 5.2, 2.6, 2.6); wallDecal(DECAL.S_DOCKS, 'x', -1, 76, 3.4, 5.4, 4, 1); wallDecal(DECAL.B, 'z', 1, -22, 50, 4.2, 2.4, 2.4);

  // =====================================================================================================
  // COUR DE L'ENTREPÔT (0) + platform (+1.5) + ATELIER + TUNNEL + HANGAR
  // =====================================================================================================
  Floor(32, 62, 8, 28, 'concrete', 0xa9a399);
  Container(33, 21.4, false, 0x3d7a4a); Car(40.5, 11, true, 0x8a4a3a); Jersey(37, 17, false, 3); Pallets(44.6, 26.4, 4); Tyres(47, 9, 3);
  Barrel(33, 9, OCHRE); Barrel(33.8, 9.6, RUST); Crate(49, 13.4); Crate(49, 14.6, 1.0); Dumpster(54, 9.3, true, 0x3a5f7a); Lamp(48, 27.4, 0);
  // platform: crates and a forklift-height stack, overwatch on the gate
  Stack(60.6, 26.6, 2); Crate(59.4, 26.6); Barrel(51, 27, GREY); Pallets(60.6, 17.2, 3); Sandbags(50.5, 17, 50.5, 20, 0.9);
  GDecal(DECAL.HAZARD, 56, 15.2, 8, 1.2, 0); GDecal(DECAL.ARROW, 52, 11, 1.8, 1.8, 0); GDecal(DECAL.OIL, 42, 18, 3.5, 3.5, 1);
  // Atelier: workbench, shelves, crates
  Floor(56, 66, 8, 14, 'concrete', 0x8f8a80);
  Counter(60.6, 12.9, 61.8, 13.8, 0.95, 0x8a9aa0); Shelf('x', -1, 65.84, 12.2, 13.8, 2.2); Crate(64.8, 8.9, 0.9); Barrel(60.6, 8.8, RUST);
  lantern(61, 3.3, 11);
  // Tunnel
  Crate(20.6, 19.2, 1.0); Barrel(15, 14.6, BLUE); Pot(21, 14.6); lantern(27, 3.3, 17); GDecal(DECAL.ARROW, 18, 17, 1.6, 1.6, -R);
  // Hangar interior: racks make two aisles, crates by the doors
  Floor(30, 46, 28, 42, 'concrete', 0x8f8a80);
  Rack(37.6, 31.6, 38.6, 38.4, 3.0); Rack(30.4, 30, 31.3, 36.5, 3.0); Rack(44.7, 31, 45.6, 37, 3.0);
  Stack(31.4, 40.4, 2); Crate(32.6, 40.4); Pallets(41.5, 34.5, 5); Crate(42.4, 40.6, 1.0); Barrel(44.4, 29, RUST); Barrel(45.2, 29.4, OCHRE);
  for (const [x, z] of [[34.5, 35], [41.6, 35]]) lantern(x, 3.3, z);
  wallDecal(DECAL.S_DOCKS, 'z', 1, 42.2, 38, 3.7, 4.4, 1.1);

  // =====================================================================================================
  // QUAI EST (0 / hump +1.5)
  // =====================================================================================================
  Floor(66, 76, 8, 42, 'concrete');
  Container(73.2, 35.2, false, 0x2f5f8f); Crate(67, 40.6); Crate(67, 39.4, 1.0); NetPile(74.6, 31.2); Barrel(66.6, 34.6, OCHRE);
  Stack(67.2, 26, 2); Crate(74.8, 23.2); Pallets(74.6, 27.2, 3); Boat(72.5, 14.5, R, 0xd9a230); Tyres(66.8, 16.6, 3); Lamp(75.4, 20, -R);

  // =====================================================================================================
  // BASTION (+3): old battery — cannons, tower, sand
  // =====================================================================================================
  Cannon(47, -34, R); Balls(48.6, -32.6); Cannon(55, -46, 0); Balls(53.2, -47.4); Flag(60.6, -41, 10, 0);
  LowWall(50, -40.4, 55, -39.8, 1.1); Sandbags(57.5, -31, 57.5, -29); Crate(63, -29.4); Crate(64.2, -29.4, 1.0); Barrel(35, -29, GREY);
  Cypress(36, -48.6, 7.5); Cypress(68.6, -30, 7); Cypress(44, -49, 6.5); Bush(60, -49, 0.9); Tent(41, -42, false); Crate(44.4, -44, 1.0); Lamp(34.6, -38, R);
  G.wood.box(61.72, 3, -41.2, 61.98, 5.6, -39.6, col(0x5a3a22), 'ny');                                             // tower door (west face)

  // =====================================================================================================
  // JARDINS (+3): pergola, cypress alley, hedges (they block sight and movement)
  // =====================================================================================================
  Pergola(-60, -47, -52, -43); Bench(-56, -45, 0);
  for (const x of [-68, -62, -44, -38]) Cypress(x, -50.6, 7 + r() * 1.5);
  Hedge(-66, -39.4, -60, -38.6, 1.3); Hedge(-48, -39.4, -42, -38.6, 1.3); Hedge(-55.4, -36, -54.6, -33, 1.3);
  Well(-40, -35.4); Palm(-67, -34, 7); Tree(-46, -45.5, 6, 2.6); Bush(-69, -43, 0.9); Bush(-36, -50.5, 0.8); Bush(-63.6, -33.4, 0.7);
  Planter(-52, -32.9, -47.4, -32.2, 'flowers'); Pot(-56.6, -28.6, 1.2); Pot(-61.4, -28.6, 1.2); Lamp(-69.4, -45, R);
  LowWall(-38.6, -41.6, -38, -38.6, 1.0);                                                                          // cover facing the citadel stairs

  // =====================================================================================================
  // CITADELLE (+6) — DEF spawn x[-22,13] z[-54,-46] kept clear
  // =====================================================================================================
  Flag(0, -55.2, 13, 3); Tent(19, -55, true); Tent(-20, -57.4, true); Truck(22.6, -42.5, 0x5d6b4a);
  Stack(14.6, -57.6, 2); Crate(15.8, -57.6); Crate(-13, -58.4); Crate(-11.8, -58.4, 1.0); Barrel(8.6, -55.4, GREY); Barrel(-8.6, -55.4, GREY);
  Sandbags(-9, -38.4, -5, -38.4); Sandbags(5, -38.4, 9, -38.4);                                                    // flank the stairs down to the Médina
  Jersey(-21, -40.5, false, 3); Jersey(21, -47.6, false, 3); Cannon(-16, -37.4, -R); Balls(-13.8, -37.2); Cannon(16, -37.4, -R);
  Cypress(-24.4, -58.4, 8); Cypress(24.4, -58.4, 8); Lamp(-25.4, -50.6, R); Lamp(25.4, -52, -R); Pallets(-24.4, -37.4, 3);
  G.wood.box(-1.3, 6, -56.02, 1.3, 8.9, -55.9, col(0x5a3a22), 'ny');                                              // keep door

  // =====================================================================================================
  // wires between buildings, lanterns under passages, ground wear
  // =====================================================================================================
  for (const [a, b] of [[[-68, 7.2, 18], [-46, 7.6, 20]], [[32, 6.6, 12], [62, 6.8, 13]], [[66, 6.4, 38], [76, 6.6, 38.4]], [[-24, 9, -22], [-20, 9.2, -22.4]], [[44, 8.6, -22], [56, 8.4, -22.2]], [[-16, 7.4, 14], [14, 7.8, 13.2]]]) wire(V(...a), V(...b), 0.8);
  for (let i = 0; i < 170; i++) {
    const x = -76 + r() * 152, z = -60 + r() * 114, y = T.levelCell(x, z); if (y == null || nearSolid(physics, x, z, y)) continue;
    const k = r(); GDecal(k < 0.5 ? DECAL.DIRT : k < 0.8 ? DECAL.CRACK : k < 0.93 ? DECAL.OIL : DECAL.MANHOLE, x, z, k < 0.93 ? 2 + r() * 2.5 : 1.3, k < 0.93 ? 2 + r() * 2.5 : 1.3, r() * 6.28);
  }

  // lighthouse on a rock out at sea (landmark for the port, decor)
  {
    const X = 104, Z = 78, w = col(0xf0ebe0), red = col(0xb8322a);
    G.stone.add(new THREE.ConeGeometry(14, 5, 9), mat4(X, -0.2, Z, 0.4, 1, 1, 0.8), col(0x9a8f80), 4); G.stone.add(new THREE.ConeGeometry(8, 4, 7), mat4(X - 9, -0.6, Z + 4, 1, 1, 1, 1), col(0x8f8578), 4);
    for (let k = 0; k < 5; k++) G.paint.add(new THREE.CylinderGeometry(2.3 - k * 0.2, 2.5 - k * 0.2, 4, 16), mat4(X, 3 + k * 4, Z), k % 2 ? red : w);
    G.metal.add(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 16), mat4(X, 21.1, Z), col(0x2b2d2e)); G.glow.add(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 10), mat4(X, 22.2, Z), col(0xffe2a0));
    G.paint.add(new THREE.ConeGeometry(1.7, 1.4, 10), mat4(X, 23.8, Z), red);
  }
}
