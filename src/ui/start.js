// Start screen: name, church tradition and role picker, then the appearance editor with a
// live rotating 3D preview (createCharacter from src/characters).
import { h, ic, setChildren } from './dom.js';
import { createPreview } from './preview.js';
import { ROLES, CHURCH_TYPES, ROLE_IDS } from '../game/content.js';

// Labels for the appearance contract (ARCHITECTURE.md → Characters). The characters
// module's own lists are used when loaded; these are the fallbacks and the UI names.
const SKIN_FALLBACK = ['#b98563', '#9a6646', '#7e4f35', '#663d28', '#4f2e1f', '#3b2218'];
const BODY = [['male', 'Man'], ['female', 'Woman']];
const HAIR = [['buzzed', 'Low cut'], ['buzzedfemale', 'Short'], ['buns', 'Bun'], ['long', 'Long'], ['simpleparted', 'Side part'], ['none', 'Bald']];
const HAIR_COLORS = [['#1b1b1b', 'Black'], ['#3b2a1e', 'Dark brown'], ['#7a3b1d', 'Auburn'], ['#a3a3a3', 'Grey']];
const OUTFIT = [
  ['senator', 'Senator'], ['agbada', 'Agbada'], ['ankara-shirt', 'Ankara shirt'], ['shirt-trousers', 'Shirt & trousers'], ['suit', 'Suit'],
  ['iro-buba', 'Iro & buba'], ['ankara-gown', 'Ankara gown'], ['skirt-blouse', 'Skirt & blouse'], ['tshirt-jeans', 'T-shirt & jeans'],
  ['choir-robe', 'Choir robe'], ['white-garment', 'White garment'], ['usher', 'Usher uniform'], ['security', 'Security uniform'], ['apron', 'Kitchen apron'],
];
const PATTERN = [['ankara-1', 'Ankara I'], ['ankara-2', 'Ankara II'], ['ankara-3', 'Ankara III'], ['lace', 'Lace'], ['stripes', 'Stripes'], ['plain', 'Plain']];
const HEADWEAR = [['none', 'None'], ['gele', 'Gele'], ['fila', 'Fila'], ['cap', 'Cap'], ['beret', 'Beret'], ['headscarf', 'Headscarf']];
const PRIMARY = ['#c2410c', '#b91c1c', '#be185d', '#7e22ce', '#1d4ed8', '#1e3a8a', '#0f766e', '#15803d', '#ca8a04', '#f3efe4', '#f8fafc', '#111827'];
const SECONDARY = ['#facc15', '#d4af37', '#f97316', '#e11d48', '#0ea5e9', '#22c55e', '#a3e635', '#f5f0e6', '#1f2937', '#111827'];
const FEMALE_ONLY = ['ankara-gown', 'skirt-blouse', 'iro-buba'];
const SKIN_NAMES = ['Light brown', 'Caramel', 'Brown', 'Chocolate', 'Deep brown', 'Ebony'];
/** Where each role spends church time (one line on the role card). */
const ROLE_PLACE = {
  worshipper: 'In the pews', prayer: 'Prayer room', security: 'Gate & car park', usher: 'Hall aisles', choir: 'Choir stand',
  media: 'Media desk', hospitality: 'Church kitchen', children: 'Kids\' church', visitor: 'Just looking', minister: 'Bible school',
};

const SILHOUETTE = '<svg class="ac-silhouette" viewBox="0 0 100 200" aria-hidden="true"><circle cx="50" cy="26" r="17" fill="#18181b"/><path d="M22 58c0-9 8-14 28-14s28 5 28 14l6 64c1 6-8 7-9 1l-6-45-3 118c0 8-12 8-12 0l-4-70-4 70c0 8-12 8-12 0L31 78l-6 45c-1 6-10 5-9-1z" fill="#18181b"/></svg>';

/**
 * @param {object} o
 * @param {HTMLElement} o.root
 * @param {object} o.game
 * @param {() => Promise<object>} o.getLib resolves {kit, createCharacter, randomAppearance, normalizeAppearance, SKIN_TONES}
 * @param {(profile: object, how: 'new'|'continue') => void} o.onBegin
 * @param {string} [o.quality]
 */
