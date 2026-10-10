// Amen City UI: createUI(ctx, {root, game, onStart}) builds the start screen with the
// appearance editor, the in-game HUD, the bottom dock (Today / Prayer / Shop / Diary),
// modals for events, temptations and the Bible quiz, toasts, help and settings.
import './ui.css';
import './start.css';
import './front.css';
import '../map/map.css';
import { h, store, setChildren } from './dom.js';
import { createStartScreen } from './start.js';
import { createHud } from './hud.js';
import { createDock } from './sheet.js';
import { createDialogs } from './dialogs.js';
import { createFront, isLoggedIn } from './front.js';
import { createMapView } from './mapview.js';
import { createPhone } from './phone/phone.js';
import { FURNITURE_BY_ID, variantOf } from '../game/life.js';
import { drawPoster } from '../map/posters.js';
import { ROLES as GAME_ROLES } from '../game/content.js';
import { naira } from '../game/content.js';
import { countdown } from '../game/clock.js';

/**
 * @typedef {object} UIOptions
 * @property {HTMLElement} [root] container for the UI (default document.body)
 * @property {object} game from createGame (src/game)
 * @property {(profile: {name: string, role: string, tradition: string, appearance: object}) => void} [onStart]
 *   called once the player starts a new life or continues; the game has already begun
 * @property {object|Promise<object>} [kit] a character kit (loadCharacterKit) to reuse for the preview
 * @property {{setMuted?: (m: boolean) => void}} [audio] optional, muted with the sound button
 * @property {{enabled: boolean}} [input] optional, disabled while modals are open
 * @property {boolean} [keys] handle "?" and Esc (default true)
 * @property {object} [map] the Lagos map (createLagosMap): landing page and the in-game Map
 * @property {(go: object) => Promise<void>|void} [onArrive] move the player after travelling to a walkable place
 */

/**
 * @param {object} ctx engine context (ctx.bus, ctx.quality, ctx.assets for the preview)
 * @param {UIOptions} opts
 */
