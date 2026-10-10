// The phone: a working smartphone in your hand. Church first: the Grace Assembly group chat
// and your department group, your pastor, mum and prayer partner, the Bible, Church Live,
// AmenPay for tithes and offerings, the church calendar and the prayer wall. Then normal
// Lagos life: calls, maps, rides, food delivery, notes, camera and praise music.
import './phone.css';
import { h, setChildren, store as ls } from '../dom.js';
import { naira, VERSES, servicesFor, WEEKDAY_NAMES } from '../../game/content.js';
import { servicesBetween, hhmm, DAY } from '../../game/clock.js';
import { GIVING, titheAmount, DELIVERY, PLACES, distanceKm, AD_SPOTS } from '../../game/life.js';
import { drawPoster, THEMES, MOTIFS } from '../../map/posters.js';
import { logStamp } from '../../game/systems.js';
import { PASSAGES } from './bible.js';
import { threadDefs, newStore, post, scheduled, replyTo, preview, seed } from './messages.js';

const KEY = 'amen.phone';
const APPS = [
  ['chats', '💬', 'Chats', '#16a34a'], ['bible', '📖', 'Bible', '#7f1d1d'], ['live', '🔴', 'Church Live', '#dc2626'], ['give', '🙏', 'AmenPay', '#1e3a8a'],
  ['calendar', '📅', 'Calendar', '#ea580c'], ['prayer', '🕊️', 'Prayer Wall', '#7c3aed'], ['calls', '📞', 'Phone', '#15803d'], ['maps', '🗺️', 'Maps', '#0284c7'],
  ['rides', '🚕', 'Rides', '#ca8a04'], ['food', '🍲', 'Chow', '#c2410c'], ['notes', '📝', 'Notes', '#a16207'], ['camera', '📷', 'Camera', '#374151'],
  ['ads', '📣', 'Billboards', '#9333ea'], ['music', '🎵', 'Praise', '#be185d'], ['diary', '📔', 'My Story', '#0f766e'], ['settings', '⚙️', 'Settings', '#4b5563'],
];
const DOCK = ['chats', 'bible', 'give', 'calls'];
const CONTACTS = [
  { id: 'callPastor', name: 'Pastor Ade', emoji: '👨🏿‍💼', note: 'Senior Pastor, Grace Assembly' },
  { id: 'callMum', name: 'Mum ❤️', emoji: '👩🏿', note: 'Ibadan' },
  { id: 'callPartner', name: 'Sis. Chioma', emoji: '🙋🏿‍♀️', note: 'Prayer partner' },
  { id: 'office', name: 'Church Office', emoji: '⛪', note: 'Grace Assembly, Yaba' },
];
const SERMONS = [
  ['Faith that works', 'James 2:14-26', 'Pastor Ade'],
  ['Stand firm in the evil day', 'Ephesians 6:10-18', 'Pastor Ade'],
  ['The God who provides', 'Genesis 22:1-14', 'Rev. Mrs Ade'],
  ['Serving with joy', 'Psalm 100', 'Deacon Femi'],
];
const LIVE_LINES = ['"Somebody shout Hallelujah!"', '"Turn to your neighbour and say: Neighbour, God is good!"', '"Open your Bible to Psalm 23…"', '"The LORD is my shepherd; I shall not want."', '"Can I get a loud Amen?!"', '"Let us stand for prayer."', '"God has not forgotten you."'];

/**
 * @param {object} o
 * @param {HTMLElement} o.root
 * @param {object} o.game
 * @param {object} [o.bus]
 * @param {(text: string, opts?: object) => void} o.toast
 * @param {{openMap?: () => void, travel?: (to: string) => void, settings?: () => void, snapshot?: () => Promise<string|null>|string|null}} [o.actions]
 * @param {(n: number) => void} [o.onBadge] unread messages count changed
 */
