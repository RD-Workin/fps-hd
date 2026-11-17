// Bot skill levels (difficulty). Multipliers / overrides applied on top of the weapon stats (DIFFICULTY / SNIPER),
// so 'normal' = the balanced baseline measured on the bench (every multiplier 1, every value = the old constant).
// Applies to the bots of the team facing the player; the player's teammates always play 'normal'.
export const SKILLS = {
  easy: {
    label: 'RECRUE',
    // aim / gun handling
    accuracy: 0.6, headshot: 0.4, trackTime: 1.6, trackMin: 0.7, turnRate: 0.6, aimTol: 0.7, pause: 1.5,
    // reaction / perception
    reaction: 1.7, perceive: 0.2, view: 0.75, fov: 0.85, hearing: 0.7, peripheralMiss: 0.6, holdReact: 0.85, holdPreAim: 0.3,
    // decisions / tactics
    coverHp: 25, coverOnReload: false, standStill: 0.4, crouchSpray: 0.2, hunt: 3, shareIntel: false,
    regroup: false, rotateWindow: 10, rotateNeed: 0.45, threatRadius: 14,
    // Ops de nuit: sight in the dark (x NIGHT_SIGHT.dark), lamp discipline (0 always on, 1 off when holding, 2 also off when sneaking)
    nightView: 0.8, lamp: 0,
  },
  normal: {
    label: 'NORMAL',
    accuracy: 1, headshot: 1, trackTime: 1, trackMin: 1, turnRate: 1, aimTol: 1, pause: 1,
    reaction: 1, perceive: 0.12, view: 1, fov: 1, hearing: 1, peripheralMiss: 0.35, holdReact: 0.5, holdPreAim: 0.7,
    coverHp: 45, coverOnReload: true, standStill: 0, crouchSpray: 0.45, hunt: 6, shareIntel: false,
    regroup: true, rotateWindow: 20, rotateNeed: 0.3, threatRadius: 24,
    nightView: 1, lamp: 1,
  },
  veteran: {
    label: 'VÉTÉRAN',
    accuracy: 1.3, headshot: 1.8, trackTime: 0.65, trackMin: 1.3, turnRate: 1.35, aimTol: 1.2, pause: 0.8,
    reaction: 0.65, perceive: 0.09, view: 1.2, fov: 1.1, hearing: 1.3, peripheralMiss: 0.12, holdReact: 0.4, holdPreAim: 0.9,
    coverHp: 60, coverOnReload: true, standStill: 0, crouchSpray: 0.55, hunt: 9, shareIntel: true,
    regroup: true, rotateWindow: 25, rotateNeed: 0.2, threatRadius: 30,
    nightView: 1.2, lamp: 2,
  },
};
export const SKILL_IDS = Object.keys(SKILLS);
