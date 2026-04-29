#!/usr/bin/env python3
"""
FEC Insider — daily news curation pipeline.

1. Pulls recent articles from FEC industry RSS feeds + Google News.
2. Sends them to Claude for curation, summarisation, and categorisation.
3. Writes the finished index.html from a template.
"""

import json
import os
import re
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path

import anthropic
import feedparser
import requests
from bs4 import BeautifulSoup

SCRIPT_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = SCRIPT_DIR / "template.html"
OUTPUT_PATH = SCRIPT_DIR.parent / "index.html"
ARTICLES_JSON_PATH = SCRIPT_DIR.parent / "articles.json"

CATEGORY_META = {
    "attractions": {
        "label": "Attractions & Experiences",
        "icon": "\U0001f3a2",
        "color": "#FF6B35",
    },
    "tech": {
        "label": "Technology",
        "icon": "\u2699\ufe0f",
        "color": "#3B82F6",
    },
    "business": {
        "label": "Business & Growth",
        "icon": "\U0001f4ca",
        "color": "#10B981",
    },
    "ops": {
        "label": "Operations & Safety",
        "icon": "\U0001f6e1\ufe0f",
        "color": "#F59E0B",
    },
    "design": {
        "label": "Design & Trends",
        "icon": "\U0001f3a8",
        "color": "#EC4899",
    },
}

RSS_FEEDS = [
    "https://blooloop.com/feed/",
    "https://amusementtoday.com/feed/",
    "https://www.intergameonline.com/coin-op/rss",
    "https://www.intergameonline.com/leisure/rss",
    "https://news.google.com/rss/search?q=%22family+entertainment+center%22+when:14d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=FEC+arcade+bowling+trampoline+entertainment+when:14d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=%22indoor+entertainment%22+OR+%22amusement+center%22+when:14d&hl=en-US&gl=US&ceid=US:en",
]

HEADERS = {
    "User-Agent": "FECInsiderBot/1.0 (news aggregator; +https://github.com/davidmarkleach/fec-insider)"
}


def resolve_google_news_url(url: str) -> str:
    """Follow Google News redirect URLs to get the real article link."""
    if "news.google.com" not in url:
        return url
    try:
        resp = requests.head(url, headers=HEADERS, timeout=10, allow_redirects=True)
        if resp.url and "news.google.com" not in resp.url:
            return resp.url
    except Exception:
        pass
    return url


def fetch_feeds() -> list[dict]:
    """Pull articles from all RSS feeds, return de-duped list."""
    seen_titles = set()
    articles = []

    for url in RSS_FEEDS:
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            feed = feedparser.parse(resp.content)
        except Exception as exc:
            print(f"  [warn] failed to fetch {url}: {exc}", file=sys.stderr)
            continue

        for entry in feed.entries[:30]:
            title = (entry.get("title") or "").strip()
            if not title or title.lower() in seen_titles:
                continue
            seen_titles.add(title.lower())

            link = resolve_google_news_url(entry.get("link", ""))
            summary = entry.get("summary") or entry.get("description") or ""
            summary = BeautifulSoup(summary, "html.parser").get_text(" ", strip=True)
            source = feed.feed.get("title", "")

            articles.append(
                {
                    "title": title,
                    "raw_summary": summary[:1000],
                    "url": link,
                    "source": source,
                }
            )

    print(f"Fetched {len(articles)} candidate articles from {len(RSS_FEEDS)} feeds.")
    return articles


CURATE_PROMPT = textwrap.dedent("""\
You are the editorial AI for **FEC Insider**, a daily news briefing for the
Family Entertainment Center industry (bowling, arcades, trampoline parks,
laser tag, go-karts, mini golf, escape rooms, VR attractions, etc.).

I will give you a batch of raw article headlines and snippets scraped from
industry RSS feeds and Google News.  Each article has an `idx` number.

Your job:

1. **Select the 25-30 most relevant and interesting articles** for FEC
   operators, suppliers, and investors. Discard anything off-topic.
   If fewer than 25 articles are relevant, that's fine — quality over quantity.
2. For each selected article, produce:
   - `idx` — the original article index number (REQUIRED — this is how we
     look up the real URL, so it must match exactly)
   - `title`  — a crisp, informative headline (rewrite if the original is clickbait)
   - `summary` — 2-3 sentence plain-text summary written for an FEC industry
     audience.  Focus on *why it matters* for FEC operators.  No markdown.
   - `source` — short source name (e.g. "Blooloop", "IAAPA", "Workforce.com")
   - `categoryId` — one of: attractions, tech, business, ops, design
3. Spread articles roughly evenly across the five categories when possible.
4. Order articles so the most impactful / newsworthy come first.

Return **only** a JSON array.  No markdown fences, no commentary.
Do NOT include a "url" field — we will fill it in from the original data using `idx`.

Example element:
{
  "idx": 3,
  "title": "Round1 Opens Third New Jersey Location",
  "summary": "The Japanese FEC giant opened a new venue at Menlo Park Mall…",
  "source": "InterGame",
  "categoryId": "business"
}

---

RAW ARTICLES:
""")