export function createPhone({ root, game, bus, toast, actions = {}, onBadge = () => {} }) {
  let st = load();
  let open = false;
  let app = null; // null = home screen
  let sub = null; // thread id / passage index / contact…
  let net = null;
  let liveIdx = 0;
  let music = false;
  const timers = new Set();

  const timeEl = h('b.ph-time');
  const batteryEl = h('span.ph-battery');
  const status = h('div.ph-status', null, timeEl, h('span.ph-island', { attrs: { 'aria-hidden': 'true' } }), h('span.ph-signal', null, 'MTN 4G ', h('span', { text: '▂▄▆█', attrs: { 'aria-hidden': 'true' } })), batteryEl);
  const view = h('div.ph-view');
  const homeBar = h('button.ph-homebar', { type: 'button', attrs: { 'aria-label': 'Home screen' }, on: { click: () => go(null) } });
  const device = h('div.ph', { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Phone' } },
    h('div.ph-screen', null, status, view, homeBar));
  const backdrop = h('div.ph-backdrop', { hidden: true }, device,
    h('button.ac-iconbtn.ph-close', { type: 'button', attrs: { 'aria-label': 'Put the phone away' }, on: { click: () => close() } }, '✕'));
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  root.append(backdrop);

  /* ---------------------------------------------------------------- storage */
  function load() {
    try { const raw = JSON.parse(ls.get(KEY, 'null')); if (raw && raw.v === 1) return raw; } catch { /* bad json */ }
    return null;
  }
  function save() { try { ls.set(KEY, JSON.stringify(st)); } catch { /* full */ } }
  /** One phone per life: a new life gets a new phone. */
  function ensure() {
    const s = game.state;
    if (!s) return false;
    if (!st || st.startT !== s.startT) { st = newStore(s.startT); seed(st, s); save(); badge(); }
    return true;
  }
  const unreadTotal = () => Object.entries(st?.unread || {}).reduce((n, [k, v]) => n + (k === 'live' ? 0 : v), 0);
  function badge() { onBadge(unreadTotal()); }

  /* ---------------------------------------------------------------- clock: scheduled messages */
  function tick() {
    if (!ensure()) return;
    const c = game.clock;
    if (!c) return;
    const hr = c.hour % 12 || 12;
    timeEl.textContent = `${hr}:${c.time.slice(3)}`;
    batteryEl.textContent = `${Math.max(12, 100 - Math.floor(c.minute / 60) * 3)}%`;
    const fresh = scheduled(st, game.state, c, game.plan);
    if (fresh.length) {
      save();
      badge();
      const last = fresh[fresh.length - 1];
      const t = threadDefs(game.state.role).find((x) => x.id === last.thread);
      if (!(open && app === 'chats' && sub === last.thread)) toast(`${t?.name || 'Message'}: ${last.msg.text.slice(0, 90)}${last.msg.text.length > 90 ? '…' : ''}`, { emoji: '💬' });
      if (open) render();
    } else if (open && (app === 'live' || app === null)) render();
  }

  /* ---------------------------------------------------------------- navigation */
  function go(next, s2 = null) {
    app = next; sub = s2;
    render();
    view.scrollTop = 0;
  }
  function header(title, back = () => go(null), extra = null) {
    return h('div.ph-head', null, h('button.ph-back', { type: 'button', attrs: { 'aria-label': 'Back' }, on: { click: back } }, '‹'), h('h3', { text: title }), extra);
  }
  function render() {
    if (!open || !ensure()) return;
    const r = { chats, bible, live, give, calendar, prayer, calls, maps, rides, food, notes, camera, music: praise, diary, ads, settings }[app] || home;
    setChildren(view, r());
    device.dataset.app = app || 'home';
  }

  /* ---------------------------------------------------------------- home screen */
  function home() {
    const c = game.clock;
    const plan = game.plan;
    const v = VERSES[(c.day + 2) % VERSES.length];
    const next = c.current ? `${c.current.name} is on now` : c.next ? `${c.next.name} · ${c.next.when}` : '';
    const icon = (id) => {
      const [, emoji, label, color] = APPS.find((a) => a[0] === id);
      const n = id === 'chats' ? unreadTotal() : 0;
      return h('button.ph-app', { type: 'button', attrs: { 'aria-label': label }, on: { click: () => openApp(id) } },
        h('span.ph-app-ic', { text: emoji, style: { background: color } }, n ? h('i.ph-badge', { text: String(n) }) : null), h('span.ph-app-name', { text: label }));
    };
    return [
      h('div.ph-widget', null,
        h('p.ph-widget-day', { text: `${c.weekdayName}, ${c.date?.day ?? ''} ${c.date?.monthName ?? ''}` }),
        h('p.ph-widget-next', null, '⛪ ', next),
        plan?.items?.length ? h('p.ph-widget-plan', { text: `Today: ${plan.items.map((x) => `${x.name} ${x.time}`).join(' · ')}` }) : null,
        h('p.ph-widget-verse', { text: `“${v[1]}” — ${v[0]}` })),
      h('div.ph-grid', null, APPS.filter((a) => !DOCK.includes(a[0])).map((a) => icon(a[0]))),
      h('div.ph-dock', null, DOCK.map(icon)),
    ];
  }
  function openApp(id) {
    if (id === 'maps') { close(); actions.openMap?.(); return; }
    if (id === 'settings') { close(); actions.settings?.(); return; }
    go(id);
  }

  /* ---------------------------------------------------------------- chats */
  function chats() {
    const defs = threadDefs(game.state.role).filter((t) => !t.hidden || (st.threads[t.id] || []).length);
    if (sub) return thread(defs.find((t) => t.id === sub) || defs[0]);
    const last = (id) => { const l = st.threads[id] || []; return l[l.length - 1]; };
    defs.sort((a, b) => (last(b.id)?.T ?? -1) - (last(a.id)?.T ?? -1));
    return [
      header('Chats'),
      h('div.ph-list', null, defs.map((t) => {
        const m = last(t.id);
        const n = st.unread[t.id] || 0;
        return h('button.ph-row', { type: 'button', on: { click: () => go('chats', t.id) } },
          h('span.ph-avatar', { text: t.emoji }),
          h('span.ph-row-body', null, h('b', { text: t.name }), h('small', { text: t.live ? (net ? `${net.online || 1} online now · chat with real people` : 'People on this device') : preview(st, t.id) || 'No messages yet' })),
          h('span.ph-row-meta', null, m?.T !== undefined ? h('small', { text: hhmm(m.T) }) : null, n && !t.live ? h('i.ph-badge', { text: String(n) }) : null));
      })),
    ];
  }

  function thread(t) {
    st.unread[t.id] = 0; save(); badge();
    const list = st.threads[t.id] || [];
    const box = h('div.ph-msgs');
    for (const m of list) {
      box.append(h(`div.ph-msg${m.me ? '.is-me' : ''}`, null,
        t.group && !m.me && m.from ? h('b.ph-msg-from', { text: m.from }) : null,
        h('span', { text: m.text }),
        m.T !== undefined ? h('small', { text: hhmm(m.T) }) : null));
      if (m.choices && t.id === 'scam' && st.scamOpen !== null) {
        box.append(h('div.ph-choices', null, m.choices.map((label, i) => h('button.ac-btn.is-sm', {
          type: 'button', class: i === 0 ? 'is-green' : '',
          on: { click: () => { st.scamOpen = null; save(); const r = game.phone(i === 0 ? 'blockScam' : 'replyScam'); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); post(st, 'scam', { me: true, text: i === 0 ? '🚫 Blocked and reported' : 'Ok, I will send it now.', T: game.clock.T }); save(); render(); } },
        }, label))));
      }
    }
    if (t.typing) box.append(h('div.ph-msg.is-typing', null, h('span', { text: 'typing…' })));
    const input = h('input.ph-input', { type: 'text', maxLength: 200, placeholder: t.id === 'scam' ? 'Blocked numbers cannot be answered' : 'Message', disabled: t.id === 'scam', attrs: { enterkeyhint: 'send', 'aria-label': `Message ${t.name}` } });
    const send = () => {
      const text = input.value.replace(/\s+/g, ' ').trim();
      if (!text) return;
      input.value = '';
      if (t.live) {
        if (!net) { toast('Chat with people online opens when you are connected.', { tone: 'warn' }); return; }
        net.sendChat(text); // our own line comes back through the chat:message event
        return;
      }
      post(st, t.id, { me: true, text, T: game.clock.T });
      save();
      render();
      const answer = replyTo(t.id, text, game.state.name);
      if (answer) {
        const tid = setTimeout(() => {
          timers.delete(tid);
          post(st, t.id, { ...answer, T: game.clock.T });
          if (!(open && app === 'chats' && sub === t.id)) toast(`${answer.from}: ${answer.text.slice(0, 80)}`, { emoji: '💬' });
          else st.unread[t.id] = 0;
          save(); badge();
          if (open) render();
        }, 1500 + Math.random() * 1800);
        timers.add(tid);
      }
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); if (e.key === 'Escape') input.blur(); });
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
    const quick = t.group ? h('div.ph-quick', null, ['Amen 🙏', 'Hallelujah!', 'God bless you', 'Good morning'].map((q) => h('button', { type: 'button', on: { click: () => { input.value = q; send(); } } }, q))) : null;
    return [
      header(t.name, () => go('chats'), h('span.ph-avatar.is-small', { text: t.emoji })),
      box, quick,
      h('div.ph-compose', null, input, h('button.ph-send', { type: 'button', disabled: t.id === 'scam', attrs: { 'aria-label': 'Send' }, on: { click: send } }, '➤')),
    ];
  }

  /** Real chat lines from the multiplayer room. */
  function onRoomChat(e) {
    if (!st || !e?.text) return;
    post(st, 'live', { me: !!e.self, from: e.from, text: e.text, T: game.clock?.T });
    if (st.unread.live && open && app === 'chats' && sub === 'live') st.unread.live = 0;
    save();
    if (open && app === 'chats' && sub === 'live') render();
  }

  /* ---------------------------------------------------------------- Bible */
  function bible() {
    if (sub !== null && PASSAGES[sub]) {
      const p = PASSAGES[sub];
      const read = game.can('read');
      return [
        header(p.ref, () => go('bible')),
        h('div.ph-bible', null,
          h('h4', { text: p.title }),
          p.verses.map((v, i) => h('p', null, h('sup', { text: String((p.start || 1) + i) }), ` ${v}`)),
          h('p.ph-kjv', { text: 'King James Version' }),
          h('button.ac-btn.is-primary.is-block', {
            type: 'button', disabled: !read.ok,
            on: { click: () => { const r = game.act('read'); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); render(); } },
          }, read.ok ? 'I have read it · Quiet time ✓' : (read.reason || 'Done today'))),
      ];
    }
    const v = VERSES[(game.clock.day + 2) % VERSES.length];
    return [
      header('Holy Bible'),
      h('div.ph-card.is-verse', null, h('small', { text: 'Verse of the day' }), h('p', { text: `“${v[1]}”` }), h('b', { text: v[0] })),
      h('div.ph-list', null, PASSAGES.map((p, i) => h('button.ph-row', { type: 'button', on: { click: () => go('bible', i) } },
        h('span.ph-avatar', { text: '📖' }), h('span.ph-row-body', null, h('b', { text: p.ref }), h('small', { text: p.title }))))),
    ];
  }

  /* ---------------------------------------------------------------- Church Live */
  function live() {
    const c = game.clock;
    const cur = c.current;
    liveIdx = (liveIdx + 1) % LIVE_LINES.length;
    const sermonOk = game.state.doneToday?.['phone:sermon'] ? null : true;
    return [
      header('Grace Assembly Live'),
      cur
        ? h('div.ph-live', null,
          h('div.ph-live-screen', null, h('span.ph-live-dot', { text: '● LIVE' }), h('p', { text: LIVE_LINES[liveIdx] }), h('small', { text: `${cur.name} · ${Math.round((cur.progress || 0) * 100)}%` })),
          h('p.ph-note', { text: 'Watching online is good when you cannot come, but nothing beats being in the house of God. Your attendance only counts in the hall.' }),
          h('button.ac-btn.is-primary.is-block', { type: 'button', on: { click: () => { close(); actions.travel?.('grace'); } } }, '⛪ Go to church now'))
        : h('div.ph-card', null, h('b', { text: 'No live service right now' }), h('p', { text: c.next ? `Next: ${c.next.name}, ${c.next.when}` : '' })),
      h('p.ph-section', { text: 'Sermons' }),
      h('div.ph-list', null, SERMONS.map(([title, text, by], i) => h('div.ph-row', null,
        h('span.ph-avatar', { text: '🎙️' }), h('span.ph-row-body', null, h('b', { text: title }), h('small', { text: `${text} · ${by}` })),
        h('button.ac-btn.is-sm', {
          type: 'button', disabled: !sermonOk,
          on: { click: () => { const r = game.phone('sermon'); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); render(); } },
        }, sermonOk ? 'Listen' : i === 0 ? 'Done today' : 'Tomorrow')))),
    ];
  }

  /* ---------------------------------------------------------------- AmenPay (bank + giving) */
  function give() {
    const s = game.state;
    const recent = s.log.filter((e) => /₦/.test(e.text)).slice(0, 8);
    return [
      header('AmenPay'),
      h('div.ph-bank', null, h('small', { text: 'Available balance' }), h('strong', { text: naira(s.naira) }), h('small', { text: `Given to God's work so far: ${naira(s.given || 0)}` })),
      h('p.ph-section', { text: 'Give to Grace Assembly' }),
      ...GIVING.map((g) => h('div.ph-give', null,
        h('div.ph-give-head', null, h('span', { text: g.emoji }), h('b', { text: g.name }), h('small', { text: g.desc })),
        h('div.ph-give-amounts', null, (g.id === 'tithe' ? [titheAmount(s)] : g.amounts).map((n) => h('button.ac-btn.is-sm', {
          type: 'button', disabled: s.naira < n,
          on: { click: () => { const r = game.give(g.id, n); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); render(); } },
        }, naira(n)))))),
      h('p.ph-section', { text: 'Recent' }),
      h('div.ph-list', null, recent.length ? recent.map((e) => h('div.ph-tx', null, h('small', { text: hhmm(e.T) }), h('span', { text: e.text.slice(0, 110) }))) : h('p.ph-note', { text: 'No transactions yet.' })),
    ];
  }

  /* ---------------------------------------------------------------- calendar */
  function calendar() {
    const c = game.clock;
    const s = game.state;
    const dayStart = c.T - c.minute;
    const list = servicesBetween(dayStart, dayStart + 7 * DAY, servicesFor(s.role)).filter((x) => x.start >= dayStart);
    const byDay = new Map();
    for (const x of list) {
      const d = Math.floor((x.start - dayStart) / DAY);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(x);
    }
    return [
      header('Church calendar'),
      h('div.ph-list', null, [...Array(7)].map((_, d) => {
        const wd = WEEKDAY_NAMES[(c.weekday + d) % 7];
        const items = byDay.get(d) || [];
        return h(`div.ph-day${d === 0 ? '.is-today' : ''}`, null,
          h('b', { text: d === 0 ? `Today · ${wd}` : d === 1 ? `Tomorrow · ${wd}` : wd }),
          items.length ? items.map((x) => h('p', null, h('span', { text: hhmm(x.start) }), ` ${x.def.emoji} ${x.name}`)) : h('p.ph-note', { text: d === 0 || d > 0 ? 'Work, family, rest. Pray and read your Bible.' : '' }));
      })),
    ];
  }

  /* ---------------------------------------------------------------- prayer wall */
  function prayer() {
    const s = game.state;
    const acts = game.actions('prayer');
    const ta = h('textarea.ph-input', { rows: 2, maxLength: 200, placeholder: 'What should we pray about?', attrs: { 'aria-label': 'Prayer request' } });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    return [
      header('Prayer Wall'),
      h('div.ph-list', null, acts.map((a) => h('div.ph-row', null,
        h('span.ph-avatar', { text: a.emoji }), h('span.ph-row-body', null, h('b', { text: a.name }), h('small', { text: a.ok ? a.desc : a.reason || a.desc })),
        h('button.ac-btn.is-sm', { type: 'button', disabled: !a.ok || a.kneel, on: { click: () => { const r = game.act(a.id); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); render(); } } }, a.kneel ? 'Kneel (P)' : a.done ? '✓' : 'Pray')))),
      h('p.ph-section', { text: 'Your requests' }),
      h('div.ph-compose', null, ta, h('button.ph-send', { type: 'button', attrs: { 'aria-label': 'Post request' }, on: { click: () => { const r = game.postRequest(ta.value); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); render(); } } }, '➤')),
      h('div.ph-list', null, s.requests.map((r) => h('div.ph-card', null, h('p', { text: r.text }),
        r.answered ? h('small', { text: '🙌 Answered!' }) : h('button.ac-btn.is-sm.is-green', { type: 'button', on: { click: () => { game.markAnswered(r.id); render(); } } }, 'God answered!')))),
    ];
  }

  /* ---------------------------------------------------------------- calls */
  function calls() {
    if (sub) {
      const c = CONTACTS.find((x) => x.id === sub);
      const screen = h('div.ph-call', null, h('span.ph-call-avatar', { text: c.emoji }), h('h4', { text: c.name }), h('p.ph-call-state', { text: 'Calling…' }));
      const end = h('button.ph-hangup', { type: 'button', attrs: { 'aria-label': 'End call' }, on: { click: () => go('calls') } }, '📞');
      const tid = setTimeout(() => {
        timers.delete(tid);
        if (app !== 'calls' || sub !== c.id) return;
        const st2 = screen.querySelector('.ph-call-state');
        if (c.id === 'office') { st2.textContent = 'Grace Assembly office: Sunday service 9am, Bible study Wednesday 6pm, vigil Friday 10pm. Choir practice and cleaning on Saturday. God bless you!'; return; }
        const r = game.phone(c.id);
        st2.textContent = r?.ok ? 'Connected · 03:12' : `${c.name} did not pick up. ${r?.reason === 'Already done today' ? 'You already spoke today.' : ''}`;
      }, 1400);
      timers.add(tid);
      return [screen, end];
    }
    return [
      header('Phone'),
      h('div.ph-list', null, CONTACTS.map((c) => h('button.ph-row', { type: 'button', on: { click: () => go('calls', c.id) } },
        h('span.ph-avatar', { text: c.emoji }), h('span.ph-row-body', null, h('b', { text: c.name }), h('small', { text: c.note })), h('span', { text: '📞' })))),
    ];
  }

  /* ---------------------------------------------------------------- rides, food, notes, camera, music */
  function maps() { return home(); }
  function rides() {
    const here = game.here;
    return [
      header('Rides'),
      h('p.ph-note', { text: 'Where are you going? Pick a place, then choose bike, danfo, taxi, a free ride or trek.' }),
      h('div.ph-list', null, PLACES.filter((p) => p.id !== here).map((p) => h('button.ph-row', { type: 'button', on: { click: () => { close(); actions.travel?.(p.id); } } },
        h('span.ph-avatar', { text: p.emoji }), h('span.ph-row-body', null, h('b', { text: p.name }), h('small', { text: `${p.area} · ${distanceKm(here, p.id)} km` }))))),
    ];
  }
  function food() {
    const s = game.state;
    return [
      header('Chow · food delivery'),
      h('p.ph-note', { text: `Delivered to wherever you are. Hunger: ${Math.round(s.hunger)}/100.` }),
      h('div.ph-list', null, DELIVERY.map((f) => h('div.ph-row', null,
        h('span.ph-avatar', { text: f.emoji }), h('span.ph-row-body', null, h('b', { text: f.name }), h('small', { text: `From ${f.from}` })),
        h('button.ac-btn.is-sm.is-yellow', { type: 'button', disabled: s.naira < f.naira, on: { click: () => { const r = game.phone(`order:${f.id}`); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); render(); } } }, naira(f.naira))))),
    ];
  }
  function notes() {
    const ta = h('textarea.ph-notes', { value: st.notes || '', placeholder: 'Sermon notes, prayer points, things to remember…', attrs: { 'aria-label': 'Notes' } });
    ta.addEventListener('input', () => { st.notes = ta.value.slice(0, 4000); save(); });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    return [header('Notes'), ta];
  }
  function camera() {
    const shots = st.gallery || [];
    const grid = h('div.ph-gallery');
    shots.forEach((d, i) => { const img = new Image(); img.alt = `Photo ${i + 1}`; img.src = blobUrl(d); grid.append(img); });
    return [
      header('Camera'),
      h('button.ac-btn.is-primary.is-block', {
        type: 'button',
        on: {
          click: async () => {
            close();
            await new Promise((r) => setTimeout(r, 250));
            const d = await actions.snapshot?.();
            if (!d) { toast('The camera could not take a photo.', { tone: 'warn' }); return; }
            st.gallery = [d, ...(st.gallery || [])].slice(0, 8);
            save();
            toast('📸 Photo saved in your phone.', { emoji: '📷' });
            openPhone('camera');
          },
        },
      }, '📸 Take a photo'),
      shots.length ? grid : h('p.ph-note', { text: 'No photos yet. Take one at church on Sunday!' }),
    ];
  }
  function praise() {
    return [
      header('Praise'),
      h('div.ph-card', null, h('b', { text: 'Grace Assembly Choir · Live praise' }), h('p', { text: 'Keyboard, bass, talking drum and the choir. Play it anywhere.' }),
        h('button.ac-btn.is-primary.is-block', { type: 'button', on: { click: () => { music = !music; bus?.emit('audio:music', { track: music ? 'worship' : 'none' }); render(); } } }, music ? '⏸ Pause' : '▶ Play')),
    ];
  }
  function settings() { return home(); }

  /* ---------------------------------------------------------------- billboards: advertise a church programme */
  const draft = { spot: 'yaba', title: 'HOLY GHOST NIGHT', sub: 'Friday 10pm · All are welcome', church: '', theme: 'fire', motif: 'flame' };
  function ads() {
    const s = game.state;
    if (!draft.church) draft.church = s.pastor?.church || 'Grace Assembly, Yaba';
    const canvas = h('canvas.ph-poster', { width: 512, height: 224, attrs: { 'aria-label': 'Poster preview' } });
    const paint = () => drawPoster(canvas.getContext('2d'), 0, 0, 512, 224, draft);
    const field = (label, key, max) => {
      const inp = h('input.ph-input.is-field', { value: draft[key], maxLength: max, attrs: { 'aria-label': label } });
      inp.addEventListener('input', () => { draft[key] = key === 'title' ? inp.value.toUpperCase() : inp.value; paint(); });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      return h('label.ph-field', null, h('small', { text: label }), inp);
    };
    const running = game.ads;
    requestAnimationFrame(paint);
    return [
      header('Billboards'),
      h('p.ph-note', { text: 'Put your church programme on a real Lagos billboard for a week. More people hear about it, and they come.' }),
      canvas,
      field('Programme title', 'title', 28),
      field('Date, time, venue', 'sub', 40),
      field('Church', 'church', 36),
      h('div.ph-swatches', null, Object.entries(THEMES).map(([id, [bg, ac]]) => h('button', {
        type: 'button', title: id, attrs: { 'aria-label': `Colours: ${id}`, 'aria-pressed': String(draft.theme === id) }, style: { background: `linear-gradient(135deg, ${bg} 60%, ${ac} 60%)` },
        on: { click: () => { draft.theme = id; render(); } },
      }))),
      h('div.ph-quick', null, MOTIFS.map((m) => h('button', { type: 'button', attrs: { 'aria-pressed': String(draft.motif === m) }, on: { click: () => { draft.motif = m; render(); } } }, { cross: '✝️ Cross', dove: '🕊️ Dove', flame: '🔥 Fire', crown: '👑 Crown', mic: '🎤 Mic', bible: '📖 Bible' }[m]))),
      h('p.ph-section', { text: 'Choose a billboard' }),
      h('div.ph-list', null, AD_SPOTS.map((sp) => {
        const busy = running.find((a) => a.spot === sp.id);
        return h('button.ph-row', { type: 'button', attrs: { 'aria-pressed': String(draft.spot === sp.id) }, class: draft.spot === sp.id ? 'is-picked' : '', on: { click: () => { draft.spot = sp.id; render(); } } },
          h('span.ph-avatar', { text: sp.emoji }), h('span.ph-row-body', null, h('b', { text: sp.name }), h('small', { text: busy ? `Showing "${busy.title}"` : sp.reach })),
          h('b', { text: naira(sp.naira) }));
      })),
      h('button.ac-btn.is-primary.is-block', {
        type: 'button',
        on: { click: () => { const r = game.bookAd({ ...draft }); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); render(); } },
      }, `Book for a week · ${naira(AD_SPOTS.find((x) => x.id === draft.spot).naira)}`),
      running.length ? h('p.ph-note', { text: `Running now: ${running.map((a) => `"${a.title}"`).join(', ')}. See them on the Lagos map.` }) : null,
    ];
  }
  function diary() {
    const s = game.state;
    const stats = [['Sunday streak', `${s.streak} wk`], ['Services', s.services], ['Souls won', s.souls], ['Prayed for', s.prayed], ['Given', naira(s.given || 0)], ['Repented', s.repentances]];
    return [
      header('My Story'),
      h('div.ph-stats', null, stats.map(([k, v]) => h('div', null, h('small', { text: k }), h('b', { text: String(v) })))),
      h('div.ph-list', null, s.log.slice(0, 40).map((e) => h('div.ph-tx', null, h('small', { text: logStamp(e, s.startT) }), h('span', { text: e.text })))),
    ];
  }

  /* ---------------------------------------------------------------- open / close */
  function openPhone(target = null) {
    if (!ensure()) return;
    open = true;
    backdrop.hidden = false;
    document.documentElement.classList.add('ph-open');
    bus?.emit('ui:phone', { open: true });
    go(target);
    tick();
  }
  function close() {
    if (!open) return;
    open = false;
    backdrop.hidden = true;
    document.documentElement.classList.remove('ph-open');
    for (const t of timers) clearTimeout(t);
    timers.clear();
    bus?.emit('ui:phone', { open: false });
  }

  const offs = [];
  if (bus) offs.push(bus.on('chat:message', onRoomChat));
  const onKey = (e) => { if (open && e.key === 'Escape') { e.stopPropagation(); if (app) go(app === 'chats' && sub ? 'chats' : null); else close(); } };
  window.addEventListener('keydown', onKey, true);

  return {
    el: backdrop,
    get open() { return open; },
    get unread() { return st ? unreadTotal() : 0; },
    show: openPhone,
    close,
    toggle() { if (open) close(); else openPhone(); },
    /** The multiplayer client, for the "Yaba · people online" chat. */
    setNet(n) { net = n; },
    /** Call when the game clock changes (messages arrive on their own). */
    tick,
    destroy() { close(); offs.forEach((f) => f()); window.removeEventListener('keydown', onKey, true); backdrop.remove(); },
  };
}

/** A data: URL as a blob: URL (strict hosts refuse data: images). */
function blobUrl(dataUrl) {
  try {
    const [head, b64] = dataUrl.split(',');
    const type = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type }));
  } catch { return ''; }
}
