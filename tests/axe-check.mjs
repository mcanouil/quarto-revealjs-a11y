import { chromium } from "playwright";
import { serveDeck } from "./serve.mjs";

// Loads a deck rendered with Quarto's built-in `axe: {output: json}`, which
// injects axe-core (from a CDN), scans every slide, and logs the result as
// JSON to the console. This script serves the deck over HTTP, captures that
// JSON, and fails the build on serious or critical violations.

const target = process.argv[2];
if (!target) {
  console.error("Usage: node axe-check.mjs <html-file>");
  process.exit(2);
}

const { url, close } = await serveDeck(target);

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

try {
  await page.goto(url, { waitUntil: "load" });
  // Quarto sets this attribute once the axe scan has finished.
  await page.waitForSelector("body[data-quarto-axe-complete='true']", {
    state: "attached",
    timeout: 60000,
  });
} finally {
  await browser.close();
  close();
}

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
