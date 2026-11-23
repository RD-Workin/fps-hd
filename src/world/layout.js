// "Citadelle de Port-Cassis" — 10v10 S&D map on 3 ground levels (0 port, +3 ville haute, +6 citadelle).
// The map is authored as a 2 m cell grid carved out of solid buildings. See docs/decisions/world.md.
import { GRAND_CARVES, ROOMS, ROOM_WALLS, GRAND_LABELS, GRAND_CHOKES } from './grand.js';
import { HOUSES, HCHAR, HOUSE_WALLS } from './storeys.js';
export const CELL = 2, GX0 = -176, GZ0 = -64, GW = 176, GH = 64; // x[-176,176] z[-64,64] (grand map, see grand.js)
// Cell codes: '#' building, '.' floor 0, ';' +1.5, ',' +3, '=' +4.5, ':' +6, covered floors (room / passage under a
// building mass): 'c' 0, 'e' +1.5, 'C' +3. Stairs '^' 'v' '>' '<' rise toward -z / +z / +x / -x. 'w' sea.
// A 1.5 m drop between two floors has no railing: players can jump up it (jump apex ~1.2 m + 0.45 step-up), bots can't.
export const LEVEL = { '.': 0, 'c': 0, 'H': 0, 'h': 0, 'i': 1.5, 'I': 3, ';': 1.5, 'e': 1.5, ',': 3, 'C': 3, '=': 4.5, ':': 6 };
export const COVERED = { c: 0, e: 1.5, C: 3, H: 0 }; // 'H' = tall hall (grand.js HALL_CEIL)
export const BOUNDS = { minX: -176, maxX: 176, minZ: -64, maxZ: 56 };
export const CORE_BOUNDS = { minX: -80, maxX: 80, minZ: -64, maxZ: 56 }; // the Citadelle (zombie mode stays there)

