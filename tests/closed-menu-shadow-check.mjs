import { chromium } from "playwright";
import { serveDeck } from "./serve.mjs";

// Checks that the settings panel casts no shadow while it is closed.
//
// The closed panel sits off-screen, translated by its own width, so its
// shadow reaches back over the edge of the slide: a strip of darker pixels
// runs down the side of every slide for as long as the panel is closed. The
// shadow belongs to the open state only.
//
// The assertion reads the computed shadow, so it fails whichever rule brings
// the shadow back.

const target = process.argv[2];
if (!target) {
  console.error("Usage: node closed-menu-shadow-check.mjs <html-file>");
  process.exit(2);
}

const { url, close } = await serveDeck(target);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

/**
 * Wait for the settings panel to open or close.
 *
 * @param {boolean} open
 */
async function waitForMenu(open) {
  await page.waitForFunction(
    (wantOpen) => {
      const menu = document.querySelector("#revealjs-a11y-menu");
      if (!menu) return false;
      return menu.getAttribute("aria-hidden") === (wantOpen ? "false" : "true");
    },
    open,
    { timeout: 10000 },
  );
}

/** @returns {Promise<string>} The computed shadow of the settings panel. */
function menuShadow() {
  return page.evaluate(
    () => getComputedStyle(document.querySelector("#revealjs-a11y-menu")).boxShadow,
  );
}

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.Reveal && Reveal.isReady(), null, {
    timeout: 10000,
  });

  await waitForMenu(false);
  const closed = await menuShadow();
  check(closed === "none", `the closed panel has the shadow "${closed}", expected none`);

  await page.keyboard.press("a");
  await waitForMenu(true);
  const open = await menuShadow();
  check(open !== "none", "the open panel has no shadow");

  await page.keyboard.press("Escape");
  await waitForMenu(false);
  const closedAgain = await menuShadow();
  check(
    closedAgain === "none",
    `the panel has the shadow "${closedAgain}" after closing, expected none`,
  );
} finally {
  await browser.close();
  await close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("Closed settings panel shadow check passed.");
