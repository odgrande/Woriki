# Amen City — architecture and module contracts

A third-person 3D browser game (Three.js r186, Vite 8, plain JavaScript ES modules with JSDoc, no TypeScript).
A church community set in real Lagos. Mobile-first: it must run on cheap Android phones.

Conventions for every module:
- Units are metres. +Y is up. Characters face +Z when `rotation.y = 0`.
- Import three as `import * as THREE from 'three'`; addons from `'three/addons/...'`.
- Each module exports factory functions (no classes required) and never touches another module's internals.
- Register per-frame work with `ctx.onUpdate((dt, t) => ...)` or expose `update(dt, t)` for the caller.
- Wrap every `localStorage` access in try/catch.
- Expose debug hooks on `window.__amen` (read-only state for tests). Never rely on them in game logic.
- Real Lagos place names are fine (Yaba, Oshodi, Balogun Market, Ojuelegba, Makoko, Third Mainland Bridge...).
  Churches, pastors and people are fictional. No real church names.
- Keep text in plain, friendly English with light Nigerian flavour (Pidgin lines for NPCs are welcome).

Performance budgets (low tier): ≤ 250 draw calls, ≤ 450k triangles on screen, ≤ 12 full-detail characters
on screen (others use the low-detail path), textures ≤ 1024 px, no post-processing.

## Files and owners

| Area | Files | Contract |
|---|---|---|
| Engine core (done) | `src/engine/context.js`, `src/engine/assets.js` | below |
| Input, camera, collisions | `src/engine/input.js`, `src/engine/camera.js`, `src/engine/physics.js` | below |
| Characters | `src/characters/*` | below |
| World (map) | `src/world/*` | below |
| Player | `src/player/player.js` | below |
| NPC community | `src/npc/*`, `src/ui/bubbles.js` | below |
| Audio | `src/audio/*` | below |
| Multiplayer + chat | `server/*`, `src/net/*`, `src/ui/chat.js` | below |
| Game rules + UI | `src/game/*`, `src/ui/*` (except bubbles.js, chat.js) | below |
| Wiring | `src/main.js` | integration |

Assets already built (CC0, Quaternius) in `public/assets/characters/`:
`male.glb`, `female.glb` (65-bone rig, ~15k tris, meshes: body + `Eyebrows` + `Eyes`),
`hair_{buzzed,buzzedfemale,buns,long,simpleparted,beard}.glb`, `eyebrows_{regular,female}.glb` (skinned to the same rig),
`anims_1.glb` (19 clips) and `anims_2.glb` (7 clips). Clip names:
`Idle_Loop, Walk_Loop, Walk_Formal_Loop, Jog_Fwd_Loop, Sprint_Loop, Jump_Start, Jump_Loop, Jump_Land, Sitting_Enter,
Sitting_Idle_Loop, Sitting_Exit, Sitting_Talking_Loop, Idle_Talking_Loop, Dance_Loop, Fixing_Kneeling, Interact,
PickUp_Table, Crouch_Idle_Loop, Driving_Loop, Idle_FoldArms_Loop, Idle_TalkingPhone_Loop, Yes, Idle_No_Loop,
Walk_Carry_Loop, Consume, LayToIdle`.
Bone names include `root, pelvis, spine_01, spine_02, spine_03, neck_01, Head, clavicle_l/r, upperarm_l/r, lowerarm_l/r,
hand_l/r, thigh_l/r, calf_l/r, foot_l/r, ball_l/r` and finger bones.
The bodies are base meshes in underwear with medium-brown skin; clothing must be added (see Characters).
Assets are loaded with `ctx.assets.gltf('characters/male.glb')` (cached, meshopt decoder set).

## Engine core — `src/engine/context.js` (done)

`createContext(canvas, {quality?}) → ctx` with:
`THREE, renderer, scene, camera, quality ('low'|'medium'|'high'), bus {on(type, fn) → off, emit(type, data)},
sun, hemi, assets {gltf(path)}, time, onUpdate(fn(dt, t)) → off, setShadowFocus(vec3), start(), stop()`.

