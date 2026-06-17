import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, basename, extname, join, resolve } from "node:path";

// Loads a deck rendered with Quarto's built-in `axe: {output: json}`, which
// injects axe-core (from a CDN), scans every slide, and logs the result as
// JSON to the console. This script serves the deck over HTTP (axe-core is an
// ES module that the browser refuses to load from file://), captures that
// JSON, and fails the build on serious or critical violations.

const target = process.argv[2];
if (!target) {
  console.error("Usage: node axe-check.mjs <html-file>");
  process.exit(2);
}

const filePath = resolve(target);
const root = dirname(filePath);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const body = await readFile(join(root, path));
    res.setHeader(
      "Content-Type",
      CONTENT_TYPES[extname(path).toLowerCase()] || "application/octet-stream",
    );
    res.end(body);
  } catch (_e) {
    res.statusCode = 404;
    res.end("Not found");
  }
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/${basename(filePath)}`;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

let axeResult = null;
page.on("console", (message) => {
  try {
    const parsed = JSON.parse(message.text());
    if (parsed && Array.isArray(parsed.violations)) {
      axeResult = parsed;
    }
  } catch (_e) {
    // Not the axe JSON payload; ignore.
  }
});

await page.goto(url, { waitUntil: "load" });
// Quarto sets this attribute once the axe scan has finished.
await page.waitForSelector("body[data-quarto-axe-complete='true']", {
  state: "attached",
  timeout: 60000,
});
await browser.close();
server.close();

if (!axeResult) {
  console.error("No axe-core JSON result was captured from the page console.");
  process.exit(2);
}

const blocking = axeResult.violations.filter(
  (v) => v.impact === "serious" || v.impact === "critical",
);

for (const v of axeResult.violations) {
  const label = blocking.includes(v) ? "BLOCKING" : "note";
  console.log(`[${label}] ${v.impact}: ${v.id} — ${v.help}`);
  for (const node of v.nodes) {
    console.log(`    ${node.target.join(" ")}`);
  }
}

console.log(
  `\n${axeResult.violations.length} violation type(s), ${blocking.length} of serious/critical impact.`,
);

process.exit(blocking.length > 0 ? 1 : 0);
