// Modals (events and temptations with choices, Bible quiz, info, travel, game over,
// controls help, settings), toasts and the time-skip overlay.
import { h, ic, setChildren, trapFocus, store } from './dom.js';
import { naira } from '../game/content.js';

const DELTA_LABEL = { naira: '', points: '⭐', energy: 'energy', hunger: 'food', faith: 'faith', character: 'character', word: 'word', fame: 'fame' };

/** "+6 character", "-₦1,000", "+3⭐" chips. */
export function deltaChips(deltas = []) {
  if (!deltas.length) return null;
  return h('div.ac-deltas', null, deltas.map(({ key, delta }) => {
    const sign = delta > 0 ? '+' : '−';
    const abs = Math.abs(delta);
    const text = key === 'naira' ? `${sign}${naira(abs)}` : key === 'points' ? `${sign}${abs}⭐` : `${sign}${abs} ${DELTA_LABEL[key] || key}`;
    return h(`span.ac-delta${delta < 0 ? '.is-neg' : ''}`, { text });
  }));
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root
 * @param {object} o.game
 * @param {(open: boolean) => void} o.onModal called when the first modal opens / the last closes
 */
export function createDialogs({ root, game, onModal }) {
  const queue = [];
  let current = null;
  const toasts = h('div.ac-toasts', { attrs: { role: 'status', 'aria-live': 'polite' } });
  root.append(toasts);

  /* ---------------------------------------------------------------- modal core */
  /**
   * @param {{id?: string, build: (card: HTMLElement, close: () => void) => void, dismissible?: boolean, tempt?: boolean, wide?: boolean, priority?: number}} m
   */
  function open(m) {
    if (m.id && (current?.id === m.id || queue.some((q) => q.id === m.id))) return;
    queue.push(m);
    queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    if (!current) next();
  }

  function next() {
    const m = queue.shift();
    if (!m) { current = null; onModal(false); return; }
    const card = h(`div.ac-modal-card${m.wide ? '.is-wide' : ''}`, { attrs: { role: 'document' } });
    const wrap = h(`div.ac-modal${m.tempt ? '.is-tempt' : ''}`, { attrs: { role: 'dialog', 'aria-modal': 'true' } }, card);
    const prevFocus = document.activeElement;
    let closed = false;
    let untrap = () => {};
    const close = () => {
      if (closed) return;
      closed = true;
      untrap();
      wrap.remove();
      current = null;
      if (queue.length) next();
      else { onModal(false); prevFocus?.focus?.({ preventScroll: true }); }
    };
    if (m.dismissible) {
      wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
      card.append(h('button.ac-iconbtn.ac-modal-close', { type: 'button', attrs: { 'aria-label': 'Close' }, on: { click: close } }, ic('x')));
    }
    current = { ...m, close, wrap, card };
    onModal(true);
    m.build(card, close);
    if (closed) return;
    root.append(wrap);
    untrap = trapFocus(wrap);
    focusFirst(card);
  }

  function focusFirst(card) {
    requestAnimationFrame(() => {
      const b = card.querySelector('.ac-choices button, .ac-options button, .ac-btn, button:not(.ac-modal-close)');
      (b || card.querySelector('button'))?.focus({ preventScroll: true });
    });
  }

  const head = (emoji, title, text, tag) => [
    tag ? h('div', null, h('span.ac-modal-tag', null, ic('flame', { size: 13 }), tag)) : null,
    h('div.ac-modal-emoji', { text: emoji, attrs: { 'aria-hidden': 'true' } }),
    h('h3', { text: title, id: 'ac-modal-title' }),
    text ? h('p.ac-modal-text', { text }) : null,
  ];

  /* ---------------------------------------------------------------- kinds */
  /** A simple message with one button. */
  function info({ emoji = '🙏', title, text, ok = 'OK', deltas, onOk } = {}) {
    open({
      dismissible: true,
      build(card, close) {
        setChildren(card, ...head(emoji, title, text), deltaChips(deltas),
          h('div.ac-choices', null, h('button.ac-btn.is-primary', { type: 'button', on: { click: () => { close(); onOk?.(); } } }, ok)));
      },
    });
  }

  /** The game's active event / temptation / prompt, with choices and the result. */
  function event(ev) {
    if (!ev) return;
    open({
      id: `event:${ev.id}`,
      priority: 2,
      tempt: ev.tempt,
      build(card, close) {
        const choices = h('div.ac-choices', null, ev.choices.map((label, i) => h('button.ac-btn', {
          type: 'button',
          class: ev.kind === 'prompt' && ev.choices.length > 3 ? 'is-sm' : '',
          on: { click: () => choose(i) },
        }, label)));
        setChildren(card, ...head(ev.emoji, ev.title, ev.text, ev.tempt ? 'Temptation · the devil is busy' : null), choices);
        function choose(i) {
          const r = game.choose(i);
          if (!r?.ok || !r.text) { close(); return; }
          const body = r.text.startsWith(`${ev.title}: `) ? r.text.slice(ev.title.length + 2) : r.text;
          const fell = /You fell into/.test(body);
          setChildren(card,
            h('div.ac-modal-emoji', { text: fell ? '💔' : ev.emoji, attrs: { 'aria-hidden': 'true' } }),
            h('h3', { text: fell ? 'You fell' : ev.title }),
            h('p.ac-modal-text', { text: body }),
            deltaChips(r.deltas),
            h('div.ac-choices', null, h('button.ac-btn.is-primary', { type: 'button', on: { click: close } }, fell ? 'Lord, have mercy' : 'Continue')));
          focusFirst(card);
        }
      },
    });
  }

  /** Bible quiz or Bible school exam, one question at a time. */
  function quiz(q) {
    if (!q) return;
    open({
      id: 'quiz',
      priority: 3,
      build(card, close) {
        const marks = [];
        const ask = () => {
          const ex = game.state.exam;
          if (!ex) { close(); return; }
          const item = ex.questions[ex.i];
          const dots = h('div.ac-quiz-dots', { attrs: { 'aria-hidden': 'true' } }, ex.questions.map((_, i) => h(`i${marks[i] ? `.is-${marks[i]}` : ''}`)));
          const opts = h('div.ac-options', null, item.options.map((o, i) => h('button.ac-btn', { type: 'button', on: { click: () => answer(i, opts) } }, h('b', { text: 'ABCD'[i] }), h('span', { text: o }))));
          setChildren(card,
            h('div', null, h('span.ac-modal-tag', { style: { background: 'var(--blue)' } }, ic('book-open', { size: 13 }), q.kind === 'exam' ? `Semester ${q.semester} exam` : 'Daily Bible quiz')),
            dots,
            h('p.ac-note', { text: `Question ${ex.i + 1} of ${ex.questions.length}` }),
            h('p.ac-quiz-q', { text: item.q, id: 'ac-modal-title' }),
            opts);
          focusFirst(card);
        };
        const answer = (i, opts) => {
          const ex = game.state.exam;
          const right = ex.questions[ex.i].answer;
          const r = game.answer(i);
          marks.push(r.correct ? 'right' : 'wrong');
          const buttons = opts.querySelectorAll('button');
          buttons.forEach((b, k) => { b.disabled = true; if (k === right) b.classList.add('is-right'); else if (k === i) b.classList.add('is-wrong'); });
          setTimeout(() => (r.done ? result(r.result) : ask()), r.correct ? 650 : 1300);
        };
        const result = (res) => {
          setChildren(card, ...head(res.emoji, res.title, res.text), deltaChips(res.deltas),
            h('div.ac-choices', null, h('button.ac-btn.is-primary', { type: 'button', on: { click: close } }, res.kind === 'exam' && res.score < 4 ? 'I will study harder' : 'Amen')));
          focusFirst(card);
        };
        ask();
      },
    });
  }

  /** Where to? (boarding the danfo at the bus stop) */
  function travel(list) {
    open({
      id: 'travel',
      dismissible: true,
      build(card, close) {
        const rows = list.length ? list.map((a) => h('button.ac-btn', {
          type: 'button', disabled: !a.ok, class: a.ok ? '' : '',
          style: { justifyContent: 'flex-start', textAlign: 'left' },
          on: { click: () => { close(); const r = game.act(a.id); if (!r.ok && r.reason) toast(r.reason, { tone: 'warn' }); } },
        }, h('span', { text: a.emoji, style: { fontSize: '20px' } }), h('span', { style: { flex: 1, minWidth: 0 } }, h('b', { text: a.name }), h('br'), h('small', { text: a.ok ? `⚡${a.energy}${a.cost ? ` · ${naira(a.cost)}` : ''}` : a.reason, style: { fontWeight: 600 } })))) : [h('p.ac-empty', { text: 'Nowhere to go right now.' })];
        setChildren(card, ...head('🚐', 'Where to?', 'The danfo conductor is shouting "Oshodi! CMS! Enter with your change!"'), h('div.ac-choices', null, rows));
      },
    });
  }

  /** The end of the story. */
  function over(ending, onNew) {
    open({
      id: 'over',
      priority: 9,
      build(card) {
        setChildren(card, ...head(ending.emoji, ending.title, ending.text),
          h('div.ac-choices', null, h('button.ac-btn.is-primary', { type: 'button', on: { click: onNew } }, 'Start a new journey')));
      },
    });
  }

  /** Controls help (?) */
  function help() {
    if (current?.id === 'help') { current.close(); return; }
    const row = (keys, text) => h('tr', null, h('td', null, keys.map((k) => [h('kbd', { text: k }), ' '])), h('td', { text }));
    open({
      id: 'help',
      dismissible: true,
      wide: true,
      build(card) {
        setChildren(card,
          h('h3', { text: 'Controls', id: 'ac-modal-title' }),
          h('div.ac-keys-grid', null,
            h('div', null, h('h4', null, ic('keyboard', { size: 18 }), 'Keyboard'),
              h('table.ac-keys', null, h('tbody', null,
                row(['W', 'A', 'S', 'D'], 'Walk (or arrow keys)'),
                row(['Shift'], 'Run'),
                row(['Space'], 'Jump'),
                row(['C'], 'Sit down / stand up'),
                row(['P'], 'Kneel and pray'),
                row(['E'], 'Wave'),
                row(['G'], 'Clap'),
                row(['B'], 'Dance'),
                row(['F'], 'Interact (buy food, board danfo)'),
                row(['Enter'], 'Chat'),
                row(['N'], 'Sleep (at home)'),
                row(['?'], 'This help'),
                row(['Esc'], 'Close panels')))),
            h('div', null, h('h4', null, ic('smartphone', { size: 18 }), 'Phone'),
              h('table.ac-keys', null, h('tbody', null,
                h('tr', null, h('td', { text: 'Left side' }), h('td', { text: 'Drag to walk; push far to run' })),
                h('tr', null, h('td', { text: 'Right side' }), h('td', { text: 'Drag to look around' })),
                h('tr', null, h('td', { text: 'Pinch' }), h('td', { text: 'Zoom the camera' })),
                h('tr', null, h('td', { text: 'Buttons' }), h('td', { text: 'Jump, Sit, Wave, Pray, Interact' })))),
              h('h4', { style: { marginTop: '14px' } }, ic('church', { size: 18 }), 'Church life'),
              h('p.ac-note', { text: 'Services: Sunday 9am, Wednesday Bible study 6pm, Friday vigil 10pm. Sit in the hall (or serve at your post) while they run to get credit and keep your Sunday streak. One day lasts 24 minutes.' }))),
          h('div.ac-choices', null, h('button.ac-btn.is-primary', { type: 'button', on: { click: () => current?.close() } }, 'Got it')));
      },
    });
  }

  /** Settings: graphics quality, sound, day length, new life. */
  function settings({ muted, setMuted, quality, onNewLife }) {
    open({
      id: 'settings',
      dismissible: true,
      build(card, close) {
        let q = store.get('amen.quality', quality);
        const startQ = quality;
        const reload = h('button.ac-btn.is-sm.is-yellow', { type: 'button', hidden: q === startQ, on: { click: () => location.reload() } }, ic('refresh-cw', { size: 16 }), 'Reload to apply');
        const seg = (list, value, onPick) => {
          const wrap = h('div.ac-seg', { attrs: { role: 'group' } });
          const draw = (v) => setChildren(wrap, list.map(([id, label]) => h('button', { type: 'button', attrs: { 'aria-pressed': String(v === id) }, on: { click: () => { onPick(id); draw(id); } } }, label)));
          draw(value);
          return wrap;
        };
        const qSeg = seg([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], q, (id) => { q = id; store.set('amen.quality', id); reload.hidden = id === startQ; });
        const days = String(game.realMinutesPerDay);
        const dSeg = seg([['12', '12 min'], ['24', '24 min'], ['48', '48 min']], days, (id) => { store.set('amen.dayMinutes', id); game.realMinutesPerDay = Number(id); });
        let m = muted();
        const sw = h('button', { type: 'button', attrs: { role: 'switch', 'aria-checked': String(!m), 'aria-label': 'Sound' } });
        sw.addEventListener('click', () => { m = !m; setMuted(m); sw.setAttribute('aria-checked', String(!m)); });
        let confirm = false;
        const newBtn = h('button.ac-btn.is-pink.is-block', { type: 'button' }, ic('trash-2', { size: 18 }), 'Start a new life');
        newBtn.addEventListener('click', () => {
          if (!confirm) { confirm = true; newBtn.lastChild.textContent = 'Tap again: your saved life will be deleted'; return; }
          close();
          onNewLife();
        });
        setChildren(card,
          h('div.ac-settings', null,
            h('h3', { text: 'Settings', id: 'ac-modal-title', style: { textAlign: 'center' } }),
            h('div.ac-field', null, h('span', { text: 'Graphics quality' }), qSeg,
              h('small', { text: 'Low runs best on budget phones. Changes apply after a reload.' }), h('div', { style: { marginTop: '8px' } }, reload)),
            h('div.ac-field', null, h('div.ac-switch', null, h('span', { text: 'Sound and music', style: { fontWeight: 700, fontSize: '13px' } }), sw)),
            h('div.ac-field', null, h('span', { text: 'Length of a day' }), dSeg, h('small', { text: 'Real minutes per in-game day. Services follow the in-game clock.' })),
            h('div.ac-field', null, newBtn)),
          h('div.ac-choices', null, h('button.ac-btn.is-primary', { type: 'button', on: { click: close } }, 'Done')));
      },
    });
  }

  /* ---------------------------------------------------------------- toasts */
  function toast(text, { emoji = null, tone = null, deltas = null, ms = null } = {}) {
    if (!text) return;
    const t = h('div.ac-toast', { data: tone ? { tone } : {} },
      emoji ? h('span.ac-toast-emoji', { text: emoji, attrs: { 'aria-hidden': 'true' } }) : null,
      h('div.ac-toast-body', null, h('div', { text }), deltaChips(deltas || [])));
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    const life = ms || Math.min(8000, 2600 + text.length * 35);
    const hide = () => { t.classList.add('is-out'); setTimeout(() => t.remove(), 260); };
    const timer = setTimeout(hide, life);
    t.addEventListener('click', () => { clearTimeout(timer); hide(); });
  }

  /** "Good morning!" / "8 hours later" fade while the clock skips. */
  function skip(label, sub) {
    const el = h('div.ac-skip', { attrs: { 'aria-live': 'polite' } }, h('h2', { text: label }), sub ? h('p', { text: sub }) : null);
    root.append(el);
    setTimeout(() => el.remove(), 1950);
  }

  return {
    open, info, event, quiz, travel, over, help, settings, toast, skip,
    get current() { return current; },
    get isOpen() { return !!current; },
    /** Close the top modal if it can be dismissed. Returns true if one closed. */
    escape() {
      if (current?.dismissible) { current.close(); return true; }
      return false;
    },
    clear() { queue.length = 0; current?.close(); },
  };
}
