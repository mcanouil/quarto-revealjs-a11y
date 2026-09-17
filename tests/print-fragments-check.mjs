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
const mode = process.argv[3] ?? "separated";
if (!target || (mode !== "separated" && mode !== "together")) {
  console.error(
    "Usage: node print-fragments-check.mjs <html-file> [separated|together]",
  );
  process.exit(2);
}

// `separated` is a deck with `pdf-separate-fragments: true`, which prints the
// slide before anything is revealed and then one page per step. `together` is
// the same deck with the option off, which prints the slide once with every
// fragment shown. The second is worth checking because the plugin used to
// force fragments visible in print, and that rule is gone: nothing but
// RevealJS guarantees the fragments appear at all now.
const EXPECTATIONS = {
  // The title slide, the three pages of the slide that builds up, and the
  // slide with no fragments, which is exported once.
  separated: { pages: 5, fragments: [[false, false], [true, false], [true, true]] },
  // The title slide, and the slide that would have built up, printed once.
  together: { pages: 2, fragments: [[true, true]] },
};

const expectation = EXPECTATIONS[mode];

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

  check(
    pages.length === expectation.pages,
    `expected ${expectation.pages} printed pages, got ${pages.length}`,
  );

  const expected = expectation.fragments;

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

console.log(`Print fragment checks passed (${mode}).`);
