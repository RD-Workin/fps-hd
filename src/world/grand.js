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

  // ======================= VIEILLE-VILLE (west) =======================
  // Haute-Ville (+3)
  [',', -174, -80, -46, -42],                 // Rue Haute (-> Jardins)
  [',', -170, -80, -10, -6],                  // Rue de l'Église (-> site A)
  [',', -166, -112, -58, -56],                // ruelle des Remparts
  [',', -170, -168, -58, -10],                // ruelle Ouest (1 cell)
  [',', -150, -146, -58, -10],                // rue des Tanneurs (2 cells)
  [',', -128, -126, -56, -36],                // Rue Haute -> Placette
  [',', -136, -118, -36, -22],                // Placette du Puits
  [',', -146, -136, -30, -28],                // Tanneurs -> Placette
  [',', -124, -122, -22, -10],                // Placette -> Rue de l'Église
  [',', -114, -110, -42, -10],                // rue du Notable (2 cells)
  [',', -96, -92, -42, -10],                  // rue du Four (2 cells)
  ['C', -170, -168, -40, -30],                // covered passage under a house (ruelle Ouest)
  ['C', -150, -146, -22, -16],                // voûte des Tanneurs
  // Marché (+1.5)
  ['^', -170, -168, -6, -2], ['^', -150, -146, -6, -2], ['^', -114, -110, -6, -2], ['^', -96, -92, -6, -2],
  [';', -170, -168, -2, 26], [';', -150, -146, -2, 2], [';', -114, -110, -2, 26], [';', -96, -92, -2, 20],
  [';', -150, -122, 2, 18],                   // Place du Marché (site D)
  [';', -136, -132, 18, 20], [';', -150, -148, 18, 20],
  [';', -174, -80, 20, 24],                   // Rue du Marché (-> Cour des Pêcheurs)
  [';', -110, -96, 10, 12],                   // passage du Four
  [';', -140, -136, 24, 26],
  // harbour (0)
  ['^', -170, -168, 26, 30], ['^', -140, -136, 26, 30], ['^', -114, -110, 26, 30],
  ['.', -170, -168, 30, 44], ['.', -140, -136, 30, 44], ['.', -114, -110, 30, 44], ['.', -100, -96, 34, 44],
  ['.', -174, -80, 34, 36],                   // Rue des Pêcheurs (1 cell)
  ['.', -174, -80, 44, 56],                   // Port de pêche
  ['^', -92, -88, 24, 28], ['.', -92, -88, 28, 34], // Escalier du Port: Rue du Marché -> harbour
  // cross alleys (more ways round each block)
  [',', -168, -150, -26, -24], [',', -146, -128, -52, -50], [',', -110, -96, -18, -16], [';', -168, -150, 16, 18], ['.', -168, -140, 30, 32], ['.', -136, -114, 40, 42],

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
  // Vieille-Ville
  { ch: 'C', x0: -110, x1: -96, z0: -36, z1: -24, y: 3, sides: { W: [[-33, 'door'], [-28, 'win']], E: [[-34, 'win'], [-27, 'door']] } },          // Maison du Notable
  { ch: 'e', x0: -122, x1: -114, z0: 4, z1: 14, y: 1.5, sides: { W: [[6, 'win'], [9, 'door'], [12, 'win']], E: [[11, 'door']] } },                  // Café du Marché
  { ch: 'e', x0: -168, x1: -150, z0: 6, z1: 14, y: 1.5, sides: { W: [[10, 'door']], E: [[7.5, 'win'], [10.5, 'door'], [13, 'win']] } },             // Atelier du Tisserand
  { ch: 'c', x0: -160, x1: -146, z0: 36, z1: 44, y: 0, sides: { N: [[-153, 'door']], S: [[-157, 'win'], [-151, 'gate']] } },                        // Remise des pêcheurs
  { ch: 'c', x0: -130, x1: -118, z0: 36, z1: 44, y: 0, sides: { N: [[-122, 'door']], S: [[-127, 'gate'], [-121, 'win']] } },                        // Saurisserie
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
  ['Haute-Ville', -140, -50], ['Rue Haute', -100, -44], ['Placette', -127, -29], ['Notable', -103, -30], ['Tanneurs', -148, -24],
  ["Rue de l'Église", -120, -8], ['Marché', -136, 10], ['Café du Marché', -118, 9], ['Tisserand', -159, 10], ['Rue du Marché', -100, 22],
  ['Port de pêche', -140, 50], ['Remise', -153, 40], ['Saurisserie', -124, 40], ['Escalier du Port', -90, 30],
  ['Gare', 143, -34], ['Place de la Gare', 140, -48], ['Quais', 140, 6], ['Voies', 100, 4], ['Passage à niveau', 116, 4],
  ['Rue du Triage', 150, 22], ['Entrepôt 1', 95, 30], ['Entrepôt 2', 156, 30], ['Quai de fret', 140, 48], ['Dépôt', 133, 30],
  ['Descente du Bastion', 86, -37],
].map(([text, x, z]) => ({ text, x, z }));

// CTF and chokes are unchanged (the Citadelle). Extra chokes for the defenders' roamers on the wings:
export const GRAND_CHOKES = [[-169, 0], [-148, 0], [-112, 0], [-94, 0], [-138, 28], [-112, 28], [-127, -30], [-80, 22], [-80, -8],
  [116, 22], [116, -26], [90, 0], [168, 0], [133, 30], [80, -2], [78, 39], [89, -37]];
