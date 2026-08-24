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

// Far above the real cycle, which is the skip link and the content of the
// slides on screen. The walk stops when it wraps around.
const MAX_TAB_STOPS = 150;
const MENU = "#revealjs-a11y-menu";
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
}

// A wait that reports a timeout as a failed check, so the run always prints
// every check it collected.
async function waitFor(condition, message, argument = null) {
  const met = await page
    .waitForFunction(condition, argument, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check(met, message);
  return met;
}

// Selects a slide by its identifier, whether it stands on its own or sits
// inside a vertical stack.
async function goToSlide(id) {
  await page.evaluate((slideId) => {
    const slide = document.getElementById(slideId);
    if (!slide) throw new Error(`No slide with the identifier "${slideId}".`);
    const top = slide.closest(".slides > section");
    const h = [...document.querySelectorAll(".slides > section")].indexOf(top);
    const v = [...top.querySelectorAll(":scope > section")].indexOf(slide);
    window.Reveal.slide(h, v < 0 ? undefined : v);
  }, id);
  await waitFor(
    (slideId) =>
      window.Reveal.getCurrentSlide() &&
      window.Reveal.getCurrentSlide().id === slideId,
    `Deck view: the deck did not reach the slide "${id}".`,
    id,
  );
}

// Walks the tab order from the top of the document until it comes back to the
// first stop, and reports each stop on the way.
async function tabStops(view) {
  await page.evaluate(() => {
    if (document.activeElement) document.activeElement.blur();
    window.tabWalkSeen = [];
  });
  const stops = [];
  for (let i = 0; i < MAX_TAB_STOPS; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate((menuSelector) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      // An element seen twice means the walk has come round. The first stop
      // alone is not enough, because the walk can start part way through the
      // cycle. A repeat of the stop before it does not count: Chromium reports
      // an `iframe` as the active element both when the frame is the stop and
      // when the focus is inside it.
      const seen = window.tabWalkSeen;
      if (seen.length > 0 && seen[seen.length - 1] === el) return null;
      const wrapped = seen.includes(el);
      seen.push(el);
      const slide = el.closest(".slides section");
      return {
        wrapped: wrapped,
        id: el.id || null,
        tag: el.tagName.toLowerCase(),
        slide: slide ? slide.id || slide.getAttribute("aria-label") : null,
        onCurrentSlide: slide ? slide.classList.contains("present") : null,
        inMenu: el.closest(menuSelector) !== null,
      };
    }, MENU);
    if (!stop) continue;
    if (stop.wrapped) {
      reportClosedMenuStops(stops, view);
      return stops;
    }
    stops.push(stop);
  }
  check(
    false,
    `${view}: the tab order did not return to its first stop within ${MAX_TAB_STOPS} stops, so the checks below may be incomplete.`,
  );
  reportClosedMenuStops(stops, view);
  return stops;
}

// The settings panel is a closed dialog until a reader opens it, so none of its
// controls may sit in the tab order. Every walk is checked, because no walk
// runs while the panel is open.
function reportClosedMenuStops(stops, view) {
  for (const stop of stops.filter((s) => s.inMenu)) {
    check(
      false,
      `${view}: Tab reaches ${stop.tag}#${stop.id || "(no id)"} inside the closed settings menu.`,
    );
  }
}

function reportOffSlideStops(stops, view) {
  for (const stop of stops.filter((s) => s.slide && !s.onCurrentSlide)) {
    check(
      false,
      `${view}: Tab reaches ${stop.tag}#${stop.id || "(no id)"} on slide "${stop.slide}", which is not the current slide.`,
    );
  }
}

// reveal.js sets `aria-hidden` on the slides it hides itself, so only the
// attribute the extension owns is checked here.
async function inertSlides() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".slides section")]
      .filter((s) => s.hasAttribute("inert"))
      .map((s) => s.id || s.getAttribute("aria-label") || "(stack)"),
  );
}

// Names what holds the focus: the slide it sits on, or the element itself.
async function focusHolder() {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "(body)";
    const slide = el.closest(".slides section");
    return slide ? slide.id : el.className || el.id || el.tagName.toLowerCase();
  });
}

// Only one slide holds `aria-current`, even when a vertical stack holds it.
async function currentMarkers() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".slides section")]
      .filter((s) => s.hasAttribute("aria-current"))
      .map((s) => s.id || "(stack)"),
  );
}