// v4 "Port-Cassis": open streets around building islands. South = port (ATK), north = citadel (DEF).
// Left lane -> site A (Place de l'Église, +3). Centre = Place Ronde -> Grand Escalier -> Médina (+3), forks to A and B.
// Right lane -> site B (Chantier naval, 0), overlooked by the Corniche (+3) and a dock (+1.5).
const CARVES = [
  ['w', -176, 176, 56, 64],
  // PORT (0): quay, two sheds break the long strip
  ['.', -76, 76, 42, 56], ['#', 14, 24, 42, 48], ['c', -46, -34, 46, 54],
  // front row openings: Montée (steps to the Cour), Halle (covered market), Grand-Rue, Hangar (interior), Quai Est
  ['.', -60, -52, 36, 42], ['^', -60, -52, 30, 36], ['c', -28, -14, 28, 42], ['.', -4, 4, 30, 42], ['c', 30, 46, 28, 42], ['.', 66, 76, 8, 42],
  // LEFT: Cour des Pêcheurs (+1.5) -> Escalier de l'Église -> landing (+3)
  [';', -68, -46, 14, 30], ['^', -66, -58, 8, 14], [',', -68, -56, 0, 8],
  // connector left <-> centre: Rue des Filets (0), steps up to the Cour
  ['.', -46, -16, 22, 28], ['<', -50, -46, 22, 28],
  // CENTRE: Place Ronde (0), café terrace (+1.5), Café (room, +1.5), Grand Escalier (0 -> +3)
  ['.', -16, 14, 12, 30], [';', -16, -6, 12, 20], ['<', -6, -2, 14, 18], ['e', -16, -6, 4, 12], ['^', 4, 14, 2, 12],
  // Café back stairs (+1.5 -> +3): the bar's back exit climbs into the Médina, so the Café links the Place Ronde to mid
  ['^', -8, -6, 2, 4],
  // A-short: Rue des Filets -> steps -> back alley (+1.5, also the Café back door) -> steps -> Passage (+3) -> Maison A (room) -> plaza
  ['.', -30, -26, 14, 22], ['^', -30, -26, 10, 14], [';', -30, -16, 6, 10], ['<', -38, -30, 6, 10], [',', -44, -38, -6, 10], ['C', -56, -44, 0, 6],
  // connector centre <-> right: Tunnel, Cour de l'Entrepôt with a loading platform (+1.5), Atelier (room with windows on B)
  ['.', 14, 22, 14, 20], ['c', 22, 32, 14, 20], ['.', 32, 62, 8, 28], [';', 50, 62, 16, 28], ['>', 46, 50, 20, 24], ['c', 56, 66, 8, 14],
  // Quai Est hump (+1.5)
  [';', 66, 76, 22, 30], ['^', 66, 76, 30, 34], ['v', 66, 76, 18, 22],
  // SITE B: Chantier naval (0), north dock (+1.5), gate pier
  ['.', 44, 76, -22, 8], ['#', 44, 48, 4, 8], [';', 64, 76, -22, -14], ['>', 60, 64, -20, -16],
  // SITE A: Place de l'Église (+3), church block, DEF balcony (+4.5)
  [',', -74, -44, -28, 0], ['#', -74, -62, -28, -14], ['=', -56, -44, -28, -22],
  // Galerie de l'Abbaye (covered, +3) + cloister garden, link to the Jardins
  ['C', -44, -24, -16, -10], [',', -42, -26, -24, -16], [',', -34, -30, -32, -24],
  // MÉDINA (+3): open quarter around four blocks, kiosk perch (+4.5)
  [',', -24, 24, -26, 2], ['#', -20, -8, -6, 2], ['#', -20, -10, -22, -12], ['#', 10, 20, -22, -12], ['#', 16, 24, -6, 2], ['=', -2, 2, -16, -12],
  // CORNICHE (+3) above B, alley to the Bastion
  [',', 24, 44, -14, -6], [',', 36, 42, -28, -14],
  // BASTION (+3) with its tower
  [',', 34, 70, -50, -28], ['#', 62, 70, -50, -42],
  // JARDINS (+3), gate to the plaza
  [',', -70, -34, -52, -32], [',', -62, -56, -32, -28],
  // CITADELLE (+6): DEF spawn, keep
  [':', -26, 26, -60, -36], ['#', -6, 6, -60, -56],
  // stairs between levels (after floors so they override)
  ['v', -50, -46, -32, -28],                               // Jardins -> balcony (+3 -> +4.5)
  ['^', -4, 4, -36, -26],                                  // Médina -> Citadelle
  ['>', -34, -26, -48, -42], ['<', 26, 34, -48, -42],      // Jardins / Bastion -> Citadelle
  ['<', 44, 52, -14, -8],                                  // B -> Corniche
  ['^', 56, 62, -28, -22],                                 // B -> Bastion
  ...GRAND_CARVES,
  ...ROOMS.map(r => [r.ch, r.x0, r.x1, r.z0, r.z1]),
  ...HOUSES.map(h => [HCHAR[h.base], h.x0, h.x1, h.z0, h.z1]), // multi-storey houses (storeys.js): ground floor, no mass above
];

// Thin walls with openings around rooms and galleries (centre line on a cell boundary). ax 'x': wall along x at z = p.
// open: [t0, t1, kind] with kind 'win' (sill 1.0, head 2.3: shoot through, no walking), 'door' (head 2.4), 'gate' (head 3.1).
export const WALLS = [
  // Café (+1.5): two windows and a door on the terrace, back door to the alley
  { ax: 'x', p: 12, a: -16, b: -6, y: 1.5, open: [[-15.2, -13.2, 'win'], [-12.2, -10.6, 'door'], [-9.4, -7.4, 'win']] },
  { ax: 'z', p: -16, a: 6, b: 10, y: 1.5, open: [[7.2, 8.8, 'door']] },
  // Maison A (+3): windows on the plaza, three doors
  { ax: 'x', p: 0, a: -56, b: -44, y: 3, open: [[-54.6, -52.6, 'win'], [-50.6, -48.6, 'win'], [-47.2, -45.6, 'door']] },
  { ax: 'z', p: -56, a: 0, b: 6, y: 3, open: [[1.2, 2.8, 'door']] },
  { ax: 'z', p: -44, a: 0, b: 6, y: 3, open: [[2.2, 3.8, 'door']] },
  // Atelier (0): windows on site B (no door on that side), doors to the yard and to the Quai Est
  { m: 'corr', ax: 'x', p: 8, a: 56, b: 66, y: 0, open: [[57, 59.4, 'win'], [62.4, 64.8, 'win']] },
  { m: 'corr', ax: 'z', p: 56, a: 8, b: 14, y: 0, open: [[10.2, 11.8, 'door']] },
  { m: 'corr', ax: 'x', p: 14, a: 56, b: 62, y: 0, open: [[58, 60, 'win']] },
  { m: 'corr', ax: 'z', p: 66, a: 8, b: 14, y: 0, open: [[10.2, 11.8, 'door']] },
  // Hangar (0): two truck doors on the port, a door and a window on the yard
  { m: 'corr', ax: 'x', p: 42, a: 30, b: 46, y: 0, open: [[32, 36.5, 'gate'], [39.5, 44, 'gate']] },
  { m: 'corr', ax: 'x', p: 28, a: 32, b: 46, y: 0, open: [[34, 37.5, 'gate'], [41, 43.4, 'win']] },
  // Halle (0): arcades on both ends
  { m: 'stone', ax: 'x', p: 42, a: -28, b: -14, y: 0, open: [[-27, -23.6, 'gate'], [-22.7, -19.3, 'gate'], [-18.4, -15, 'gate']] },
  { m: 'stone', ax: 'x', p: 28, a: -28, b: -16, y: 0, open: [[-27, -23.8, 'gate'], [-23, -19.8, 'gate'], [-19, -16.4, 'gate']] },
  // Galerie de l'Abbaye (+3): arcade on the cloister garden
  { m: 'stone', ax: 'x', p: -16, a: -42, b: -26, y: 3, open: [[-41, -38, 'gate'], [-37, -34, 'gate'], [-33, -30, 'gate'], [-29, -26.6, 'gate']] },
  ...ROOM_WALLS,
  ...HOUSE_WALLS,
];

