# Analytics

Workers Analytics Engine binding: `EVENTS`, dataset: `portfolio_events`.
Writes are best-effort and never block page delivery. No cookies, IPs, user
agents, full referrer URLs, query strings, or visitor/session identifiers are stored.

| Event | blobs | indexes | doubles |
| --- | --- | --- | --- |
| `pageview` | event, page pathname, category (`ai`, `search`, `social`, `other`, `direct`) | event | 1 |
| `contact_click_x` | event, page pathname | event | 1 |

`utm_source` takes precedence over Referer; only its classification is stored.
GET requests are counted only with response status 200 or 404 and Content-Type `text/html`, regardless
of the URL extension or Accept header; `/api`, `/api/*`, and non-HTML responses are excluded.
Stored pageview paths are `/`, `/hire`, `/things`, `/work`, `/blog`,
`/work/<slug>` (`[a-z0-9-]+`, matching the case slugs), `/blog/<id>`
(`[A-Za-z0-9_-]+`, matching `POST_ID` in `blog/microcms.ts`), or `/blog/page/<n>`
(a decimal archive page number of 2 or greater, without leading zeros; page 1 is `/blog`).
`.html` aliases and an optional trailing slash normalize to clean paths;
`/index.html` becomes `/`.
All other 200 HTML paths are stored as the fixed value `unknown`. HTML 404s always
use the fixed path `not_found`. Both preserve the referral category without storing
the supplied path or query string. Other response statuses are not counted.
Contact beacons must be at most 2048 bytes and use an allowlisted event and page:
`/` or `/hire` (`/index.html` and `/hire.html` normalize to those paths).
Origin must match the request's full origin (scheme, host, and port); when absent,
Sec-Fetch-Site must be `same-origin`. A present Sec-Fetch-Site must also be `same-origin`.
Invalid beacons still return 204.
Origin checks, the capped body read, and allowlist validation finish before the 204;
only valid writes are scheduled through `ctx.waitUntil`, without awaiting the write.
Missing bindings and write failures do not affect the response.

```sql
-- Pageviews by referral category (last 7 days).
SELECT blob3 AS category, SUM(_sample_interval * double1) AS pageviews
FROM portfolio_events
WHERE index1 = 'pageview' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY category
```

```sql
-- Contact clicks by page.
SELECT blob2 AS page, SUM(_sample_interval * double1) AS clicks
FROM portfolio_events
WHERE index1 = 'contact_click_x' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY page
```

```sql
-- AI-referred pageviews alongside contact clicks, not attributed conversions.
SELECT blob2 AS page,
  SUM(IF(index1 = 'pageview' AND blob3 = 'ai', _sample_interval * double1, 0)) AS ai_views,
  SUM(IF(index1 = 'contact_click_x', _sample_interval * double1, 0)) AS clicks
FROM portfolio_events
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY page
```

There are no session IDs: sessions, unique visitors, and AI-to-click attribution
cannot be reconstructed. These queries compare aggregate event counts only.
