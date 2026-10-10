// In-game Lagos map (and the landing page's map): layer chips, city tabs, place cards with
// things to do, the travel picker (trek / bike / danfo / taxi / free ride) and the short
// travel screen while you are on the way.
import { h, ic, setChildren } from './dom.js';
import { naira } from '../game/content.js';
import { PLACE_BY_ID, distanceKm, familyAt } from '../game/life.js';
import { drawPoster } from '../map/posters.js';
import { countdown } from '../game/clock.js';

const CHIPS = [
  ['traffic', '🚗', 'Go-slow'],
  ['billboards', '🪧', 'Billboards'],
  ['sea', '🌊', 'Sea'],
  ['gov', '🏛️', 'Gov'],
  ['names', '🏷️', 'Names'],
];

/**
 * @param {object} o
 * @param {HTMLElement} o.root
 * @param {object} o.game
 * @param {object} o.map from createLagosMap
 * @param {(text: string, opts?: object) => void} o.toast
 * @param {(go: object) => Promise<void>|void} o.onArrive move the player (walkable places)
 * @param {(open: boolean) => void} [o.onToggle]
 * @param {(go: object) => Promise<void>} [o.onJourney] show the trip on the road in 3D (else a travel card)
 * @param {() => void} [o.onSkip] skip the journey scene
 * @param {() => void} [o.onAds] open the phone's Billboards app
 */
