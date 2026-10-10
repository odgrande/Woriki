// The front door, like Lagos Life: the logo preloader, then the live map of Lagos with
// "Sign up free" and "Log in" before you join; and for returning players the "welcome back"
// card over their 3D home (name, date, naira, today's church plan, Continue / New life).
// You stay logged in on this device until you log out.
import { h, ic, setChildren, store } from './dom.js';
import { naira, ROLES } from '../game/content.js';

const LOGGED_OUT = 'amen.loggedOut';

/** Should a returning player go straight to their home card? */
export function isLoggedIn(game) {
  const saved = game.saved;
  return !!(saved && !saved.over && store.get(LOGGED_OUT) !== '1');
}

/** Hide the static logo preloader from index.html (after at least `minMs`). */
export function finishBoot(minMs = 1400) {
  const boot = document.getElementById('boot');
  if (!boot) return Promise.resolve();
  const shown = performance.now();
  return new Promise((resolve) => {
    setTimeout(() => {
      boot.classList.add('is-done');
      setTimeout(() => { boot.remove(); resolve(); }, 500);
    }, Math.max(0, minMs - shown));
  });
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root
 * @param {object} o.game
 * @param {object} o.dialogs createDialogs()
 * @param {() => void} o.onSignUp open the sign-up (role + look) screens
 * @param {() => void} o.onLogin a saved life on this device: go to its home card
 * @param {() => void} o.onContinue continue the saved life
 * @param {() => void} o.onNewLife delete the saved life and sign up again
 * @param {() => void} o.onLogout back to the landing page
 */
export function createFront(o) {
  const { root, game, dialogs } = o;
  let online = null;

  /* ---------------------------------------------------------------- landing */
  const onlineEl = h('span.fr-online', { hidden: true }, h('i'), h('span'));
  const landing = h('div.fr-landing', { hidden: true },
    h('header.fr-bar', null,
      h('div.fr-brand', null, h('span.fr-logo', { text: '⛪', attrs: { 'aria-hidden': 'true' } }), h('b', { text: 'Amen City' })),
      onlineEl,
      h('div.fr-bar-btns', null,
        h('button.ac-btn.is-sm.fr-login', { type: 'button', on: { click: () => login() } }, 'Log in'),
        h('button.ac-btn.is-sm.is-yellow', { type: 'button', on: { click: () => o.onSignUp() } }, 'Sign up free'))),
    h('section.fr-pitch', null,
      h('h1', null, 'Your church. ', h('span.ac-mark', { text: 'Your Lagos.' })),
      h('p', { text: 'Worship at Grace Assembly in Yaba. Serve as an usher, in the choir or at the gate, pray, win souls, and stand firm when the devil is busy. Then live real Lagos life around it.' }),
      h('ul.fr-points', null,
        h('li', null, '⛪', h('span', { text: 'Sunday service, Wednesday Bible study, Friday vigil, on real Lagos time' })),
        h('li', null, '🙏', h('span', { text: 'Pray, serve in your department, win souls across Lagos' })),
        h('li', null, '💬', h('span', { text: 'Worship and chat with real people' }))),
      h('div.fr-cta', null,
        h('button.ac-btn.is-primary.is-big', { type: 'button', on: { click: () => o.onSignUp() } }, 'Sign up free', ic('arrow-right', { size: 20 })),
        h('button.ac-btn.is-ghost', { type: 'button', on: { click: () => login() } }, 'I have a life here'))));
  root.append(landing);

  function login() {
    const saved = game.saved;
    dialogs.info({
      emoji: saved && !saved.over ? (ROLES[saved.role]?.emoji || '🙏') : '🔑',
      title: saved && !saved.over ? `Welcome back, ${saved.name}` : 'Log in',
      text: saved && !saved.over
        ? `${saved.roleName} · Day ${saved.day}. Your life in Amen City is saved on this device.`
        : 'There is no Amen City life on this device yet. Your life is saved on the device you play on. Sign up free to start.',
      ok: saved && !saved.over ? 'Continue my life' : 'Sign up free',
      onOk: () => { if (saved && !saved.over) { store.set(LOGGED_OUT, '0'); o.onLogin(); } else o.onSignUp(); },
    });
  }

  /* ---------------------------------------------------------------- returning: home card */
  const home = h('div.fr-home', { hidden: true });
  root.append(home);

  function renderHome() {
    const s = game.saved;
    const st = game.peek?.() || null; // the saved state, for naira and the plan
    if (!s) return;
    const c = st?.clock;
    const plan = st?.plan;
    const r = ROLES[s.role] || ROLES.worshipper;
    setChildren(home,
      h('button.ac-btn.is-sm.fr-logout', { type: 'button', on: { click: () => { store.set(LOGGED_OUT, '1'); o.onLogout(); } } }, ic('log-out', { size: 16 }), 'Log out'),
      h('section.fr-home-card', { attrs: { 'aria-label': 'Welcome back' } },
        h('div.fr-home-top', null,
          h('div.ac-avatar', { text: r.emoji, attrs: { 'aria-hidden': 'true' } }),
          h('div', null,
            h('h2', { text: s.name }),
            h('p', { text: c ? `${c.weekdayName}, ${c.date.day} ${c.date.monthName} · ${c.time}` : r.name }))),
        h('div.fr-home-stats', null,
          h('div', null, h('span', { text: 'Naira' }), h('strong', { text: naira(st?.naira ?? 0) })),
          h('div', null, h('span', { text: 'Points' }), h('strong', { text: `${st?.points ?? 0}⭐` })),
          h('div', null, h('span', { text: 'Role' }), h('strong', { text: r.name }))),
        plan ? h('div.fr-plan', null,
          h('b', { text: `${plan.weekday} at Grace Assembly` }),
          plan.items.length
            ? h('ul', null, plan.items.map((x) => h(`li${x.done ? '.is-done' : x.live ? '.is-live' : ''}`, null, h('span', { text: x.emoji }), `${x.name} · ${x.time}${x.live ? ' · on now' : x.done ? ' ✓' : ''}`)))
            : null,
          h('p', { text: plan.idea })) : null,
        h('div.fr-home-btns', null,
          h('button.ac-btn.is-ghost', { type: 'button', on: { click: confirmNew } }, 'New life'),
          h('button.ac-btn.is-primary.is-big', { type: 'button', on: { click: () => o.onContinue() } }, 'Continue', ic('arrow-right', { size: 20 })))));
  }

  function confirmNew() {
    dialogs.info({
      emoji: '⚠️', title: 'Start a new life?', text: 'Your saved life on this device will be deleted. This cannot be undone.',
      ok: 'Yes, start again', cancel: 'Keep my life', onOk: () => o.onNewLife(),
    });
  }

  return {
    showLanding() { home.hidden = true; landing.hidden = false; },
    showHome() { landing.hidden = true; renderHome(); home.hidden = false; },
    hide() { landing.hidden = true; home.hidden = true; },
    setOnline(n) {
      online = n;
      onlineEl.hidden = !n;
      if (n) onlineEl.lastChild.textContent = `${n.toLocaleString('en-NG')} online`;
    },
    get online() { return online; },
  };
}
