// Rolling the dice at the start of a life: your role in church, your church tradition and how
// your story begins are chosen for you, like in real life. (You can change role later, from
// your Today tab, the way people move between departments in church.)
import { ROLES, CHURCH_TYPES, STARTS } from './content.js';

/** How often each role comes up: most people start in the pews. */
export const ROLE_WEIGHTS = {
  worshipper: 22, usher: 12, choir: 12, security: 10, media: 9, hospitality: 9, children: 8, prayer: 8, visitor: 5, minister: 5,
};

function weighted(weights, r) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let x = r * total;
  for (const [k, w] of Object.entries(weights)) { if ((x -= w) < 0) return k; }
  return Object.keys(weights)[0];
}

/** Roll a new life: {role, tradition, start}. */
export function rollDestiny(rng = Math.random) {
  const role = weighted(ROLE_WEIGHTS, rng());
  const trads = Object.keys(CHURCH_TYPES);
  const tradition = trads[Math.floor(rng() * trads.length)];
  const start = rng() < 0.5 ? 'home' : 'convert';
  return { role, tradition, start, roleDef: ROLES[role], tradDef: CHURCH_TYPES[tradition], startDef: STARTS[start] };
}
