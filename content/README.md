# Phronesis Content Directory

This directory is the single source of truth for all site content.

## Files

| File | Content type |
|---|---|
| `research.json` | Research papers (original + curated) |
| `policy.json` | Policy proposals |
| `legal.json` | Legal analyses |
| `essays.json` | Essays |
| `articles.json` | Articles |
| `reports.json` | Reports |

## Schema

Every entry shares these core fields:

```json
{
  "placeholder": true,
  "id": "slug-used-as-url-path",
  "title": "...",
  "subtitle": "...",
  "date": "YYYY-MM-DD",
  "type": "research | policy | legal | essay | article | report",
  "fields": ["Computer Science", "Public Policy"],
  "tags": ["AI Governance", "Privacy"],
  "origin": "original | via",
  "content_type": "full | abstract | preview",
  "publisher": "Phronesis Research | Journal Name | News Outlet",
  "publisher_url": "https://... or null",
  "original_url": "https://... or null",
  "doi": "10.xxxx/... or null",
  "venue_type": "journal | preprint | working-paper | report | news | null",
  "abstract": "Academic abstract or editorial description.",
  "preview": "1-2 sentence teaser for paywalled/news content (written by Phronesis). null if not applicable.",
  "body": "Full markdown body for original content. null for all others."
}
```

## Content type rules

| `origin` | `content_type` | `body` | `preview` | Use case |
|---|---|---|---|---|
| `original` | `full` | markdown string | null | Phronesis-authored piece |
| `via` | `abstract` | null | null | Open-access academic paper — reproduce abstract only |
| `via` | `preview` | null | short teaser | Paywalled journal or news article — our own words only |

## Adding real content

When replacing a placeholder entry with real content:
1. Set `"placeholder": false`
2. Fill in all fields; set genuinely missing ones to `null`
3. For `full` entries: write the body in Markdown in the `body` field
4. For `via/abstract`: paste the paper's own abstract in `abstract`; leave `body` and `preview` null
5. For `via/preview`: write 1-2 original sentences in `preview`; leave `body` null; never reproduce the source's text

The placeholder entry can stay in the file with `"placeholder": true` until the real entry is ready — the page JS will skip it (or you can remove it entirely).
