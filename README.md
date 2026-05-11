# FEC Insider

AI-assisted daily news for **Family Entertainment Center (FEC)** operators—headlines and summaries pulled from industry RSS and Google News, curated with Claude, published on **GitHub Pages**.

**Live site:** [davidmarkleach.github.io/fec-insider](https://davidmarkleach.github.io/fec-insider/)

---

## Haven’t opened this repo in a while?

1. **`scripts/template.html`** is the source for the main page layout + inline scripts. **`curate.py` regenerates `index.html` from it.** If you only edit `index.html`, the next curation run can overwrite your work—edit the **template** (or accept that it may be replaced).
2. **Stories live in `articles.json`.** The browser loads that file on every visit. It’s updated when **`scripts/curate.py`** runs (locally or in GitHub Actions).
3. **Pushing to `main`** deploys the whole repo to **GitHub Pages** (`deploy.yml`). **Daily News Update** (`update.yml`) runs the curator once a day (and can be run manually) and may commit fresh `articles.json` + `index.html`.

More detail (file-by-file, branches): see **[DEVELOPMENT.md](./DEVELOPMENT.md)**.

---

## Preview locally

From the repo root (serves `index.html` and `articles.json` together):

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

---

## Run the curator on your machine

Needs an Anthropic API key.

```bash
cd scripts
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."
python curate.py
```

Optional env vars (see `curate.py` / Actions): `GA4_ID`, `CLARITY_ID`, `CHAT_API_URL`.

This writes **`../articles.json`** and **`../index.html`** from **`template.html`**. Commit those if you want them on GitHub.

---

## GitHub Actions checklist

| Workflow | When | You need |
|----------|------|----------|
| **Deploy to GitHub Pages** | Push to `main` | Pages enabled for the repo; no extra secrets for a basic deploy. |
| **Daily News Update** | Every day ~11:00 UTC + **Run workflow** button | Repo secret **`ANTHROPIC_API_KEY`**. Optional: `GA4_ID`, `CLARITY_ID`, `CHAT_API_URL`. |

Manual refresh: **Actions → Daily News Update → Run workflow**.

Typical curation step: **about 1–4 minutes** (mostly the Claude request). Much longer may mean API issues—retry or check [Anthropic status](https://status.anthropic.com/).

---

## Embeds

**`site.js`** targets a container `#fec-app` or `[data-fec-app]` and loads **`articles.json`** from the published site URL inside the script. Use it when embedding elsewhere (e.g. Webflow); the standalone **`widget.html`** is a separate static variant.

---

## Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| Action fails on `curate.py` with **`NameError: Path`** | Ensure `from pathlib import Path` exists at the top of `scripts/curate.py`. |
| Action fails on import / pip | `scripts/requirements.txt` matches what `curate.py` imports. |
| Site looks old | Hard-refresh; confirm the latest workflow committed `articles.json` / `index.html`. |
| **Recommended** sort or **AI Score** looks wrong | Scores come from Claude in `articles.json` (`curatorScore`, 1–100). Re-run curation or inspect the JSON. |
