# toposaic.com

The TopoSaic site. Static HTML, served straight from this repo by nginx.

## Do not edit the HTML in the repo root

`index.html`, `404.html`, `guides/*/index.html`, `changelog/index.html` and
`sitemap.xml` are **generated**. Each one says so on its second line. Edit the
source under `src/`, then:

```bash
node build.mjs
```

and commit both the source and the regenerated output. The output is committed
because the repo is the deployable artifact — nginx serves these files as they
are, so there is no build step at deploy time.

To check the committed output still matches its source, without writing
anything:

```bash
node build.mjs --check
```

It exits non-zero and names the stale files.

## Layout

```
build.mjs              the whole build, no dependencies
src/layout.html        the page skeleton
src/partials/          header, footer, analytics helper — shared by every page
src/pages/             one file per page: front matter, then its content
css/  js/  assets/     served as-is, not generated
```

A page file starts with front matter and holds only what is unique to that
page:

```
---
title: Guides — TopoSaic
description: ...
ogTitle: TopoSaic guides
ogDescription: ...
ogType: website
url: /guides/
sitemap: yes
updated: 2026-07-28
---

<section class="section">…</section>
{{footer}}
```

`url` gives the canonical link, the `og:url`, and the sitemap entry. `scripts`
adds page-specific scripts. `{{footer}}` drops the shared footer in.

## Two things the build protects

**The analytics tag is not in this repo.** nginx injects the Google tag
immediately before `</head>` on every page. The inline
`gtag_report_conversion` helper in `src/partials/analytics.html` calls into it
for outbound-click conversions. The build fails if a page ever comes out
without exactly one `</head>`, or without that helper — either would switch
analytics off site-wide and leave nothing in the HTML to notice it by.

**`/releases/` is not ours.** nginx serves the desktop app's update metadata
from that path — `updater.json` and `notice.json`, which the app's updater
points at — and it returns 403 to anything else. Do not add a page there. The
release notes live at `/changelog/`.

## Cache busting

The stylesheet link carries `?v=` plus a hash of `css/site.css`. It changes
when the CSS changes and never otherwise, so there is nothing to remember to
bump.
