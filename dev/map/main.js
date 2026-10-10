// Lagos map harness: ?hour=19 to preview the night, ?focus=govhouse to fly to a place.
import { createContext } from '../../src/engine/context.js';
import { createLagosMap } from '../../src/map/lagos.js';
import '../../src/map/map.css';

const params = new URLSearchParams(location.search);
const ctx = createContext(document.getElementById('world'), { quality: params.get('quality') || undefined });
const t0 = performance.now();
const map = createLagosMap(ctx, { root: document.getElementById('ui'), onPick: (p) => { window.__picked = p; console.log('pick', p.type); } });
const hour = params.get('hour') ? Number(params.get('hour')) : undefined;
map.show({ hour, focus: params.get('focus') || undefined });
map.setHere('home');
if (params.get('tour')) map.tour(true);
ctx.start();
window.__map = { map, ctx, buildMs: Math.round(performance.now() - t0) };
