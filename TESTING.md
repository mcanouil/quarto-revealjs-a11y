# Testing accessibility

This extension builds custom ARIA semantics, keyboard handling, and screen-reader announcements.
Automated tooling catches structural regressions, but screen-reader behaviour must be verified by hand.
Run both before a release.

## Automated check

The `Accessibility` GitHub Actions workflow renders `tests/_a11y-fixture.qmd` and gates on its accessibility.
The fixture enables Quarto's built-in axe-core check (`axe: {output: json}`), which scans every slide and logs the result as JSON.
`tests/axe-check.mjs` serves the rendered deck over HTTP (axe-core is an ES module the browser refuses to load from `file://`), captures that JSON in a headless browser, and fails the build on serious or critical violations.

The fixture is a deliberately clean deck; `example.qmd` is not used because it intentionally ships a missing-alt image (to demonstrate `alt-text-warnings`).
The `_` prefix keeps the fixture out of the release render, and `tests/_quarto.yml` copies the extension into `tests/` for the render and removes it afterwards.

Run it locally:

```bash
quarto render tests
cd tests
npm install
npx playwright install --with-deps chromium
node axe-check.mjs _a11y-fixture.html
node landmarks-check.mjs _a11y-fixture.html
```

## Slide landmark keyboard check

`tests/landmarks-check.mjs` walks the tab order of the same fixture in a headless browser, because axe-core cannot see which slide an element belongs to.
It checks that the current slide reaches its own `iframe` and its own `tabindex`-focusable widget, that no other slide is reachable, and that a slide is still reachable after the reader leaves it and comes back.
A slide inside a vertical stack is checked as well, because the stack that holds it must stay live.
It also checks the views where every slide is legitimately on screen: a slide stays clickable in the overview, and no slide is made `inert` in the print view or the scroll view.
A change of view while the deck is open is checked too, because reveal.js rebuilds the slides from a copy of their markup taken when the scroll view started.
The focus is checked as well: it moves to the new slide when the reader leaves a slide with the focus inside it, and it stays where it is when a dialog outside the deck holds it.

The accessibility settings panel shares the tab order with the slides, so the same walk checks it.
No control inside the closed panel is reachable, in every view.
The panel gives the focus back to the control it was opened from, and takes the current slide when that control is gone or sits on a slide the deck has left.
Each route that closes the panel is checked: `Escape`, the close button, and the backdrop.

To inspect any deck interactively, add `axe: {output: document}` under the `revealjs` format and open it with `quarto preview`; axe-core violations are reported on the page itself.
Use the manual checklist below for behaviour axe-core cannot see.

## Manual checklist

### Keyboard only (no mouse)

- `Tab` from page load reveals the skip link; activating it moves focus to the slide content.
- `+`, `-`, and `0` change and reset the font size, and each change is announced.
- `T` opens and closes the transcript; focus is trapped inside it and `Escape` closes it.
- `P` toggles the pointer indicator and it follows keyboard focus.
- `A` opens the settings menu; focus is trapped, every control is reachable, and `Escape` closes it.
- Arrow keys still navigate slides when no overlay is open.

### Screen reader

Test with VoiceOver (macOS, Safari) and NVDA (Windows, Firefox).

- Navigating slides announces the slide number, total, and title.
- Showing and hiding fragments announces their content.
- Navigating to a slide with a different `lang` (the French slides in `example.qmd`) announces the language change, and navigating back announces the change back. No announcement fires on first load or when the language is unchanged.
- Each slide is reachable as a labelled region.
- The transcript reads as a linear document with no duplicated headings.
- Every settings-menu control has a meaningful label and reports its state.

### Operating-system preferences

- With `prefers-reduced-motion` enabled, slide transitions and animations are disabled.
- With high-contrast mode on, text, links, code, tables, and the pointer remain legible.

### Print to PDF

- Export with `?print-pdf`: the menu, pointer, skip link, and status region are hidden, and user-preference overrides are reset.
- With `transcript: {print: true}`, the transcript appears below each slide.
- `{data-pdf-separate="true"}` produces one page per fragment state.