Bus events used across modules (payloads in braces):
- `player:moved {position, surface, speed}` (every frame the player moves)
- `player:step {surface, position, run}` (each footstep)
- `player:zone {zone}` when the player enters a world zone
- `player:action {name}` ('jump','sit','stand','kneel','wave','clap','dance','pray')
- `chat:local {text}` the player sent a chat line; `chat:message {from, text, id, self}` any chat line to show
- `npc:say {npc, text}`
- `game:changed {state}` after game state changes; `game:toast {text}`
- `audio:play {name, position?}`; `audio:music {track}` ('worship' | 'none')
- `service:start {kind}` / `service:end {kind}` when a church service begins or ends

## Input — `src/engine/input.js`

`createInput(domRoot) → input`:
- `input.move` `{x, y}` in −1..1 (x right, y forward) from WASD/arrows or the on-screen joystick (left half of the screen on touch).
- `input.run` boolean (Shift, or joystick pushed past 90%).
- `input.lookDelta()` → `{dx, dy}` pixels since last call (mouse drag / right-half touch drag), for the camera.
- `input.zoomDelta()` → number (wheel / pinch).
- `input.consume(name)` → boolean, true once per press. Names: `jump` (Space), `sit` (C), `kneel` (P), `wave` (E),
  `clap` (G), `dance` (B), `interact` (F), `chat` (Enter or T), `help` (?), `endday` (N), `escape` (Esc).
- Ignores keys while focus is in an input/textarea or `input.enabled = false`.
- Creates the touch controls DOM itself (joystick bottom-left; buttons bottom-right: Jump, Sit, Wave, Pray, Interact)
  inside `domRoot`, visible only on touch devices, neo-brutalist styled (see UI).

## Camera — `src/engine/camera.js`

`createFollowCamera(ctx, input) → cam` with `cam.yaw`, `cam.pitch`, `cam.distance`, `cam.update(dt, targetPosition, physics?)`.
Third-person orbit behind the player, smoothly following; drag to orbit, wheel/pinch to zoom (2.5–9 m);
pulls in when a wall is between camera and player (raycast against `physics.blockers` if given).
Movement is camera-relative: forward = direction the camera looks, flattened on XZ.

## Collisions — `src/engine/physics.js`

`createPhysics() → physics`:
- `addBox(min: Vector3, max: Vector3, {kind?})`, `addCylinder(center: Vector3, radius, height)`.
- `moveCapsule(position: Vector3, delta: Vector3, radius = 0.3, height = 1.7) → Vector3` new position after sliding
  along colliders (XZ resolution against boxes and cylinders; Y from `groundHeight`).
- `setGround(fn(x, z) → y)` and `groundHeight(x, z)`.
- `blockers` array of `THREE.Object3D` the camera may raycast against (optional).

## Characters — `src/characters/*`

`loadCharacterKit(ctx) → Promise<kit>` loads bodies, hair, eyebrows and all clips once.

`createCharacter(kit, appearance, {detail: 'high'|'low'} = {}) → character`:
- `character.object` (`THREE.Group`, feet at y = 0, faces +Z), `character.height` (≈ 1.75).
- `character.play(state, {fade = 0.25, loop?, timeScale?, once?})` with states:
  `idle, walk, walkFormal, jog, run, jumpStart, jumpLoop, jumpLand, sitDown, sit, standUp, sitTalk, talk, dance,
  kneel, foldArms, phone, nod, shakeHead, carry, eat, drive, interact, pickup, crouch, lie`.
- `character.setLocomotion(speed)` m/s: chooses idle / walk / jog / run and matches timeScale to speed.
- `character.wave(seconds = 2)`, `character.clap(seconds = 3)`, `character.raiseHands(seconds = 3)` (praise):
  procedural upper-body overlays applied after the mixer.
- `character.update(dt)`, `character.dispose()`, `character.appearance`.

