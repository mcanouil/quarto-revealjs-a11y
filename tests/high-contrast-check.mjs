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

/**
 * Wait for the settings panel to open or close.
 *
 * The panel is closed with `inert` and `aria-hidden` rather than by being
 * hidden, so it stays laid out and a visibility wait never settles.
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
  await waitForMenu(true);

  const menu = await page.evaluate(() => {
    const style = getComputedStyle(
      document.querySelector("#revealjs-a11y-menu"),
    );
    return { colour: style.color, border: style.borderLeftColor };
  });

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

  // Close the panel before reaching the other chrome, so its key bindings
  // are not swallowed by the dialogue.
  await page.keyboard.press("Escape");
  await waitForMenu(false);

  // The transcript overlay, which carries its own high-contrast rule.
  await page.keyboard.press("t");
  await page.waitForSelector(".revealjs-a11y-transcript", { state: "visible" });
  const transcript = await page.evaluate(() => {
    const style = getComputedStyle(
      document.querySelector(".revealjs-a11y-transcript"),
    );
    return { colour: style.color };
  });
  check(
    transcript.colour === BLACK,
    `the transcript text is ${transcript.colour}, expected ${BLACK}`,
  );
  await page.keyboard.press("Escape");

  // The pointer indicator, which the fixture enables.
  await page.keyboard.press("p");
  await page.waitForSelector(".revealjs-a11y-pointer", { state: "attached" });
  const pointer = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".revealjs-a11y-pointer"));
    return { border: style.borderTopColor, width: style.borderTopWidth };
  });
  check(
    pointer.border === BLACK,
    `the pointer border is ${pointer.border}, expected ${BLACK}`,
  );
  check(
    pointer.width === "4px",
    `the pointer border is ${pointer.width} wide, expected 4px`,
  );
  await page.keyboard.press("p");

  // Turning it off has to clear the root element, or the deck keeps the
  // repaint for good.
  await page.keyboard.press("a");
  await waitForMenu(true);
  await page.click('[data-setting="high-contrast"]');
  const afterOff = await page.evaluate(() => ({
    // Anywhere at all, so a change that puts the class back on the deck is
    // caught rather than passing because the root element is clear.
    carriers: document.querySelectorAll(".revealjs-a11y-high-contrast").length,
    onRoot: document.documentElement.classList.contains(
      "revealjs-a11y-high-contrast",
    ),
    checked: document
      .querySelector('[data-setting="high-contrast"]')
      .getAttribute("aria-checked"),
  }));
  check(!afterOff.onRoot, "the high-contrast class stayed on the root element");
  check(
    afterOff.carriers === 0,
    `${afterOff.carriers} element(s) still carry the high-contrast class`,
  );
  check(
    afterOff.checked === "false",
    `the switch reports aria-checked ${afterOff.checked}, expected false`,
  );
} finally {
  await browser.close();
  await close();
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}

console.log("High contrast chrome checks passed.");
