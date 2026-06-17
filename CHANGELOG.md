# Changelog

## Unreleased

### New Features

- feat: announce language changes to screen readers when navigating between slides with different `lang` attributes (`announce-language-changes` option, enabled by default).
- feat: add transcript view that linearises slide content into a screen-reader-friendly document (`transcript` option). Authors can provide custom transcript text via `::: {.transcript}` blocks; otherwise the slide's visible content is used. Optionally show transcript below each slide in print-pdf mode with `transcript: {print: true}`.
- feat: add pointer/focus indicator for low-vision users (`pointer-indicator` option). A configurable spotlight follows the cursor or keyboard focus, with size and colour adjustable from the accessibility menu.
- feat: improve print-pdf output by resetting user preferences, hiding interactive UI, preserving backgrounds, and supporting per-slide fragment separation via `{data-pdf-separate="true"}` and `{data-pdf-no-separate="true"}` attributes.

### Fixes

- fix: queue and coalesce status announcements so rapid slide or fragment changes are no longer lost to the `requestAnimationFrame` race; consecutive duplicates are dropped and queued messages are flushed at a polite cadence.
- fix: validate `pointer-indicator.size` (numeric, clamped to `[16, 800]` px) and `pointer-indicator.colour` (parsed as a CSS colour) at configuration time; invalid values fall back to defaults and are reported via `console.warn`.
- fix: render the local font picker in chunks via `requestAnimationFrame` so very large font collections no longer block the main thread; search input is debounced.
- fix: replace the generic "Could not access local fonts" message with permission-aware help text covering denial, insecure contexts, and unsupported browsers.
- fix: cancel the in-flight announcement timer and clear the queue on plugin teardown.
- fix: document `announce-language-changes` in `_schema.yml` so IDE autocompletion covers it.
- fix: treat `alt=""` as a valid decorative-image declaration; the "missing alt text" warning is now only shown when the `alt` attribute is absent entirely.
- feat: allow zooming by overriding the Reveal.js viewport meta that set `user-scalable=no` (`viewport-zoom` option, enabled by default; WCAG 1.4.4).
- fix: label the bundled reveal.js-menu toggle button so screen readers announce it (`slide-menu-a11y`).
- docs: document the colour overlay options and custom `font-families` configuration in the README, and demonstrate the object-form options in the example deck.
- chore: remove the unused `.revealjs-a11y-captions` CSS rule.
- test: gate accessibility in CI using Quarto's built-in axe-core check against a dedicated fixture deck, and add a manual screen-reader and keyboard testing checklist (`TESTING.md`).

## 0.1.1 (2026-04-01)

### Fixes

- fix: remove version-specific reference (added from CI/CD) from the GitHub repository link to ensure it always points to the latest version.

## 0.1.0 (2026-03-30)

### New Features

- feat: Initial release with skip navigation, focus indicators, reduced motion, high contrast mode, font size controls, font selection, slide landmarks, alt text warnings, and screen reader announcements.
