import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPlayer, WALK_SPEED, RUN_SPEED } from './player.js';
import { createPhysics } from '../engine/physics.js';
import { createFollowCamera } from '../engine/camera.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function bus() {
  const map = new Map();
  const log = [];
  return {
    log,
    on(t, fn) { (map.get(t) || map.set(t, new Set()).get(t)).add(fn); return () => map.get(t)?.delete(fn); },
    emit(t, d) { log.push([t, d]); map.get(t)?.forEach((fn) => fn(d)); },
    of(t) { return log.filter((e) => e[0] === t).map((e) => e[1]); },
  };
}
function fakeInput() {
  const pressed = new Set();
  const buttons = {};
  return {
    move: { x: 0, y: 0 }, run: false, touch: false, looking: false, lastLookAt: -1e9, buttons,
    consume(n) { return pressed.delete(n); },
    press(n) { pressed.add(n); },
    setButton(n, s) { buttons[n] = { ...buttons[n], ...s }; },
    lookDelta() { return { dx: 0, dy: 0 }; },
    zoomDelta() { return 0; },
  };
}
function setup({ seats = [], interactables = [] } = {}) {
  const ctx = { scene: new THREE.Scene(), bus: bus(), camera: new THREE.PerspectiveCamera(55, 1.6, 0.1, 400) };
  const physics = createPhysics();
  const input = fakeInput();
  const camera = createFollowCamera(ctx, input);
  camera.autoFollow = false;
  camera.yaw = 0; // looking towards −Z
  const zones = [
    { id: 'church-hall', ambience: 'church', box: new THREE.Box3(V(-5, -1, -20), V(5, 5, -10)) },
    { id: 'street', ambience: 'street', box: new THREE.Box3(V(-50, -1, -50), V(50, 5, 50)) },
  ];
  const world = {
    seats, interactables,
    spawns: { player: { position: V(0, 0, 0), rotY: Math.PI } },
    surfaceAt: (x, z) => (z < -10 ? 'tile' : 'asphalt'),
    zoneAt: (p) => zones.find((z) => z.box.containsPoint(p)) || null,
  };
  const player = createPlayer(ctx, { world, physics, input, camera });
  const run = (sec, dt = 1 / 60) => { for (let i = 0; i < Math.round(sec / dt); i++) { player.update(dt, 0); camera.update(dt, player.position, physics); } };
  return { ctx, physics, input, camera, world, player, run };
}

