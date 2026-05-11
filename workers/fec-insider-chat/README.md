# FEC Insider Chat Worker

Cloudflare Worker: `/chat`, `/feedback`, `/subscribe` (Ghost members + optional Zapier hooks).

## Security

**Never commit API keys or webhook URLs.** Use [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

After any leak (chat, screenshot, public repo), **rotate**:

- Ghost: Admin → Settings → Integrations → Admin API — revoke the key and create a new one (`id:secret`; use the **hex secret** part for `GHOST_ADMIN_KEY_SECRET` as in Ghost’s JWT docs).
- Zapier: replace catch hooks if they were exposed.
- Anthropic: rotate `ANTHROPIC_API_KEY` if it appeared in the same bundle.

## Configure

```bash
cd workers/fec-insider-chat
npm i -g wrangler  # or use npx wrangler
wrangler login
```

Set secrets (values are not echoed):

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GHOST_ADMIN_KEY_ID
wrangler secret put GHOST_ADMIN_KEY_SECRET
wrangler secret put ZAPIER_CHAT_WEBHOOK
wrangler secret put ZAPIER_FEEDBACK_WEBHOOK
wrangler secret put ZAPIER_SUBSCRIBE_WEBHOOK
```

`GHOST_URL` can be a plain [var] in `wrangler.toml` (not secret) or a secret if you prefer.

Local dev: copy `.dev.vars.example` → `.dev.vars` (gitignored) and fill in.

## Deploy

```bash
wrangler deploy
```

Point the site’s `CHAT_API` / `CHAT_API_URL` at your deployed worker URL.
