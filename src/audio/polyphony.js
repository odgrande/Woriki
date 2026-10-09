// Pure voice allocator: caps simultaneous one-shots globally and per sound name, and
// decides which voices to steal (lowest priority first, then oldest).

/**
 * @param {{max: number, caps?: Record<string, number>}} opts
 */
export function createVoicePool({ max, caps = {} }) {
  /** @type {{id: number, name: string, priority: number, start: number, end: number}[]} */
  let voices = [];
  let seq = 0;

  function prune(now) { voices = voices.filter((v) => v.end > now); }

  return {
    /**
     * Reserve a voice. Returns the new voice id and the ids that must be stopped to make room
     * (or id = -1 when the new sound has too low a priority to get a voice).
     */
    allocate(name, priority, now, end) {
      prune(now);
      const steal = [];
      const cap = caps[name];
      if (cap) {
        const same = voices.filter((v) => v.name === name).sort((a, b) => a.start - b.start);
        while (same.length >= cap) { const v = same.shift(); steal.push(v.id); voices = voices.filter((x) => x !== v); }
      }
      while (voices.length >= max) {
        let victim = null;
        for (const v of voices) {
          if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start)) victim = v;
        }
        if (!victim || victim.priority > priority) return { id: -1, steal };
        steal.push(victim.id);
        voices = voices.filter((x) => x !== victim);
      }
      const id = ++seq;
      voices.push({ id, name, priority, start: now, end });
      return { id, steal };
    },
    /** Forget a voice (it ended or was stopped). */
    release(id) { voices = voices.filter((v) => v.id !== id); },
    /** Active voices at `now`. */
    active(now) { prune(now); return voices.length; },
    count(name, now) { prune(now); return voices.filter((v) => v.name === name).length; },
  };
}
