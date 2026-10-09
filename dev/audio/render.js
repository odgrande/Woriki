// Offline rendering hooks for automated checks (Playwright): renders the real engine into an
// OfflineAudioContext and returns the PCM so a test can measure it and write WAV files.
import { createBaker } from '/src/audio/baker.js';
import { createEngine } from '/src/audio/engine.js';

const baker = createBaker();

function b64(f32) {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

/**
 * @param {{seconds?: number, sampleRate?: number, quality?: string, zone?: string|null, music?: boolean,
 *   sounds?: {name: string, at?: number, position?: object, opts?: object}[],
 *   steps?: {surface: string, run?: boolean, at: number, position?: object}[],
 *   listener?: {x:number,y:number,z:number,yaw:number}, preload?: string[], skipData?: boolean}} spec
 */
window.__renderOffline = async (spec) => {
  const seconds = spec.seconds ?? 3;
  const sr = spec.sampleRate ?? 44100;
  const oac = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const engine = createEngine(oac, { quality: spec.quality || 'medium', baker });
  const pre = new Set(spec.preload || []);
  if (spec.sounds?.length) pre.add('sfx');
  if (spec.steps?.length) pre.add('footsteps');
  if (spec.zone && spec.zone !== 'none') pre.add(spec.zone);
  if (spec.music) pre.add('music');
  const t0 = performance.now();
  await engine.preload([...pre]);
  const bakeMs = performance.now() - t0;
  const L = spec.listener || { x: 0, y: 0, z: 0, yaw: 0 };
  engine.setListener(L, { x: Math.sin(L.yaw || 0), y: 0, z: Math.cos(L.yaw || 0) });
  engine.setZone(spec.zone ?? 'none', 0.05);
  if (spec.noAmbience) engine.ambience.set('none', 0.01);
  if (spec.music) {
    if (spec.solo) for (const name of engine.music.instruments) if (!spec.solo.includes(name)) engine.music.setInstrumentMuted(name, true);
    engine.music.set('worship');
    await new Promise((r) => setTimeout(r, 0));
  }
  for (const s of spec.sounds || []) engine.play(s.name, { ...(s.opts || {}), position: s.position, when: s.at ?? 0 });
  for (const st of spec.steps || []) engine.footstep(st.surface, { run: st.run, when: st.at, position: st.position });
  // Drive the engine exactly like the live clock does: suspend every 0.25 s of audio time and
  // schedule only a short lookahead, so node counts and voice stealing match real play.
  const TICK = 0.25;
  engine.pump(0.35);
  for (let t = TICK; t < seconds; t += TICK) {
    oac.suspend(t).then(() => { engine.pump(0.35); oac.resume(); });
  }
  const t1 = performance.now();
  const buf = await oac.startRendering();
  const renderMs = performance.now() - t1;
  const chans = [buf.getChannelData(0), buf.getChannelData(1)];
  let peak = 0, sum = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; sum += c[i] * c[i]; }
  const rms = Math.sqrt(sum / (chans[0].length * 2));
  return {
    sampleRate: sr, length: buf.length, peak, rms, bakeMs, renderMs,
    channels: spec.skipData ? null : chans.map(b64),
  };
};

window.__bakeTimes = async (jobs) => {
  const out = [];
  for (const [recipe, args] of jobs) {
    const t0 = performance.now();
    await baker.load(recipe, args);
    out.push([recipe, JSON.stringify(args || {}), Math.round(performance.now() - t0)]);
  }
  return out;
};

window.__renderReady = true;
