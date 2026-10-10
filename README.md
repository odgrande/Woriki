# Amen City ⛪

A free 3D browser game set in real Lagos. You are part of a church community at **Grace Assembly, Yaba**
(the church and its people are fictional; the places are real). Pick your role, walk around in third person,
attend services, pray, serve at your post, chat with other players and stay faithful while the devil is busy.

It runs in the browser with no download, and it is built to work on cheap Android phones.

## What's in this version

- **Realistic people.** CC0 human models with Nigerian outfits generated on the body, so clothes move
  with every animation: Ankara shirts and gowns, agbada, senator, iro and buba with gele, choir robes,
  Aladura white garments, security (hi-vis vest and beret) and usher uniforms. Six skin tones, several
  hairstyles, beards, fila caps and headscarves.
- **A real-feeling Yaba street.** The Grace Assembly compound includes:
  - the gate and security post, and the car park
  - an auditorium with pews, altar, choir stand, keyboard and drums, speakers, fans and a media desk
  - a prayer room and a canteen

  Outside the church:
  - your home
  - a market row with a buka, a pure-water seller and a POS kiosk
  - a bus stop with a yellow danfo, okada and keke
  - palm trees, electric poles and painted signs
- **A living community.** People walk the street and gist in groups (English and Pidgin). Vendors call
  out, the danfo conductor shouts "Oshodi!", security guards the gate and kids play. NPCs greet you and
  wave back. During services the pews fill up, the pastor preaches and the choir praises.
- **Your role:** worshipper, prayer warrior, security, usher, choir, media and sound, hospitality,
  children's teacher, visitor, or the minister path (Bible school, then your own church). Each role has
  ranks, duties and its own temptations.
- **Real-time days.** One in-game day lasts 24 real minutes. Sunday service is at 9:00, Wednesday Bible
  study at 18:00 and the Friday vigil at 22:00. Go to the hall and sit, or serve at your post, while the
  service runs.
- **Multiplayer and chat.** See other players walking around with name tags, chat with bubbles over
  your heads, use quick phrases ("God bless you 🙏", "Amen!"), and report or block players. Chat is
  filtered for swear words, including common Pidgin, Yoruba and Igbo insults.
- **Sound.** Everything is generated in code with no audio files:
  - footsteps that change with the surface
  - Lagos street ambience: traffic, horns and the crowd
  - the church room, the market and the prayer room
  - a gospel praise groove during services, with keyboard, bass, shaker, talking drum and a choir pad
- **Needs and points.** Energy, hunger, faith and character; naira and ⭐ points; a shop; Bible quiz
  exams; evangelism missions in real Lagos places; repentance and grace.

## Controls

| Keyboard | Phone | Action |
|---|---|---|
| `W` `A` `S` `D` / arrows | joystick (left thumb) | Walk |
| `Shift` | push the joystick far | Run |
| `Space` | Jump | Jump |
| `C` | Sit | Sit on the nearest seat / stand up |
| `P` | Pray | Kneel and pray |
| `E` | Wave | Wave |
| `G` / `B` | – | Clap / dance |
| `F` | Interact | Use what's nearby (ring the bell, buy food, board the danfo) |
| `Enter` or `T` | Chat | Open chat |
| mouse drag / wheel | drag right side / pinch | Turn and zoom the camera |
| `?` | ? button | Show all controls |

## Run it

Needs Node 20 or newer.

```bash
npm install --legacy-peer-deps
npm run assets     # downloads the CC0 characters and compresses them (already done in this repo)
npm run dev        # game on http://localhost:5173 and the multiplayer server on :8787
```

Open the game in two browser windows to see multiplayer. `npm test` runs the unit tests and `npm run build`
makes the production bundle in `dist/`. Add `?quality=low|medium|high` to the URL to force a graphics level.

## Deploy for free

- **Game (static files):** `npm run build`, then put `dist/` on Cloudflare Pages, Vercel or Netlify.
- **Multiplayer server:** run `server/` on Render, Fly.io or any small VM (see `server/README.md`).
  The server can also serve `dist/` itself, so one service is enough. If the client is hosted elsewhere,
  build it with `VITE_SERVER_URL=wss://your-server/ws`.
- Without a server the game still works: players on the same device see each other (offline mode).

## Project layout

| Folder | What it does |
|---|---|
| `src/engine/` | Renderer, quality tiers, input (keyboard + touch), follow camera, collisions |
| `src/characters/` | Character kit, outfits, skin tones, headwear, animations |
| `src/world/` | The Yaba map: street, church, market, home, vehicles, navigation |
| `src/player/` | Your character's movement, sitting, kneeling, emotes |
| `src/npc/` | The NPC community |
| `src/audio/` | Procedural sound and music |
| `src/net/`, `server/` | Multiplayer client and server, remote players |
| `src/game/` | Game rules, content, clock and save |
| `src/ui/` | Start screen, look editor, HUD, sheets, chat, speech bubbles |
| `legacy/` | The first 2D prototype, kept for reference |

`ARCHITECTURE.md` describes how the modules fit together.

## Credits and licences

- Characters, hair and animations: **Quaternius** (Universal Base Characters and Universal Animation
  Library), CC0 1.0, https://quaternius.com
- Three.js (MIT). Scripture is quoted from the King James Version (public domain).
- All churches, pastors and people in the game are fictional. Places in Lagos are real.
