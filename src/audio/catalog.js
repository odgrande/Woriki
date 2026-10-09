// Named one-shot sounds: which recipe bakes them and how they are played.
// gain: base level; priority: higher survives voice stealing; cap: max simultaneous;
// ref/rolloff: PannerNode distance model when played at a position; reverb: room send;
// ui: always non-positional (interface feedback); repeat: [count, interval s] default pattern.

export const SOUNDS = {
  bell: { recipe: 'bell', gain: 0.95, priority: 3, cap: 4, ref: 14, rolloff: 0.55, reverb: 0.5, repeat: [3, 2.4] },
  click: { recipe: 'click', gain: 0.5, priority: 1, cap: 3, minGap: 0.03, ui: true },
  chat: { recipe: 'chat', gain: 0.38, priority: 2, cap: 1, minGap: 0.3, ui: true },
  coin: { recipe: 'coin', gain: 0.5, priority: 2, cap: 2, minGap: 0.05, ui: true },
  success: { recipe: 'success', gain: 0.42, priority: 2, cap: 1, minGap: 0.1, ui: true },
  fail: { recipe: 'fail', gain: 0.42, priority: 2, cap: 1, minGap: 0.1, ui: true },
  pray: { recipe: 'amen', gain: 0.5, priority: 2, cap: 1, minGap: 0.5, ui: true, reverb: 0.55 },
  clap: { recipe: 'clap', gain: 0.5, priority: 1, cap: 8, ref: 3, rolloff: 1, reverb: 0.3, repeat: [5, 1 / 1.9] },
  door: { recipe: 'door', gain: 0.6, priority: 2, cap: 2, minGap: 0.2, ref: 3, rolloff: 1, reverb: 0.3 },
  horn: { recipe: 'horn', gain: 0.5, priority: 2, cap: 3, ref: 8, rolloff: 0.9, reverb: 0.25 },
  okada: { recipe: 'okada', args: { mode: 'pass' }, moving: { recipe: 'okada', args: { mode: 'source' }, travel: 62 }, gain: 0.65, priority: 2, cap: 2, ref: 6, rolloff: 0.9, reverb: 0.15 },
  thunder: { recipe: 'thunder', gain: 0.85, priority: 3, cap: 1, minGap: 1, ui: true, reverb: 0.12 },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/** Recipes worth baking right after start (small, used early). */
export const ESSENTIAL = [
  ['click'], ['chat'], ['coin'], ['success'], ['fail'], ['clap'], ['door'], ['horn'],
];