try {
  // The deck view: only the current slide is in the tab order.
  await openDeck();

  await goToSlide(FRAME_SLIDE);
  let stops = await tabStops("Deck view");
  check(
    stops.some((s) => s.id === FRAME),
    "Deck view: the iframe on the current slide is never reached by Tab.",
  );
  reportOffSlideStops(stops, "Deck view");

  await goToSlide(WIDGET_SLIDE);
  stops = await tabStops("Deck view");
  check(
    stops.some((s) => s.id === WIDGET),
    "Deck view: the tabindex-focusable widget on the current slide is never reached by Tab.",
  );
  reportOffSlideStops(stops, "Deck view");

  // Leaving a slide and coming back must restore it exactly.
  await goToSlide(FRAME_SLIDE);
  await goToSlide(WIDGET_SLIDE);
  stops = await tabStops("Deck view");
  check(
    stops.some((s) => s.id === WIDGET),
    "Deck view: the widget is not reachable after leaving its slide and returning.",
  );

  // A slide inside a vertical stack keeps its own content reachable, and the
  // stack that holds it must not be isolated with the other slides.
  await goToSlide(NESTED_SLIDE);
  stops = await tabStops("Deck view");
  check(
    stops.some((s) => s.id === NESTED_WIDGET),
    "Deck view: the widget on a vertical slide is never reached by Tab.",
  );
  reportOffSlideStops(stops, "Deck view");

  const markers = await currentMarkers();
  check(
    markers.length === 1 && markers[0] === NESTED_SLIDE,
    `Deck view: ${markers.length} slide(s) carry aria-current on a vertical slide: ${markers.join(", ")}.`,
  );

  // The overview shows every slide, so clicking one must still select it.
  await goToSlide("title-slide");
  await page.evaluate(() => window.Reveal.toggleOverview(true));
  await page.waitForFunction(() => window.Reveal.isOverview());
  await page.locator(`#${FRAME_SLIDE}`).click();
  await page.waitForFunction(
    (id) =>
      window.Reveal.getCurrentSlide() &&
      window.Reveal.getCurrentSlide().id === id,
    FRAME_SLIDE,
    { timeout: 5000 },
  ).catch(() => {});
  const selected = await page.evaluate(
    () => window.Reveal.getCurrentSlide() && window.Reveal.getCurrentSlide().id,
  );
  check(
    selected === FRAME_SLIDE,
    `Overview: clicking a slide did not select it (landed on "${selected}", expected "${FRAME_SLIDE}").`,
  );

  // `inert` blurs what it holds, so a reader focused inside a slide loses the
  // focus when that slide is left. The focus must land on the new slide, not
  // on the body, or the next Tab restarts from the top of the document.
  await goToSlide(WIDGET_SLIDE);
  await page.evaluate((id) => document.getElementById(id).focus(), WIDGET);
  await goToSlide(FRAME_SLIDE);
  await page
    .waitForFunction(() => document.activeElement !== document.body, null, {
      timeout: 5000,
    })
    .catch(() => {});
  const movedFocusHolder = await focusHolder();
  check(
    movedFocusHolder === FRAME_SLIDE,
    `Deck view: after leaving a slide with the focus inside it, the focus is on "${movedFocusHolder}", expected the new slide.`,
  );

  // A dialog outside the deck keeps the focus it holds. The deck can still
  // change slide under it, through `autoSlide`, a swipe, or author code.
  await goToSlide(WIDGET_SLIDE);
  await page.evaluate((id) => document.getElementById(id).focus(), WIDGET);
  await page.keyboard.press("a");
  const menuOpen = await page
    .waitForFunction(
      (menuSelector) =>
        document.activeElement !== document.body &&
        document.activeElement.closest(menuSelector) !== null,
      MENU,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  check(menuOpen, "Deck view: the settings menu did not take the focus.");
  await goToSlide(FRAME_SLIDE);
  // The focus must not be pulled into the deck. reveal.js can drop it to the
  // body on its own, which is not this extension's doing.
  const menuHolder = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "(body)";
    return el.closest(".slides section")
      ? `slide "${el.closest(".slides section").id}"`
      : el.className || el.id || el.tagName.toLowerCase();
  });
  check(
    !menuHolder.startsWith("slide "),
    `Deck view: a slide change with the menu open moved the focus onto ${menuHolder}.`,
  );
  // `Escape` reaches the panel through its own listener, so the focus goes
  // back inside first. reveal.js can leave it on the body, and the deck
  // keyboard is off while the panel is open.
  await page.evaluate(
    (menuSelector) => document.querySelector(menuSelector).focus(),
    MENU,
  );
  await page.keyboard.press("Escape");
  await waitFor(
    (menuSelector) => document.querySelector(menuSelector).inert,
    "Deck view: Escape did not close the settings menu.",
    MENU,
  );

  // The reader left the focus on a slide the deck has since left, so the panel
  // cannot give the focus back to it. The focus must land on the current
  // slide, or the next Tab restarts from the top of the document.
  const closedFocusHolder = await focusHolder();
  check(
    closedFocusHolder === FRAME_SLIDE,
    `Deck view: closing the menu left the focus on "${closedFocusHolder}", expected the current slide.`,
  );

  // The panel must leave the tab order again once it is closed.
  await tabStops("Deck view, after the menu closed");

  // The same close, with the focus dropped to the body while the panel was
  // open. A reader closes the panel with the mouse from there, because
  // `Escape` no longer reaches it.
  // The walk above can leave the focus inside the iframe on the slide, where
  // the shortcut never reaches the deck.
  await page.evaluate(() => window.Reveal.getCurrentSlide().focus());
  await page.keyboard.press("a");
  await waitFor(
    (menuSelector) => !document.querySelector(menuSelector).inert,
    "Deck view: the settings menu did not open for the second time.",
    MENU,
  );
  await page.evaluate(() => document.activeElement.blur());
  await page.locator(".revealjs-a11y-menu-close").click();
  await waitFor(
    (menuSelector) => document.querySelector(menuSelector).inert,
    "Deck view: the close button did not close the settings menu.",
    MENU,
  );
  const blurredFocusHolder = await focusHolder();
  check(
    blurredFocusHolder === FRAME_SLIDE,
    `Deck view: closing the menu with the focus on the body left it on "${blurredFocusHolder}", expected the current slide.`,
  );

  // The backdrop closes the panel too, and a click on it focuses nothing. The
  // deck has left the slide that held the focus, so the panel has no element
  // to give it back to.
  await goToSlide(WIDGET_SLIDE);
  await page.evaluate((id) => document.getElementById(id).focus(), WIDGET);
  await page.keyboard.press("a");
  await waitFor(
    (menuSelector) => !document.querySelector(menuSelector).inert,
    "Deck view: the settings menu did not open for the third time.",
    MENU,
  );
  await goToSlide(FRAME_SLIDE);
  await page.evaluate(() => {
    document.activeElement.blur();
    document.querySelector(".revealjs-a11y-menu-backdrop").click();
  });
  await waitFor(
    (menuSelector) => document.querySelector(menuSelector).inert,
    "Deck view: the backdrop did not close the settings menu.",
    MENU,
  );
  const backdropFocusHolder = await focusHolder();
  check(
    backdropFocusHolder === FRAME_SLIDE,
    `Deck view: closing the menu from the backdrop left the focus on "${backdropFocusHolder}", expected the current slide.`,
  );

  // Content on other slides is deliberately reachable while the overview is
  // open, because `inert` would also block the click that selects a slide.
  // The click above closed the overview, so open it again.
  await page.evaluate(() => window.Reveal.toggleOverview(true));
  await page.waitForFunction(() => window.Reveal.isOverview());
  stops = await tabStops("Overview");
  check(
    stops.some((s) => s.slide && !s.onCurrentSlide),
    "Overview: content on slides other than the current one is not reachable, so the overview now isolates slides.",
  );

  // Views that lay every slide out at once: nothing may be isolated in any of
  // them. reveal.js rebuilds the DOM around each slide in the last two, so a
  // slide isolated before that rebuild can never be reached again. The print
  // view prints every slide, so no slide is the current one there. The scroll
  // view keeps one.
  for (const [view, query, expectedMarkers] of [
    ["Print view (?print-pdf)", "?print-pdf", 0],
    ["Print view (?view=print)", "?view=print", 0],
    ["Scroll view", "?view=scroll", 1],
  ]) {
    await openDeck(query);
    const isolated = await inertSlides();
    check(
      isolated.length === 0,
      `${view}: ${isolated.length} slide(s) made inert: ${isolated.join(", ")}.`,
    );
    const viewMarkers = await currentMarkers();
    check(
      viewMarkers.length === expectedMarkers,
      `${view}: ${viewMarkers.length} slide(s) carry aria-current, expected ${expectedMarkers}: ${viewMarkers.join(", ")}.`,
    );
  }

  // A view can also change while the deck is open. reveal.js rebuilds the
  // slides from a copy of their markup taken when the scroll view started, so
  // a slide can come back isolated after the round trip.
  await openDeck();
  await goToSlide(FRAME_SLIDE);
  await page.setViewportSize({ width: 420, height: 800 });
  await waitFor(
    () => window.Reveal.isScrollView(),
    "Scroll view round trip: a narrow viewport did not start the scroll view.",
  );
  await page.evaluate(
    (id) => document.getElementById(id).scrollIntoView(),
    WIDGET_SLIDE,
  );
  await page
    .waitForFunction(
      (id) =>
        window.Reveal.getCurrentSlide() &&
        window.Reveal.getCurrentSlide().id === id,
      WIDGET_SLIDE,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.setViewportSize({ width: 1280, height: 800 });
  await waitFor(
    () => !window.Reveal.isScrollView(),
    "Scroll view round trip: a wide viewport did not leave the scroll view.",
  );
  const strandedInert = await page.evaluate(() => {
    const slide = window.Reveal.getCurrentSlide();
    return slide ? slide.hasAttribute("inert") : true;
  });
  check(
    strandedInert === false,
    "Scroll view round trip: the slide the reader comes back to is inert, so none of its content can be reached.",
  );
  stops = await tabStops("Scroll view round trip");
  check(
    stops.some((s) => s.onCurrentSlide),
    "Scroll view round trip: no content on the current slide is reachable by Tab.",
  );

  // The tab order of the print view must reach the content of every slide.
  await openDeck("?print-pdf");
  stops = await tabStops("Print view");
  for (const id of [FRAME, WIDGET, NESTED_WIDGET]) {
    check(
      stops.some((s) => s.id === id),
      `Print view: #${id} is not reachable by Tab.`,
    );
  }
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