`appearance` (all optional, defaults filled in):
```js
{ body: 'male'|'female', skin: 0..5 (0 lightest brown … 5 deepest), hair: 'buzzed'|'buzzedfemale'|'buns'|'long'|'simpleparted'|'none',
  beard: boolean, hairColor: '#1b1b1b',
  outfit: 'shirt-trousers'|'ankara-shirt'|'agbada'|'senator'|'ankara-gown'|'skirt-blouse'|'iro-buba'|'choir-robe'|'white-garment'|'security'|'usher'|'suit'|'tshirt-jeans'|'apron',
  colors: { primary: '#hex', secondary: '#hex', pattern: 'ankara-1'|'ankara-2'|'ankara-3'|'plain'|'stripes' },
  headwear: 'none'|'gele'|'fila'|'cap'|'beret'|'headscarf', shoes: '#hex' }
```
`randomAppearance(rng = Math.random, role?) → appearance` picks a realistic Nigerian look (role-appropriate:
security in black trousers + high-vis vest + beret, ushers in matching uniforms, choir in robes, Aladura in white).

Clothing approach (required): build garments from the body mesh itself — select triangles whose vertices are
dominated by the garment's bones (e.g. shirt = spine/clavicle/upperarm[/lowerarm]; trousers = pelvis/thigh/calf;
gown = all but head/hands/feet), offset positions along normals by a few millimetres, keep the skin weights, and
bind to the same skeleton so clothes deform with animation. Fabrics use generated canvas textures
(Ankara wax prints, stripes, lace) mapped with the body UVs. Long garments (agbada, gown, robe) may add a rigid
flared skirt piece parented to `pelvis`. Headwear is a mesh parented to the `Head` bone. Skin tone is a material
colour tint over the body texture. `detail: 'low'` must be much cheaper (e.g. a simplified body or merged
materials) for crowds.

## World — `src/world/*`

