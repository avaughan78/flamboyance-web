# Flamboyance — web

Lets a player without an iPhone join a live Flamboyance party from a browser: enter the room code (or open a link with `?code=` already filled in), pick a name, and play the same quiz in step with everyone else.

It's a static site with no backend of its own — it talks directly to the same Supabase project as the iOS app (anonymous auth, Postgres + Realtime, and the `submit-answer` edge function for scoring), so a web player and native players are just different clients of one shared room.

## Develop

```
npm install
npm run dev
```

## Deploy

Pushing to `main` builds and publishes to GitHub Pages automatically via `.github/workflows/deploy.yml`.
