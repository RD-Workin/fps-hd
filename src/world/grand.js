// "Port-Cassis — Grande carte": the Citadelle (x[-80,80]) is the centre of a 352 x 120 m coastal town.
// West = Vieille-Ville (x[-176,-80]): maze of 2-4 m alleys on 3 terraces (+3 Haute-Ville, +1.5 Marché, 0 harbour),
// enterable houses, site D on the Place du Marché. East = Gare de triage (x[80,176]): freight quay, warehouses,
// rail yard with platforms (+1.5) and parked freight trains, station hall (7 m ceiling), site C on the central platform.
// Same authoring format as layout.js (2 m cells, carves applied in order) + ROOMS that generate their thin walls.
// See docs/decisions/world.md "Grande carte".

// [char, x0, x1, z0, z1] (world metres, multiples of 2)
export const GRAND_CARVES = [
  // ---------------- links through the Citadelle's outer ring ----------------
  ['.', -80, -76, 42, 56], [';', -80, -68, 20, 24], [',', -80, -74, -10, -6], [',', -80, -70, -46, -42],
  ['.', 76, 80, 42, 56], ['.', 76, 80, 36, 42], ['.', 76, 82, -6, 2], [',', 70, 80, -40, -34],

  // ======================= VIEILLE-VILLE (west), v6 =======================
  // Big open squares packed with cover (props in grandZones.js), linked by short passages and through-buildings; no
  // street runs straight for long. Harbour 0 (ATK), Grande Place du Marché +1.5 (site D), Haute-Ville +3 (DEF).
  // ---- harbour (0)
  ['.', -176, -80, 44, 56], // quay
  ['.', -174, -82, 40, 44], // waterfront
  // ---- lower town (0)
  ['.', -174, -164, 28, 40], // west passage (wide)
  ['.', -160, -138, 26, 40], // Cour des Pêcheurs (big courtyard)
  ['.', -164, -160, 30, 34], // link west passage <-> courtyard
  ['c', -134, -118, 30, 38], // Halle aux poissons (interior)
  ['.', -138, -134, 32, 36], // halle west door (wide)
  ['.', -128, -124, 26, 30], // halle north door -> stairs
  ['.', -130, -126, 38, 40], ['.', -122, -120, 38, 40], // halle south doors (wall row z(38,40))
  ['.', -118, -116, 30, 32], // halle east door
  ['.', -116, -96, 28, 40], // Cour du Four (east courtyard)
  ['.', -92, -86, 28, 40], // Escalier du Port bottom
  ['.', -96, -92, 32, 36],
  // ---- stairs harbour -> market (rise toward -z)
  ['^', -172, -168, 22, 28], ['^', -150, -146, 22, 26], ['^', -128, -124, 22, 26], ['^', -110, -106, 22, 28], ['^', -92, -88, 24, 28],
  // ---- market terrace (+1.5)
  [';', -160, -112, -4, 22], // Grande Place du Marché (48 x 26) -> site D at (-136, 10)
  ['#', -160, -152, -4, 4], // NW corner block
  ['#', -118, -112, 16, 22], // SE corner block
  ['#', -160, -156, 16, 22], // SW corner block
  [';', -174, -160, 4, 22], // Place du Tisserand (west, merges with the Grande Place)
  ['#', -176, -170, 12, 16], // notch
  ['#', -162, -158, 6, 12], // house between the Tisserand and the place
  [';', -172, -162, -6, 4], // west stairs landing
  ['e', -110, -102, 2, 14], // Café du Marché (interior)
  ['#', -112, -110, 2, 14], [';', -112, -110, 4, 6], [';', -112, -110, 10, 12], // café west wall + 2 doors
  [';', -100, -94, -4, 14], // east street (short)
  [';', -94, -84, -2, 18], // Cour du Pressoir: the east street opens into a square (café east side -> Rue du Marché)
  [';', -102, -100, 6, 8], // café east door
  [';', -112, -94, 14, 22], // Placette du Four
  [';', -96, -80, 18, 24], // Rue du Marché -> Citadelle
  // ---- stairs market -> Haute-Ville
  ['^', -170, -166, -10, -6], ['^', -140, -132, -10, -4], ['^', -100, -96, -8, -4],
  // ---- Haute-Ville (+3)
  [',', -150, -118, -34, -10], // Parvis de Saint-Roch (32 x 24)
  ['#', -150, -144, -34, -28], // notch NW
  [',', -174, -156, -40, -10], // Jardins du Cloître
  ['#', -162, -156, -24, -18], // garden pavilion block
  [',', -156, -150, -22, -14], // gardens <-> parvis
  [',', -170, -140, -52, -40], // Place Haute (DEF post)
  [',', -146, -140, -40, -34], [',', -128, -122, -38, -34], // Place Haute / Rue Haute -> parvis
  [',', -142, -120, -50, -44], // Rue Haute 1
  [',', -122, -104, -46, -38], // Rue Haute 2 (jog)
  [',', -106, -86, -40, -34], // Rue Haute 3 (jog)
  [',', -90, -80, -46, -38], // Rue Haute 4 -> Jardins (citadel)
  ['C', -116, -104, -34, -22], // Maison du Notable (interior +3)
  [',', -118, -116, -30, -26], // notable west door
  [',', -104, -100, -26, -24], // notable east door
  [',', -104, -80, -14, -8], [',', -90, -80, -10, -6], // Rue de l'Église -> site A
  [',', -100, -94, -24, -14], // east lane parvis/notable -> rue de l'Église
  [',', -94, -84, -24, -14], // Cour de l'Église (old churchyard): the lane and the Rue de l'Église open into a yard

  // ======================= GARE DE TRIAGE (east) =======================
  ['.', 80, 174, 44, 56],                     // quai de fret
  ['.', 80, 174, 36, 44],                     // cour de fret
  ['.', 112, 120, -54, 44],                   // Avenue de la Gare (passage à niveau)
  ['.', 132, 134, 24, 36],                    // ruelle du Dépôt
  ['.', 104, 112, 24, 36],                    // allée des Entrepôts
  ['.', 82, 174, 20, 24],                     // Rue du Triage
  ['.', 82, 174, -28, 20],                    // faisceau de voies
  // platforms (+1.5), cut by the level crossing, steps at both ends
  [';', 92, 110, 10, 14], [';', 122, 166, 10, 14],
  [';', 92, 110, -2, 2], [';', 122, 166, -2, 2],
  [';', 92, 110, -14, -10], [';', 122, 166, -14, -10],
  ['>', 88, 92, 10, 14], ['<', 110, 112, 10, 14], ['>', 120, 122, 10, 14], ['<', 166, 170, 10, 14],
  ['>', 88, 92, -2, 2], ['<', 110, 112, -2, 2], ['>', 120, 122, -2, 2], ['<', 166, 170, -2, 2],
  ['>', 88, 92, -14, -10], ['<', 110, 112, -14, -10], ['>', 120, 122, -14, -10], ['<', 166, 170, -14, -10],
  // Bastion (+3) -> stairs down -> Place de la Gare
  [',', 80, 86, -40, -34], ['<', 86, 92, -40, -34], ['.', 92, 120, -40, -28],
  ['.', 100, 174, -54, -40],                  // Place de la Gare (DEF post)
];

