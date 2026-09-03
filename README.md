# Flamboyance — web

Flamboyance is a trivia/word game about English collective nouns for
groups of animals ("a flamboyance of flamingos", "a murder of crows").
This is the web client: it lets a player without the iOS or Android app
play from a browser.

- **Join a Party** — enter a room code (or open a link with `?code=`
  already filled in), pick a name, and play in step with everyone else in
  a room hosted from the iOS app, up to 8 players.
- **Play a Duel** — matchmake into a rated 1v1 match against another
  player entirely from the browser, no native app needed.
- **Admin** — a `?admin` view (`src/admin/`) for reviewing/moderating
  community-submitted collective nouns.

It's a static site with no backend of its own — it talks directly to the
same Supabase project the iOS and Android apps use (anonymous auth,
Postgres + Realtime, and Edge Functions such as `submit-answer` /
`submit-party-answer` for scoring), so a web player is just another client
of the same shared rooms/duels.

## Architecture

- **Supabase** (`uockbafewpevbpxfelde.supabase.co`) is the single backend
  shared with `flamboyance` (iOS) and `flamboyance-android` — same
  project, same anonymous-auth publishable key (`src/supabase.ts`), same
  RLS policies, same Edge Functions. This site has no server of its own;
  all game logic lives in Supabase Edge Functions.
- **Realtime** subscriptions drive live sync for Party lobbies/standings
  and Duel rounds — see `src/party/` and `src/duel/`.
- **Deterministic answer shuffling** (`src/lib/seededShuffle.ts`) mirrors
  the Swift/Kotlin implementations so every client renders the same
  answer-option order from the same seed without a server round trip.
- **Deployment**: pushing to `main` builds and publishes to GitHub Pages
  automatically via `.github/workflows/deploy.yml`, served at the custom
  domain flamboyance.click (`public/CNAME`).

## Tech stack

| Category | Tech |
|---|---|
| Framework | React 19 |
| Build tool | [Vite](https://vitejs.dev) 8 |
| Language | TypeScript |
| Backend client | [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) |
| Linting | [oxlint](https://oxc.rs/docs/guide/usage/linter.html) |
| Hosting | GitHub Pages, deployed via GitHub Actions |
| Backend (shared with iOS/Android) | [Supabase](https://supabase.com) — Postgres, Auth, Realtime, Edge Functions |

## Repo layout

- `src/party/` — Party join/lobby/question/standings/results screens.
- `src/duel/` — Duel matchmaking/question/result screens.
- `src/admin/` — community-noun moderation admin view.
- `src/lib/` — shared helpers (seeded shuffle, edge-function error handling).
- `src/supabase.ts` — Supabase client setup.
- `public/` — static assets, including `CNAME` (custom domain) and
  `data-deletion.html` / `privacy.html` / `support.html` policy pages.

## Develop

```
npm install
npm run dev
```

## Deploy

Pushing to `main` builds and publishes to GitHub Pages automatically via
`.github/workflows/deploy.yml`.