export function buildGrid() {
  const g = Array.from({ length: GH }, () => Array(GW).fill('#'));
  for (const [ch, x0, x1, z0, z1] of CARVES) {
    for (let j = (z0 - GZ0) / CELL; j < (z1 - GZ0) / CELL; j++) for (let i = (x0 - GX0) / CELL; i < (x1 - GX0) / CELL; i++) g[j][i] = ch;
  }
  return g;
}

const ry = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z)); // yaw looking from (x,z) to (tx,tz); 0 looks -z
export const SPAWNS = {
  // 20 per side (up to 20v20): two staggered rows. ATK on the quay in front of the landing ship, DEF in the citadel yard.
  ATK: [50, 53].flatMap((z, r) => [-19, -17, -15, -13, -11, -9, -7, -5, -3, -1].map(x => ({ x: x + 11 * r, z, yaw: 0 }))),
  DEF: [-48, -52].flatMap((z, r) => [-19, -17, -15, -13, -11, -9, -7, -5, -3, -1].map(x => ({ x: x + 11 * r, z, yaw: Math.PI }))),
};
export const SITES = [{ name: 'A', x: -56, z: -12, radius: 7 }, { name: 'B', x: 60, z: -6, radius: 7 }];

export const LABELS = [
  ['Port', 0, 47], ['Citadelle', 0, -46], ['Site A', -56, -18], ['Site B', 60, -12], ['Montée', -56, 38], ['Halle', -21, 35],
  ['Place Ronde', 2, 24], ['Rue des Filets', -34, 25], ['Cour', -58, 22], ['Café', -11, 8], ['Tunnel', 26, 17], ['Hangar', 38, 35],
  ['Entrepôt', 42, 16], ['Quai Est', 71, 34], ['Atelier', 61, 11], ['Abbaye', -34, -13], ['Médina', 2, -9], ['Corniche', 32, -10],
  ['Bastion', 50, -38], ['Jardins', -52, -42], ['Passage', -41, 3], ['Escalier', 9, 7],
].map(([text, x, z]) => ({ text, x, z })).concat(GRAND_LABELS);