export function createUI(ctx, opts) {
  const { game } = opts;
  const root = opts.root || document.body;
  const bus = ctx?.bus || null;
  const quality = ctx?.quality || store.get('amen.quality', 'medium');
  const el = h('div.amen-ui', { class: quality === 'low' ? 'is-low' : '' });
  root.append(el);
  const offs = [];
  let muted = store.get('amen.sound', 'on') === 'off';
  let inGame = false;
  let modalOpen = false;

  // Saved day length preference (only for the fast local clock; the shared clock is real Lagos time).
  const dayMinutes = Number(store.get('amen.dayMinutes', ''));
  if (dayMinutes > 0 && game.mode === 'local') game.realMinutesPerDay = dayMinutes;

  /* ---------------------------------------------------------------- characters (lazy) */
  let libP = null;
  function getLib() {
    if (!libP) {
      libP = (async () => {
        const mod = await import('../characters/index.js');
        const kit = opts.kit ? await opts.kit : await mod.loadCharacterKit(ctx);
        return { ...mod, kit };
      })();
      libP.catch(() => { libP = null; });
    }
    return libP;
  }

  /* ---------------------------------------------------------------- parts */
  const dialogs = createDialogs({
    root: el,
    game,
    onModal(open) {
      modalOpen = open;
      if (open) game.pause('ui-modal'); else game.resume('ui-modal');
      if (opts.input) opts.input.enabled = !open && inGame;
      bus?.emit('ui:modal', { open });
    },
  });

  const start = createStartScreen({
    root: el,
    game,
    quality,
    getLib,
    onBegin: (profile, how) => begin(profile, how),
  });

  /** Start a new life (or continue the saved one) and enter the game. */
  function begin(profile, how = 'new') {
    let p = profile;
    front.hide();
    mapView?.close();
    if (how === 'continue') {
      const s = game.continueGame();
      if (!s) { dialogs.toast('Could not load your saved life. Start a new one.', { tone: 'warn' }); return null; }
      p = { name: s.name, role: s.role, tradition: s.tradition, appearance: s.appearance };
    } else {
      game.newGame(profile);
    }
    enterGame();
    opts.onStart?.(p);
    return p;
  }

  const hud = createHud({
    game,
    root: el,
    actions: {
      sound: () => setMuted(!muted),
      settings: () => openSettings(),
      help: () => dialogs.help(),
      today: () => dock.select('today'),
      earn: () => dock.select('today'),
      view: (btn) => toggleViewMenu(btn),
    },
  });

  /* ---------------------------------------------------------------- camera views (eye button) */
  let view = store.get('amen.view', 'follow');
  let mouseLook = store.get('amen.mouseLook', 'off') === 'on';
  let viewMenu = null;
  const VIEW_LIST = [['follow', '🎥', 'Behind'], ['close', '🙂', 'Close'], ['wide', '🌄', 'Wide'], ['top', '🛰️', 'From above'], ['first', '👀', 'My eyes']];
  function setView(id) {
    view = id;
    store.set('amen.view', id);
    bus?.emit('ui:view', { mode: id });
    renderViewMenu();
  }
  function setMouseLook(on) {
    mouseLook = on;
    store.set('amen.mouseLook', on ? 'on' : 'off');
    bus?.emit('ui:mouselook', { on });
    if (on) dialogs.toast('Mouse look is on: click the 3D view, then move the mouse to look. Esc to stop.', { emoji: '🖱️' });
    renderViewMenu();
  }
  function renderViewMenu() {
    if (!viewMenu) return;
    setChildren(viewMenu,
      h('p.ac-view-title', { text: 'Camera' }),
      ...VIEW_LIST.map(([id, emoji, label]) => h('button.ac-view-opt', { type: 'button', attrs: { role: 'menuitemradio', 'aria-checked': String(view === id) }, on: { click: () => setView(id) } }, h('span', { text: emoji }), label)),
      h('button.ac-view-opt', { type: 'button', attrs: { role: 'menuitemcheckbox', 'aria-checked': String(mouseLook) }, on: { click: () => setMouseLook(!mouseLook) } }, h('span', { text: '🖱️' }), 'Mouse look'),
      h('p.ac-view-hint', { text: 'Wheel or pinch to zoom · drag to turn · V to switch view' }));
  }
  function toggleViewMenu(btn) {
    if (viewMenu) { closeViewMenu(); return; }
    viewMenu = h('div.ac-view-menu', { attrs: { role: 'menu', 'aria-label': 'Camera view' } });
    renderViewMenu();
    el.append(viewMenu);
    const r = btn?.getBoundingClientRect();
    if (r) { viewMenu.style.top = `${Math.round(r.top)}px`; viewMenu.style.right = `${Math.round(window.innerWidth - r.left + 8)}px`; }
    setTimeout(() => window.addEventListener('pointerdown', outside, true), 0);
  }
  function outside(e) { if (viewMenu && !viewMenu.contains(e.target) && !e.target.closest?.('.ac-eye')) closeViewMenu(); }
  function closeViewMenu() { viewMenu?.remove(); viewMenu = null; window.removeEventListener('pointerdown', outside, true); }

  /* ---------------------------------------------------------------- map and front door */
  const mapView = opts.map ? createMapView({
    root: el,
    game,
    map: opts.map,
    toast: (t, o) => dialogs.toast(t, o),
    onArrive: (go) => opts.onArrive?.(go),
    onJourney: opts.onJourney ? (go) => {
      hud.show(false); dock.show(false);
      if (opts.input) { opts.input.enabled = false; opts.input.setVisible?.(false); }
      return Promise.resolve(opts.onJourney(go)).finally(() => {
        if (!inGame) return;
        hud.show(true); dock.show(true);
        if (opts.input) { opts.input.enabled = !modalOpen; opts.input.setVisible?.(true); }
      });
    } : undefined,
    onSkip: () => opts.onSkipJourney?.(),
    onAds: () => phone.show('ads'),
    onToggle(open) {
      if (!inGame) return;
      hud.show(!open);
      dock.show(!open);
      if (opts.input) { opts.input.enabled = !open && !modalOpen; opts.input.setVisible?.(!open); }
      bus?.emit('ui:map', { open });
    },
  }) : null;
  if (mapView) {
    mapView.onLandingPick = (info) => {
      const p = info.place;
      dialogs.info({
        emoji: p ? p.emoji : info.emoji || '📍',
        title: p ? p.name : info.name || info.title || 'Lagos',
        text: `${p ? `${p.area}. ${p.desc}` : info.text || ''}\n\nSign up free to go there, worship at Grace Assembly and live your Lagos life.`,
        ok: 'Sign up free', onOk: () => signUp(),
      });
    };
  }

  const front = createFront({
    root: el,
    game,
    dialogs,
    onSignUp: () => signUp(),
    onLogin: () => showHomeCard(),
    onContinue: () => { front.hide(); begin(null, 'continue'); },
    onNewLife: () => { game.reset(); store.set('amen.loggedOut', '0'); front.hide(); showStart(); },
    onLogout: () => showLanding(),
  });

  /** Before joining: the live Lagos map with Sign up / Log in. */
  function showLanding() {
    inGame = false;
    start.hide();
    hud.show(false);
    dock.show(false);
    front.showLanding();
    mapView?.show({ mode: 'landing' });
    bus?.emit('ui:screen', { screen: 'landing' });
  }

  /** Returning player: their home in 3D with the welcome-back card. */
  function showHomeCard() {
    inGame = false;
    start.hide();
    hud.show(false);
    dock.show(false);
    mapView?.close();
    front.showHome();
    bus?.emit('ui:screen', { screen: 'home', saved: game.peek?.() });
  }

  function signUp() {
    mapView?.close();
    front.hide();
    showStart();
  }
  hud.setMuted(muted);

  const dock = createDock({
    game,
    root: el,
    toast: (t, o) => dialogs.toast(t, o),
    actions: {
      home: () => mapView ? mapView.goHome() : dialogs.toast('The map is not ready yet.'),
      map: () => mapView?.show(),
      phone: (app) => phone.show(['prayer', 'diary', 'ads'].includes(app) ? app : null),
      furniture: (slot) => furniture(slot),
    },
    onToggle(open) {
      document.documentElement.classList.toggle('ac-sheet-open', open);
      bus?.emit('ui:sheet', { open });
    },
  });

  /* ---------------------------------------------------------------- the phone */
  const phone = createPhone({
    root: el,
    game,
    bus,
    toast: (t, o) => dialogs.toast(t, o),
    onBadge: (n) => dock.setBadge('phone', n),
    actions: {
      openMap: () => mapView?.show(),
      travel: (to) => mapView?.picker(to),
      settings: () => openSettings(),
      snapshot: () => opts.snapshot?.(),
    },
  });
  offs.push(game.on('clock', () => phone.tick()));
  if (bus) offs.push(bus.on('ui:phone', ({ open }) => {
    if (!inGame) return;
    if (opts.input) { opts.input.enabled = !open && !modalOpen; opts.input.setVisible?.(!open); }
    if (open) game.pause('phone'); else game.resume('phone');
  }));

  const KIND_TEXT = {
    vendor: 'Sells here every day. Buy something, and greet them with a smile.',
    choir: 'Sings in the Grace Assembly choir.',
    kid: 'A child from the neighbourhood. Children\'s church is on Sunday!',
    pastor: 'Senior Pastor of Grace Assembly. Ask him to pray with you.',
    post: 'Serving at their post in God\'s house.',
    congregant: 'Worshipping with you at Grace Assembly.',
    group: 'Gisting with friends.',
    wander: 'Walking around Yaba.',
    leaving: 'Going home after the service.',
  };
  /** A person in the street or the church was clicked. */
  function person(npc, cb = {}) {
    if (!inGame) return;
    const role = GAME_ROLES[npc.role];
    dialogs.open({
      id: `person:${npc.id}`,
      dismissible: true,
      build(card, close) {
        setChildren(card,
          h('div.ac-modal-emoji', { text: npc.kind === 'kid' ? '🧒' : npc.kind === 'pastor' ? '👨🏿‍💼' : role?.emoji || '🙂', attrs: { 'aria-hidden': 'true' } }),
          h('h3', { text: npc.kind === 'pastor' ? 'Pastor Ade' : npc.name, id: 'ac-modal-title' }),
          h('p', { text: `${npc.kind === 'pastor' ? '' : `${role?.name || 'Neighbour'} · `}${KIND_TEXT[npc.kind] || ''}` }),
          h('div.ac-choices', null,
            h('button.ac-btn.is-primary', { type: 'button', on: { click: () => { close(); cb.greet?.(); } } }, '👋 Greet'),
            npc.kind === 'kid' ? null : h('button.ac-btn', { type: 'button', on: { click: () => { close(); const r = game.act('witness'); if (r && !r.ok && r.reason) dialogs.toast(r.reason, { tone: 'warn' }); } } }, '💬 Share the Gospel'),
            npc.kind === 'pastor' ? h('button.ac-btn', { type: 'button', on: { click: () => { close(); const r = game.phone('callPastor'); if (r && !r.ok && r.reason) dialogs.toast(r.reason, { tone: 'warn' }); } } }, '🙏 Ask him to pray') : null));
      },
    });
  }
  /** A billboard poster, big. */
  function poster(p) {
    dialogs.open({
      id: 'poster',
      dismissible: true,
      build(card, close) {
        const c = h('canvas.mv-poster', { width: 512, height: 224, attrs: { 'aria-label': p.title } });
        drawPoster(c.getContext('2d'), 0, 0, 512, 224, p);
        setChildren(card, c,
          h('h3', { text: p.title, id: 'ac-modal-title' }),
          h('p', { text: `${p.church || ''}${p.sub ? ` · ${p.sub}` : ''}` }),
          h('div.ac-choices', null,
            h('button.ac-btn.is-primary', { type: 'button', on: { click: () => { close(); phone.show('ads'); } } }, '📣 Advertise your church programme'),
            h('button.ac-btn', { type: 'button', on: { click: close } }, 'Close')));
      },
    });
  }

  /** Replace or upgrade a piece of furniture (click it, or press F next to it). */
  function furniture(slot) {
    const f = FURNITURE_BY_ID[slot];
    const s = game.state;
    if (!f || !s || !inGame) return;
    dialogs.open({
      id: `furniture:${slot}`,
      dismissible: true,
      build(card, close) {
        const cur = variantOf(s, slot);
        setChildren(card,
          h('div.ac-modal-emoji', { text: f.emoji, attrs: { 'aria-hidden': 'true' } }),
          h('h3', { text: `Your ${f.name.toLowerCase()}`, id: 'ac-modal-title' }),
          h('p', { text: `${f.perk} Replace it, or upgrade. Your old one goes to a neighbour who needs it.` }),
          h('div.ac-furn', null, f.variants.map((v) => {
            const mine = cur?.id === v.id;
            const can = !mine && !v.free && s.naira >= v.naira;
            return h(`div.ac-furn-row${mine ? '.is-mine' : ''}`, null,
              h('span', null, h('b', { text: v.name }), h('small', { text: v.free ? 'What you started with' : naira(v.naira) })),
              mine ? h('span.ac-chip.is-green', { text: '✓ Yours' })
                : v.free ? h('span.ac-chip', { text: 'Old model' })
                  : h('button.ac-btn.is-sm', { type: 'button', class: can ? 'is-yellow' : '', disabled: !can, on: { click: () => { const r = game.buyFurniture(slot, v.id); close(); if (r && !r.ok && r.reason) dialogs.toast(r.reason, { tone: 'warn' }); } } }, can ? 'Buy & replace' : `Need ${naira(v.naira)}`));
          })),
          h('div.ac-choices', null, h('button.ac-btn', { type: 'button', on: { click: close } }, 'Keep it')));
      },
    });
  }

  function openSettings() {
    dialogs.settings({
      muted: () => muted,
      setMuted,
      quality,
      onNewLife() {
        game.reset();
        location.reload();
      },
      onLogout() {
        game.save();
        store.set('amen.loggedOut', '1');
        location.reload();
      },
    });
  }

  function setMuted(m) {
    muted = !!m;
    store.set('amen.sound', muted ? 'off' : 'on');
    hud.setMuted(muted);
    opts.audio?.setMuted?.(muted);
    bus?.emit('ui:mute', { muted });
  }

  /* ---------------------------------------------------------------- screens */
  function showStart() {
    inGame = false;
    document.documentElement.classList.remove('ac-in-game');
    hud.show(false);
    dock.show(false);
    if (opts.input) opts.input.enabled = false;
    start.show();
    // The start screen is opaque: the world loop can pause meanwhile (main decides).
    bus?.emit('ui:screen', { screen: 'start' });
    // Warm the character kit while the player types their name.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    idle(() => getLib().catch(() => {}));
  }

  function enterGame() {
    start.hide();
    inGame = true;
    document.documentElement.classList.add('ac-in-game');
    hud.show(true);
    dock.show(true);
    if (opts.input) opts.input.enabled = !modalOpen;
    refresh();
    bus?.emit('ui:screen', { screen: 'game' });
    const s = game.state;
    if (s?.activeEvent) dialogs.event(s.activeEvent);
    if (s?.over && s.ending) dialogs.over(s.ending, newLife);
  }

  function newLife() {
    game.reset();
    location.reload();
  }

  function refresh() {
    if (!inGame) return;
    hud.update();
    dock.update();
    mapView?.refresh();
  }
  offs.push(game.on('start', () => setTimeout(() => phone.tick(), 0)));

  /* ---------------------------------------------------------------- game events */
  offs.push(game.on('change', refresh));
  offs.push(game.on('event', ({ event }) => dialogs.event(event)));
  offs.push(game.on('quiz', ({ quiz }) => dialogs.quiz(quiz)));
  offs.push(game.on('modal', ({ modal }) => dialogs.info(modal)));
  offs.push(game.on('travel', ({ actions }) => dialogs.travel(actions)));
  offs.push(game.on('over', ({ ending }) => dialogs.over(ending, newLife)));
  offs.push(game.on('skip', ({ minutes, label }) => {
    const c = game.clock;
    dialogs.skip(label || `${countdown(minutes)} later`, c ? `${c.weekdayName} · ${c.time}` : '');
  }));
  offs.push(game.on('role', () => refresh()));
  // Toasts from any module (the game emits game:toast on the bus).
  const onToast = (d) => dialogs.toast(d?.text, { emoji: d?.emoji, tone: d?.tone, deltas: d?.deltas });
  if (bus) offs.push(bus.on('game:toast', onToast));
  else offs.push(game.on('toast', onToast));

  /* ---------------------------------------------------------------- keys */
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (!inGame) return;
    if ((e.key === 'v' || e.key === 'V') && !mapView?.open) { setView(VIEW_LIST[(VIEW_LIST.findIndex((x) => x[0] === view) + 1) % VIEW_LIST.length][0]); dialogs.toast(`View: ${VIEW_LIST.find((x) => x[0] === view)[2]}`, { emoji: '🎥' }); return; }
    if ((e.key === 'm' || e.key === 'M') && mapView) { if (mapView.open) mapView.close(); else mapView.show(); return; }
    if ((e.key === 'h' || e.key === 'H') && mapView && !mapView.open) { mapView.goHome(); return; }
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); dialogs.help(); return; }
    if (e.key === 'Escape') {
      if (phone.open) return; // the phone handles its own Esc
      if (dialogs.escape()) return;
      if (mapView?.open) { mapView.close(); return; }
      if (dock.open) dock.setOpen(false);
    }
  };
  if (opts.keys !== false) window.addEventListener('keydown', onKey);

  /* ---------------------------------------------------------------- start */
  // Lagos Life style: logged-in players see their home; everyone else the live city map.
  if (game.state) enterGame();
  else if (isLoggedIn(game)) showHomeCard();
  else if (mapView) showLanding();
  else showStart();

  const ui = {
    el,
    /** Slots for other modules' widgets. */
    slots: { online: hud.onlineSlot },
    get kit() { return getLib().then((l) => l.kit); },
    get muted() { return muted; },
    get modalOpen() { return modalOpen; },
    get sheetOpen() { return dock.open; },
    setMuted,
    /** "● 23 online" chip in the HUD (mode 'local' for the same-device fallback). */
    setOnline: (count, mode) => { hud.setOnline(count, mode); if (mode !== 'local') front.setOnline(count); },
    /** Players online on the landing page (from the server's /stats). */
    setLandingOnline: (n) => front.setOnline(n),
    /** The phone (createPhone). */
    phone,
    /** Replace or upgrade furniture in a slot of the home. */
    furniture,
    /** A clicked person in the 3D world. */
    person,
    /** A clicked billboard poster. */
    poster,
    /** A pin on the Lagos map was tapped. */
    mapPick: (p) => mapView?.pick(p),
    get mapOpen() { return !!mapView?.open; },
    showMap: (o) => mapView?.show(o),
    closeMap: () => mapView?.close(),
    goHome: () => mapView?.goHome(),
    showLanding,
    showHomeCard,
    /** Saved camera view and mouse-look choice (main applies them when you enter). */
    get view() { return view; },
    get mouseLook() { return mouseLook; },
    toast: (text, o) => dialogs.toast(text, o),
    modal: (m) => dialogs.info(m),
    help: () => dialogs.help(),
    settings: openSettings,
    openSheet: (tab = 'today') => dock.select(tab),
    closeSheet: () => dock.setOpen(false),
    showStart,
    /** Skip the start screen: begin a new life with this profile, or 'continue' the saved one. */
    begin,
    /** Dev harness helpers. */
    dev: { start, dock, dialogs, hud, front, mapView },
    destroy() {
      offs.forEach((f) => f());
      window.removeEventListener('keydown', onKey);
      start.hide();
      hud.destroy();
      dock.destroy();
      el.remove();
      document.documentElement.classList.remove('ac-in-game', 'ac-sheet-open');
    },
  };
  if (typeof window !== 'undefined') {
    window.__amen = window.__amen || {};
    window.__amen.ui = { get sheetOpen() { return dock.open; }, get modalOpen() { return modalOpen; } };
  }
  return ui;
}