// Enterable rooms: covered floor + thin walls on the listed sides. side: N (z = z0), S (z = z1), W (x = x0), E (x = x1).
// open: [centre, kind] with kind 'door' (1.6 m), 'win' (1.8 m), 'gate' (3.2 m). ch: covered char (c 0, e +1.5, C +3, H hall 0).
export const ROOMS = [
  // Vieille-Ville: interiors are carved directly (Halle aux poissons, Café, Maison du Notable)
  // Gare
  { ch: 'c', m: 'corr', x0: 86, x1: 104, z0: 24, z1: 36, y: 0, sides: { N: [[92, 'door'], [99, 'win']], S: [[90, 'gate'], [99, 'gate']], E: [[30, 'door']] } },   // Entrepôt 1
  { ch: 'c', m: 'corr', x0: 146, x1: 166, z0: 24, z1: 36, y: 0, sides: { N: [[152, 'door'], [160, 'win']], S: [[150, 'gate'], [161, 'gate']] } },               // Entrepôt 2
  { ch: 'H', m: 'stone', x0: 120, x1: 166, z0: -40, z1: -28, y: 0, sides: {                                                                                     // Hall de la Gare
    N: [[126, 'win'], [133, 'gate'], [141, 'win'], [149, 'gate'], [157, 'win'], [162, 'door']],
    S: [[125, 'gate'], [131, 'win'], [137, 'gate'], [143, 'win'], [149, 'gate'], [155, 'win'], [161, 'gate']],
    W: [[-36, 'win'], [-31, 'gate']] } },
];
export const HALL_CEIL = 7; // clear height of the station hall ('H')
const OPEN_W = { door: 1.6, win: 1.8, gate: 3.2 };
export const ROOM_WALLS = [];
for (const r of ROOMS) {
  for (const [side, list] of Object.entries(r.sides)) {
    const alongX = side === 'N' || side === 'S';
    const p = side === 'N' ? r.z0 : side === 'S' ? r.z1 : side === 'W' ? r.x0 : r.x1;
    const a = alongX ? r.x0 : r.z0, b = alongX ? r.x1 : r.z1;
    ROOM_WALLS.push({ m: r.m, ax: alongX ? 'x' : 'z', p, a, b, y: r.y, ceil: r.ch === 'H' ? HALL_CEIL : undefined,
      open: list.map(([t, k]) => [t - OPEN_W[k] / 2, t + OPEN_W[k] / 2, k]) });
  }
}