// Bot hints (x,z only; floor height via world.nav.floorAt). routes[site]: ATK spawn -> site polylines.
export const NAV = {
  routes: {
    A: [
      [[-20, 49], [-56, 44], [-56, 33], [-60, 22], [-62, 11], [-62, 4], [-58, -8]],                                           // Montée -> Escalier de l'Église
      [[-12, 46], [-21, 40], [-21, 30], [-28, 25], [-28, 12], [-24, 8], [-34, 8], [-41, 4], [-41, -3], [-51, -6]],            // Halle -> A-short
      [[0, 46], [0, 34], [-1, 22], [-4, 16], [-11, 16], [-11.4, 10], [-13, 8], [-22, 8], [-34, 8], [-41, 3], [-50, 3], [-46.4, -3], [-52, -8]], // Café -> Maison A
      [[0, 46], [0, 34], [4, 20], [9, 12], [9, 0], [0, -9], [-22, -9], [-34, -13], [-46, -13], [-54, -12]],                    // Grand Escalier -> Abbaye
    ],
    B: [
      [[14, 50], [34, 46], [34, 35], [36, 26], [44, 14], [52, 8], [54, 0], [59.5, -4.5]],                                         // Hangar -> gate
      [[20, 52], [70, 48], [71, 26], [71, 10], [66, 3], [62, -5]],                                                            // Quai Est
      [[0, 46], [0, 34], [8, 24], [16, 17], [27, 17], [38, 14], [52, 8], [54, 0], [59.5, -4.5]],                                  // Tunnel
      [[0, 46], [0, 34], [4, 20], [9, 12], [9, 0], [12, -9], [26, -10], [42, -11], [53, -11], [58, -8]],                      // Grand Escalier -> Corniche
    ],
  },
  holds: {
    A: [[-70, -8, -62, 4], [-48, -18, -62, 2], [-52, -25, -58, -10], [-60, -24, -62, 0], [-66, -2, -46, -2], [-46, -4, -41, 4],
      [-58, -14, -62, 2], [-36, -13, -22, -10], [-50, 3, -41, 4], [-64, -11, -46, -12], [-48, -10, -62, 4]],
    B: [[70, -17, 52, 6], [66, -19, 70, 8], [50, -4, 52, 8], [74, -4, 71, 10], [58, -16, 48, -11], [62, 2, 52, 8],
      [39, -11, 28, -10], [59, -25, 60, -6], [73.5, 4, 71, 14], [56, -11, 52, 6], [66, -8, 71, 8]],
  },
  chokes: [[-56, 33], [-62, 11], [-28, 12], [-41, 3], [-34, -13], [0, 34], [9, 7], [-7, 1], [0, -9], [0, -24], [27, 17], [36, 26], [52, 8], [71, 26], [48, -11], [59, -25], [-30, -45], [30, -45], [39, -21], ...GRAND_CHOKES],
};
for (const k of ['A', 'B']) NAV.holds[k] = NAV.holds[k].map(([x, z, tx, tz]) => ({ x, z, yaw: ry(x, z, tx, tz) }));

// Capture du drapeau: one flag base per side (port = ATK spawn side, citadel = DEF) and the lanes between them.
// lanes: port base -> citadel base polylines (bots reverse them from the citadel). Every street of the map is one lane.
export const CTF = {
  bases: { ATK: [0, 46], DEF: [0, -43] },
  lanes: [
    [[0, 46], [-20, 49], [-56, 44], [-56, 33], [-60, 22], [-62, 11], [-62, 4], [-58, -8], [-59, -20], [-59, -30], [-52, -40], [-40, -45], [-30, -45], [-15, -44], [0, -43]], // Montée -> A -> Jardins
    [[0, 46], [-12, 46], [-21, 40], [-21, 30], [-28, 25], [-28, 12], [-24, 8], [-34, 8], [-41, 4], [-41, -6], [-34, -13], [-22, -9], [-6, -9], [0, -9], [0, -24], [0, -32], [0, -43]], // Halle -> Passage -> Abbaye
    [[0, 46], [0, 34], [-1, 22], [4, 20], [9, 12], [9, 0], [0, -9], [0, -24], [0, -32], [0, -43]],                                    // Grand Escalier -> Médina
    [[0, 46], [0, 34], [8, 24], [16, 17], [27, 17], [38, 14], [52, 8], [54, 0], [50, -6], [48, -11], [39, -11], [39, -21], [39, -30], [36, -38], [30, -45], [15, -44], [0, -43]], // Tunnel -> Corniche -> Bastion
    [[0, 46], [14, 50], [34, 46], [34, 35], [36, 26], [44, 14], [52, 8], [54, 0], [59.5, -4.5], [59, -18], [59, -25], [52, -36], [40, -42], [30, -45], [15, -44], [0, -43]], // Hangar -> B -> Bastion
    [[0, 46], [20, 52], [70, 48], [71, 26], [71, 10], [66, 3], [62, -8], [59, -18], [59, -25], [56, -35], [44, -44], [30, -45], [15, -44], [0, -43]], // Quai Est -> B -> Bastion
  ],
};
