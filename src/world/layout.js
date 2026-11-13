// "Citadelle de Port-Cassis" — 10v10 S&D map on 3 ground levels (0 port, +3 ville haute, +6 citadelle).
// The map is authored as a 2 m cell grid carved out of solid buildings. See docs/decisions/world.md.
export const CELL = 2, GX0 = -80, GZ0 = -64, GW = 80, GH = 64; // x[-80,80] z[-64,64]
// Cell codes: '#' building, '.' floor 0, ',' floor +3, ':' floor +6, 'c' covered floor 0 (passage under a building),
// 'C' covered floor +3, '^' 'v' '>' '<' stairs rising toward -z / +z / +x / -x, 'w' sea.
export const LEVEL = { '.': 0, 'c': 0, ',': 3, 'C': 3, ':': 6 };
export const BOUNDS = { minX: -80, maxX: 80, minZ: -64, maxZ: 56 };

const CARVES = [
  ['w', -80, 80, 56, 64],
  // Port (ATK spawn) — quay with jogs
  ['.', -72, -40, 46, 56], ['.', -40, 40, 42, 56], ['.', 40, 72, 44, 56],
  // LEFT lane: Montée des Pêcheurs -> courtyard -> covered passage -> landing -> stairs -> Place Haute
  ['.', -56, -48, 36, 46], ['.', -64, -52, 30, 36], ['c', -64, -58, 22, 30], ['.', -66, -56, 14, 22], ['^', -66, -60, 10, 14], [',', -68, -58, 0, 10],
  // CENTER lane: Halle (covered) -> Place Ronde -> jogging alley -> grand stairs -> Médina
  ['c', -4, 4, 34, 42], ['.', -16, 6, 18, 34], ['.', -4, 2, 12, 18], ['.', -2, 10, 8, 12], ['^', 2, 10, 2, 8], [',', 0, 12, -2, 2],
  // connector LOW left<->center: Rue des Filets
  ['.', -30, -16, 26, 30], ['.', -44, -28, 30, 34], ['.', -54, -42, 32, 36],
  // connector LOW center<->right: Tunnel (covered passages + small yard)
  ['c', 10, 22, 8, 12], ['.', 22, 34, 4, 12], ['c', 34, 44, 6, 10],
  // RIGHT lane: Hangar (covered) -> yard -> shipyard ; Quai Est
  ['c', 40, 48, 32, 44], ['.', 44, 58, 24, 32], ['.', 64, 72, 22, 44],
  // Site B: Chantier naval (level 0)
  ['.', 44, 76, -14, 24], ['.', 50, 72, -20, -14],
  // Site A: Place Haute (+3) + abbey gallery connector (covered at +3)
  [',', -72, -44, -24, 0], [',', -44, -40, -16, -8], ['C', -40, -26, -14, -10], [',', -26, -16, -12, -6], [',', -16, 0, -10, -4],
  // Médina (+3): dense centre with small alleys and a courtyard
  [',', -6, 12, -10, -2], [',', 8, 12, -20, -10], [',', -8, -4, -20, -10], [',', -6, 4, -20, -14], [',', 0, 6, -28, -20],
  // Corniche (+3) overlooking the shipyard, Bastion (+3)
  [',', 12, 26, -12, -6], [',', 26, 44, -14, -8], [',', 36, 42, -28, -14], [',', 40, 50, -34, -28],
  [',', 50, 66, -44, -26], [',', 48, 68, -40, -30], [',', 42, 50, -46, -38],
  // Jardins (+3)
  [',', -66, -42, -50, -30], [',', -60, -52, -30, -24],
  // Citadelle (+6) — DEF spawn
  [':', -34, 34, -58, -34], [':', -28, 28, -62, -58],
  // stairs (after floors so they override)
  ['<', 44, 50, -14, -8], ['^', 54, 60, -26, -20], ['^', 0, 6, -34, -28], ['>', -42, -34, -46, -40], ['<', 34, 42, -46, -40],
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
  ATK: [-9, -7, -5, -3, -1, 1, 3, 5, 7, 9].map(x => ({ x, z: 50, yaw: 0 })),
  DEF: [-9, -7, -5, -3, -1, 1, 3, 5, 7, 9].map(x => ({ x, z: -50, yaw: Math.PI })),
};
export const SITES = [{ name: 'A', x: -58, z: -12, radius: 7 }, { name: 'B', x: 60, z: 2, radius: 7 }];

export const LABELS = [
  ['Port', 0, 47], ['Citadelle', 0, -44], ['Site A', -58, -18], ['Site B', 60, -4], ['Montée', -52, 40], ['Halle', 0, 38],
  ['Place Ronde', -5, 22], ['Rue des Filets', -32, 32], ['Tunnel', 28, 8], ['Hangar', 44, 36], ['Quai Est', 68, 34],
  ['Abbaye', -33, -12], ['Médina', 3, -6], ['Corniche', 30, -11], ['Bastion', 58, -36], ['Jardins', -54, -40],
].map(([text, x, z]) => ({ text, x, z }));

// Bot hints (x,z only; floor height via world.nav.floorAt). routes[site]: ATK spawn -> site polylines.
export const NAV = {
  routes: {
    A: [
      [[-20, 49], [-52, 44], [-58, 33], [-61, 26], [-61, 18], [-63, 12], [-63, 4], [-58, -8]],                              // gauche
      [[0, 48], [0, 38], [-2, 22], [-1, 15], [4, 10], [6, 5], [6, 0], [-8, -7], [-21, -9], [-33, -12], [-42, -12], [-55, -12]], // centre -> abbaye
      [[-10, 48], [-6, 30], [-22, 28], [-36, 32], [-50, 34], [-61, 26], [-61, 18], [-63, 12], [-63, 4], [-58, -8]],           // Rue des Filets
    ],
    B: [
      [[20, 48], [44, 46], [44, 38], [51, 31], [58, 12], [60, 4]],                                                           // Hangar
      [[30, 50], [68, 48], [68, 26], [62, 8]],                                                                               // Quai Est
      [[0, 48], [0, 38], [-2, 24], [-1, 15], [4, 10], [16, 10], [28, 8], [39, 8], [50, 6], [58, 4]],                          // Tunnel
      [[0, 48], [0, 38], [-2, 22], [-1, 15], [4, 10], [6, 5], [8, -4], [20, -9], [36, -11], [48, -11], [56, -2]],             // Médina -> Corniche
    ],
  },
  holds: {
    A: [[-66, -18, -63, 4], [-48, -20, -63, 4], [-50, -4, -42, -12], [-70, -6, -63, 6], [-56, -22, -46, -12]],
    B: [[52, -16, 50, 26], [73, -8, 68, 22], [49, -3, 44, 8], [66, 12, 52, 28], [57, -8, 47, -11]],
  },
  chokes: [[-52, 40], [-61, 26], [-63, 12], [0, 38], [6, 5], [-42, -12], [3, -24], [44, 38], [68, 30], [39, 8], [47, -11], [57, -23], [-38, -43], [38, -43]],
};
for (const k of ['A', 'B']) NAV.holds[k] = NAV.holds[k].map(([x, z, tx, tz]) => ({ x, z, yaw: ry(x, z, tx, tz) }));
