# Changelog

## Unreleased

### New Features

- feat: announce language changes to screen readers when navigating between slides with different `lang` attributes (`announce-language-changes` option, enabled by default).
- feat: add transcript view that linearises slide content into a screen-reader-friendly document (`transcript` option). Authors can provide custom transcript text via `::: {.transcript}` blocks; otherwise the slide's visible content is used. Optionally show transcript below each slide in print-pdf mode with `transcript: {print: true}`.
- feat: add pointer/focus indicator for low-vision users (`pointer-indicator` option). A configurable spotlight follows the cursor or keyboard focus, with size and colour adjustable from the accessibility menu.

## 0.1.1 (2026-04-01)

### Fixes

- fix: remove version-specific reference (added from CI/CD) from the GitHub repository link to ensure it always points to the latest version.

## 0.1.0 (2026-03-30)

### New Features

- feat: Initial release with skip navigation, focus indicators, reduced motion, high contrast mode, font size controls, font selection, slide landmarks, alt text warnings, and screen reader announcements.
