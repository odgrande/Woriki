# Amen City server

A small Node + [`ws`](https://github.com/websockets/ws) server for multiplayer and chat. One process
holds every room in memory; there is no database. It can also serve the built game (`dist/`), so a single
free web service is enough to put Amen City online.

```bash
node server/index.js                 # ws://localhost:8787/ws?room=yaba
PORT=8790 node server/index.js       # another port
npm run dev                          # Vite + this server together
```

## What it does

| | |
|---|---|
| **Rooms** | `?room=` query param (slug, default `yaba`). Up to 60 players per room (`ROOM_CAP`), 600 in total (`MAX_PLAYERS`). |
| **Messages** | JSON `{t: type, ...}`. Client → server: `hello`, `state` (≤ 10/s), `chat`, `report`, `ping`, `bye`. Server → client: `welcome`, `join`, `leave`, `states` (10 Hz), `chat`, `online`, `error`, `pong`, `profile`. See `protocol.js` and ARCHITECTURE.md. |
| **Validation** | Every field is clamped in `protocol.js`: names ≤ 20 chars (letters, digits, `.'-_&`), chat ≤ 200 code points, positions inside the world box and rounded to cm, yaw wrapped, animation states from a fixed list, appearance reduced to known keys with hex colours and slug values. Invisible / bidi characters and "zalgo" stacks are stripped. Frames over 4 KB are refused. |
| **Profanity** | `obscenity` English dataset with its recommended transformers, plus a short list of Nigerian Pidgin / Yoruba / Igbo / Hausa insults (`filter.js`). Matches are **masked** with asterisks, not dropped. Names are masked too. |
| **Rate limits** | Chat: 5 lines per 10 s per player (then `error {code: 'rate'}`), the same line at most twice in 30 s. States: ~12/s, the excess is dropped quietly. All frames: 25/s with a burst of 40; persistent flooding closes the socket (1008). Connections: 24 open sockets and 40 new connections per minute per IP (`MAX_PER_IP`, `CONNECTS_PER_MINUTE`; Nigerian mobile networks put many people behind one IP, so keep these generous). |
| **Moderation** | `report {id, reason}` is logged. When people on 3 different IPs report the same player within 10 minutes, that player's chat is paused for 10 minutes. Blocking is local to each device (`net.block`). |
| **Timeouts** | `hello` within 10 s or the socket is closed (4001). No message for 150 s (`IDLE_MS`) → dropped as idle (4002); clients send a keep-alive state every 5 s while the tab is in use. Ping/pong every 20 s terminates dead connections. |
| **Resume** | A connection that drops without a close frame (phone lost signal) keeps its player in the room for 20 s. The client reconnects with `hello {resume: {id, token}}` and continues with the same id, so other players see no leave/join flicker. |
| **History** | The last 30 chat lines per room are sent to new joiners in `welcome.history`. |
| **Online counts** | `online {count, total}`: players in your room and in all rooms, broadcast at most once a second when they change. `GET /stats` returns `{online, rooms, uptime}` (CORS open) for a landing page. |
| **Health** | `GET /health` → `ok`. |
| **Shutdown** | `SIGTERM` / `SIGINT`: clients get `error {code: 'restart'}` and close code 1012 (they reconnect after a second), then the process exits within 6 s. |
| **Bandwidth** | `states` frames only carry players that moved, positions in cm; permessage-deflate is on (small window) because mobile data is expensive. |

## How the client finds the server

`src/net/client.js` → `serverUrl(room)`:

1. `createNet({url})` if the caller passes one (the dev harness passes `?server=`).
2. `import.meta.env.VITE_SERVER_URL` at build time, e.g. `VITE_SERVER_URL=wss://amen-city.onrender.com/ws`
   (`http(s)://` URLs are turned into `ws(s)://`, `/ws` is added when the path is empty).
3. In dev (`vite`): the same host on port **8787**, so phones on your Wi-Fi can open `http://<laptop-ip>:5173`
   and reach `ws://<laptop-ip>:8787/ws`.
4. In a production build: the same origin, `wss://<host>/ws` — correct when this server also serves `dist/`.

If the server cannot be reached the client switches to **local mode** (BroadcastChannel): several tabs on the
same device still see each other and chat, and it keeps retrying the server in the background
(1 s → 30 s backoff, immediately when the network or the tab comes back).

## Deploy for free

The simplest setup is **one web service that serves the game and the WebSocket** (same origin, nothing to configure).

### Render (free web service)

1. Push the repo to GitHub and create a **Web Service** on [render.com](https://render.com) from it.
2. Runtime: Node. **Build command:** `npm ci --include=dev && npm run build`. **Start command:** `node server/index.js`.
3. Health check path: `/health`. Render sets `PORT` and `RENDER`; the server then trusts `X-Forwarded-For` for per-IP limits.
4. Open `https://<name>.onrender.com`. WebSockets work on the free plan.

Free instances sleep after ~15 minutes without traffic and take 30–60 s to wake: the first visitor waits, and the
client shows "Connecting…" / local mode meanwhile. A free uptime pinger hitting `/health` every 10 minutes keeps
it awake (within Render's free hours). Rooms live in memory, so a restart or deploy clears chat history.

### Fly.io

```bash
fly launch --no-deploy --dockerfile server/Dockerfile   # pick a region close to Lagos, e.g. jnb (Johannesburg) or lhr/cdg
fly deploy
```

`server/Dockerfile` builds the game and runs the server on port 8080 (`internal_port = 8080` in `fly.toml`).
Add an HTTP check on `/health`. Keep **one** machine (`fly scale count 1`): rooms are in memory, and two machines
would split players into two worlds. `auto_stop_machines = "stop"` with `min_machines_running = 0` keeps it in the
free allowance at the cost of a cold start.

### Static site + separate server

Host `dist/` anywhere static (Cloudflare Pages, Netlify, GitHub Pages) and run only the server on Render/Fly:

```bash
VITE_SERVER_URL=wss://amen-city-server.onrender.com/ws npm run build
```

Set `ALLOWED_ORIGINS=https://amen-city.pages.dev` on the server so other sites can't connect their pages to it.
(`STATIC_DIR=none` or simply no `dist/` → the server only answers `/ws`, `/health` and `/stats`.)

### Later: Cloudflare Durable Objects

When there are many rooms or players across Africa, the natural next step is Cloudflare Workers + **Durable
Objects**: one Durable Object per room holds the players, the 30-line history and the 10 Hz tick, WebSockets use
the hibernation API (idle rooms cost nothing), and Cloudflare's Lagos edge cuts latency. `protocol.js`,
`filter.js` and `ratelimit.js` are plain ES modules without Node APIs, so they move over unchanged; only
`index.js` (HTTP/upgrade) and the socket wrapper passed to `hub.connect` need a Workers version.

## Environment variables

| Variable | Default | |
|---|---|---|
| `PORT` | `8787` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | bind address |
| `STATIC_DIR` | `../dist` | serve the built game from here when it has an `index.html` |
| `ALLOWED_ORIGINS` | (any) | comma-separated `Origin`s allowed to open a WebSocket |
| `TRUST_PROXY` | off (on when `RENDER` / `FLY_APP_NAME` is set) | use `X-Forwarded-For` / `Fly-Client-IP` for per-IP limits |
| `ROOM_CAP` | `60` | players per room |
| `MAX_PLAYERS` | `600` | players in total |
| `IDLE_MS` | `150000` | drop a player after this long without messages |
| `MAX_PER_IP` | `24` | open sockets per IP |
| `CONNECTS_PER_MINUTE` | `40` | new sockets per IP per minute |

## Files

- `index.js`: HTTP server, `/health`, `/stats`, static files, WebSocket upgrade, heartbeat, graceful shutdown.
  `startServer(opts)` is exported for tests.
- `hub.js`: rooms, players, resume, chat, history, reports, the 10 Hz tick (transport-agnostic).
- `protocol.js`: constants and validators shared with the client.
- `filter.js`: profanity masking. `ratelimit.js`: token buckets. `static.js`: tiny static file server.
- Tests: `npx vitest run server/ src/net/` (unit tests, a fake-clock hub test, an integration test that starts the
  server and connects real clients, and client tests for reconnect/resume and the BroadcastChannel fallback).
  End to end in two browser pages: `node dev/net/two-players.pw.mjs` (Playwright; starts the server and Vite if needed).
- Dev harness: `npx vite` then open `/dev/net/index.html?name=Ada&role=choir` in two tabs with `node server/index.js`
  running on 8790 (`PORT=8790`), or pass `&server=ws://host:port/ws`. `&bots=8&botchat=1` adds walking, chatting players.