`buildWorld(ctx, physics) → Promise<world>` builds ONE continuous map, the vertical slice:
a street in **Yaba, Lagos** with a church compound ("Grace Assembly", fictional) — gate with security post,
car park, auditorium with pews, altar/pulpit, choir stand, keyboard/drums, speakers, projector screen,
ceiling fans and a media desk, a prayer room, a kitchen/canteen — plus houses (the player's home), a small
market row (buka, kiosk, pure-water seller), a bus stop with a yellow danfo, okada and keke, palm trees,
electric poles, signboards. Procedural geometry with good materials (canvas textures for painted walls,
zinc roofs, laterite, asphalt, tiles), instancing for repeated props, shadows on.
`world`:
- `root` (Group added to `ctx.scene`), `update(dt, t)`.
- `spawns`: `{ player: {position, rotY}, byRole: {security, usher, choir, media, hospitality, children, prayer, worshipper, visitor, minister} }`.
- `seats: [{position, rotY, kind: 'pew'|'chair'|'bench', zone, taken: false}]` (seat position = hip height point).
- `nav: { nodes: [{id, position, zone}], edges: [[a, b]] , randomNode(zone?), path(fromPos, toPos) → Vector3[] }`.
- `zones: [{id, label, box: Box3, ambience: 'street'|'church'|'market'|'home'|'prayer'}]` with ids
  `street, busstop, market, gate, carpark, church-hall, altar, choir, media, prayer-room, kitchen, home`.
- `surfaceAt(x, z) → 'asphalt'|'concrete'|'tile'|'dirt'|'wood'|'carpet'`.
- `zoneAt(position) → zone|null`.
- `interactables: [{id, position, radius, label, action}]` actions: `pray, sit, buy-food, board-danfo, ring-bell, play-keyboard, open-door`.
- `vehicles` (optional moving danfo/okada along the road) updated in `update`.
Also registers colliders in `physics` and sets `physics.setGround`.

## Player — `src/player/player.js`

`createPlayer(ctx, {world, physics, input, camera, character}) → player` with
`object`, `position`, `state` ('move'|'air'|'sit'|'kneel'|'emote'), `update(dt, t)`, `sitAt(seat)`, `stand()`,
`teleport(position, rotY)`. Walk 1.6 m/s, run 4.5 m/s, jump with gravity, turns to face movement, uses
`character.setLocomotion`, sits on the nearest free seat with `sit` (C), kneels to pray with `kneel` (P),
wave/clap/dance emotes, emits `player:moved`, `player:step`, `player:zone`, `player:action`.
`interact` (F) triggers the nearest `world.interactables` entry via `ctx.bus.emit('player:interact', item)`.

## NPC community — `src/npc/*`, `src/ui/bubbles.js`

`createCommunity(ctx, {world, physics, kit, bubbles}) → community` with `update(dt, t)`, `npcs`.
Spawns 25–60 NPCs (fewer on low quality) with `randomAppearance`, LOD (full detail near the camera, low far,
hidden beyond ~45 m), simple brains: wander along `world.nav`, gather in groups and talk (talk animation +
speech bubbles in English/Pidgin: "Good morning sir!", "How body?", "God dey!"), vendors at the market, security at
the gate, ushers at the door, people sitting in pews during service times, choir singing (dance/raise hands),
a pastor preaching at the pulpit during service, kids playing. Reacts when the player waves (waves back) or comes
close (greets). Avoids walking through each other (simple separation).
`createBubbles(ctx) → bubbles` with `show(object3d, text, {seconds = 4, kind = 'npc'|'chat'|'self'})`, `update()`:
DOM speech bubbles above heads, projected each frame, clamped to the screen, max ~8 visible.

## Audio — `src/audio/*`

`createAudio(ctx) → audio` (Web Audio, all procedural; no external files needed):
`unlock()` (call on first user gesture), `setMuted(bool)`, `muted`, `setZone(ambience)` crossfades ambience beds
(street: traffic hum, distant horns, hawker chatter; church: room tone + fans; market: crowd; prayer: quiet;
home: generator hum + birds), `footstep(surface, {run})`, `play(name, {position?, volume?})` for
`'bell','click','chat','coin','pray','clap','door','horn','okada','thunder','success','fail'`,
`setMusic('worship'|'none')` — a generated gospel keyboard + bass + percussion loop with a choir pad that plays
during services, `update(listenerPosition, listenerYaw)` for spatial sounds.
Listens on the bus for `player:step`, `player:zone`, `audio:play`, `audio:music`, `chat:message`.

## Multiplayer + chat — `server/*`, `src/net/*`, `src/ui/chat.js`

Server `server/index.js`: Node + `ws`, `PORT` env (default 8787), path `/ws`. Rooms by `room` query param
(default `yaba`). Messages are JSON `{t: type, ...}`:
client→server `hello {name, role, appearance}`, `state {p: [x,y,z], r: yaw, a: animState, s: seat?}` (≤ 10/s),
`chat {text}`; server→client `welcome {id, players: [...], online}`, `join {id, name, role, appearance}`,
`leave {id}`, `states {list: [[id, x, y, z, r, a], ...]}` (broadcast 10 Hz), `chat {id, name, text, ts}`,
`online {count}`, `error {message}`. Server validates and clamps all input, limits names to 20 chars and chat to
200 chars, filters profanity (`obscenity` English dataset plus a small list of common Nigerian Pidgin/Yoruba insults,
masked with asterisks), rate-limits chat (e.g. 5 messages / 10 s) and states, drops idle sockets, and keeps the
last 30 chat lines per room for new joiners. `GET /health` returns `ok`.
Client `src/net/client.js`: `createNet({url?, room, name, role, appearance}) → net` with `on(type, fn)`,
`sendState(state)`, `sendChat(text)`, `connected`, `id`, `online`. If the WebSocket server is unreachable it falls
back to a `BroadcastChannel` mode so several tabs on one device still see each other (and reports `mode: 'local'`).
`src/net/remotes.js`: `createRemotes(ctx, {net, kit, bubbles}) → remotes` spawns a character per remote player,
interpolates positions (~100 ms buffer), plays their animation state, shows name tags and chat bubbles.
`src/ui/chat.js`: `createChatUI(ctx, {net, root, input}) → chatUI` — chat box (Enter/T to open, Esc to close),
recent messages log, quick phrases ("God bless you 🙏", "Amen!", "Good morning", "Welcome!"), report/block a
player locally, online count chip ("● 23 online").

## Game rules + UI — `src/game/*`, `src/ui/*`

Port the content from `legacy/game.js` (roles and ranks, Bible verses KJV, Bible quiz, temptations, missions in real
Lagos places, shop, needs: energy/hunger/faith/character/word/points/naira, mood, Sunday streaks, repentance and
grace, EFCC ending for fraud) into data modules + pure logic (`src/game/state.js`, `src/game/content.js`,
`src/game/systems.js`, unit-tested with Vitest in `src/game/*.test.js`).
Time: one in-game day lasts 24 real minutes by default (configurable) with a visible clock; Sunday service at
in-game 9:00, Wednesday Bible study 18:00, Friday vigil 22:00. Services are physical events: go to the church hall
and sit (or serve at your post) while it runs to get credit.
Actions happen in the world where possible (pray by kneeling in the prayer room, buy food at the buka, duties at
your post) with a compact panel for the rest.
UI (`src/ui/*`): start screen with name, church tradition and role picker plus an appearance editor (body,
skin tone, hair, outfit, colours, headwear) showing the live 3D character; HUD (time, day, naira, ⭐ points,
mood, energy/hunger/faith/character bars, online count), bottom navigation (Today, Prayer, Shop, Diary),
toasts, modal events/temptations, controls help (`?`), settings (quality, sound). Neo-brutalist style ported from
`legacy/style.css`: cream paper, 2px black borders, hard shadows, pastel blocks, Space Grotesk + Inter, Lucide-style
inline SVG icons (no icon library needed). Mobile-first; the 3D view must stay visible (panels slide over, collapsible).

## Lagos life around the church (map, travel, home)

- **Clock.** `main.js` creates the game with `clock: 'shared'` and `realMinutesPerDay: REAL_TIME` (1440):
  in-game time is the real time in Lagos (WAT). `servicesFor(role)` adds each role's own meetings
  (Saturday cleaning, choir practice) to the worship services. `game.plan` gives today's plan.
- **Places and travel** (`src/game/life.js`): `PLACES` (map position, walkable 3D place or day trip),
  `TRAVEL_MODES`, `ACTIVITIES` and the home `CATALOG`. Game API: `game.here`, `game.trip`,
  `game.quotes(to)`, `game.travel(to, mode)` (emits `game:travel` on the bus), `game.activities()`,
  `game.activity(id)` and `game.buyFurniture(id)` (emits `home:changed`).
- **Map** (`src/map/`): `createLagosMap(ctx, {root, onPick})` builds a separate scene. It is drawn instead
  of the world with `ctx.setView(scene, camera)`, and `ctx.setView(null)` switches back to the world.
  The map has HTML pins and layers (traffic, billboards, sea, gov, names), and its lighting follows the
  hour in Lagos.
- **UI**:
  - `src/ui/front.js`: landing page and home card. The `amen.loggedOut` key in localStorage keeps you
    logged out.
  - `src/ui/mapview.js`: map panel, travel picker and the screen shown while you are on the way.
  - The dock is Home, Map, Buy, Today, Phone (prayer wall and diary).
- **World**:
  - `src/world/districts.js` builds Elegushi Beach (around z = 600) and the National Theatre with its
    cinema (around x = 600). They are far enough apart that they never appear in each other's view.
  - Arrival points are in `world.spawns.places`.
  - Stalls are interactables with `action: 'activity'`.
  - `src/world/decor.js` places the furniture you bought in No. 14.