export function createMapView({ root, game, map, toast, onArrive, onToggle = () => {}, onJourney, onSkip, onAds }) {
  let open = false;
  let mode = 'game'; // 'game' | 'landing'
  let selected = null;
  let landingPick = null;

  const chips = h('div.mv-chips', { attrs: { role: 'group', 'aria-label': 'Map layers' } }, CHIPS.map(([id, emoji, label]) => {
    const b = h('button.mv-chip', { type: 'button', attrs: { 'aria-pressed': String(map.layers[id] !== false) } }, h('span', { text: emoji, attrs: { 'aria-hidden': 'true' } }), label);
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      map.setLayer(id, on);
      if (id === 'gov' && on) map.focus('govhouse', { dist: 60 });
      if (id === 'sea' && on) map.focus([30, -10], { dist: 140 });
    });
    return b;
  }));
  const title = h('div.mv-cities', null, h('span.mv-city', { text: '📍 Lagos', attrs: { 'aria-current': 'true' } }), h('small.mv-hint', { text: 'Tap anything on the map' }));
  const walkBtn = h('button.ac-btn.is-yellow.mv-walk', { type: 'button', on: { click: () => walkYaba() } }, '🚶', 'Walk Yaba');
  const closeBtn = h('button.ac-iconbtn.mv-close', { type: 'button', attrs: { 'aria-label': 'Close map' }, on: { click: () => close() } }, ic('x'));
  const top = h('div.mv-top', null, title, closeBtn);
  // On-screen zoom / turn buttons, for laptops whose touchpad doesn't pinch.
  const zbtn = (label, text, fn) => h('button.mv-zoom-btn', { type: 'button', attrs: { 'aria-label': label, title: label }, on: { click: fn } }, text);
  const zoom = h('div.mv-zoom', { attrs: { role: 'group', 'aria-label': 'Zoom' } },
    zbtn('Zoom in', '+', () => map.zoomBy(0.7)),
    zbtn('Zoom out', '−', () => map.zoomBy(1.4)),
    zbtn('Turn left', '⟲', () => map.rotateBy(-Math.PI / 8)),
    zbtn('Turn right', '⟳', () => map.rotateBy(Math.PI / 8)));
  const card = h('section.mv-card', { hidden: true, attrs: { 'aria-live': 'polite' } });
  const el = h('div.mv', { hidden: true }, top, h('div.mv-row', null, chips, walkBtn), zoom, card);
  root.append(el);

  /* ---------------------------------------------------------------- open / close */
  function show(o = {}) {
    mode = o.mode || 'game';
    el.classList.toggle('is-landing', mode === 'landing');
    closeBtn.hidden = mode === 'landing';
    walkBtn.hidden = mode === 'landing';
    top.hidden = false;
    el.hidden = false;
    open = true;
    const here = mode === 'game' ? game.here : null;
    map.setHere(here);
    map.show({ focus: o.focus || (mode === 'game' ? (here || 'grace') : null), dist: o.dist ?? 70 });
    if (mode === 'landing') map.tour(true);
    else map.tour(false);
    if (o.place) pick({ type: 'place', place: PLACE_BY_ID[o.place] });
    else hideCard();
    onToggle(true);
  }

  function close() {
    if (!open) return;
    open = false;
    el.hidden = true;
    hideCard();
    map.hide();
    if (game.trip) game.endTrip();
    onToggle(false);
  }

  function hideCard() { card.hidden = true; selected = null; }

  /* ---------------------------------------------------------------- places */
  /**
   * Something on the map was tapped: a place pin or building, a billboard, a neighbourhood,
   * a bridge, a road, the lagoon… Every tap shows a card.
   * @param {{type: string, place?: object, name?: string}} info (a bare place object also works)
   */
  function pick(info) {
    if (!info) return;
    if (!info.type) info = { type: 'place', place: info };
    map.tour(false);
    if (info.type === 'place') {
      const p = info.place;
      if (!p) return;
      map.focus(p.id, { dist: 45 });
      selected = p;
      if (mode === 'landing') { landingPick?.(info); return; }
      renderPlace();
      return;
    }
    selected = null;
    if (mode === 'landing' && info.type !== 'billboard' && info.type !== 'house') { landingPick?.(info); return; }
    renderInfo(info);
  }

  /** Cards for things that are not places: billboards, areas, bridges, roads, water. */
  function renderInfo(info) {
    const head = (emoji, title, sub) => h('div.mv-card-head', null,
      h('span.mv-card-emoji', { text: emoji, attrs: { 'aria-hidden': 'true' } }),
      h('div', null, h('h3', { text: title }), sub ? h('p', { text: sub }) : null),
      h('button.ac-iconbtn', { type: 'button', attrs: { 'aria-label': 'Close' }, on: { click: hideCard } }, ic('x')));
    if (info.type === 'billboard') {
      const c = h('canvas.mv-poster', { width: 512, height: 224, attrs: { 'aria-label': `Poster: ${info.poster?.title || ''}` } });
      drawPoster(c.getContext('2d'), 0, 0, 512, 224, { ...info.poster, booked: info.poster?.booked });
      setChildren(card,
        head('🪧', info.poster?.title || 'Billboard', info.poster?.church || ''),
        c,
        h('p.mv-desc', { text: `${info.poster?.sub || ''}. Churches across Lagos put their programmes on these boards.` }),
        mode === 'game' ? h('button.ac-btn.is-primary.is-block', { type: 'button', on: { click: () => { close(); onAds?.(); } } }, '📣 Put your church programme on a billboard') : null);
    } else if (info.type === 'house') {
      const f = familyAt(info.key, info.area);
      const act = (fn) => { const r = fn(); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); };
      setChildren(card,
        head('🏠', f.name, `${info.area} · ${f.children} ${f.children === 1 ? 'child' : 'children'}`),
        h('p.mv-desc', { text: `They ${f.faith}. ${f.job[0].toUpperCase()}${f.job.slice(1)}. Prayer need: ${f.need}.` }),
        mode === 'game'
          ? h('div.mv-family-btns', null,
            h('button.ac-btn.is-primary', { type: 'button', on: { click: () => act(() => game.visitFamily(info.key, info.area)) } }, '🚪 Visit & invite to church'),
            h('button.ac-btn', { type: 'button', on: { click: () => act(() => game.prayFamily(info.key, info.area)) } }, '🙏 Pray for them'))
          : null);
    } else if (info.type === 'area') {
      const places = (info.places || []).map((id) => PLACE_BY_ID[id]).filter(Boolean);
      setChildren(card,
        head(/Lagoon|Ocean/.test(info.name) ? '🌊' : info.house ? '🏘️' : '📍', info.name, info.house ? 'Houses and families: neighbours to invite to church' : 'Lagos'),
        h('p.mv-desc', { text: info.text }),
        places.length ? h('div.mv-acts', null, places.map((p) => h('button.mv-act.is-link', { type: 'button', on: { click: () => pick({ type: 'place', place: p }) } },
          h('span.mv-act-ic', { text: p.emoji }), h('span.mv-act-body', null, h('b', { text: p.name }), h('small', { text: p.soon ? 'Coming soon' : p.desc.slice(0, 80) })), ic('chevron-right')))) : null,
        info.house && mode === 'game' ? h('p.ac-note', { text: 'Every house is a family God loves. Invite your neighbours: use "Invite Someone to Church" on your Today tab.' }) : null);
    } else {
      setChildren(card, head(info.emoji || '📍', info.title || 'Lagos'), h('p.mv-desc', { text: info.text || '' }));
    }
    card.hidden = false;
  }

  function renderPlace() {
    const p = selected;
    if (!p) return;
    const s = game.state;
    const here = game.here === p.id;
    const km = distanceKm(game.here, p.id);
    const acts = game.activities(p.id);
    const isChurch = p.id === 'grace';
    setChildren(card,
      h('div.mv-card-head', null,
        h('span.mv-card-emoji', { text: p.emoji, attrs: { 'aria-hidden': 'true' } }),
        h('div', null, h('h3', { text: p.name }), h('p', { text: `${p.area}${here ? ' · you are here' : ` · ${km} km away`}` })),
        h('button.ac-iconbtn', { type: 'button', attrs: { 'aria-label': 'Close' }, on: { click: hideCard } }, ic('x'))),
      h('p.mv-desc', { text: p.desc }),
      p.soon ? h('p.mv-soon', null, h('b', { text: '🚧 Coming soon. ' }), 'We are building Amen City step by step. This place opens in a coming update.') : null,
      isChurch && s ? churchLine() : null,
      acts.length ? h('div.mv-acts', null, acts.map((a) => h(`div.mv-act${a.shady ? '.is-shady' : ''}`, null,
        h('span.mv-act-ic', { text: a.emoji, attrs: { 'aria-hidden': 'true' } }),
        h('span.mv-act-body', null, h('b', { text: a.name }), a.shady ? h('span.ac-tag', { text: 'temptation' }) : null,
          h('small', { text: [a.naira ? naira(a.naira) : 'Free', a.energy > 0 ? `${a.energy} energy` : a.energy < 0 ? `+${-a.energy} energy` : '', !here ? '' : a.reason || ''].filter(Boolean).join(' · ') })),
        h('button.ac-btn.is-sm', {
          type: 'button', class: here && a.ok && !a.shady ? 'is-green' : '', disabled: !here || !a.ok,
          on: { click: () => { const r = game.activity(a.id); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); renderPlace(); } },
        }, here ? 'Do' : 'Go first')))) : null,
      p.soon ? null : here
        ? (game.trip ? h('button.ac-btn.is-primary.is-block', { type: 'button', on: { click: () => picker('home') } }, '🏠', 'Go home') : p.walk ? h('button.ac-btn.is-primary.is-block', { type: 'button', on: { click: close } }, 'Back to the street') : null)
        : h('button.ac-btn.is-primary.is-block', { type: 'button', on: { click: () => picker(p.id) } }, 'Go here', ic('arrow-right', { size: 18 })));
    card.hidden = false;
  }

  function churchLine() {
    const c = game.clock;
    const plan = game.plan;
    const today = plan?.items?.length ? plan.items.map((x) => `${x.emoji} ${x.name} ${x.time}`).join(' · ') : null;
    return h('p.mv-church', null, h('b', { text: c?.current ? `${c.current.name} is on now!` : c?.next ? `Next: ${c.next.name}, ${c.next.when}` : '' }), today ? h('span', { text: ` Today: ${today}` }) : null);
  }

  /* ---------------------------------------------------------------- travel picker */
  function picker(to) {
    const p = PLACE_BY_ID[to];
    if (!p || !game.state) return;
    if (game.here === to) { toast(`You are already at ${p.name}.`); return; }
    const quotes = game.quotes(to);
    const km = quotes[0]?.km ?? 0;
    const sheet = h('div.mv-travel', { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `How do you want to go to ${p.name}?` } });
    const closeSheet = () => sheet.remove();
    setChildren(sheet, h('div.mv-travel-card', null,
      h('div.mv-card-head', null,
        h('span.mv-card-emoji', { text: p.emoji, attrs: { 'aria-hidden': 'true' } }),
        h('div', null, h('h3', { text: `Go to ${p.name}` }), h('p', { text: `${km} km · how will you go?` })),
        h('button.ac-iconbtn', { type: 'button', attrs: { 'aria-label': 'Cancel' }, on: { click: closeSheet } }, ic('x'))),
      h('div.mv-modes', null, quotes.map((q) => h('button.mv-mode', {
        type: 'button', disabled: !q.ok,
        on: { click: () => { closeSheet(); go(to, q.mode.id); } },
      },
      h('span.mv-mode-ic', { text: q.ownBike ? '🚲' : q.mode.emoji, attrs: { 'aria-hidden': 'true' } }),
      h('span.mv-mode-body', null, h('b', { text: q.ownBike ? 'Your bicycle' : q.mode.name }), h('small', { text: q.ok ? q.mode.blurb : q.reason })),
      h('span.mv-mode-meta', null,
        h('b', { text: q.naira ? naira(q.naira) : 'Free' }),
        h('small', { text: `${countdown(q.minutes)}${q.energy ? ` · −${q.energy}⚡` : ''}` }))))),
      p.fee ? h('p.ac-note', { text: `Gate fee at ${p.name}: ${naira(p.fee)}.` }) : null));
    sheet.addEventListener('pointerdown', (e) => { if (e.target === sheet) closeSheet(); });
    root.append(sheet);
    sheet.querySelector('.mv-mode:not([disabled])')?.focus({ preventScroll: true });
  }

  async function go(to, modeId) {
    const r = game.travel(to, modeId);
    if (!r?.ok) {
      if (r?.reason) toast(r.reason, { tone: 'warn' });
      if (r?.stuck) setTimeout(() => picker(to), 300);
      return;
    }
    const p = PLACE_BY_ID[to];
    if (onJourney) {
      // See yourself on the road with the transport you picked.
      if (open) { open = false; el.hidden = true; hideCard(); map.hide(); onToggle(false); }
      const banner = journeyBanner(r);
      try { await onJourney(r); } finally { banner.remove(); }
    } else await travelScreen(r);
    if (r.walk) {
      if (open) { open = false; el.hidden = true; hideCard(); map.hide(); onToggle(false); }
      await onArrive?.(r);
    } else {
      // A trip: you are at the place on the map, with what you can do there.
      if (!open) show({ place: to, dist: 45 });
      map.setHere(to);
      selected = p;
      renderPlace();
    }
  }

  /** Banner over the 3D journey: where you are going, how long it takes, and Skip. */
  function journeyBanner(r) {
    const p = PLACE_BY_ID[r.to];
    const name = { trek: 'Trekking', bike: game.state?.items?.bike ? 'Cycling' : 'On an okada', danfo: 'In a danfo', taxi: 'In a taxi', free: 'Free ride' }[r.mode] || 'On the way';
    const b = h('div.mv-journey', { attrs: { role: 'status' } },
      h('span.mv-journey-emoji', { text: { trek: '🚶', bike: '🏍️', danfo: '🚐', taxi: '🚕', free: '🚗' }[r.mode] || '🚕' }),
      h('span', null, h('b', { text: `${name} to ${p.name}` }), h('small', { text: `${p.area} · ${countdown(r.minutes)} in Lagos traffic` })),
      h('button.ac-btn.is-sm', { type: 'button', on: { click: () => onSkip?.() } }, 'Skip'));
    root.append(b);
    return b;
  }

  /** "🚕 Taxi to Elegushi Beach · 42 min" with the vehicle crossing the screen. */
  function travelScreen(r) {
    return new Promise((resolve) => {
      const p = PLACE_BY_ID[r.to];
      const vehicle = h('span.mv-go-vehicle', { text: r.mode === 'bike' && game.state?.items?.bike ? '🚲' : { trek: '🚶', bike: '🏍️', danfo: '🚐', taxi: '🚕', free: '🚗' }[r.mode] || '🚕' });
      const scr = h('div.mv-go', { attrs: { role: 'status' } },
        h('div.mv-go-card', null,
          h('p.mv-go-to', { text: `On the way to ${p.name}` }),
          h('p.mv-go-sub', { text: `${p.area} · ${countdown(r.minutes)} in Lagos traffic` }),
          h('div.mv-go-road', null, vehicle, h('span.mv-go-flag', { text: p.emoji }))));
      root.append(scr);
      const ms = Math.min(3200, 1400 + r.minutes * 25);
      vehicle.style.animationDuration = `${ms}ms`;
      setTimeout(() => { scr.classList.add('is-done'); resolve(); setTimeout(() => scr.remove(), 400); }, ms);
    });
  }

  function walkYaba() {
    const here = game.here;
    if (['home', 'grace', 'market'].includes(here) && !game.trip) { close(); return; }
    picker('market');
  }

  return {
    el,
    get open() { return open; },
    show,
    close,
    pick,
    picker,
    /** On the landing page a pick asks you to sign up. */
    set onLandingPick(fn) { landingPick = fn; },
    /** Go home from anywhere (the Home button). */
    goHome() {
      if (game.here === 'home' && !game.trip) { toast('You are at home. 🏠'); return; }
      picker('home');
    },
    refresh() { if (open && selected && !card.hidden) renderPlace(); },
  };
}
