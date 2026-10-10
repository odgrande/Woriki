// Amen City UI: createUI(ctx, {root, game, onStart}) builds the start screen with the
// appearance editor, the in-game HUD, the bottom dock (Today / Prayer / Shop / Diary),
// modals for events, temptations and the Bible quiz, toasts, help and settings.
import './ui.css';
import './start.css';
import { h, store } from './dom.js';
import { createStartScreen } from './start.js';
import { createHud } from './hud.js';
import { createDock } from './sheet.js';
import { createDialogs } from './dialogs.js';
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
    },
  });
  hud.setMuted(muted);

  const dock = createDock({
    game,
    root: el,
    toast: (t, o) => dialogs.toast(t, o),
    onToggle(open) {
      document.documentElement.classList.toggle('ac-sheet-open', open);
      bus?.emit('ui:sheet', { open });
    },
  });

  function openSettings() {
    dialogs.settings({
      muted: () => muted,
      setMuted,
      quality,
      onNewLife() {
        game.reset();
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
  }

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
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); dialogs.help(); return; }
    if (e.key === 'Escape') {
      if (dialogs.escape()) return;
      if (dock.open) dock.setOpen(false);
    }
  };
  if (opts.keys !== false) window.addEventListener('keydown', onKey);

  /* ---------------------------------------------------------------- start */
  if (game.state) enterGame();
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
    setOnline: (count, mode) => hud.setOnline(count, mode),
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
    dev: { start, dock, dialogs, hud },
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