export function createStartScreen({ root, game, getLib, onBegin, quality = 'medium' }) {
  const el = h('div.ac-start', { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Start Amen City' } });
  root.append(el);
  el.hidden = true;

  const st = { step: 'who', name: '', role: 'worshipper', tradition: 'pentecostal', appearance: null, lookRole: null, customized: false, error: '' };
  let preview = null;
  let lib = null;

  getLibSafe().then((l) => { lib = l; });

  function getLibSafe() {
    return getLib().catch((e) => { console.warn('[ui] characters unavailable', e); return null; });
  }

  /* ---------------------------------------------------------------- step 1: who are you */
  function renderWho() {
    disposePreview();
    el.classList.remove('is-editor');
    const saved = game.saved;
    const nameInput = h('input.ac-input', { id: 'ac-name', value: st.name, maxLength: 20, autocomplete: 'off', placeholder: 'e.g. Tunde, Chioma, Ifeanyi', attrs: { 'aria-describedby': 'ac-name-err', enterkeyhint: 'next' } });
    nameInput.addEventListener('input', () => { st.name = nameInput.value; if (st.error) { st.error = ''; err.textContent = ''; } });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
    const err = h('p.ac-perk', { id: 'ac-name-err', text: st.error, style: { color: 'var(--red)' }, attrs: { role: 'alert' } });

    const roleInfo = h('p.ac-role-info');
    const showRole = () => {
      const r = ROLES[st.role];
      setChildren(roleInfo, h('b', { text: `${r.emoji} ${r.name}: ` }), r.blurb, r.postLabel ? ` During services you serve at ${r.postLabel}.` : '');
    };
    const roles = h('div.ac-roles', null, ROLE_IDS.map((id) => {
      const r = ROLES[id];
      const input = h('input', { type: 'radio', name: 'ac-role', value: id, checked: st.role === id, attrs: { 'aria-describedby': 'ac-role-info' } });
      input.addEventListener('change', () => { st.role = id; showRole(); });
      return h('label.ac-role', null, input,
        h('span.ac-role-emoji', { text: r.emoji, attrs: { 'aria-hidden': 'true' } }),
        h('span.ac-role-name', { text: r.name }),
        h('span.ac-role-blurb', { text: ROLE_PLACE[id] }));
    }));
    roleInfo.id = 'ac-role-info';
    showRole();

    const perk = h('p.ac-perk', { text: CHURCH_TYPES[st.tradition].perk });
    const trads = h('div.ac-trads', null, Object.entries(CHURCH_TYPES).map(([id, t]) => {
      const input = h('input', { type: 'radio', name: 'ac-trad', value: id, checked: st.tradition === id });
      input.addEventListener('change', () => { st.tradition = id; perk.textContent = t.perk; });
      return h('label.ac-trad', null, input, h('span', { text: t.emoji, attrs: { 'aria-hidden': 'true' } }), h('span', { text: t.name }));
    }));

    const cont = saved && !saved.over ? [
      h('div.ac-continue', null,
        h('div.ac-avatar', { text: saved.emoji, attrs: { 'aria-hidden': 'true' } }),
        h('div.ac-continue-text', null, h('b', { text: `Continue as ${saved.name}` }), h('span', { text: `${saved.roleName} · Day ${saved.day}` })),
        h('button.ac-btn.is-primary', { type: 'button', on: { click: () => onBegin(null, 'continue') } }, 'Continue', ic('arrow-right', { size: 18 }))),
      h('p.ac-or', { text: 'or start a new life' }),
    ] : null;

    setChildren(el, h('div.ac-start-inner.ac-step.is-wide', null,
      h('header.ac-brand', null,
        h('div.ac-logo', { html: '' }, ic('church')),
        h('h1', { text: 'Amen City' }),
        h('p.ac-tagline', null, 'Your place in God\'s house in Yaba, Lagos. ', h('span.ac-mark', { text: 'Pick your role.' })),
        h('ul.ac-pitch', null,
          h('li', null, h('span', { text: '⛪' }), 'Real services: Sunday 9am, Wednesday Bible study, Friday vigil'),
          h('li', null, h('span', { text: '🙏' }), 'Pray, serve at your post, win souls across Lagos'),
          h('li', null, h('span', { text: '💬' }), 'Worship and chat with real people'),
          h('li', null, h('span', { text: '😈' }), 'The devil is busy. Stand firm, or repent and rise'))),
      cont,
      h('form.ac-card', { attrs: { novalidate: true }, on: { submit: (e) => { e.preventDefault(); next(); } } },
        h('label.ac-label', { htmlFor: 'ac-name', text: 'Your name' }),
        nameInput, err,
        h('fieldset.ac-fieldset', null, h('legend', { text: 'Who are you in church?' }), roles, roleInfo),
        h('fieldset.ac-fieldset', null, h('legend', { text: 'Church tradition' }), trads, perk),
        h('button.ac-btn.is-primary.is-big.is-block', { type: 'submit' }, 'Next: your look', ic('arrow-right', { size: 20 })),
        saved && !saved.over ? h('p.ac-disclaimer', { text: 'Starting a new life replaces your saved one.' }) : null),
      h('p.ac-disclaimer', { text: 'A virtual church community. All churches and people are fictional; the places in Lagos are real. Scripture from the King James Version.' })));
  }

  function next() {
    const name = st.name.replace(/\s+/g, ' ').trim();
    if (!name) {
      st.error = 'Please enter your name.';
      renderWho();
      el.querySelector('#ac-name')?.focus();
      return;
    }
    st.name = name.slice(0, 20);
    st.step = 'look';
    render();
  }

  /* ---------------------------------------------------------------- step 2: appearance */
  function defaultLook() {
    if (lib?.randomAppearance) return lib.randomAppearance(Math.random, st.role);
    return { body: 'male', skin: 3, hair: 'buzzed', beard: false, outfit: 'senator', colors: { primary: '#1e3a8a', secondary: '#d4af37', pattern: 'plain' }, headwear: 'none' };
  }
  const norm = (a) => (lib?.normalizeAppearance ? lib.normalizeAppearance(a) : a);

  function renderLook() {
    el.classList.add('is-editor');
    if (!st.appearance || (!st.customized && st.lookRole !== st.role)) {
      st.appearance = norm(defaultLook());
      st.lookRole = st.role;
    }
    const canvas = h('canvas', { attrs: { 'aria-label': 'Your character, drag to turn' } });
    const msg = h('div.ac-stage-msg', null, h('div.ac-spinner'), h('span', { text: 'Dressing your character…' }));
    const tag = h('div.ac-nametag', null, h('span', { text: ROLES[st.role].emoji }), h('span', { text: `${st.name} · ${ROLES[st.role].name}` }));
    const panel = h('div.ac-panel');
    const stage = h('div.ac-stage', null,
      canvas, msg,
      h('div.ac-stage-bar', null,
        h('button.ac-iconbtn', { type: 'button', attrs: { 'aria-label': 'Back' }, on: { click: back } }, ic('arrow-left')),
        h('h2', { text: 'Your look' }),
        h('button.ac-iconbtn', { type: 'button', title: 'Surprise me', attrs: { 'aria-label': 'Random look' }, on: { click: randomize } }, ic('dices'))),
      tag,
      h('div.ac-hint-rotate', null, ic('rotate-cw'), 'Drag to turn'));
    const enter = h('button.ac-btn.is-primary.is-big', { type: 'button', on: { click: begin } }, 'Enter Amen City', ic('arrow-right', { size: 20 }));
    setChildren(el, h('div.ac-editor.ac-step', null, stage,
      h('div.ac-side', null, panel, h('div.ac-foot', null,
        h('button.ac-btn.is-ghost', { type: 'button', on: { click: back } }, 'Back'), enter))));

    preview = createPreview(canvas, {
      quality,
      getKit: async () => { const l = lib || await getLibSafe(); if (!l) throw new Error('no characters'); lib = l; return l; },
      onState(s) {
        if (s === 'ready') msg.hidden = true;
        if (s === 'error') setChildren(msg, h('div', { html: SILHOUETTE }), h('span', { text: 'Preview unavailable. Your look is saved.' }));
      },
    });
    // When the characters module arrives after the editor opened, give a role look.
    if (!lib) getLibSafe().then((l) => { if (!l) return; lib = l; if (!st.customized) { st.appearance = norm(defaultLook()); renderPanel(panel); } preview?.setAppearance(st.appearance); });
    else preview.setAppearance(st.appearance);
    renderPanel(panel);
  }

  function update(patch, panel) {
    const a = { ...st.appearance, ...patch, colors: { ...st.appearance.colors, ...(patch.colors || {}) } };
    if (patch.outfit && patch.outfit !== st.appearance.outfit) delete a.colors; // the outfit's own colours
    if (patch.body) {
      if (patch.body === 'male' && FEMALE_ONLY.includes(a.outfit)) { a.outfit = 'senator'; delete a.colors; }
      if (patch.body === 'male' && ['gele', 'headscarf'].includes(a.headwear)) a.headwear = 'none';
      if (patch.body === 'female') { a.beard = false; if (a.headwear === 'fila') a.headwear = 'none'; }
      if (patch.body === 'female' && ['buzzed', 'simpleparted', 'none'].includes(a.hair)) a.hair = 'buns';
      if (patch.body === 'male' && ['buns', 'long', 'buzzedfemale'].includes(a.hair)) a.hair = 'buzzed';
    }
    if ((patch.headwear === 'gele' || patch.headwear === 'headscarf') && a.body === 'female' && a.hair === 'long') a.hair = 'buns';
    st.appearance = norm(a);
    if (!a.colors && !lib) st.appearance.colors = { primary: '#1e3a8a', secondary: '#d4af37', pattern: 'plain' };
    st.customized = true;
    preview?.setAppearance(st.appearance);
    renderPanel(panel);
  }

  function renderPanel(panel) {
    const a = st.appearance;
    const top = panel.scrollTop;
    const pills = (list, value, key, o = {}) => h(`div.ac-pills${o.scroll ? '.is-scroll' : ''}${o.seg ? '.ac-seg2' : ''}`, { attrs: { role: 'group', 'aria-label': o.label } },
      list.map(([v, label]) => h('button.ac-pill', { type: 'button', attrs: { 'aria-pressed': String(value === v) }, on: { click: () => update(o.make ? o.make(v) : { [key]: v }, panel) } }, label)));
    const swatches = (list, value, make, o = {}) => h(`div.ac-swatches${o.small ? '.is-small' : ''}`, { attrs: { role: 'group', 'aria-label': o.label } },
      list.map((c, i) => h('button.ac-swatch', { type: 'button', style: { '--c': c }, title: o.names?.[i] || c, attrs: { 'aria-pressed': String(value === i || value === c), 'aria-label': o.names?.[i] || c }, on: { click: () => update(make(c, i), panel) } })));
    const opt = (title, sub, ...body) => h('section.ac-opt', null, h('div.ac-opt-head', null, h('h4', { text: title }), sub ? h('span', { text: sub }) : null), ...body);
    const skins = lib?.SKIN_TONES || SKIN_FALLBACK;
    const outfitName = OUTFIT.find((o) => o[0] === a.outfit)?.[1] || a.outfit;
    const patternUsed = !['security', 'usher', 'choir-robe', 'white-garment', 'suit', 'apron'].includes(a.outfit);

    setChildren(panel,
      opt('Body', null, pills(BODY, a.body, 'body', { seg: true, label: 'Body' })),
      opt('Skin tone', SKIN_NAMES[a.skin], swatches(skins, a.skin, (c, i) => ({ skin: i }), { label: 'Skin tone', names: SKIN_NAMES })),
      opt('Hair', null, pills(HAIR, a.hair, 'hair', { label: 'Hair' }),
        h('div', { style: { height: '8px' } }),
        swatches(HAIR_COLORS.map((x) => x[0]), a.hairColor, (c) => ({ hairColor: c }), { small: true, label: 'Hair colour', names: HAIR_COLORS.map((x) => x[1]) })),
      a.body === 'male' ? opt('Beard', null, pills([[false, 'Clean shaven'], [true, 'Beard']], a.beard, 'beard', { seg: true, label: 'Beard' })) : null,
      opt('Outfit', outfitName, pills(OUTFIT, a.outfit, 'outfit', { scroll: true, label: 'Outfit' })),
      opt('Main colour', null, swatches(PRIMARY, a.colors?.primary, (c) => ({ colors: { primary: c } }), { label: 'Main colour' })),
      opt('Second colour', null, swatches(SECONDARY, a.colors?.secondary, (c) => ({ colors: { secondary: c } }), { small: true, label: 'Second colour' })),
      patternUsed ? opt('Fabric', null, pills(PATTERN, a.colors?.pattern, 'pattern', { scroll: true, label: 'Fabric pattern', make: (v) => ({ colors: { pattern: v } }) })) : null,
      opt('Headwear', null, pills(HEADWEAR, a.headwear, 'headwear', { label: 'Headwear' })));
    panel.scrollTop = top;
  }

  function randomize() {
    st.appearance = norm(lib?.randomAppearance ? lib.randomAppearance(Math.random, st.role) : st.appearance);
    st.customized = true;
    preview?.setAppearance(st.appearance);
    preview?.face();
    setTimeout(() => preview?.wave(1.6), 250);
    const panel = el.querySelector('.ac-panel');
    if (panel) renderPanel(panel);
  }

  function back() {
    st.step = 'who';
    render();
  }

  function begin() {
    const profile = { name: st.name, role: st.role, tradition: st.tradition, appearance: norm(st.appearance) };
    onBegin(profile, 'new');
  }

  function disposePreview() {
    preview?.dispose();
    preview = null;
  }

  function render() {
    if (st.step === 'who') renderWho();
    else renderLook();
    el.scrollTop = 0;
  }

  return {
    el,
    get state() { return st; },
    get preview() { return preview; },
    show() {
      el.hidden = false;
      st.step = 'who';
      render();
      requestAnimationFrame(() => el.querySelector('#ac-name')?.focus({ preventScroll: true }));
    },
    hide() {
      el.hidden = true;
      disposePreview();
      setChildren(el);
    },
    /** Jump to the editor (dev harness). */
    toLook(name = 'Tunde') { st.name = st.name || name; st.step = 'look'; render(); },
  };
}
