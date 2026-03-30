# Reveal.js A11y

A Quarto extension that enhances Reveal.js presentations with accessibility features.
It provides skip navigation, enhanced focus indicators, reduced motion support, high contrast mode, font size controls, font selection (including accessible web fonts from Bunny Fonts and a local font picker on Chromium), text spacing controls, colour overlays for reading comfort, link highlighting, ARIA slide landmarks, alt text warnings, screen reader announcements, slide change cues (visual and audio), and an accessibility settings menu.

## Installation

```bash
quarto add mcanouil/quarto-revealjs-a11y@0.1.0
```

This will install the extension under the `_extensions` subdirectory.
If you are using version control, you will want to check in this directory.

## Usage

Add the plugin to your Reveal.js presentation:

```yaml
format:
  revealjs:
    revealjs-plugins:
      - a11y
```

All features are enabled by default except high contrast mode, alt text warnings, and slide change audio cue.
Colour overlay is available from the settings menu and defaults to `None`.
The accessibility settings menu is enabled by default and can be opened by pressing `A`.

## Configuration

Configure the plugin in your presentation YAML:

```yaml
format:
  revealjs:
    revealjs-plugins:
      - a11y
    revealjs-a11y:
      high-contrast: false
      alt-text-warnings: true
      slide-change-cue:
        visual: true
        audio: true
```

### Options

| Option                   | Type             | Default                        | Description                                                                                                                                         |
| ------------------------ | ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skip-navigation`        | boolean          | `true`                         | Add a skip navigation link for keyboard users.                                                                                                      |
| `focus-indicators`       | boolean          | `true`                         | Enable enhanced visible focus indicators.                                                                                                           |
| `reduced-motion`         | boolean          | `true`                         | Respect `prefers-reduced-motion` by disabling transitions.                                                                                          |
| `high-contrast`          | boolean          | `false`                        | Enable high contrast mode on load (togglable via the settings menu).                                                                                |
| `font-size-controls`     | boolean          | `true`                         | Enable keyboard font size controls (`+` / `-` / `0`).                                                                                               |
| `font-selection`         | boolean          | `true`                         | Enable font family selection via the settings menu.                                                                                                 |
| `font-families`          | array            | (see below)                    | List of font families to cycle through. Each entry has `name`, `value`, and optional `url` keys.                                                    |
| `text-spacing`           | boolean          | `true`                         | Enable line height, letter spacing, and word spacing controls via the settings menu.                                                                |
| `link-highlight`         | boolean          | `true`                         | Underline all links so they are distinguishable without relying on colour alone (WCAG 1.4.1).                                                       |
| `slide-landmarks`        | boolean          | `true`                         | Add ARIA landmark roles and labels to slides.                                                                                                       |
| `alt-text-warnings`      | boolean          | `false`                        | Highlight images missing alt text (useful during authoring).                                                                                        |
| `announce-slide-numbers` | boolean          | `true`                         | Announce slide numbers (with total) and titles to screen readers.                                                                                   |
| `announce-fragments`     | boolean          | `true`                         | Announce fragment content to screen readers when shown or hidden.                                                                                   |
| `slide-menu-a11y`        | boolean          | `true`                         | Patch the bundled reveal.js-menu plugin for screen reader accessibility.                                                                            |
| `slide-change-cue`       | boolean / object | `{visual: true, audio: false}` | Slide change feedback. `true` enables both visual and audio; `false` disables both; or use `{visual: true, audio: false}` for fine-grained control. |
| `font-size-step`         | number           | `10`                           | Percentage increment for font size adjustments.                                                                                                     |
| `font-size-min`          | number           | `50`                           | Minimum font size percentage.                                                                                                                       |
| `font-size-max`          | number           | `200`                          | Maximum font size percentage.                                                                                                                       |
| `menu`                   | boolean / object | `true`                         | Accessibility settings menu. `true` enables with defaults; `false` disables; or use an object (see below).                                          |

#### Menu Options

| Sub-option | Type    | Default   | Description                                      |
| ---------- | ------- | --------- | ------------------------------------------------ |
| `enabled`  | boolean | `true`    | Whether the menu is enabled.                     |
| `shortcut` | string  | `"a"`     | Key for the shortcut to toggle the menu.         |
| `position` | string  | `"right"` | Side the panel slides in from (`right`, `left`). |

### Default Font Families

The plugin ships with these font families:

1. **Default** (presentation theme font).
2. **System Sans** (`system-ui, -apple-system, sans-serif`).
3. **System Serif** (`Georgia, 'Times New Roman', serif`).
4. **System Mono** (`ui-monospace, 'Courier New', monospace`).
5. **Atkinson Hyperlegible** (loaded from [Bunny Fonts](https://fonts.bunny.net), designed for high legibility).
6. **Lexend** (loaded from [Bunny Fonts](https://fonts.bunny.net), designed to reduce visual stress).
7. **OpenDyslexic** (loaded from cdnfonts, dyslexia-friendly).

On Chromium-based browsers (Chrome, Edge), a local font picker is available as a progressive enhancement via the plugin API, allowing users to select any font installed on their machine.

### Keyboard Shortcuts

| Shortcut | Action                 |
| -------- | ---------------------- |
| `Tab`    | Navigate to skip link. |
| `+`      | Increase font size.    |
| `-`      | Decrease font size.    |
| `0`      | Reset font size.       |
| `A`      | Toggle settings menu.  |

### Persistence

User preferences (high contrast, font size, font family, text spacing, link highlight, colour overlay, and slide cue toggles) are saved to `localStorage` and persist across sessions and page reloads.

## Example

Here is the source code for a minimal example: [example.qmd](example.qmd).

Rendered output:

- [Reveal.js](https://m.canouil.dev/quarto-revealjs-a11y/).