def curate_with_claude(raw_articles: list[dict]) -> list[dict]:
    """Send raw articles to Claude and get back curated JSON.

    Articles are numbered so Claude references them by index. We then
    replace/fill the URL from the original feed data — never trusting
    the LLM to copy URLs verbatim.
    """
    client = anthropic.Anthropic()

    raw_block = "\n\n".join(
        f"[{i}] TITLE: {a['title']}\nSOURCE: {a['source']}\nSNIPPET: {a['raw_summary']}"
        for i, a in enumerate(raw_articles)
    )

    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8000,
        messages=[
            {
                "role": "user",
                "content": CURATE_PROMPT + raw_block,
            }
        ],
    )

    text = msg.content[0].text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    articles = json.loads(text)
    print(f"Claude selected {len(articles)} articles.")

    for a in articles:
        idx = a.pop("idx", None)
        if idx is not None and 0 <= idx < len(raw_articles):
            a["url"] = raw_articles[idx]["url"]
        else:
            a.setdefault("url", "")
            print(f"  [warn] article '{a.get('title','')}' missing valid idx, url may be wrong", file=sys.stderr)

    return articles


def enrich_articles(articles: list[dict]) -> list[dict]:
    """Add category metadata and validate/resolve URLs."""
    from urllib.parse import urlparse

    for a in articles:
        cat_id = a.get("categoryId", "business")
        meta = CATEGORY_META.get(cat_id, CATEGORY_META["business"])
        a["categoryLabel"] = meta["label"]
        a["categoryIcon"] = meta["icon"]
        a["categoryColor"] = meta["color"]

        url = (a.get("url") or "").strip()
        if url:
            url = resolve_google_news_url(url)
            a["url"] = url

            parsed = urlparse(url)
            if parsed.path in ("", "/") and not parsed.query:
                print(f"  [warn] bare-domain URL for '{a.get('title','')}': {url}", file=sys.stderr)

    return articles


def render_html(articles: list[dict]) -> str:
    """Inject timestamp and config into the HTML template (articles loaded at runtime from articles.json)."""
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    now_iso = datetime.now(timezone.utc).isoformat()
    html = template.replace("{{TIMESTAMP_ISO}}", now_iso)
    html = html.replace("{{GA4_ID}}", os.environ.get("GA4_ID", "G-XXXXXXXXXX"))
    html = html.replace("{{CLARITY_ID}}", os.environ.get("CLARITY_ID", "xxxxxxxxxx"))
    html = html.replace("{{CHAT_API_URL}}", os.environ.get("CHAT_API_URL", "https://fec-insider-chat.davidmarkleach.workers.dev"))
    return html


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set.", file=sys.stderr)
        sys.exit(1)

    print("=== FEC Insider daily curation ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    raw = fetch_feeds()
    if not raw:
        print("No articles fetched — skipping update.", file=sys.stderr)
        sys.exit(1)

    curated = curate_with_claude(raw)
    curated = enrich_articles(curated)

    html = render_html(curated)
    OUTPUT_PATH.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} ({len(html):,} bytes, {len(curated)} articles).")

    articles_payload = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "count": len(curated),
        "articles": curated,
    }
    articles_json = json.dumps(articles_payload, ensure_ascii=False, indent=2)
    ARTICLES_JSON_PATH.write_text(articles_json, encoding="utf-8")
    print(f"Wrote {ARTICLES_JSON_PATH} ({len(articles_json):,} bytes).")


if __name__ == "__main__":
    main()
