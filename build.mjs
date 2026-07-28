#!/usr/bin/env node
// Builds the static site from src/ into the repo root.
//
// The repo is the deployable artifact — nginx serves these files directly —
// so the generated HTML is committed alongside its source. Run `node
// build.mjs` after editing anything under src/ or css/, and `node build.mjs
// --check` to fail if the committed output has drifted from its source.
//
// No dependencies, by design: the whole site is seven pages.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const SITE = "https://toposaic.com";

const check = process.argv.includes("--check");

/** Every `{{name}}` in `template` replaced from `values`. */
function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name) => {
    if (!(name in values)) throw new Error(`no value for ${whole}`);
    return values[name];
  });
}

/**
 * Splits a page file into its `key: value` front matter and its body. Values
 * are plain strings — nothing here needs nesting, and a YAML parser would be
 * a dependency to maintain for the sake of seven pages.
 */
function readPage(text, where) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error(`${where} has no front matter`);
  const fields = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(":");
    if (at < 0) throw new Error(`${where}: cannot read front matter line "${line}"`);
    fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  if (!fields.title) throw new Error(`${where} has no title`);
  return { fields, body: text.slice(match[0].length).trim() };
}

function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** The per-page part of <head>, in the order the pages have always used. */
function headFor(fields, cssVersion) {
  const lines = [
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${fields.title}</title>`,
  ];
  if (fields.description) {
    lines.push(`  <meta name="description" content="${escapeAttribute(fields.description)}">`);
  }
  lines.push('  <link rel="icon" type="image/png" href="/assets/logo.png">');
  lines.push(`  <link rel="stylesheet" href="/css/site.css?v=${cssVersion}">`);
  if (fields.url) {
    lines.push(`  <link rel="canonical" href="${SITE}${fields.url}">`);
  }
  if (fields.ogTitle) {
    const image = `${SITE}/assets/og.png?v=2`;
    lines.push(`  <meta property="og:title" content="${escapeAttribute(fields.ogTitle)}">`);
    lines.push(
      `  <meta property="og:description" content="${escapeAttribute(fields.ogDescription ?? fields.description ?? "")}">`,
    );
    lines.push(`  <meta property="og:image" content="${image}">`);
    lines.push('  <meta property="og:image:width" content="1200">');
    lines.push('  <meta property="og:image:height" content="630">');
    if (fields.url) lines.push(`  <meta property="og:url" content="${SITE}${fields.url}">`);
    lines.push(`  <meta property="og:type" content="${fields.ogType ?? "website"}">`);
    lines.push('  <meta name="twitter:card" content="summary_large_image">');
    lines.push(`  <meta name="twitter:image" content="${image}">`);
  }
  return lines.join("\n");
}

/**
 * Tags every `<td>` with the column heading above it.
 *
 * On a phone a three-column table is squeezed to about 90px a column, which
 * is unreadable, so the stylesheet stacks each row into a block. Stacked
 * cells lose the header row that explained them, and `data-label` is what
 * puts it back. Generated here rather than typed into every cell.
 */
function labelTableCells(html) {
  return html.replace(/<table>[\s\S]*?<\/table>/g, (table) => {
    const headings = [...table.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) =>
      m[1].replace(/<[^>]*>/g, "").trim(),
    );
    if (!headings.length) return table;
    return table.replace(/<tr>[\s\S]*?<\/tr>/g, (row) => {
      if (row.includes("<th>")) return row;
      let column = 0;
      return row.replace(/<td(\s[^>]*)?>/g, (whole, attrs) => {
        const label = headings[column++];
        if (!label || (attrs ?? "").includes("data-label=")) return whole;
        return `<td data-label="${escapeAttribute(label)}"${attrs ?? ""}>`;
      });
    });
  });
}

async function pageFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await pageFiles(path)));
    else if (entry.name.endsWith(".html")) found.push(path);
  }
  return found.sort();
}

const [layout, header, footer, analytics, css] = await Promise.all([
  readFile(join(src, "layout.html"), "utf8"),
  readFile(join(src, "partials/header.html"), "utf8"),
  readFile(join(src, "partials/footer.html"), "utf8"),
  readFile(join(src, "partials/analytics.html"), "utf8"),
  readFile(join(root, "css/site.css"), "utf8"),
]);

// The stylesheet's own hash, so the cache buster can never be forgotten and
// can never be bumped for a change that did not happen.
const cssVersion = createHash("sha256").update(css).digest("hex").slice(0, 8);

const written = [];
const stale = [];
const sitemap = [];

for (const file of await pageFiles(join(src, "pages"))) {
  const out = relative(join(src, "pages"), file);
  const { fields, body } = readPage(await readFile(file, "utf8"), out);

  const scripts = (fields.scripts ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => `<script src="/${s}"></script>`)
    .join("\n");

  const page = fill(layout, {
    source: `pages/${out.split(sep).join("/")}`,
    head: headFor(fields, cssVersion),
    // Keeps its own leading indentation: it sits inside <head>.
    analytics: analytics.replace(/\s+$/, ""),
    header: header.trim(),
    content: labelTableCells(body).replace("{{footer}}", footer.trim()),
    scripts: scripts ? `\n${scripts}` : "",
  });

  // nginx injects the Google Analytics tag immediately before </head> on
  // every page — it lives in the server config, not in this repo. A build
  // that dropped or reshaped that tag would switch analytics off site-wide
  // and leave no trace in the HTML to notice it by, so it is checked here
  // rather than trusted.
  const heads = page.match(/<\/head>/g) ?? [];
  if (heads.length !== 1) {
    throw new Error(`${out}: expected exactly one </head> for the server's tag, found ${heads.length}`);
  }
  if (!page.includes("function gtag_report_conversion")) {
    throw new Error(`${out}: lost the outbound-click conversion helper`);
  }

  const target = join(root, out);
  const current = await readFile(target, "utf8").catch(() => null);
  if (current !== page) {
    stale.push(out);
    if (!check) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, page);
    }
  }
  written.push(out);

  if (fields.sitemap !== "no") {
    if (!fields.url) throw new Error(`${out} is in the sitemap but has no url`);
    sitemap.push({ url: fields.url, updated: fields.updated });
  }
}

const sitemapXml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemap
    .map(({ url, updated }) =>
      ["  <url>", `    <loc>${SITE}${url}</loc>`, `    <lastmod>${updated}</lastmod>`, "  </url>"].join("\n"),
    )
    .join("\n") +
  "\n</urlset>\n";

const sitemapPath = join(root, "sitemap.xml");
if ((await readFile(sitemapPath, "utf8").catch(() => null)) !== sitemapXml) {
  stale.push("sitemap.xml");
  if (!check) await writeFile(sitemapPath, sitemapXml);
}

if (check) {
  if (stale.length) {
    console.error(`Committed output is stale. Run \`node build.mjs\`:\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${written.length} pages up to date (css ?v=${cssVersion}).`);
} else {
  console.log(
    stale.length
      ? `Wrote ${stale.length} of ${written.length + 1} files (css ?v=${cssVersion}):\n  ${stale.join("\n  ")}`
      : `${written.length} pages already up to date (css ?v=${cssVersion}).`,
  );
}
