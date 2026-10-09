// Sound Lab: buttons for every sound, ambience, music; a spatial pad; offline render hooks.
import './harness.css';
import { createAudio, SOUND_NAMES, AMBIENCES } from '/src/audio/index.js';
import { sectionOf } from '/src/audio/arrangement.js';
import './render.js';

const q = new URLSearchParams(location.search);
const quality = q.get('q') || 'medium';

// minimal stand-in for ctx (no 3D here)
const handlers = new Map();
const bus = {
  on(t, fn) { (handlers.get(t) || handlers.set(t, new Set()).get(t)).add(fn); return () => handlers.get(t)?.delete(fn); },
  emit(t, d) { handlers.get(t)?.forEach((fn) => fn(d)); },
};
const audio = createAudio({ bus, quality });
window.__lab = { audio, bus };

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, text) => { const e = Object.assign(document.createElement(tag), props); if (text != null) e.textContent = text; return e; };
const flash = (b) => { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 120); };

// ---- start / mute -------------------------------------------------------------
$('#unlock').addEventListener('click', async () => {
  await audio.unlock();
  $('#unlock').lastChild.textContent = ' Sound on';
});
const muteBtn = $('#mute');
const syncMute = () => { muteBtn.setAttribute('aria-pressed', String(audio.muted)); muteBtn.textContent = audio.muted ? 'Unmute' : 'Mute'; };
muteBtn.addEventListener('click', () => { audio.setMuted(!audio.muted); syncMute(); });
syncMute();

