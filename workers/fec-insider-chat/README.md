# FEC Insider Chat Worker

Cloudflare Worker routes:

- **`POST /chat`** — Anthropic Claude + optional `ZAPIER_CHAT_WEBHOOK`
- **`POST /feedback`** — optional `ZAPIER_FEEDBACK_WEBHOOK`
- **`POST /subscribe`** — **`ZAPIER_SUBSCRIBE_WEBHOOK`** (required). Add the email to your list in Zapier (Mailchimp, Google Sheet, etc.). **Ghost is not used.**

## Secrets (Wrangler)

```bash
cd workers/fec-insider-chat
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ZAPIER_CHAT_WEBHOOK      # optional
wrangler secret put ZAPIER_FEEDBACK_WEBHOOK  # optional
wrangler secret put ZAPIER_SUBSCRIBE_WEBHOOK # required for signup
```

If you previously used Ghost, remove old secrets from the Worker (Dashboard → Workers → your worker → Settings → Variables, or):

```text
wrangler secret delete GHOST_ADMIN_KEY_ID
wrangler secret delete GHOST_ADMIN_KEY_SECRET
```

and delete the **`GHOST_URL`** plain variable from `wrangler.toml` / dashboard if it was set.

## Local dev

Copy `.dev.vars.example` → `.dev.vars` (gitignored) and fill in. Deploy:

```bash
wrangler deploy
```

Point the site `CHAT_API` at your worker URL.
