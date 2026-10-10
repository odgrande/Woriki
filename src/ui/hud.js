// In-game HUD: clock + day, naira, ⭐ points, mood, energy/hunger/faith/character
// mini-bars, an online-count slot for the net module, mute / settings / help buttons,
// and a status banner (next service countdown, live attendance, prayer or task progress).
import { h, ic, setChildren } from './dom.js';
import { naira } from '../game/content.js';
import { countdown } from '../game/clock.js';

const BARS = [
  ['energy', 'zap', 'Energy'],
  ['hunger', 'utensils', 'Food'],
  ['faith', 'flame', 'Faith'],
  ['character', 'shield-check', 'Character'],
];

/**
 * @param {object} o
 * @param {object} o.game
 * @param {HTMLElement} o.root
 * @param {{sound: () => void, settings: () => void, help: () => void, today: () => void}} o.actions
 */
export function createHud({ game, root, actions }) {
  const time = h('strong', { text: '--:--' });
  const day = h('span', { text: '' });
  const nairaChip = h('span.ac-chip', { title: 'Naira' }, h('span', { text: '₦0' }));
  const pointsChip = h('span.ac-chip', { title: 'Points' }, ic('star', { cls: 'ac-star' }), h('span', { text: '0' }));
  const moodChip = h('span.ac-chip.ac-mood', { title: 'Mood' }, h('span.ac-mood-emoji'), h('span.ac-mood-label'));
  const who = h('div.ac-who');
  const bars = {};
  const barsEl = h('div.ac-bars', null, BARS.map(([k, icon, label]) => {
    const fill = h('span.ac-fill');
    const num = h('span.ac-bar-num');
    const bar = h('div.ac-bar', { data: { k }, title: label, attrs: { role: 'meter', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100' } }, ic(icon), h('span.ac-track', null, fill), num);
    bars[k] = { bar, fill, num };
    return bar;
  }));

  const card = h('section.ac-hud-card.ac-glass', { attrs: { 'aria-label': 'Your status' } },
    h('div.ac-hud-row', null, h('div.ac-clock', null, time, day), h('div.ac-hud-chips', null, nairaChip, pointsChip, moodChip)),
    who,
    barsEl);

  const onlineSlot = h('div.ac-online-slot');
  const soundBtn = h('button.ac-iconbtn', { type: 'button', attrs: { 'aria-label': 'Mute sound', 'aria-pressed': 'false' }, on: { click: actions.sound } }, ic('volume-2'));
  const side = h('div.ac-hud-side', null, onlineSlot, h('div.ac-hud-btns', null,
    soundBtn,
    h('button.ac-iconbtn', { type: 'button', attrs: { 'aria-label': 'Settings' }, on: { click: actions.settings } }, ic('settings')),
    h('button.ac-iconbtn', { type: 'button', attrs: { 'aria-label': 'Controls help (?)' }, on: { click: actions.help } }, ic('circle-help'))));

  const el = h('header.ac-hud', null, card, side);

  const bEmoji = h('span.ac-banner-emoji');
  const bText = h('span.ac-banner-text');
  const bMeterFill = h('b');
  const bMeterGoal = h('i');
  const bMeter = h('span.ac-meter', { attrs: { 'aria-hidden': 'true' } }, bMeterFill, bMeterGoal);
  const banner = h('button.ac-banner', { type: 'button', attrs: { 'aria-live': 'polite' }, on: { click: actions.today } }, bEmoji, bText, bMeter);

  root.append(el, banner);

  // Keep banner and toasts just below the HUD, whatever its height.
  const ro = new ResizeObserver(() => {
    document.documentElement.style.setProperty('--ac-hud-h', `${Math.round(card.getBoundingClientRect().height)}px`);
  });
  ro.observe(card);

  let online = null;

  function update() {
    const s = game.state;
    if (!s) return;
    const c = game.clock;
    time.textContent = c.time;
    day.textContent = `${c.weekdayShort} · Day ${c.day}`;
    nairaChip.firstChild.textContent = naira(s.naira);
    pointsChip.lastChild.textContent = String(s.points);
    pointsChip.setAttribute('aria-label', `${s.points} points`);
    const m = game.mood;
    moodChip.dataset.mood = m.id;
    moodChip.querySelector('.ac-mood-emoji').textContent = m.emoji;
    moodChip.querySelector('.ac-mood-label').textContent = m.label;
    moodChip.title = `Mood: ${m.label}`;
    setChildren(who, h('b', { text: `${game.title} ${s.name}` }), ` · ${s.pastor ? s.pastor.church : `${s.church}, Yaba`}`,
      s.convicted ? h('span.ac-repent', null, ic('droplet', { size: 11 }), 'Needs repentance') : null);
    for (const [k] of BARS) {
      const v = Math.round(s[k]);
      const b = bars[k];
      b.fill.style.width = `${Math.max(0, Math.min(100, v))}%`;
      b.num.textContent = v;
      b.bar.setAttribute('aria-valuenow', String(v));
      b.bar.classList.toggle('is-low', v < 25);
    }
    updateBanner(s, c);
  }

  function updateBanner(s, c) {
    if (s.over) { banner.hidden = true; return; }
    banner.hidden = false;
    const p = game.progress;
    let tone = 'calm';
    let emoji = '⛪';
    let text = '';
    let small = '';
    let meter = null;
    let goal = null;
    if (p && p.kind === 'kneel') {
      tone = 'live'; emoji = '🙏'; text = 'Praying…'; small = 'stay on your knees'; meter = p.value;
    } else if (p && p.kind === 'shift') {
      tone = p.hint ? 'away' : 'live'; emoji = p.emoji; text = p.label; small = p.hint || `${Math.round(p.value * 100)}%`; meter = p.value;
    } else if (p && p.kind === 'service') {
      emoji = p.emoji; meter = p.value; goal = p.goal;
      const pct = Math.round(p.value * 100);
      if (p.present) { tone = 'live'; text = `${p.label} · ${pct}%`; small = p.value >= p.goal ? 'it counts ✓' : 'keep going'; }
      else { tone = 'away'; text = `${p.label} is on`; small = p.hint; }
    } else if (c.next) {
      const mins = c.next.inMinutes;
      emoji = c.next.def.emoji;
      if (mins <= 120) {
        tone = 'soon';
        text = `${c.next.name} in ${countdown(mins)}`;
        const post = game.postLabel;
        small = post ? `serve at ${post}` : 'go to the church hall';
      } else {
        text = `Next: ${c.next.name}`;
        small = c.next.when;
      }
    }
    banner.dataset.tone = tone;
    bEmoji.textContent = emoji;
    setChildren(bText, text, small ? h('small', { text: small }) : null);
    bMeter.hidden = meter === null;
    if (meter !== null) bMeterFill.style.width = `${Math.round(meter * 100)}%`;
    bMeterGoal.hidden = goal === null;
    if (goal !== null) bMeterGoal.style.left = `${goal * 100}%`;
    banner.setAttribute('aria-label', `${text}${small ? `, ${small}` : ''}`);
  }

  return {
    el,
    banner,
    onlineSlot,
    update,
    setMuted(muted) {
      soundBtn.setAttribute('aria-pressed', String(muted));
      soundBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
      soundBtn.replaceChildren(ic(muted ? 'volume-x' : 'volume-2'));
    },
    /** Show "● 23 online" (mode 'local' = same-device fallback). */
    setOnline(count, mode = 'online') {
      if (count === null || count === undefined) { online?.remove(); online = null; return; }
      if (!online) { online = h('span.ac-online', { attrs: { role: 'status' } }, h('i'), h('span')); onlineSlot.append(online); }
      online.dataset.mode = mode;
      online.lastChild.textContent = `${count} ${mode === 'local' ? 'here' : 'online'}`;
      online.title = mode === 'local' ? 'Players on this device (offline mode)' : 'Players online';
    },
    show(v) { el.hidden = !v; banner.hidden = !v; },
    destroy() { ro.disconnect(); el.remove(); banner.remove(); },
  };
}
