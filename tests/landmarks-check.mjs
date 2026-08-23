import { chromium } from "playwright";
import { serveDeck } from "./serve.mjs";

// Checks the keyboard contract of `slide-landmarks`: on the current slide,
// every focusable element is reachable; on every other slide, none is. The
// deck view and the print view have opposite requirements, and the overview
// shows every slide at once, so each is checked on its own.

const target = process.argv[2];
if (!target) {
  console.error("Usage: node landmarks-check.mjs <html-file>");
  process.exit(2);
}

const MAX_TAB_STOPS = 40;
const FRAME_SLIDE = "embedded-frame";
const WIDGET_SLIDE = "focusable-widget";
const NESTED_SLIDE = "second-vertical-slide";
const FRAME = "fixture-frame";
const WIDGET = "fixture-widget";
const NESTED_WIDGET = "fixture-nested-widget";

const { url, close } = await serveDeck(target);
const browser = await chromium.launch();
const page = await browser.newPage();

const failures = [];

function check(condition, message) {
  if (!condition && !failures.includes(message)) failures.push(message);
}

async function openDeck(query = "") {
  await page.goto(`${url}${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.Reveal && window.Reveal.isReady());
  await page.waitForTimeout(500);
}

// Selects a slide by its identifier, whether it stands on its own or sits
// inside a vertical stack.
async function goToSlide(id) {
  await page.evaluate((slideId) => {
    const slide = document.getElementById(slideId);
    const top = slide.closest(".slides > section");
    const h = [...document.querySelectorAll(".slides > section")].indexOf(top);
    const v = [...top.querySelectorAll(":scope > section")].indexOf(slide);
    window.Reveal.slide(h, v < 0 ? undefined : v);
  }, id);
  await page.waitForTimeout(500);
}

// Walks the tab order from the top of the document and reports each stop.
async function tabStops() {
  await page.evaluate(() => {
    if (document.activeElement) document.activeElement.blur();
  });
  const stops = [];
  for (let i = 0; i < MAX_TAB_STOPS; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const slide = el.closest(".slides section");
      return {
        id: el.id || null,
        tag: el.tagName.toLowerCase(),
        slide: slide ? slide.id || slide.getAttribute("aria-label") : null,
        onCurrentSlide: slide ? slide.classList.contains("present") : null,
      };
    });
    if (stop) stops.push(stop);
  }
  return stops;
}

function reportOffSlideStops(stops, view) {
  for (const stop of stops.filter((s) => s.slide && !s.onCurrentSlide)) {
    check(
      false,
      `${view}: Tab reaches ${stop.tag}#${stop.id || "(no id)"} on slide "${stop.slide}", which is not the current slide.`,
    );
  }
}

try {
  // The deck view: only the current slide is in the tab order.
  await openDeck();

  await goToSlide(FRAME_SLIDE);
  let stops = await tabStops();
  check(
    stops.some((s) => s.id === FRAME),
    "Deck view: the iframe on the current slide is never reached by Tab.",
  );
  reportOffSlideStops(stops, "Deck view");

  await goToSlide(WIDGET_SLIDE);
  stops = await tabStops();
  check(
    stops.some((s) => s.id === WIDGET),
    "Deck view: the tabindex-focusable widget on the current slide is never reached by Tab.",
  );
  reportOffSlideStops(stops, "Deck view");

  // Leaving a slide and coming back must restore it exactly.
  await goToSlide(FRAME_SLIDE);
  await goToSlide(WIDGET_SLIDE);
  stops = await tabStops();
  check(
    stops.some((s) => s.id === WIDGET),
    "Deck view: the widget is not reachable after leaving its slide and returning.",
  );

  // A slide inside a vertical stack keeps its own content reachable, and the
  // stack that holds it must not be isolated with the other slides.
  await goToSlide(NESTED_SLIDE);
  stops = await tabStops();
  check(
    stops.some((s) => s.id === NESTED_WIDGET),
    "Deck view: the widget on a vertical slide is never reached by Tab.",
  );
  reportOffSlideStops(stops, "Deck view");

  // The overview shows every slide, so clicking one must still select it.
  await goToSlide("title-slide");
  await page.evaluate(() => window.Reveal.toggleOverview(true));
  await page.waitForTimeout(500);
  await page.locator(`#${FRAME_SLIDE}`).click();
  await page.waitForTimeout(500);
  const selected = await page.evaluate(
    () => window.Reveal.getCurrentSlide() && window.Reveal.getCurrentSlide().id,
  );
  check(
    selected === FRAME_SLIDE,
    `Overview: clicking a slide did not select it (landed on "${selected}", expected "${FRAME_SLIDE}").`,
  );

  // The print view lays every slide out at once, so nothing may be isolated.
  await openDeck("?print-pdf");
  stops = await tabStops();
  for (const id of [FRAME, WIDGET, NESTED_WIDGET]) {
    check(
      stops.some((s) => s.id === id),
      `Print view: #${id} is not reachable by Tab.`,
    );
  }
  // reveal.js sets `aria-hidden` on hidden slides itself, so only the
  // attribute the extension owns is checked here.
  const isolated = await page.evaluate(() =>
    [...document.querySelectorAll(".slides section")]
      .filter((s) => s.hasAttribute("inert"))
      .map((s) => s.id || s.getAttribute("aria-label")),
  );
  check(
    isolated.length === 0,
    `Print view: ${isolated.length} slide(s) made inert: ${isolated.join(", ")}.`,
  );
} finally {
  await browser.close();
  close();
}

for (const failure of failures) {
  console.log(`[FAIL] ${failure}`);
}

console.log(
  failures.length === 0
    ? "\nSlide landmark keyboard checks passed."
    : `\n${failures.length} slide landmark check(s) failed.`,
);

process.exit(failures.length > 0 ? 1 : 0);
