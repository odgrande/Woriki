// Bottom dock: a tab bar (Today / Prayer / Shop / Diary) whose sheet slides up over the
// 3D view and collapses back to the bar. Holds the actions that cannot happen
// physically in the world, plus guidance for the ones that can.
import { h, ic, setChildren } from './dom.js';
import {
  ROLES, SHOP, VENUES, UPGRADES, BRANCHES, VERSES, V, naira, num,
} from '../game/content.js';
import { GROUPS } from '../game/actions.js';
import { countdown, ampm } from '../game/clock.js';
import { logStamp, choirCost } from '../game/systems.js';
import { CATALOG } from '../game/life.js';

// Like Lagos Life: Home and Map are buttons (go home from anywhere, open the Lagos map);
// Buy, Today and Phone open the sheet. Prayer wall and diary live on the phone.
const TABS = [
  ['home', 'house', 'Home', true],
  ['map', 'map', 'Map', true],
  ['shop', 'shopping-bag', 'Buy'],
  ['today', 'church', 'Today'],
  ['phone', 'smartphone', 'Phone'],
];

const REASON_ICON = { where: 'map-pin', time: 'clock', energy: 'zap', money: 'wallet', done: 'check', service: 'church', busy: 'hourglass', over: 'lock', hidden: 'lock' };

/**
 * @param {object} o
 * @param {object} o.game
 * @param {HTMLElement} o.root
 * @param {(text: string, opts?: object) => void} o.toast
 * @param {(open: boolean) => void} [o.onToggle]
 * @param {{home?: () => void, map?: () => void}} [o.actions] the Home and Map buttons
 */
