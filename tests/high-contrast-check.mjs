import { chromium } from "playwright";
import { serveDeck } from "./serve.mjs";

// Checks that high contrast repaints the plugin's own chrome as well as the
// slides.
//
// The stylesheet has always carried rules for the settings panel, the
// transcript overlay, the pointer and the viewport background. They never
// applied: the class went on the deck element, while all four are appended to
// `document.body`, which is the deck's parent, so a rule rooted at the deck
// could not reach them. The class now goes on the root element instead.
//
// The assertion reads computed colours, so it fails whichever way the rules
// stop applying.

const target = process.argv[2];
if (!target) {
  console.error("Usage: node high-contrast-check.mjs <html-file>");
  process.exit(2);
}

const WHITE = "rgb(255, 255, 255)";
const BLACK = "rgb(0, 0, 0)";

const { url, close } = await serveDeck(target);
const browser = await chromium.launch();
const page = await browser.newPage();

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.Reveal && Reveal.isReady(), null, {
    timeout: 10000,
  });

  // The fixture starts in high contrast, so the class is on before anything is
  // pressed.
  const onRoot = await page.evaluate(() =>
    document.documentElement.classList.contains("revealjs-a11y-high-contrast"),
  );
  check(onRoot, "the high-contrast class is not on the root element");

  // Open the settings panel, which is what the dead rules were written for.
  await page.keyboard.press("a");
  await page.waitForSelector("#revealjs-a11y-menu", { state: "visible" });

  const menu = await page.evaluate(() => {
    const style = getComputedStyle(
      document.querySelector("#revealjs-a11y-menu"),
    );
    return {
      background: style.backgroundColor,
      colour: style.color,
      border: style.borderLeftColor,
    };
  });

  check(
    menu.background === WHITE,
    `the settings panel background is ${menu.background}, expected ${WHITE}`,
  );
  check(
    menu.colour === BLACK,
    `the settings panel text is ${menu.colour}, expected ${BLACK}`,
  );
  check(
    menu.border === BLACK,
    `the settings panel border is ${menu.border}, expected ${BLACK}`,
  );

  const viewport = await page.evaluate(
    () => getComputedStyle(document.querySelector(".reveal-viewport")).backgroundColor,
  );
  check(
    viewport === WHITE,
    `the viewport background is ${viewport}, expected ${WHITE}`,
  );

  // Turning it off has to clear the root element, or the deck keeps the
  // repaint for good.
  await page.click('[data-setting="high-contrast"]');
  const stillOn = await page.evaluate(() =>
    document.documentElement.classList.contains("revealjs-a11y-high-contrast"),
  );
  check(!stillOn, "the high-contrast class stayed on after it was turned off");
} finally {
  await browser.close();
  await close();
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}

console.log("High contrast chrome checks passed.");
