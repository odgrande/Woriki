// Hub logic with a fake clock and fake sockets: exact rates and timeouts, no network.
import { describe, it, expect } from 'vitest';
import { createHub, CLOSE } from './hub.js';
import { createFilter } from './filter.js';

const filter = createFilter();

function setup(opts = {}) {
  const clock = { t: 1_000_000 };
  const hub = createHub({ filter, now: () => clock.t, log: {}, ...opts });
  const join = (name, { room = 'yaba', ip = '1.1.1.1', hello = {} } = {}) => {
    const sock = {
      sent: [], closed: null, bufferedAmount: 0,
      send(s) { this.sent.push(JSON.parse(s)); },
      close(code) { this.closed = code; h.close(code); },
      terminate() { this.closed = 1006; h.close(1006); },
      of(t) { return this.sent.filter((m) => m.t === t); },
    };
    const h = hub.connect(sock, { ip, room });
    if (name) h.message(JSON.stringify({ t: 'hello', name, ...hello }));
    return { sock, h, send: (m) => h.message(JSON.stringify(m)), get id() { return sock.of('welcome')[0]?.id; } };
  };
  const advance = (ms, step = 100) => { for (let k = 0; k < ms; k += step) { clock.t += step; hub.tick(); } };
  return { hub, clock, join, advance };
}

describe('hub', () => {
  it('accepts a 15-frame burst of states, then ~12/s', () => {
    const { join, advance } = setup();
    const a = join('Ada');
    const b = join('Bayo');
    for (let i = 0; i < 60; i++) a.send({ t: 'state', p: [i, 0, 0], r: 0, a: 'run' });
    advance(100);
    const first = b.sock.of('states').at(-1).list.find((e) => e[0] === a.id);
    expect(first[1]).toBe(14); // frames 0..14 accepted, the rest dropped
    for (let s = 0; s < 10; s++) { // one second at 60 frames/s
      for (let i = 0; i < 6; i++) a.send({ t: 'state', p: [100 + s * 6 + i, 0, 0], r: 0, a: 'run' });
      advance(100);
    }
    const accepted = new Set(b.sock.of('states').flatMap((m) => m.list).filter((e) => e[0] === a.id && e[1] >= 100).map((e) => e[1]));
    expect(accepted.size).toBeLessThanOrEqual(12); // ≤ one per tick reaches others anyway
    expect(a.sock.closed).toBe(null);
  });

  it('broadcasts only players who changed, with the age of their state', () => {
    const { join, advance, clock } = setup();
    const a = join('Ada');
    const b = join('Bayo');
    a.send({ t: 'state', p: [1, 0, 1], r: 0, a: 'idle' });
    clock.t += 40;
    advance(100);
    const st = b.sock.of('states').at(-1);
    expect(st.list).toEqual([[a.id, 1, 0, 1, 0, 'idle', 140]]); // received 140 ms before this tick
    const n = b.sock.of('states').length;
    advance(500);
    expect(b.sock.of('states').length).toBe(n); // nothing moved → nothing sent
  });

  it('chat: 5 per 10 s, refills one line every 2 s', () => {
    const { join, clock } = setup();
    const a = join('Ada');
    for (let i = 0; i < 6; i++) a.send({ t: 'chat', text: `amen ${i}` });
    expect(a.sock.of('chat').length).toBe(5);
    expect(a.sock.of('error').at(-1)).toMatchObject({ code: 'rate', wait: 2 });
    clock.t += 2000;
    a.send({ t: 'chat', text: 'amen again' });
    expect(a.sock.of('chat').length).toBe(6);
  });

  it('hello timeout, idle timeout and flood kick', () => {
    const { join, advance } = setup({ helloTimeoutMs: 1000, idleMs: 5000, floodLimit: 10 });
    const silent = join(null);
    const idle = join('Idle');
    const flood = join('Flood');
    advance(1100);
    expect(silent.sock.closed).toBe(CLOSE.HELLO_TIMEOUT);
    for (let i = 0; i < 12; i++) flood.h.message('garbage');
    expect(flood.sock.closed).toBe(CLOSE.POLICY);
    advance(5000);
    expect(idle.sock.closed).toBe(CLOSE.IDLE);
  });

  it('keeps a dropped player for the grace period, then announces the leave', () => {
    const { join, advance } = setup({ resumeGraceMs: 2000 });
    const a = join('Ada');
    const b = join('Bayo');
    const { id, token } = b.sock.of('welcome')[0];
    b.h.close(1006); // network drop
    advance(1000);
    expect(a.sock.of('leave')).toEqual([]);
    const b2 = join('Bayo', { hello: { resume: { id, token } } });
    expect(b2.sock.of('welcome')[0]).toMatchObject({ id, resumed: true });
    b2.h.close(1006);
    advance(2200);
    expect(a.sock.of('leave')).toEqual([{ t: 'leave', id }]);
  });

  it('mutes after reports from distinct IPs, not from one person with many tabs', () => {
    const { join } = setup({ reportThreshold: 3 });
    const bad = join('Bad');
    const r1 = join('R1', { ip: '2.2.2.2' });
    const r1b = join('R1 tab', { ip: '2.2.2.2' });
    r1.send({ t: 'report', id: bad.id });
    r1b.send({ t: 'report', id: bad.id });
    bad.send({ t: 'chat', text: 'still here' });
    expect(bad.sock.of('error').filter((e) => e.code === 'muted')).toEqual([]);
    join('R2', { ip: '3.3.3.3' }).send({ t: 'report', id: bad.id });
    join('R3', { ip: '4.4.4.4' }).send({ t: 'report', id: bad.id });
    bad.send({ t: 'chat', text: 'hello?' });
    expect(bad.sock.of('error').filter((e) => e.code === 'muted').length).toBe(2);
    expect(r1.sock.of('chat').map((c) => c.text)).toEqual(['still here']);
  });

  it('skips state frames for a backed-up socket and drops a hopeless one', () => {
    const { join, advance } = setup();
    const a = join('Ada');
    const slow = join('Slow');
    slow.sock.bufferedAmount = 300 * 1024;
    a.send({ t: 'state', p: [1, 0, 0], r: 0, a: 'walk' });
    advance(100);
    expect(slow.sock.of('states')).toEqual([]);
    a.send({ t: 'chat', text: 'chat still arrives' });
    expect(slow.sock.of('chat').length).toBe(1);
    slow.sock.bufferedAmount = 3 * 1024 * 1024;
    a.send({ t: 'state', p: [2, 0, 0], r: 0, a: 'walk' });
    advance(100);
    expect(slow.sock.closed).toBe(1006);
  });

  it('profile updates re-announce the player; names are masked', () => {
    const { join } = setup();
    const a = join('Ada');
    const b = join('mumu');
    expect(b.sock.of('welcome')[0].name).toBe('****');
    b.send({ t: 'hello', name: 'Bayo', role: 'usher' });
    expect(a.sock.of('join').at(-1)).toMatchObject({ id: b.id, name: 'Bayo', role: 'usher' });
  });
});
