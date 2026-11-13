// Map layout data — "Opération Nova" (meters, floor y=0). See docs/decisions/world.md.
export const BOUNDS = { minX: -54, maxX: 54, minZ: -44, maxZ: 44 };

// Solid building blocks [x0, x1, z0, z1, hMin, hMax, style]. style: plaster | stone | warehouse
export const BLOCKS = [
  // perimeter (2 m thick, encloses the map)
  [-56, 56, -46, -44, 8, 12, 'plaster'], [-56, 56, 44, 46, 8, 11, 'plaster'],
  [-56, -54, -44, 44, 8, 12, 'plaster'], [54, 56, -44, 44, 8, 12, 'warehouse'],
  // north backs
  [-54, -14, -44, -36, 8, 11, 'plaster'], [14, 54, -44, -36, 8, 10, 'warehouse'],
  // palais (around Porte Mid)
  [-18, -6, -28, -12, 10, 12, 'stone'], [6, 18, -28, -12, 10, 12, 'stone'],
  // west / east outer rows
  [-47, -34, -8, 28, 7, 10, 'plaster'], [34, 47, -8, 28, 7, 10, 'warehouse'],
  // inner rows (Traverse z[8,13] between a/b)
  [-29, -6, -7, 8, 7, 10, 'plaster'], [-29, -6, 13, 28, 7, 10, 'plaster'],
  [6, 29, -7, 8, 7, 10, 'plaster'], [6, 29, 13, 28, 7, 10, 'plaster'],
  // south (ATK street z[28,40])
  [-54, -36, 38, 44, 7, 10, 'plaster'], [-36, -14, 40, 44, 7, 10, 'plaster'],
  [36, 54, 38, 44, 7, 10, 'plaster'], [14, 36, 40, 44, 7, 10, 'plaster'],
];

export const SPAWNS = {
  ATK: [-6, -3, 0, 3, 6].map(x => ({ x, z: 36, yaw: 0 })),
  DEF: [-6, -3, 0, 3, 6].map(x => ({ x, z: -40, yaw: Math.PI })),
};
export const SITES = [{ name: 'A', x: -32, z: -22, radius: 6 }, { name: 'B', x: 32, z: -22, radius: 6 }];

export const LABELS = [
  ['Spawn ATK', 0, 34], ['Spawn DEF', 0, -38], ['Site A', -32, -26], ['Site B', 32, -26], ['Long A', -50.5, 10], ['Long B', 50.5, 10],
  ['Ruelle A', -31.5, 10], ['Tunnel B', 31.5, 10], ['Arches A', -12, -9.5], ['Arches B', 12, -9.5], ['Marché', 0, 22],
  ['Fontaine', 0, 6], ['Porte Mid', 0, -21], ['Arrière A', -16, -32], ['Arrière B', 16, -32], ['Traverse A', -18, 10.5], ['Traverse B', 18, 10.5],
].map(([text, x, z]) => ({ text, x, z }));

// Navigation hints for bots (all points walkable, floor y=0). routes[site] = ATK spawn -> site polylines [[x,z]...].
export const NAV = {
  routes: {
    A: [
      [[-20, 33], [-50.5, 32], [-50.5, 0], [-44, -14], [-32, -20]],                 // Long A
      [[-20, 33], [-31.5, 30], [-31.5, -4], [-32, -20]],                             // Ruelle A
      [[0, 30], [0, 0], [-4, -9.5], [-20, -10], [-30, -18]],                         // Mid -> Arches A
    ],
    B: [
      [[20, 33], [50.5, 32], [50.5, 0], [44, -14], [32, -20]],                       // Long B
      [[20, 33], [31.5, 30], [31.5, -4], [32, -20]],                                 // Tunnel B
      [[0, 30], [0, 0], [4, -9.5], [20, -10], [30, -18]],                            // Mid -> Arches B
    ],
  },
  // Defender hold spots near cover (yaw: 0 looks -z, PI looks +z, PI/2 looks -x).
  holds: {
    A: [{ x: -40, z: -30, yaw: Math.PI }, { x: -25, z: -31, yaw: 2.5 }, { x: -36, z: -17.2, yaw: Math.PI }, { x: -21, z: -20, yaw: -2.0 }],
    B: [{ x: 40, z: -30, yaw: Math.PI }, { x: 25, z: -31, yaw: -2.5 }, { x: 36, z: -17.2, yaw: Math.PI }, { x: 21, z: -20, yaw: 2.0 }],
  },
  chokes: [[-50.5, -6], [-31.5, -7], [-12, -9.5], [0.5, -18], [12, -9.5], [31.5, -7], [50.5, -6], [-16, -32], [16, -32]],
};
