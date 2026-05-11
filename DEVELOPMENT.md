# Working on FEC Insider

## Clone and branch

```bash
git clone https://github.com/davidmarkleach/fec-insider.git
cd fec-insider
git checkout -b your-branch-name
```

Work on a branch and open a PR to `main`, or push directly to `main` if you prefer. GitHub Pages deploys from `main`.

## What each file does

| Piece | Role |
|--------|------|
| **`scripts/template.html`** | Source for the main page. **`curate.py` builds `index.html` from this.** Change layout, inline script, and styles here for the live site. |
| **`index.html`** | What GitHub Pages serves. **Regenerated when the daily job (or you) runs `curate.py`.** Do not treat it as the long-term source of truth unless you also update the template. |
| **`articles.json`** | Article feed the page loads (same origin on Pages). **Updated by `curate.py` and the daily GitHub Action.** |
| **`site.js`** | Optional embed for a host page with `#fec-app` or `[data-fec-app]`. Separate from the main `index.html` bundle. |
| **`scripts/curate.py`** | Fetches RSS → Claude → writes **`articles.json`** and **`index.html`** from **`scripts/template.html`**. **RSS source URLs live in `RSS_FEEDS` inside this file** (append full feed URLs, not homepages). |

**Rule of thumb:** For the main site UI, edit **`scripts/template.html`**, then run curation locally or wait for the scheduled workflow so **`index.html`** stays aligned.

## Local preview

From the repository root:

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). The page loads **`articles.json`** from the same origin, so behavior matches production.

## Run the curator locally (optional)

```bash
cd scripts
pip install -r requirements.txt
export ANTHROPIC_API_KEY="your-key"
# Optional: GA4_ID, CLARITY_ID, CHAT_API_URL
python curate.py
```

This refreshes **`articles.json`** and **`index.html`** from **`template.html`**.

## GitHub Actions

- **Deploy:** Pushing to **`main`** deploys the **entire repo** to GitHub Pages (see `.github/workflows/deploy.yml`).
- **Daily news:** `.github/workflows/update.yml` runs **`curate.py`**, commits **`index.html`** and **`articles.json`** if they change, then deploys. Configure **`ANTHROPIC_API_KEY`** and any optional secrets in the repository settings.

## Remote

**`https://github.com/davidmarkleach/fec-insider.git`**