export function createDock({ game, root, toast, onToggle = () => {}, actions = {} }) {
  let phoneTab = 'prayer';
  let tab = 'today';
  let open = false;
  let queued = false;
  let draft = '';
  let lastKey = '';
  let pressing = false;
  let deferred = false;

  const title = h('h2', { text: 'Today' });
  const sub = h('span.ac-sheet-sub');
  const body = h('div.ac-sheet-body', { id: 'ac-sheet-body', attrs: { role: 'tabpanel', tabindex: '-1' } });
  const head = h('div.ac-sheet-head', null, h('span.ac-grab', { attrs: { 'aria-hidden': 'true' } }), title, sub,
    h('button.ac-iconbtn', { type: 'button', attrs: { 'aria-label': 'Close panel' }, on: { click: () => setOpen(false) } }, ic('chevron-down')));
  const sheet = h('section.ac-sheet', { attrs: { 'aria-label': 'Game panel' } }, head, body);

  const tabs = {};
  const nav = h('nav.ac-nav.ac-glass', { attrs: { role: 'tablist', 'aria-label': 'Game menu' } }, TABS.map(([id, icon, label]) => {
    const dot = h('span.ac-tab-dot', { hidden: true });
    const b = h('button.ac-tab', { type: 'button', id: `ac-tab-${id}`, attrs: { role: 'tab', 'aria-selected': 'false', 'aria-controls': 'ac-sheet-body' }, on: { click: () => select(id) } }, ic(icon), h('span', { text: label }), dot);
    tabs[id] = { b, dot };
    return b;
  }));
  const el = h('div.ac-dock', null, sheet, nav);
  root.append(el);

  // Never swap the DOM between a press and its release (the tap would be lost).
  body.addEventListener('pointerdown', () => { pressing = true; });
  const release = () => { pressing = false; if (deferred) { deferred = false; queue(); } };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // Swipe the sheet header down to close.
  let dragY = null;
  head.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; dragY = e.clientY; head.setPointerCapture?.(e.pointerId); });
  head.addEventListener('pointermove', (e) => {
    if (dragY === null) return;
    const dy = Math.max(0, e.clientY - dragY);
    sheet.style.transform = dy ? `translateY(${dy}px)` : '';
  });
  const endDrag = (e) => {
    if (dragY === null) return;
    const dy = e.clientY - dragY;
    dragY = null;
    sheet.style.transform = '';
    if (dy > 70) setOpen(false);
  };
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);

  const navH = new ResizeObserver(() => {
    const narrow = window.innerWidth < 1024;
    document.documentElement.style.setProperty('--amen-nav-h', narrow && !el.hidden ? `${Math.round(nav.getBoundingClientRect().height)}px` : '0px');
  });
  navH.observe(nav);

  function select(id) {
    if (TABS.find((t) => t[0] === id)?.[3]) { setOpen(false); actions[id]?.(); return; }
    if (id === 'prayer' || id === 'diary') { phoneTab = id; id = 'phone'; lastKey = ''; }
    if (open && tab === id) { setOpen(false); return; }
    tab = id;
    setOpen(true);
  }

  function setOpen(v) {
    open = v;
    el.classList.toggle('is-open', open);
    for (const [id, t] of Object.entries(tabs)) t.b.setAttribute('aria-selected', String(open && id === tab));
    onToggle(open);
    if (open) { lastKey = ''; render(); body.scrollTop = 0; }
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  }

  /** What the open tab shows, as a string: re-render only when it changes. */
  function contentKey(s) {
    const p = game.progress;
    const base = [tab, s.over, Math.round(p ? p.value * 50 : -1), p?.hint || '', p?.kind || ''];
    if (tab === 'today') {
      const acts = game.actions().map((a) => `${a.id}:${a.ok ? 1 : 0}${a.done ? 1 : 0}${a.active ? 1 : 0}${a.reason || ''}${a.cost}${a.energy}`).join('|');
      const m = game.milestone;
      return JSON.stringify([...base, Math.floor(s.T / 5), acts, m ? m.reqs.map((r) => r.join()).join() : '', s.convicted, s.role, s.stage]);
    }
    if (tab === 'phone' && phoneTab === 'diary') return JSON.stringify([tab, phoneTab, s.log.length, s.log[0]?.text, s.streak, s.services, s.souls, s.prayed, Math.round(s.word), s.testimonies, s.role, s.rank, s.stage]);
    if (tab === 'phone') {
      const acts = game.actions('prayer').map((a) => `${a.id}:${a.ok ? 1 : 0}${a.done ? 1 : 0}${a.reason || ''}`).join('|');
      return JSON.stringify([...base, phoneTab, s.prayed, s.requests, acts]);
    }
    if (tab === 'shop') return JSON.stringify([tab, s.naira, s.points, s.items, s.home, s.pastor, s.over]);
    return JSON.stringify([tab, s.log.length, s.log[0]?.text, s.streak, s.services, s.souls, s.prayed, Math.round(s.word), s.testimonies, s.role, s.rank, s.stage]);
  }

  /* ---------------------------------------------------------------- shared bits */
  function actionRow(a) {
    const live = a.active;
    const cls = ['ac-act'];
    if (a.shady) cls.push('is-shady');
    if (a.id === 'repent') cls.push('is-repent');
    if (a.done) cls.push('is-done');
    else if (!a.ok && !live) cls.push('is-locked');
    if (live) cls.push('is-active');
    const meta = [];
    if (a.energy) meta.push(h('span.ac-chip.is-yellow', null, ic('zap'), String(a.energy)));
    if (a.cost) meta.push(h('span.ac-chip', { text: naira(a.cost) }));
    if (a.stay) meta.push(h('span.ac-chip.is-blue', null, ic('timer'), `${a.stay} min`));
    if (a.away) meta.push(h('span.ac-chip.is-blue', null, ic('timer'), countdown(a.away)));
    if (a.where && a.ok) meta.push(h('span.ac-chip', null, ic('map-pin'), a.where));
    if (a.kneel && a.ok) meta.push(h('span.ac-chip.is-purple', { text: 'Kneel (P)' }));
    if (!a.ok && !a.done && !live && a.reason) meta.push(h('span.ac-reason', null, ic(REASON_ICON[a.code] || 'info'), a.reason));
    let label = 'Do';
    if (a.kneel) label = 'Kneel';
    else if (a.stay) label = 'Start';
    else if (a.away) label = 'Go';
    if (live) label = 'Stop';
    const go = h('button.ac-btn.is-sm.ac-act-go', {
      type: 'button',
      disabled: !(a.ok || live),
      class: live ? 'is-pink' : a.ok && !a.shady ? 'is-green' : '',
      attrs: { 'aria-label': `${label}: ${a.name}` },
      on: { click: () => (live ? game.cancelShift() : doAct(a)) },
    }, a.done ? ic('check', { size: 16 }) : label);
    return h(`div.${cls.join('.')}`, null,
      h('span.ac-act-ic', { text: a.emoji, attrs: { 'aria-hidden': 'true' } }),
      h('span.ac-act-body', null,
        h('span.ac-act-name', null, a.name, a.shady ? h('span.ac-tag', { text: 'temptation' }) : null),
        h('span.ac-act-desc', { text: a.desc }),
        meta.length ? h('span.ac-act-meta', null, meta) : null),
      go);
  }

  function doAct(a) {
    const r = game.act(a.id);
    if (!r) return;
    if (!r.ok && r.reason) toast(r.reason, { tone: 'warn' });
    else if (r.pending === 'kneel') { toast(r.text, { emoji: '🙏', tone: 'info' }); setOpen(false); }
    else if (r.pending === 'shift') setOpen(false);
  }

  const section = (text) => h('div.ac-section', { text });

  /* ---------------------------------------------------------------- Today */
  function nowCard(s) {
    const c = game.clock;
    const p = game.progress;
    const post = game.postLabel;
    if (s.over) {
      return h('div.ac-now', { data: { tone: 'away' } }, h('div.ac-now-top', null, h('div.ac-now-emoji', { text: s.ending?.emoji || '🕊️' }), h('div', null, h('h3', { text: s.ending?.title || 'Story ended' }), h('p', { text: 'Start a new life from Settings.' }))));
    }
    if (p && p.kind === 'shift') {
      return h('div.ac-now', { data: { tone: p.hint ? 'away' : 'live' } },
        h('div.ac-now-top', null, h('div.ac-now-emoji', { text: p.emoji }), h('div', null, h('h3', { text: p.label }), h('p', { text: p.hint || 'Stay here until it is done.' }))),
        h('div.ac-progress', null, h('b', { style: { width: `${Math.round(p.value * 100)}%` } })),
        h('div.ac-now-row', null, h('span', { text: `${Math.round(p.value * 100)}% done` }), h('button.ac-btn.is-sm', { type: 'button', on: { click: () => game.cancelShift() } }, 'Stop')));
    }
    if (c.current) {
      const svc = c.current;
      const pr = p && p.kind === 'service' ? p : { value: 0, goal: svc.def.credit, present: false };
      const pct = Math.round(pr.value * 100);
      const done = s.doneToday[svc.kind];
      const hint = pr.present ? (pr.value >= pr.goal ? 'You are in. It counts!' : `Stay until ${Math.round(pr.goal * 100)}% to get credit.`)
        : (post ? `Serve at ${post}, or sit in the hall.` : 'Go to the church hall and sit down (C).');
      return h('div.ac-now', { data: { tone: pr.present || done ? 'live' : 'away' } },
        h('div.ac-now-top', null, h('div.ac-now-emoji', { text: svc.def.emoji }),
          h('div', null, h('h3', { text: `${svc.name} is on` }), h('p', { text: `Ends ${ampm(svc.end)} · ${hint}` }))),
        h('div.ac-progress', { attrs: { role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Attendance' } },
          h('b', { style: { width: `${pct}%` } }), h('i', { style: { left: `${pr.goal * 100}%` } })),
        h('div.ac-now-row', null, h('span', { text: `You've attended ${pct}%` }), h('span', { text: `${countdown(svc.end - s.T)} left` })));
    }
    if (c.next) {
      const n = c.next;
      const soon = n.inMinutes <= 180;
      const done = s.doneToday[n.kind];
      return h('div.ac-now', { data: { tone: soon ? 'soon' : 'calm' } },
        h('div.ac-now-top', null, h('div.ac-now-emoji', { text: n.def.emoji }),
          h('div', null,
            h('h3', { text: soon ? `${n.name} in ${countdown(n.inMinutes)}` : `Next: ${n.name}` }),
            h('p', { text: soon ? (post ? `Be at ${post} by ${ampm(n.start)}.` : `Walk to Grace Assembly and find a seat before ${ampm(n.start)}.`) : `${n.when}. ${done ? '' : 'Services are where the church comes alive.'}` }))));
    }
    return null;
  }

  /** Today's church plan for this role, then normal life. */
  function planCard() {
    const plan = game.plan;
    if (!plan) return null;
    return h('div.ac-plan', null,
      h('div.ac-plan-title', null, ic('church'), `${plan.weekday} at Grace Assembly`),
      plan.items.length
        ? h('ul', null, plan.items.map((x) => h(`li${x.done ? '.is-done' : x.live ? '.is-live' : x.past ? '.is-past' : ''}`, null,
          h('span.ac-plan-time', { text: x.time }), h('span', { text: `${x.emoji} ${x.name}` }),
          h('span.ac-plan-state', { text: x.done ? '✓ done' : x.live ? 'on now' : x.past ? 'missed' : '' }))))
        : h('p', { text: 'No church meeting for you today.' }),
      h('p.ac-plan-idea', { text: plan.idea }));
  }

  function journeyCard(s) {
    const m = game.milestone;
    if (!m) return null;
    return h('div.ac-journey', null,
      h('div.ac-journey-title', null, ic('flag'), `Next step: ${m.label}`),
      h('ul', null, m.reqs.map(([text, ok]) => h(`li${ok ? '.is-ok' : ''}`, null, ic(ok ? 'circle-check' : 'circle'), h('span', { text })))),
      m.go === null ? null : h('button.ac-btn.is-block', {
        type: 'button', class: m.can ? 'is-primary' : '', disabled: !m.can,
        on: { click: () => { const r = game.advanceJourney(); if (!r.ok && r.reason) toast(r.reason, { tone: 'warn' }); } },
      }, m.can ? `${m.label}` : 'Keep growing…', m.can ? ic('arrow-right', { size: 18 }) : null));
  }

  function renderToday(s) {
    const c = game.clock;
    const v = VERSES[(c.day - 1) % VERSES.length];
    const out = [
      h('p.ac-verse', null, ic('quote'), h('span', null, `“${v[1]}” `, h('b', { text: `— ${v[0]}` }))),
      nowCard(s),
      planCard(),
      journeyCard(s),
    ];
    const prayers = game.actions('prayer');
    if (prayers.length) out.push(section('Prayer'), ...prayers.map(actionRow));
    for (const [group, label] of GROUPS) {
      const list = game.actions(group);
      if (!list.length) continue;
      let text = label;
      if (group === 'duty') text = `Your duty · ${ROLES[s.role].emoji} ${ROLES[s.role].name}`;
      out.push(section(text));
      if (group === 'mission') out.push(h('p.ac-note', { text: 'Board the danfo at the bus stop. Harder missions need more faith and character, and pay more.' }));
      if (group === 'duty' && game.postLabel) out.push(h('p.ac-note', { text: `During services, serve at ${game.postLabel} to earn your duty reward.` }));
      // Order: ready first, then locked, then done.
      const rank = (a) => (a.active ? -1 : a.ok ? 0 : a.done ? 2 : 1);
      list.sort((a, b) => rank(a) - rank(b));
      out.push(...list.map(actionRow));
    }
    return out;
  }

  /* ---------------------------------------------------------------- Prayer */
  function renderPrayer(s) {
    const ta = h('textarea', { id: 'ac-req', rows: 2, maxLength: 200, placeholder: 'What should we pray about?', value: draft });
    ta.addEventListener('input', () => { draft = ta.value; });
    const post = () => { const r = game.postRequest(ta.value); if (r.ok) draft = ''; else if (r.reason) toast(r.reason, { tone: 'warn' }); };
    return [
      h('div.ac-hero', null,
        h('div.ac-hero-count', null, h('strong', { text: String(s.prayed) }), h('span', { text: s.prayed === 1 ? 'request you have prayed for' : 'requests you have prayed for' })),
        h('p', { text: `“${V.request[1]}” — ${V.request[0]}` })),
      section('Prayer room'),
      ...game.actions('prayer').map(actionRow),
      h('p.ac-note', { text: 'Kneel with P (or the Pray button) to pray anywhere. The prayer room at Grace Assembly is open 24/7. Requests on the wall are examples for now; with more players online they become real people\'s requests.' }),
      section('Your prayer requests'),
      h('div.ac-req-form', null, h('label.ac-sr', { htmlFor: 'ac-req', text: 'Your prayer request' }), ta,
        h('button.ac-btn.is-primary.is-sm', { type: 'button', attrs: { 'aria-label': 'Post request' }, on: { click: post } }, ic('send', { size: 16 }), 'Post')),
      s.requests.length ? null : h('p.ac-empty', { text: 'No requests yet. In everything, let your requests be made known unto God.' }),
      ...s.requests.map((r) => h(`div.ac-req${r.answered ? '.is-answered' : ''}`, null,
        h('p', { text: r.text }),
        h('div.ac-req-meta', { text: r.answered ? `Answered · posted day ${r.day}` : `Posted day ${r.day}` }),
        r.answered ? null : h('button.ac-btn.is-sm.is-green', { type: 'button', on: { click: () => game.markAnswered(r.id) } }, 'God answered!'))),
    ];
  }

  /* ---------------------------------------------------------------- Shop */
  function buyRow({ emoji, name, desc, price, owned, can, onBuy, shady }) {
    return h(`div.ac-act${owned ? '.is-owned' : ''}${shady && !owned ? '.is-shady' : ''}`, null,
      h('span.ac-act-ic', { text: emoji, attrs: { 'aria-hidden': 'true' } }),
      h('span.ac-act-body', null, h('span.ac-act-name', { text: name }), h('span.ac-act-desc', { text: desc })),
      owned ? h('span.ac-chip.is-green', null, ic('check'), 'Yours')
        : h('button.ac-btn.is-sm.ac-act-go', { type: 'button', disabled: !can, class: can ? 'is-yellow' : '', attrs: { 'aria-label': `Buy ${name} for ${price}` }, on: { click: onBuy } }, h('span.ac-price', { text: price })));
  }

  function renderShop(s) {
    const home = s.home || {};
    const rooms = [...new Set(CATALOG.map((c) => c.room))];
    const out = [
      h('div.ac-wallet', null, h('div', null, h('span', { text: 'Naira' }), h('strong', { text: naira(s.naira) })), h('div', null, h('span', { text: 'Points' }), h('strong', null, String(s.points), ic('star', { cls: 'ac-star' })))),
      h('p.ac-note', { text: 'Naira comes from work and missions. ⭐ points come from showing up, serving and praying. Remember your tithe and offering on Sunday.' }),
      section('For the church'),
      ...SHOP.filter((it) => ['bible', 'mat', 'tambourine', 'outfit', 'gele'].includes(it.id)).map((it) => buyRow({
        emoji: it.emoji, name: it.name, desc: it.desc, price: it.naira ? naira(it.naira) : `${it.points}⭐`, owned: !!s.items[it.id],
        can: !s.over && (it.naira ? s.naira >= it.naira : s.points >= it.points), onBuy: () => game.buy(it.id),
      })),
      ...rooms.flatMap((room) => [
        section(`Home catalog · ${room}`),
        ...CATALOG.filter((c) => c.room === room).map((c) => buyRow({
          emoji: c.emoji, name: c.name, desc: c.perk, price: naira(c.naira), owned: !!home[c.id], shady: c.vanity,
          can: !s.over && s.naira >= c.naira, onBuy: () => { const r = game.buyFurniture(c.id); if (r && !r.ok && r.reason) toast(r.reason, { tone: 'warn' }); },
        })),
      ]),
      h('p.ac-note', { text: 'Furniture is delivered to No. 14 straight away. Go home to see it.' }),
      section('Getting around'),
      ...SHOP.filter((it) => !['bible', 'mat', 'tambourine', 'outfit', 'gele'].includes(it.id)).map((it) => buyRow({
        emoji: it.emoji, name: it.name, desc: it.desc, price: it.naira ? naira(it.naira) : `${it.points}⭐`, owned: !!s.items[it.id],
        can: !s.over && (it.naira ? s.naira >= it.naira : s.points >= it.points), onBuy: () => game.buy(it.id),
      })),
      section('Food'),
      h('p.ac-note', { text: 'Eat at Mama Nkechi\'s buka in the market, the church canteen, or cook at home. Walk there and press F (Interact).' }),
    ];
    const P = s.pastor;
    if (!P) return out;
    const next = VENUES[P.venue + 1];
    out.push(section(`${P.church} · venue`));
    out.push(next
      ? buyRow({ emoji: next.emoji, name: `Move to a ${next.name}`, desc: `Capacity ${num(next.cap)} · rent ${naira(next.rent)}/week`, price: naira(next.cost), can: !s.over && s.naira >= next.cost, onBuy: () => game.moveVenue() })
      : buyRow({ emoji: '🏕️', name: 'Camp Ground', desc: 'Room for the whole flock.', owned: true }));
    out.push(section('Choir'));
    out.push(P.choir >= 5
      ? buyRow({ emoji: '🎶', name: 'Choir level 5/5', desc: 'Heaven-sent worship.', owned: true })
      : buyRow({ emoji: '🎶', name: `Choir level ${P.choir}/5`, desc: 'Train and equip the choir.', price: naira(choirCost(s)), can: !s.over && s.naira >= choirCost(s), onBuy: () => game.upgradeChoir() }));
    for (const [label, vanity] of [['Equipment & projects', false], ['Lifestyle (temptation)', true]]) {
      out.push(section(label));
      for (const u of UPGRADES.filter((x) => !!x.vanity === vanity)) {
        out.push(buyRow({ emoji: u.emoji, name: u.name, desc: u.desc, price: naira(u.cost), owned: !!P.owned[u.id], can: !s.over && s.naira >= u.cost, onBuy: () => game.buyUpgrade(u.id), shady: u.vanity }));
      }
    }
    out.push(section('Branches'));
    for (const b of BRANCHES) {
      out.push(buyRow({ emoji: b.flag, name: `Branch: ${b.name}`, desc: P.branches[b.id] ? `Sends ${naira(b.daily)} a day.` : P.venue < 4 ? 'Needs an Auditorium first.' : `Will send ${naira(b.daily)} a day.`, price: naira(b.cost), owned: !!P.branches[b.id], can: !s.over && P.venue >= 4 && s.naira >= b.cost, onBuy: () => game.openBranch(b.id) }));
    }
    return out;
  }

  /* ---------------------------------------------------------------- Diary */
  function renderDiary(s) {
    const r = ROLES[s.role];
    const stats = [
      ['Sunday streak', `${s.streak} wk`],
      ['Services', s.services],
      ['Souls won', s.souls],
      ['Prayed for', s.prayed],
      ['Word', Math.round(s.word)],
      ['Testimonies', s.testimonies],
    ];
    if (s.pastor) stats.push(['Members', num(s.pastor.members)], ['Venue', VENUES[s.pastor.venue].name], ['Fame', Math.round(s.fame)]);
    else stats.push(['Falls', s.falls], ['Repented', s.repentances], ['Salary', naira(s.salary)]);
    return [
      h('div.ac-profile', null, h('div.ac-avatar', { text: r.emoji, attrs: { 'aria-hidden': 'true' } }),
        h('div', null, h('b', { text: `${game.title} ${s.name}` }), h('span', { text: `${r.name} · ${s.church}, Yaba · from ${s.from || s.area} · ${s.job}` }))),
      h('div.ac-stats', null, stats.map(([k, v]) => h('div.ac-stat', null, h('span', { text: k }), h('strong', { text: String(v) })))),
      section('Your story'),
      h('ul.ac-log', null, s.log.map((e) => h('li', null, h('span.ac-when', { text: logStamp(e, s.startT) }), e.text))),
    ];
  }

  /* ---------------------------------------------------------------- Phone */
  function renderPhone(s) {
    const seg = h('div.ac-seg.ac-phone-seg', { attrs: { role: 'group', 'aria-label': 'Phone apps' } },
      [['prayer', '🙏 Prayer wall'], ['diary', '📔 My story']].map(([id, label]) => h('button', {
        type: 'button', attrs: { 'aria-pressed': String(phoneTab === id) },
        on: { click: () => { phoneTab = id; lastKey = ''; render(); } },
      }, label)));
    return [seg, ...(phoneTab === 'diary' ? renderDiary(s) : renderPrayer(s))];
  }

  /* ---------------------------------------------------------------- render */
  function render() {
    queued = false;
    const s = game.state;
    if (!s || !open) return;
    if (pressing) { deferred = true; return; }
    const key = contentKey(s);
    const c0 = game.clock;
    if (tab === 'today') sub.textContent = `${c0.weekdayName} ${c0.time} · Day ${c0.day}`;
    if (key === lastKey) return;
    lastKey = key;
    const [, , label] = TABS.find((t) => t[0] === tab);
    title.textContent = label;
    const c = game.clock;
    sub.textContent = tab === 'today' ? `${c.weekdayName} ${c.time} · Day ${c.day}` : tab === 'shop' ? `${naira(s.naira)} · ${s.points} points` : tab === 'phone' ? (phoneTab === 'diary' ? 'My story' : 'Prayer wall') : '';
    const top = body.scrollTop;
    const focusId = document.activeElement?.id;
    const content = tab === 'today' ? renderToday(s) : tab === 'shop' ? renderShop(s) : renderPhone(s);
    setChildren(body, content);
    body.scrollTop = top;
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }

  function updateBadges() {
    const s = game.state;
    if (!s) return;
    const m = game.milestone;
    const today = (s.convicted ? 1 : 0) + (m && m.can ? 1 : 0);
    tabs.today.dot.hidden = !today;
    tabs.today.dot.textContent = String(today);
  }

  return {
    el,
    get open() { return open; },
    get tab() { return tab; },
    select,
    setOpen,
    /** Refresh on state changes (coalesced to one render per frame). */
    update() {
      updateBadges();
      if (!open || queued) return;
      // Don't re-render under the user's fingers while they type.
      if (document.activeElement?.id === 'ac-req') return;
      queue();
    },
    show(v) { el.hidden = !v; if (!v) setOpen(false); navH.disconnect(); navH.observe(nav); },
    destroy() {
      navH.disconnect();
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      el.remove();
    },
  };
}