describe('player movement', () => {
  it('steers with the keyboard: left / right turn you and the camera, nobody walks sideways', () => {
    const { player, input, camera, run } = setup();
    input.keyboardMove = true;
    input.move = { x: 0, y: 1 };
    run(0.5);
    input.move = { x: -1, y: 1 }; // up + left
    run(0.6);
    // the camera turned with you, so you always walk away from it (never across the screen)
    const behind = ((camera.yaw + Math.PI - player.heading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    expect(Math.abs(behind)).toBeLessThan(0.2);
    expect(Math.abs(camera.yaw)).toBeGreaterThan(1); // turned about 90°
    input.move = { x: 1, y: 0 }; // right alone turns on the spot
    const p0 = player.position.clone();
    run(0.5);
    expect(player.position.distanceTo(p0)).toBeLessThan(0.6); // only the stop from walking
  });

  it('walks and runs camera-relative and faces where it goes', () => {
    const { player, input, run } = setup();
    input.move = { x: 0, y: 1 };
    run(2);
    expect(player.position.z).toBeLessThan(-2.5);
    expect(Math.abs(player.position.x)).toBeLessThan(1e-6);
    expect(player.speed).toBeCloseTo(WALK_SPEED, 1);
    expect(Math.abs(Math.abs(player.heading) - Math.PI)).toBeLessThan(0.01); // facing −Z
    input.run = true;
    run(1.5);
    expect(player.speed).toBeCloseTo(RUN_SPEED, 1);
    input.move = { x: 1, y: 0 };
    run(1);
    expect(player.heading).toBeCloseTo(Math.PI / 2, 1); // turned to face +X
    input.move = { x: 0, y: 0 };
    run(1);
    expect(player.speed).toBe(0);
  });

  it('emits moved, step and zone events', () => {
    const { ctx, player, input, run } = setup();
    input.move = { x: 0, y: 1 };
    run(6);
    const bus = ctx.bus;
    expect(bus.of('player:moved').length).toBeGreaterThan(300);
    const steps = bus.of('player:step');
    expect(steps.length).toBeGreaterThan(8);
    expect(steps.at(-1).surface).toBe('asphalt');
    expect(steps.at(-1).run).toBe(false);
    const zones = bus.of('player:zone').map((e) => e.zone.id);
    expect(zones).toEqual(['street']);
    run(4);
    expect(bus.of('player:zone').map((e) => e.zone.id)).toEqual(['street', 'church-hall']);
    expect(bus.of('player:step').at(-1).surface).toBe('tile');
    expect(player.position.z).toBeLessThan(-10);
  });

  it('jumps (buffered), lands and reports actions', () => {
    const { ctx, player, input, run } = setup();
    run(0.2);
    input.press('jump');
    run(0.1);
    expect(player.state).toBe('air');
    expect(player.position.y).toBeGreaterThan(0.2);
    run(1);
    expect(player.state).toBe('move');
    expect(player.position.y).toBe(0);
    expect(ctx.bus.of('player:action').map((a) => a.name)).toContain('jump');
    // and again after landing
    run(0.5);
    input.press('jump');
    run(0.15);
    expect(player.state).toBe('air');
    run(1);
    expect(ctx.bus.of('player:action').filter((a) => a.name === 'jump').length).toBe(2);
  });

  it('steps up a kerb and walks off a high ledge into a fall', () => {
    const { physics, player, input, run } = setup();
    physics.addBox(V(-5, 0, -4), V(5, 0.15, -2), { kind: 'kerb' });
    physics.addBox(V(-5, 0, -9), V(5, 1.5, -4), { kind: 'platform' });
    input.move = { x: 0, y: 1 };
    run(2);
    expect(player.position.y).toBeCloseTo(0.15); // on the kerb, blocked by the 1.5 m platform
    expect(player.position.z).toBeGreaterThan(-4);
    player.teleport(V(0, 1.5, -5), Math.PI);
    input.move = { x: 0, y: -1 }; // walk back (+Z) off the platform edge
    let wasAir = false;
    for (let i = 0; i < 120; i++) { run(1 / 60); if (player.state === 'air') wasAir = true; }
    expect(wasAir).toBe(true);
    expect(player.position.y).toBeCloseTo(0.15);
    expect(player.state).toBe('move');
  });

  it('slides along walls instead of stopping', () => {
    const { physics, player, input, run } = setup();
    physics.addBox(V(-10, 0, -2), V(10, 3, -1.8), { kind: 'wall' });
    input.move = { x: 0.5, y: 1 };
    run(3);
    expect(player.position.z).toBeGreaterThanOrEqual(-1.8 + player.radius - 1e-6);
    expect(player.position.x).toBeGreaterThan(1.5);
  });
});

describe('player seats, prayer, emotes', () => {
  it('sits on the nearest free seat within 2 m and stands when moving', () => {
    const seats = [
      { position: V(0, 0.47, -1.5), rotY: Math.PI, kind: 'pew', taken: false },
      { position: V(0.5, 0.47, -1.2), rotY: Math.PI, kind: 'pew', taken: true },
      { position: V(0, 0.47, -5), rotY: 0, kind: 'chair', taken: false },
    ];
    const { ctx, player, input, run } = setup({ seats });
    input.press('sit');
    run(2);
    expect(player.state).toBe('sit');
    expect(player.phase).toBe('seated');
    expect(player.seat).toBe(seats[0]);
    expect(seats[0].taken).toBe(true);
    expect(input.buttons.sit.label).toBe('Stand');
    // feet in front of the seat (it faces −Z), on the floor
    expect(player.position.z).toBeCloseTo(-1.5 - 0.34, 2);
    expect(player.position.y).toBe(0);
    expect(player.heading).toBeCloseTo(Math.PI, 2);
    input.move = { x: 1, y: 0 };
    run(1.5);
    expect(player.state).toBe('move');
    expect(seats[0].taken).toBe(false);
    expect(player.seat).toBe(null);
    expect(ctx.bus.of('player:action').map((a) => a.name)).toEqual(['sit', 'stand']);
  });

  it('says so when there is no free seat nearby', () => {
    const { ctx, input, player, run } = setup({ seats: [{ position: V(0, 0.47, -3), rotY: 0, taken: false }] });
    input.press('sit');
    run(0.1);
    expect(player.state).toBe('move');
    expect(ctx.bus.of('game:toast').length).toBe(1);
  });

  it('kneels, prays and stands up again with P', () => {
    const { ctx, player, input, run } = setup();
    input.press('kneel');
    run(1.2);
    expect(player.state).toBe('kneel');
    expect(player.phase).toBe('pray');
    input.press('kneel');
    run(1.2);
    expect(player.state).toBe('move');
    expect(ctx.bus.of('player:action').map((a) => a.name)).toEqual(['kneel', 'pray', 'stand']);
  });

  it('dances until moving, waves and claps anywhere', () => {
    const { ctx, player, input, run } = setup();
    input.press('dance');
    run(0.5);
    expect(player.state).toBe('emote');
    input.press('wave');
    input.press('clap');
    run(0.1);
    input.move = { x: 0, y: 1 };
    run(0.3);
    expect(player.state).toBe('move');
    expect(ctx.bus.of('player:action').map((a) => a.name)).toEqual(['dance', 'wave', 'clap']);
  });

  it('interacts with the nearest interactable and shows it on the button', () => {
    const items = [
      { id: 'bell', position: V(0, 0, -1), radius: 1.2, label: 'Ring bell', action: 'ring-bell' },
      { id: 'food', position: V(0, 0, -3), radius: 1.2, label: 'Buy food', action: 'buy-food' },
    ];
    const { ctx, input, run } = setup({ interactables: items });
    run(0.3);
    expect(input.buttons.interact).toEqual({ label: 'Ring bell', active: true });
    input.press('interact');
    run(0.1);
    expect(ctx.bus.of('player:interact')).toEqual([items[0]]);
  });

  it('teleports, standing up first', () => {
    const seats = [{ position: V(0, 0.47, -1.5), rotY: Math.PI, taken: false }];
    const { player, input, run } = setup({ seats });
    input.press('sit');
    run(2);
    player.teleport(V(10, 0, 10), 0);
    expect(player.state).toBe('move');
    expect(seats[0].taken).toBe(false);
    expect(player.position.toArray()).toEqual([10, 0, 10]);
  });
});

describe('lying down', () => {
  it('lies on the bed, and gets up beside it when you move', () => {
    const { player, input, run } = setup();
    const spot = { position: V(2, 0.6, -3), rotY: Math.PI };
    player.lieAt(spot, V(0.6, 0, -3));
    run(1.5);
    expect(player.state).toBe('lie');
    expect(player.position.distanceTo(spot.position)).toBeLessThan(0.01);
    input.move = { x: 0, y: 1 };
    run(0.6);
    expect(player.state).toBe('move');
    expect(Math.hypot(player.position.x - 0.6, player.position.z + 3)).toBeLessThan(1.2);
  });
  it('does an action on the spot and goes back to walking', () => {
    const { player, run } = setup();
    expect(player.act('interact', 0.5)).toBe(true);
    expect(player.state).toBe('emote');
    run(0.8);
    expect(player.state).toBe('move');
  });
});