// ---- ambience -----------------------------------------------------------------
const zoneLabels = { street: 'Street (Yaba)', church: 'Church hall', market: 'Market', prayer: 'Prayer room', home: 'Home', none: 'Silence' };
const zoneBtns = [];
for (const z of [...AMBIENCES, 'none']) {
  const b = el('button', { className: 'btn', type: 'button' }, zoneLabels[z] || z);
  b.setAttribute('aria-pressed', String(z === 'street'));
  b.addEventListener('click', async () => {
    await audio.unlock();
    audio.setZone(z);
    zoneBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  zoneBtns.push(b);
  $('#zones').append(b);
}

// ---- music --------------------------------------------------------------------
const musicBtn = $('#music');
musicBtn.addEventListener('click', async () => {
  await audio.unlock();
  const on = audio.music !== 'worship';
  audio.setMusic(on ? 'worship' : 'none');
  musicBtn.setAttribute('aria-pressed', String(on));
  musicBtn.textContent = on ? '■ Stop praise' : '▶ Start praise';
});

// ---- one-shots ----------------------------------------------------------------
const subs = { bell: 'church bell', click: 'UI tap', chat: 'message', coin: 'naira coins', pray: 'choir amen', clap: 'clapping', door: 'door opens', horn: 'car horn', okada: 'motorbike', thunder: 'storm', success: 'well done', fail: 'oops' };
for (const name of SOUND_NAMES) {
  const b = el('button', { className: 'btn', type: 'button' });
  b.append(el('span', {}, name), el('span', { className: 'sub' }, subs[name] || ''));
  b.addEventListener('click', async () => { await audio.unlock(); audio.play(name); flash(b); });
  $('#sounds').append(b);
}

// ---- footsteps ----------------------------------------------------------------
let surface = 'concrete';
let run = false;
const surfBtns = [];
for (const s of ['asphalt', 'concrete', 'tile', 'carpet', 'wood', 'dirt']) {
  const b = el('button', { className: 'btn', type: 'button' }, s);
  b.setAttribute('aria-pressed', String(s === surface));
  b.addEventListener('click', async () => {
    await audio.unlock();
    surface = s;
    surfBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    audio.footstep(surface, { run });
  });
  surfBtns.push(b);
  $('#surfaces').append(b);
}
const runBtn = $('#run');
runBtn.addEventListener('click', () => { run = !run; runBtn.setAttribute('aria-pressed', String(run)); runBtn.textContent = run ? 'Run' : 'Walk'; });
$('#step').addEventListener('click', async (e) => { await audio.unlock(); audio.footstep(surface, { run }); flash(e.currentTarget); });
let walkTimer = null;
const autoBtn = $('#autowalk');
autoBtn.addEventListener('click', async () => {
  await audio.unlock();
  if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; autoBtn.setAttribute('aria-pressed', 'false'); return; }
  autoBtn.setAttribute('aria-pressed', 'true');
  const stepOnce = () => {
    bus.emit('player:step', { surface, run, position: { x: 0, y: 0, z: 0 } });
    walkTimer = setTimeout(stepOnce, (run ? 340 : 540) * (0.97 + Math.random() * 0.06));
  };
  stepOnce();
});

// ---- spatial pad --------------------------------------------------------------
const kinds = ['horn', 'okada', 'bell', 'clap', 'door', 'footstep'];
let kind = 'horn';
const kindBtns = [];
for (const k of kinds) {
  const b = el('button', { className: 'btn', type: 'button' }, k);
  b.setAttribute('aria-pressed', String(k === kind));
  b.addEventListener('click', () => { kind = k; kindBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  kindBtns.push(b);
  $('#spatial-kind').append(b);
}
const pad = $('#pad');
const g = pad.getContext('2d');
const SPAN = 60; // metres across
let yaw = 0;
const marks = [];
function padToWorld(px, py) {
  const w = pad.width, h = pad.height;
  const right = (px / w - 0.5) * SPAN;
  const fwdM = (0.5 - py / h) * SPAN * (h / w);
  // forward = (sin yaw, 0, cos yaw); right = forward × up = (-cos yaw, 0, sin yaw)
  const f = { x: Math.sin(yaw), z: Math.cos(yaw) }, r = { x: -Math.cos(yaw), z: Math.sin(yaw) };
  return { x: f.x * fwdM + r.x * right, y: 1, z: f.z * fwdM + r.z * right };
}
pad.addEventListener('pointerdown', async (e) => {
  await audio.unlock();
  const rect = pad.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (pad.width / rect.width), py = (e.clientY - rect.top) * (pad.height / rect.height);
  const p = padToWorld(px, py);
  if (kind === 'footstep') audio.footstep('tile', { position: p }); else audio.play(kind, { position: p });
  marks.push({ px, py, t: performance.now(), kind });
});
$('#yaw').addEventListener('input', (e) => { yaw = (+e.target.value * Math.PI) / 180; $('#yaw-val').textContent = `${e.target.value}°`; });

function drawPad() {
  const w = pad.width, h = pad.height;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1;
  const step = w / SPAN * 10;
  for (let x = w / 2 % step; x < w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = h / 2 % step; y < h; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  // distance rings 10/20 m
  g.strokeStyle = 'rgba(0,0,0,.18)';
  for (const r of [10, 20]) { g.beginPath(); g.arc(w / 2, h / 2, (r / SPAN) * w, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#52525b'; g.font = '600 12px Space Grotesk, sans-serif';
  g.fillText('10 m', w / 2 + (10 / SPAN) * w + 4, h / 2 - 4); g.fillText('20 m', w / 2 + (20 / SPAN) * w + 4, h / 2 - 4);
  // listener
  g.fillStyle = '#000';
  g.beginPath(); g.moveTo(w / 2, h / 2 - 16); g.lineTo(w / 2 - 9, h / 2 + 8); g.lineTo(w / 2 + 9, h / 2 + 8); g.closePath(); g.fill();
  g.fillStyle = '#fde047'; g.beginPath(); g.arc(w / 2, h / 2, 5, 0, Math.PI * 2); g.fill();
  // marks
  const now = performance.now();
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    const age = (now - m.t) / 1500;
    if (age > 1) { marks.splice(i, 1); continue; }
    g.globalAlpha = 1 - age;
    g.strokeStyle = '#000'; g.lineWidth = 2; g.fillStyle = '#ff9ebb';
    g.beginPath(); g.arc(m.px, m.py, 8 + age * 30, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(m.px, m.py, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#000'; g.fillText(m.kind, m.px + 12, m.py - 10);
    g.globalAlpha = 1;
  }
}

// ---- volumes ------------------------------------------------------------------
for (const k of ['master', 'music', 'ambience', 'sfx']) {
  const row = el('label', { className: 'vol' });
  const input = el('input', { type: 'range', min: 0, max: 100, value: Math.round(audio.volumes[k] * 100) });
  const val = el('span', {}, `${input.value}`);
  input.addEventListener('input', () => { audio.setVolume(k, input.value / 100); val.textContent = input.value; });
  row.append(el('span', {}, k), input, val);
  $('#volumes').append(row);
}

// ---- bus events ---------------------------------------------------------------
const busTests = [
  ['zone: church-hall', () => bus.emit('player:zone', { zone: { id: 'church-hall', label: 'Church hall', ambience: 'church' } })],
  ['zone: carpark', () => bus.emit('player:zone', { zone: { id: 'carpark', ambience: 'street' } })],
  ['zone: kitchen', () => bus.emit('player:zone', { zone: 'kitchen' })],
  ['chat in', () => bus.emit('chat:message', { from: 'Tolu', text: 'God bless you', id: 'x', self: false })],
  ['chat sent', () => bus.emit('chat:message', { from: 'me', text: 'Amen!', id: 'y', self: true })],
  ['service start', () => bus.emit('audio:music', { track: 'worship' })],
  ['service end', () => bus.emit('audio:music', { track: 'none' })],
  ['bell @ 25 m', () => bus.emit('audio:play', { name: 'bell', position: { x: 0, y: 6, z: 25 } })],
];
for (const [label, fn] of busTests) {
  const b = el('button', { className: 'btn', type: 'button' }, label);
  b.addEventListener('click', async () => { await audio.unlock(); fn(); flash(b); });
  $('#bus').append(b);
}

// ---- status + meter -------------------------------------------------------------
let analyser = null, data = null;
function frame() {
  const st = window.__amen.audio;
  $('#st-state').textContent = `● ${st.state}${st.sampleRate ? ` · ${st.sampleRate / 1000} kHz` : ''}`;
  $('#st-state').classList.toggle('on', st.state === 'running');
  $('#st-voices').textContent = `${st.voices} voices`;
  $('#st-baked').textContent = `${st.baked} baked`;
  const m = audio.engine?.music;
  $('#music-pos').textContent = m?.playing ? `bar ${m.position.bar + 1} · ${sectionOf(Math.floor(m.position.bar / 8))}` : (audio.music === 'worship' ? 'loading…' : 'stopped');
  if (audio.engine && !analyser) {
    analyser = audio.context.createAnalyser();
    analyser.fftSize = 1024;
    audio.engine.master.connect(analyser);
    data = new Float32Array(analyser.fftSize);
  }
  if (analyser) {
    analyser.getFloatTimeDomainData(data);
    let pk = 0; for (const v of data) pk = Math.max(pk, Math.abs(v));
    const db = 20 * Math.log10(pk + 1e-9);
    $('#meter-fill').style.width = `${Math.max(0, Math.min(100, (db + 60) / 60 * 100))}%`;
    $('#meter-label').textContent = pk > 1e-5 ? `${db.toFixed(1)} dB` : '−∞ dB';
  }
  // listener at the origin; the pad's "up" is forward
  audio.update({ x: 0, y: 0, z: 0 }, yaw);
  drawPad();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
