# The Reference Room — Cloudflare Worker

This Worker keeps all third-party API keys off the client and powers three
things in the app: image proxies (Unsplash/Pexels), OG-card scraping, and
shareable "pinned sets" (KV-backed).

**The app works without it.** With no Worker, Are.na embeds still render and
shared sets fall back to fully self-contained URL links. Deploying the Worker
adds Unsplash/Pexels image grids, OG previews, and short server-stored set IDs.

## Endpoints

| Method | Route                  | Purpose |
|--------|------------------------|---------|
| GET    | `/unsplash?q=`         | Proxied Unsplash search → normalized `{results:[…]}` |
| GET    | `/unsplash/track?loc=` | Pings Unsplash `download_location` (required on use) |
| GET    | `/pexels?q=`           | Proxied Pexels search → `{results:[…]}` |
| GET    | `/og?url=`             | Scrapes `{title,image,description,siteName}`, 24h edge cache |
| POST   | `/set`                 | `{title, cards, ownerEditToken?}` → `{id, editToken}` |
| GET    | `/set/:id`             | Full record (no edit token), no auth |
| PUT    | `/set/:id`             | `{title?, cards?}`, requires header `X-Edit-Token` |

Records expire after **90 days**, or **1 year** once an edit passcode is set
or the set is edited.

## Deploy

```bash
cd worker
npm i -g wrangler          # or use: npx wrangler ...

# 1) create the KV namespace and paste its id into wrangler.toml
npx wrangler kv namespace create SETS

# 2) add your API keys as secrets (never commit these)
npx wrangler secret put UNSPLASH_KEY    # Unsplash "Access Key"
npx wrangler secret put PEXELS_KEY      # Pexels API key

# 3) (recommended) lock the origin in wrangler.toml:
#    ALLOW_ORIGIN = "https://currentmethod.in"

# 4) ship it
npx wrangler deploy
```

`wrangler deploy` prints a URL like `https://reference-room.<you>.workers.dev`
(or your custom route). Put that in the app:

```html
<!-- in index.html <head> -->
<script>window.REFROOM_WORKER_BASE = "https://reference-room.<you>.workers.dev";</script>
```

## Local dev

```bash
npx wrangler dev
# add a preview_id to the [[kv_namespaces]] block for local KV
```

## Notes

- Get free API keys: Unsplash → https://unsplash.com/developers ,
  Pexels → https://www.pexels.com/api/ . Both have generous free tiers.
- Unsplash requires the `download_location` ping on display and attribution
  with UTM params — the app and `/unsplash/track` handle both.
- Tighten `ALLOW_ORIGIN` before production so only your site can call the proxy.
