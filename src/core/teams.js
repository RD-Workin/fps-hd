// Who is on whose side. Team play: same `team` field. Mêlée générale (free-for-all, src/game/ffa.js): every actor carries
// an `ffa` state object and has no teammate at all, whatever its `team` field says (the team only picks the uniform).
export const friends = (a, b) => !!a && !!b && a !== b && a.team === b.team && !a.ffa && !b.ffa;
export const foes = (a, b) => !!a && !!b && a !== b && !friends(a, b);