// The four bomb sites. Each round activates some of them (see OBJECTIVES); both teams are told which.
export const ALL_SITES = [
  { name: 'D', x: -136, z: 10, radius: 7, zone: 'Place du Marché' },
  { name: 'A', x: -56, z: -12, radius: 7, zone: "Place de l'Église" },
  { name: 'B', x: 60, z: -6, radius: 7, zone: 'Chantier naval' },
  { name: 'C', x: 140, z: 0, radius: 7, zone: 'Quais de la Gare' },
];

// Spawn blocks: two staggered rows of 10 points (x0 + 2k, z) / (x0 + 1 + 2k, z2). yaw 0 looks -z.
const rows = (x0, z, z2, yaw) => [z, z2].flatMap((zz, r) => Array.from({ length: 10 }, (_, k) => ({ x: x0 + 2 * k + r, z: zz, yaw })));
// ATK insertions (landing points on the coast) and DEF posts (where each site's defenders start).
export const INSERTIONS = {
  ouest: rows(-160, 49, 52, 0),               // Port de pêche
  port: null,                                 // layout.SPAWNS.ATK (quay in front of the landing ship)
  est: rows(134, 49, 52, 0),                  // quai de fret
};
export const POSTS = {
  D: rows(-166, -45, -43, Math.PI),           // Rue Haute
  A: null, B: null,                           // layout.SPAWNS.DEF (citadel yard) for the classic A/B pair
  C: rows(130, -50, -46, Math.PI),            // Place de la Gare
};
// Objective sets by number of active sites. insertion = ATK spawn; def = DEF spawn source per site.
export const OBJECTIVES = {
  2: [
    { sites: ['A', 'B'], insertion: ['port'] },
    { sites: ['D', 'A'], insertion: ['ouest'] },
    { sites: ['B', 'C'], insertion: ['est'] },
  ],
  3: [
    { sites: ['D', 'A', 'B'], insertion: ['ouest', 'port'] },
    { sites: ['A', 'B', 'C'], insertion: ['port', 'est'] },
  ],
  4: [{ sites: ['D', 'A', 'B', 'C'], insertion: ['ouest', 'port', 'est'] }],
};
// Region (x range) that matters for each objective set: shadows are fitted to it (texel density as on the Citadelle).
export const REGION = { D: [-176, -40], A: [-90, 10], B: [10, 90], C: [40, 176] };

export const GRAND_LABELS = [
  ['Place Haute', -155, -47], ['Rue Haute', -112, -42], ['Jardins du Cloître', -165, -28], ['Parvis Saint-Roch', -134, -24], ['Notable', -110, -28],
  ["Rue de l'Église", -92, -11], ['Grande Place', -136, 0], ['Café', -106, 8], ['Tisserand', -167, 12], ['Placette du Four', -103, 18], ['Cour du Pressoir', -89, 6], ['Cour de l\'Église', -89, -20], ['Rue du Marché', -88, 21],
  ['Cour des Pêcheurs', -149, 32], ['Halle aux poissons', -126, 34], ['Cour du Four', -106, 32], ['Port de pêche', -140, 50], ['Escalier du Port', -89, 32],
  ['Gare', 143, -34], ['Place de la Gare', 140, -48], ['Quais', 140, 6], ['Voies', 100, 4], ['Passage à niveau', 116, 4],
  ['Rue du Triage', 150, 22], ['Entrepôt 1', 95, 30], ['Entrepôt 2', 156, 30], ['Quai de fret', 140, 48], ['Dépôt', 133, 30],
  ['Descente du Bastion', 86, -37],
].map(([text, x, z]) => ({ text, x, z }));

// CTF and chokes are unchanged (the Citadelle). Extra chokes for the defenders' roamers on the wings:
export const GRAND_CHOKES = [[-168, -8], [-136, -8], [-98, -6], [-170, 25], [-148, 24], [-126, 24], [-108, 25], [-90, 26], [-111, 8], [-153, -18], [-125, -36], [-80, 22], [-80, -8],
  [116, 22], [116, -26], [90, 0], [168, 0], [133, 30], [80, -2], [78, 39], [89, -37]];
