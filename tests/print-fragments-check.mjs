import { chromium } from "playwright";
import { serveDeck } from "./serve.mjs";

// Checks that a printed deck shows the fragment build-up, one page per step.
//
// RevealJS separates fragments itself when `pdfSeparateFragments` is on. The
// plugin used to do the same work a second time, which doubled the pages and
// lost the per-step grouping, and its print stylesheet forced every fragment
// visible, which flattened what RevealJS had built. Neither does that now, and
// this check is what says so.
//
// The page is put into print media, because the rules that decide a fragment's
// visibility live in `@media print` and do not apply to a screen rendering of
// the print view. The assertion reads the computed style, so it fails whichever
// way the cascade is lost.

const target = process.argv[2];
if (!target) {
  console.error("Usage: node print-fragments-check.mjs <html-file>");
  process.exit(2);
}

const { url, close } = await serveDeck(target);
const browser = await chromium.launch();
const page = await browser.newPage();

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

try {
  await page.emulateMedia({ media: "print" });
  await page.goto(`${url}?print-pdf`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.querySelectorAll(".slides .pdf-page").length > 0,
    null,
    { timeout: 10000 },
  );

  /**
   * The computed visibility of every fragment, page by page.
   *
   * @returns {Promise<Array<Array<boolean>>>} One array per printed page, each
   *   holding whether that fragment is shown.
   */
  async function shownByPage() {
    return page.evaluate(() =>
      Array.from(document.querySelectorAll(".slides .pdf-page")).map((printed) =>
        Array.from(printed.querySelectorAll(".fragment")).map((fragment) => {
          const style = getComputedStyle(fragment);
          return style.opacity === "1" && style.visibility === "visible";
        }),
      ),
    );
  }

  const pages = await shownByPage();
  const withFragments = pages.filter((fragments) => fragments.length > 0);

  // The title slide, the three pages of the slide that builds up, and the
  // slide with no fragments, which is exported once.
  check(
    pages.length === 5,
    `expected 5 printed pages, got ${pages.length}`,
  );

  // The fixture has one slide carrying two fragments, so it prints as the slide
  // before anything is revealed, then one page per step.
  const expected = [
    [false, false],
    [true, false],
    [true, true],
  ];

  check(
    withFragments.length === expected.length,
    `expected ${expected.length} pages carrying fragments, got ` +
      `${withFragments.length}. A page count above this means the fragments ` +
      `were separated twice.`,
  );

  expected.forEach((wanted, index) => {
    const fragments = withFragments[index];
    if (!fragments) return;
    check(
      fragments.length === wanted.length,
      `page ${index + 1}: expected ${wanted.length} fragments, got ${fragments.length}`,
    );
    wanted.forEach((shouldShow, position) => {
      if (fragments[position] === undefined) return;
      check(
        fragments[position] === shouldShow,
        `page ${index + 1}, fragment ${position + 1}: expected ` +
          `${shouldShow ? "shown" : "hidden"}, got ` +
          `${fragments[position] ? "shown" : "hidden"}`,
      );
    });
  });
} finally {
  await browser.close();
  await close();
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}

console.log("Print fragment separation checks passed.");
