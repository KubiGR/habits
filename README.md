# Habits

A minimal habit tracker, inspired by the Atomic Habits tracker and the Theme System Journal.

- **Today**: check off habits. Each check plays the next note up a scale, and finishing the day stamps it done. Streaks show on the right, and a habit you missed last time it was due is flagged "never miss twice".
- **Schedules**: each habit runs every day, on chosen weekdays (say Mon/Wed/Fri), or N times a week. Rest days don't break a streak, and only what's due counts toward finishing the day. Weekly habits show "2 of 3 this week" and count their streak in weeks (`4w`). Pick it as you add a habit (the options open once you start typing: Every day, Weekdays, Weekends, Pick days, Times a week), or later with **Edit**.
- **Reorder**: drag a habit by its handle (the number on the left turns into ⠿ on hover), or focus the handle and press `↑` `↓`.
- **Stats** (tab at the top): check-ins, perfect days and longest perfect run, a year heatmap, and per habit its streak and best, completion over the last 30 days and all time, which weekdays you tend to do it, and its own heatmap.
- **Last 25 days**: a rolling grid, like GitHub's activity graph. Every habit × every recent day, with a few empty days on the right so today isn't against the edge. Click any past day to fill it in late. Days where every habit was done get a dot. `←` `→` step a week at a time.
- **Half checks**: for days you did part of a habit. On a phone, long-press. On a computer, Shift+click, right-click, the ½ button, or `Shift`+`1`–`9`. A half keeps the streak going (showing up counts) and adds ½ to the totals, but doesn't complete the day or count as a perfect day.
- **Appearance**: Auto (follows the system), Light or Dark, set from the footer.
- **Keys**: `1`–`9` check today's habits, `Shift`+`1`–`9` half, `←` `→` move the grid by a week.

## Run

Needs Node 24+ and Docker.

```sh
npm install
npm run db:up   # Postgres 18 in Docker on 127.0.0.1:5436
npm run dev     # API on :3001 + Vite on :5173
```

Open http://localhost:5173. The API creates its tables on startup (`server/schema.sql`).

To run without Vite: `npm run build && npm start`, then open http://localhost:3001.

Config is optional. Copy `.env.example` to `.env` to change the database URL, port or host.

### Using it from other devices

The server only listens on `127.0.0.1`. To open it from your phone or another computer on your network, set `HOST=0.0.0.0` in `.env` and visit `http://<this-machine's-IP>:3001` (after `npm run build`). There's no login, so only do this on a network you trust.

### Deploying to the home server

Deployed with [Komodo](https://komo.do) on `kubi-server` (UI at http://192.168.0.2:9120). The `habits` stack clones this repo, builds the image from `Dockerfile` and runs `deploy/compose.yaml`. The app is at https://habits.dranidis.com (behind Cloudflare Access) and http://192.168.0.2:3090 on the LAN.

`npm run deploy` pushes, then has Komodo redeploy (`deploy/trigger-komodo.sh` sends the push webhook from the server itself, since GitHub can't reach Komodo on the LAN). Or press **Deploy** on the stack in Komodo. Data stays in the `habits_habits-pgdata` volume across deploys.

Backup on the server: `docker exec habits-db-1 pg_dump -U habits habits > habits-backup.sql`.

### Installing on your phone

Open https://habits.dranidis.com and sign in (Cloudflare Access, `adranidisb@gmail.com` only; the login lasts 30 days). Then:

- **iPhone**: Safari → Share → **Add to Home Screen**.
- **Android**: Chrome → ⋮ → **Install app**.

It opens full-screen with its own icon, and offline it still opens (check-ins need a connection). When the login expires, the app reloads to the sign-in page by itself.

On the home network it's also at http://192.168.0.2:3090, without the login.

The service worker (`public/sw.js`) only runs in production builds, never under `npm run dev`. The icons in `public/` are rendered from `icons/icon.svg`: `qlmanage -t -s 512 -o . icons/icon.svg`, then `sips -z 192 192` for the smaller sizes.

## Code map

- `server/index.ts`: Node HTTP server (no framework, no build step). `GET /api/data` returns everything, and `POST /api/ops` applies one change.
- `src/lib/data.ts`: data types and the `Op` change format, plus the `apply(data, op)` reducer used for optimistic updates
- `src/lib/useStore.ts`: optimistic updates, writes sent one at a time in order, reload when the tab regains focus
- `src/lib/http.ts`: the frontend's client for the API
- `src/lib/schedule.ts`: schedules and their descriptions
- `src/lib/stats.ts`: streaks, "never miss twice", completion rates, perfect days. All the schedule-aware counting lives here.
- `src/lib/sound.ts`: Web Audio plucks, no audio files
- `src/components/`: `Tracker` (top level), `Masthead`, `Today` (drag to reorder), `HabitRow` (row and editor), `AddHabit`, `ScheduleField` (the schedule picker both use), `RecentGrid`, `Stats`, `Heatmap`
