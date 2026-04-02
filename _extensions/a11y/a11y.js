/**
 * Reveal.js A11y - RevealJS Accessibility Plugin
 * Enhances Reveal.js presentations with accessibility features including
 * skip navigation, focus management, reduced motion, high contrast,
 * font size controls, font selection, text spacing, slide landmarks,
 * alt text warnings, link highlighting, and menu integration.
 *
 * @license MIT License
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 * @version 0.0.0
 */

window.RevealjsA11y =
  window.RevealjsA11y ||
  (() => {
    const DEFAULT_CONFIG = {
      skipNavigation: true,
      focusIndicators: true,
      reducedMotion: true,
      highContrast: false,
      fontSizeControls: true,
      fontSelection: true,
      textSpacing: true,
      linkHighlight: true,
      slideLandmarks: true,
      altTextWarnings: false,
      announceSlideNumbers: true,
      announceFragments: true,
      slideChangeCue: { visual: true, audio: false },
      transcript: { enabled: true, print: false },
      slideMenuA11y: true,
      fontSizeStep: 10,
      fontSizeMin: 50,
      fontSizeMax: 200,
      menu: { enabled: true, shortcut: "a", position: "right" },
      fontFamilies: [
        { name: "Default", value: "" },
        { name: "System Sans", value: "system-ui, -apple-system, sans-serif" },
        { name: "System Serif", value: "Georgia, 'Times New Roman', serif" },
        { name: "System Mono", value: "ui-monospace, 'Courier New', monospace" },
        {
          name: "Atkinson Hyperlegible",
          value: "'Atkinson Hyperlegible', sans-serif",
          url: "https://fonts.bunny.net/css?family=atkinson-hyperlegible:400,400i,700,700i",
        },
        {
          name: "Lexend",
          value: "'Lexend', sans-serif",
          url: "https://fonts.bunny.net/css?family=lexend:400,700",
        },
        {
          name: "OpenDyslexic",
          value: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
          url: "https://fonts.cdnfonts.com/css/opendyslexic",
        },
      ],
    };

    const CSS_PREFIX = "revealjs-a11y";
    const STORAGE_PREFIX = "revealjs-a11y-";

    let deck;
    let config;
    let revealElement;
    let currentFontSize = 100;
    let currentFontFamilyIndex = 0;
    let currentLineHeight = 0;
    let currentLetterSpacing = 0;
    let currentWordSpacing = 0;
    let menuPreviousFocus = null;
    let menuPreviousKeyboard = null;
    let menuOpen = false;
    let reducedMotionMediaQuery = null;
    let reducedMotionListener = null;
    let reducedMotionPreviousTransitions = null;
    let audioCtx = null;
    let primeAudioClick = null;
    let primeAudioKeydown = null;
    let slideMenuObserver = null;
    let slideMenuClassObserver = null;
    let transcriptOpen = false;
    let transcriptPreviousFocus = null;
    let transcriptPreviousKeyboard = null;
    let transcriptKeyHandler = null;
    const deckHandlers = [];

    function deckOn(event, handler) {
      deck.on(event, handler);
      deckHandlers.push({ event, handler });
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    function kebabToCamel(str) {
      return str.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    }

    function normaliseKeys(obj) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
      const result = {};
      Object.entries(obj).forEach(([key, value]) => {
        result[kebabToCamel(key)] = value;
      });
      return result;
    }

    function normaliseCue(value, fallback) {
      if (typeof value === "boolean") {
        return { visual: value, audio: value };
      }
      if (value && typeof value === "object") {
        return {
          visual: value.visual !== undefined ? value.visual : fallback.visual,
          audio: value.audio !== undefined ? value.audio : fallback.audio,
        };
      }
      return fallback;
    }

    function normaliseMenu(value, fallback) {
      if (typeof value === "boolean") {
        return Object.assign({}, fallback, { enabled: value });
      }
      if (value && typeof value === "object") {
        return {
          enabled:
            value.enabled !== undefined ? value.enabled : fallback.enabled,
          shortcut:
            value.shortcut !== undefined ? value.shortcut : fallback.shortcut,
          position:
            value.position !== undefined ? value.position : fallback.position,
        };
      }
      return fallback;
    }

    function normaliseTranscript(value, fallback) {
      if (typeof value === "boolean") {
        return { enabled: value, print: false };
      }
      if (value && typeof value === "object") {
        return {
          enabled:
            value.enabled !== undefined ? value.enabled : fallback.enabled,
          print: value.print !== undefined ? value.print : fallback.print,
        };
      }
      return fallback;
    }

    function resolveConfig(revealConfig) {
      const userConfig = revealConfig["revealjs-a11y"] || {};
      const merged = Object.assign({}, DEFAULT_CONFIG, normaliseKeys(userConfig));
      merged.slideChangeCue = normaliseCue(
        merged.slideChangeCue,
        DEFAULT_CONFIG.slideChangeCue,
      );
      merged.transcript = normaliseTranscript(
        merged.transcript,
        DEFAULT_CONFIG.transcript,
      );
      merged.menu = normaliseMenu(merged.menu, DEFAULT_CONFIG.menu);
      merged.fontSizeStep = Math.max(1, merged.fontSizeStep || DEFAULT_CONFIG.fontSizeStep);
      return merged;
    }

    function createElement(tag, attrs, text) {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([key, value]) => {
        el.setAttribute(key, value);
      });
      if (text) {
        el.textContent = text;
      }
      return el;
    }

    function storageGet(key) {
      try {
        return localStorage.getItem(STORAGE_PREFIX + key);
      } catch (_e) {
        return null;
      }
    }

    function storageSet(key, value) {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, value);
      } catch (_e) {
        // Storage unavailable; silently continue.
      }
    }

    function getSlidesContainer() {
      return revealElement.querySelector(".slides");
    }

    // =========================================================================
    // Skip Navigation
    // =========================================================================

    function setupSkipNavigation() {
      const link = createElement(
        "a",
        {
          href: "#",
          class: `${CSS_PREFIX}-skip-link`,
          "aria-label": "Skip to slide content",
        },
        "Skip to slide content",
      );

      link.addEventListener("click", (e) => {
        e.preventDefault();
        const currentSlide = deck.getCurrentSlide();
        if (currentSlide) {
          currentSlide.setAttribute("tabindex", "-1");
          currentSlide.focus();
        }
      });

      revealElement.insertBefore(link, revealElement.firstChild);
    }

    // =========================================================================
    // Focus Indicators
    // =========================================================================

    function setupFocusIndicators() {
      revealElement.classList.add(`${CSS_PREFIX}-focus-indicators`);
    }

    // =========================================================================
    // Reduced Motion
    // =========================================================================

    function setupReducedMotion() {
      reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (!reducedMotionPreviousTransitions) {
        const deckConfig = deck.getConfig();
        reducedMotionPreviousTransitions = {
          transition: deckConfig.transition,
          backgroundTransition: deckConfig.backgroundTransition,
        };
      }

      function applyReducedMotion(matches) {
        if (matches) {
          revealElement.classList.add(`${CSS_PREFIX}-reduced-motion`);
          deck.configure({ transition: "none", backgroundTransition: "none" });
        } else {
          revealElement.classList.remove(`${CSS_PREFIX}-reduced-motion`);
          if (reducedMotionPreviousTransitions) {
            deck.configure({
              transition: reducedMotionPreviousTransitions.transition,
              backgroundTransition:
                reducedMotionPreviousTransitions.backgroundTransition,
            });
          }
        }
      }

      reducedMotionListener = (e) => applyReducedMotion(e.matches);
      applyReducedMotion(reducedMotionMediaQuery.matches);
      reducedMotionMediaQuery.addEventListener("change", reducedMotionListener);
    }

    // =========================================================================
    // High Contrast
    // =========================================================================

    function setHighContrast(enabled) {
      revealElement.classList.toggle(`${CSS_PREFIX}-high-contrast`, enabled);
      storageSet("high-contrast", String(enabled));
      announceStatus(
        enabled ? "High contrast mode enabled" : "High contrast mode disabled",
      );
      syncMenuState();
    }

    function setupHighContrast() {
      const stored = storageGet("high-contrast");
      if (stored === "true" || (stored === null && config.highContrast)) {
        revealElement.classList.add(`${CSS_PREFIX}-high-contrast`);
      }
    }

    // =========================================================================
    // Font Size Controls
    // =========================================================================

    function applyFontSize() {
      const container = getSlidesContainer();
      if (container) {
        container.style.fontSize = currentFontSize + "%";
      }
      storageSet("font-size", String(currentFontSize));
    }

    function setFontSize(value) {
      currentFontSize = Math.max(
        config.fontSizeMin,
        Math.min(config.fontSizeMax, value),
      );
      applyFontSize();
      announceStatus("Font size: " + currentFontSize + "%");
      syncMenuState();
    }

    function changeFontSize(delta) {
      setFontSize(currentFontSize + delta);
    }

    function resetFontSize() {
      currentFontSize = 100;
      applyFontSize();
      announceStatus("Font size reset to default");
      syncMenuState();
    }

    function setupFontSizeControls() {
      const stored = storageGet("font-size");
      if (stored) {
        currentFontSize = parseInt(stored, 10) || 100;
        applyFontSize();
      }

      deck.addKeyBinding(
        { keyCode: 187, key: "+", description: "Increase font size" },
        () => changeFontSize(config.fontSizeStep),
      );

      deck.addKeyBinding(
        { keyCode: 189, key: "-", description: "Decrease font size" },
        () => changeFontSize(-config.fontSizeStep),
      );

      deck.addKeyBinding(
        { keyCode: 48, key: "0", description: "Reset font size" },
        resetFontSize,
      );
    }

    // =========================================================================
    // Font Selection
    // =========================================================================

    function applyFontFamily() {
      const family = config.fontFamilies[currentFontFamilyIndex];
      if (family.value) {
        revealElement.style.setProperty("--a11y-font-override", family.value);
        revealElement.classList.add(`${CSS_PREFIX}-font-override`);
      } else {
        revealElement.style.removeProperty("--a11y-font-override");
        revealElement.classList.remove(`${CSS_PREFIX}-font-override`);
      }
      storageSet("font-family", String(currentFontFamilyIndex));
    }

    function loadWebFont(entry) {
      if (!entry.url) return;
      const marker = "data-revealjs-a11y-font";
      if (document.querySelector(`link[${marker}="${entry.name}"]`)) return;

      const link = createElement("link", {
        rel: "stylesheet",
        href: entry.url,
        [marker]: entry.name,
      });
      document.head.appendChild(link);
    }

    function selectFontByIndex(index) {
      if (index < 0 || index >= config.fontFamilies.length) return;
      currentFontFamilyIndex = index;
      const family = config.fontFamilies[currentFontFamilyIndex];
      loadWebFont(family);
      applyFontFamily();
      announceStatus("Font: " + family.name);
      syncMenuState();
    }

    function setupFontSelection() {
      const stored = storageGet("font-family");
      if (stored !== null) {
        const index = parseInt(stored, 10);
        if (index >= 0 && index < config.fontFamilies.length) {
          currentFontFamilyIndex = index;
          loadWebFont(config.fontFamilies[index]);
          applyFontFamily();
        }
      }
    }

    // =========================================================================
    // Text Spacing (line height and letter spacing)
    // =========================================================================

    function applyTextSpacing() {
      if (currentLineHeight > 0) {
        revealElement.style.setProperty(
          "--a11y-line-height",
          String(1.2 + currentLineHeight * 0.2),
        );
        revealElement.classList.add(`${CSS_PREFIX}-line-height-override`);
      } else {
        revealElement.style.removeProperty("--a11y-line-height");
        revealElement.classList.remove(`${CSS_PREFIX}-line-height-override`);
      }

      if (currentLetterSpacing > 0) {
        revealElement.style.setProperty(
          "--a11y-letter-spacing",
          currentLetterSpacing * 0.5 + "px",
        );
        revealElement.classList.add(`${CSS_PREFIX}-letter-spacing-override`);
      } else {
        revealElement.style.removeProperty("--a11y-letter-spacing");
        revealElement.classList.remove(
          `${CSS_PREFIX}-letter-spacing-override`,
        );
      }

      if (currentWordSpacing > 0) {
        revealElement.style.setProperty(
          "--a11y-word-spacing",
          currentWordSpacing * 0.5 + "px",
        );
        revealElement.classList.add(`${CSS_PREFIX}-word-spacing-override`);
      } else {
        revealElement.style.removeProperty("--a11y-word-spacing");
        revealElement.classList.remove(`${CSS_PREFIX}-word-spacing-override`);
      }

      storageSet("line-height", String(currentLineHeight));
      storageSet("letter-spacing", String(currentLetterSpacing));
      storageSet("word-spacing", String(currentWordSpacing));
    }

    function setupTextSpacing() {
      const storedLH = storageGet("line-height");
      const storedLS = storageGet("letter-spacing");
      const storedWS = storageGet("word-spacing");
      if (storedLH !== null) currentLineHeight = parseInt(storedLH, 10) || 0;
      if (storedLS !== null)
        currentLetterSpacing = parseInt(storedLS, 10) || 0;
      if (storedWS !== null) currentWordSpacing = parseInt(storedWS, 10) || 0;
      if (currentLineHeight > 0 || currentLetterSpacing > 0 || currentWordSpacing > 0) {
        applyTextSpacing();
      }
    }

    // =========================================================================
    // Link Highlight
    // =========================================================================

    function setLinkHighlight(enabled) {
      revealElement.classList.toggle(`${CSS_PREFIX}-link-highlight`, enabled);
      storageSet("link-highlight", String(enabled));
      announceStatus(
        enabled ? "Link underlines enabled" : "Link underlines disabled",
      );
      syncMenuState();
    }

    function setupLinkHighlight() {
      const stored = storageGet("link-highlight");
      if (stored === "true" || (stored === null && config.linkHighlight)) {
        revealElement.classList.add(`${CSS_PREFIX}-link-highlight`);
      }
    }

    // =========================================================================
    // Slide Landmarks
    // =========================================================================

    function setupSlideLandmarks() {
      const slides = revealElement.querySelectorAll(
        ".slides > section, .slides > section > section",
      );
      slides.forEach((slide, index) => {
        if (!slide.getAttribute("role")) {
          slide.setAttribute("role", "region");
        }
        if (!slide.getAttribute("aria-label")) {
          const heading = slide.querySelector("h1, h2, h3, h4, h5, h6");
          const label = heading
            ? heading.textContent.trim()
            : "Slide " + (index + 1);
          slide.setAttribute("aria-label", label);
        }
      });

      deckOn("slidechanged", updateCurrentSlideLandmarks);
      updateCurrentSlideLandmarks();
    }

    const FOCUSABLE_SELECTOR =
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function updateCurrentSlideLandmarks() {
      const allSlides = revealElement.querySelectorAll(
        ".slides > section, .slides > section > section",
      );
      const currentSlide = deck.getCurrentSlide();

      allSlides.forEach((slide) => {
        if (slide === currentSlide) {
          slide.removeAttribute("aria-hidden");
          slide.setAttribute("aria-current", "step");
          slide.querySelectorAll(FOCUSABLE_SELECTOR).forEach((el) => {
            const saved = el.getAttribute("data-a11y-tabindex");
            if (saved !== null) {
              el.setAttribute("tabindex", saved);
              el.removeAttribute("data-a11y-tabindex");
            } else if (el.getAttribute("tabindex") === "-1") {
              el.removeAttribute("tabindex");
            }
          });
        } else {
          slide.setAttribute("aria-hidden", "true");
          slide.removeAttribute("aria-current");
          slide.querySelectorAll(FOCUSABLE_SELECTOR).forEach((el) => {
            const current = el.getAttribute("tabindex");
            if (current !== "-1") {
              if (current !== null) {
                el.setAttribute("data-a11y-tabindex", current);
              }
              el.setAttribute("tabindex", "-1");
            }
          });
        }
      });
    }

    // =========================================================================
    // Alt Text Warnings
    // =========================================================================

    function checkAltText() {
      const currentSlide = deck.getCurrentSlide();
      if (!currentSlide) return;

      const images = currentSlide.querySelectorAll("img");
      images.forEach((img) => {
        const alt = img.getAttribute("alt");
        const hasAlt = alt && alt.trim().length > 0;
        img.classList.toggle(`${CSS_PREFIX}-missing-alt`, !hasAlt);

        const nextSibling = img.nextElementSibling;
        const hasLabel =
          nextSibling &&
          nextSibling.classList.contains(`${CSS_PREFIX}-missing-alt-label`);

        if (!hasAlt && !hasLabel) {
          const label = createElement(
            "span",
            {
              class: `${CSS_PREFIX}-missing-alt-label`,
              "aria-hidden": "true",
            },
            "Missing alt text",
          );
          img.insertAdjacentElement("afterend", label);
        } else if (hasAlt && hasLabel) {
          nextSibling.remove();
        }
      });
    }

    function setupAltTextWarnings() {
      deckOn("slidechanged", checkAltText);
      deckOn("ready", checkAltText);
    }

    // =========================================================================
    // Slide Number Announcements
    // =========================================================================

    function announceSlideChange(event) {
      const slide = event.currentSlide;
      if (!slide) return;

      const indices = deck.getIndices();
      const heading = slide.querySelector("h1, h2, h3, h4, h5, h6");
      const title = heading ? heading.textContent.trim() : "";

      const total = deck.getTotalSlides();
      let message = "Slide " + (indices.h + 1) + " of " + total;
      if (indices.v > 0) {
        message += ", sub-slide " + (indices.v + 1);
      }
      if (title) {
        message += ": " + title;
      }

      announceStatus(message);
    }

    function setupSlideAnnouncements() {
      deckOn("slidechanged", announceSlideChange);
    }

    // =========================================================================
    // Fragment Announcements
    // =========================================================================

    function announceFragmentShown(event) {
      const fragment = event.fragment;
      if (!fragment) return;
      const text = fragment.textContent.trim();
      if (text) {
        announceStatus(text);
      }
    }

    function announceFragmentHidden(event) {
      const fragment = event.fragment;
      if (!fragment) return;
      const text = fragment.textContent.trim();
      if (text) {
        announceStatus("Hidden: " + text);
      }
    }

    function setupFragmentAnnouncements() {
      deckOn("fragmentshown", announceFragmentShown);
      deckOn("fragmenthidden", announceFragmentHidden);
    }

    function announceStatus(message) {
      let statusEl = revealElement.querySelector(`.${CSS_PREFIX}-status`);
      if (!statusEl) {
        statusEl = createElement("div", {
          class: `${CSS_PREFIX}-status`,
          "aria-live": "polite",
          "aria-atomic": "true",
          role: "status",
        });
        revealElement.appendChild(statusEl);
      }
      statusEl.textContent = "";
      requestAnimationFrame(() => {
        statusEl.textContent = message;
      });
    }

    // =========================================================================
    // Slide Change Cue (visual and/or audio)
    // =========================================================================

    function setupSlideChangeCue(cue) {
      if (cue.visual) {
        const indicator = createElement("div", {
          class: `${CSS_PREFIX}-slide-change-indicator`,
          "aria-hidden": "true",
        });
        if (storageGet("visual-cue") === "false") {
          indicator.hidden = true;
        }
        document.body.appendChild(indicator);

        const onVisualCue = () => {
          if (indicator.hidden) return;
          indicator.classList.remove(`${CSS_PREFIX}-slide-change-active`);
          void indicator.offsetWidth;
          indicator.classList.add(`${CSS_PREFIX}-slide-change-active`);
        };

        deckOn("slidechanged", onVisualCue);
      }

      if (cue.audio) {
        const ensureAudioContext = () => {
          if (!audioCtx) {
            audioCtx = new AudioContext();
          }
          return audioCtx;
        };

        const playTone = () => {
          if (storageGet("audio-cue") === "false") return;
          const ctx = ensureAudioContext();
          const schedule = () => {
            const now = ctx.currentTime;

            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(660, now);
            oscillator.frequency.setValueAtTime(880, now + 0.06);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

            oscillator.start(now);
            oscillator.stop(now + 0.2);
          };

          if (ctx.state === "suspended") {
            ctx.resume().then(schedule);
          } else {
            schedule();
          }
        };

        primeAudioClick = () => {
          ensureAudioContext();
          if (audioCtx.state === "suspended") {
            audioCtx.resume();
          }
          document.removeEventListener("click", primeAudioClick);
          document.removeEventListener("keydown", primeAudioKeydown);
        };
        primeAudioKeydown = primeAudioClick;
        document.addEventListener("click", primeAudioClick);
        document.addEventListener("keydown", primeAudioKeydown);

        deckOn("slidechanged", playTone);
      }
    }

    // =========================================================================
    // Transcript View
    // =========================================================================

    function escapeHtml(text) {
      const el = document.createElement("span");
      el.textContent = text;
      return el.innerHTML;
    }

    function getSlideContent(slide) {
      const transcriptDiv = slide.querySelector(":scope > .transcript");
      if (transcriptDiv) {
        return transcriptDiv.innerHTML;
      }

      const clone = slide.cloneNode(true);
      clone.querySelectorAll("aside.notes").forEach((el) => el.remove());
      clone.querySelectorAll(".transcript").forEach((el) => el.remove());
      clone
        .querySelectorAll('[aria-hidden="true"]')
        .forEach((el) => el.remove());
      clone
        .querySelectorAll(".slide-background")
        .forEach((el) => el.remove());

      const heading = clone.querySelector("h1, h2, h3, h4, h5, h6");
      if (heading) heading.remove();

      const content = clone.innerHTML.trim();
      if (!content) {
        return '<p class="no-content">(No content on this slide.)</p>';
      }
      return content;
    }

    function buildTranscript() {
      const title =
        document.title ||
        (revealElement.querySelector(".slides h1") || {}).textContent ||
        "Presentation";

      let html = "<h1>" + escapeHtml(title) + "</h1>";
      let slideNumber = 0;

      const topSections = revealElement.querySelectorAll(
        ".slides > section",
      );
      topSections.forEach((section) => {
        const nested = section.querySelectorAll(":scope > section");
        if (nested.length > 0) {
          nested.forEach((sub) => {
            slideNumber++;
            const heading = sub.querySelector("h1, h2, h3, h4, h5, h6");
            const slideTitle = heading
              ? escapeHtml(heading.textContent.trim())
              : "Slide " + slideNumber;
            html +=
              "<article><h3>" +
              slideTitle +
              "</h3>" +
              getSlideContent(sub) +
              "</article>";
          });
        } else {
          slideNumber++;
          const heading = section.querySelector("h1, h2, h3, h4, h5, h6");
          const slideTitle = heading
            ? escapeHtml(heading.textContent.trim())
            : "Slide " + slideNumber;
          html +=
            "<article><h2>" +
            slideTitle +
            "</h2>" +
            getSlideContent(section) +
            "</article>";
        }
      });

      return html;
    }

    function openTranscript() {
      transcriptOpen = true;
      transcriptPreviousFocus = document.activeElement;
      transcriptPreviousKeyboard = deck.getConfig().keyboard;
      deck.configure({ keyboard: false });

      const overlay = createElement("div", {
        class: `${CSS_PREFIX}-transcript`,
        role: "document",
        "aria-label": "Presentation transcript",
      });

      const header = createElement("div", {
        class: `${CSS_PREFIX}-transcript-header`,
      });
      const closeBtn = createElement(
        "button",
        {
          class: `${CSS_PREFIX}-transcript-close`,
          "aria-label": "Close transcript",
        },
        "\u00D7",
      );
      closeBtn.addEventListener("click", closeTranscript);
      header.appendChild(
        createElement("span", {}, "Transcript"),
      );
      header.appendChild(closeBtn);
      overlay.appendChild(header);

      const body = createElement("div", {
        class: `${CSS_PREFIX}-transcript-body`,
      });
      body.innerHTML = buildTranscript();
      overlay.appendChild(body);

      transcriptKeyHandler = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeTranscript();
          return;
        }

        if (e.key === "Tab") {
          const focusable = getFocusableElements(overlay);
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener("keydown", transcriptKeyHandler);

      document.body.appendChild(overlay);
      closeBtn.focus();
      announceStatus("Transcript view opened");
    }

    function closeTranscript() {
      const overlay = document.querySelector(`.${CSS_PREFIX}-transcript`);
      if (overlay) overlay.remove();

      if (transcriptKeyHandler) {
        document.removeEventListener("keydown", transcriptKeyHandler);
        transcriptKeyHandler = null;
      }

      if (transcriptPreviousKeyboard !== null) {
        deck.configure({ keyboard: transcriptPreviousKeyboard });
        transcriptPreviousKeyboard = null;
      }

      if (transcriptPreviousFocus) {
        transcriptPreviousFocus.focus();
        transcriptPreviousFocus = null;
      }

      transcriptOpen = false;
      announceStatus("Transcript view closed");
    }

    function toggleTranscript() {
      if (transcriptOpen) {
        closeTranscript();
      } else {
        openTranscript();
      }
    }

    function setupPrintTranscript() {
      const topSections = revealElement.querySelectorAll(
        ".slides > section",
      );
      topSections.forEach((section) => {
        const nested = section.querySelectorAll(":scope > section");
        const targets = nested.length > 0 ? nested : [section];
        targets.forEach((slide) => {
          if (slide.querySelector(":scope > .transcript")) return;
          const div = document.createElement("div");
          div.className = "transcript";
          div.innerHTML = getSlideContent(slide);
          slide.appendChild(div);
        });
      });
    }

    function setupTranscript() {
      deck.addKeyBinding(
        { keyCode: 84, key: "T", description: "Open/close transcript view" },
        toggleTranscript,
      );

      const printEnabled =
        storageGet("transcript-print") === "true" || config.transcript.print;
      if (printEnabled && /print-pdf/i.test(window.location.search)) {
        setupPrintTranscript();
      }
    }

    // =========================================================================
    // Local Font Picker (progressive enhancement, Chromium only)
    // =========================================================================

    async function openLocalFontPicker() {
      if (!("queryLocalFonts" in window)) {
        announceStatus(
          "Local font picker is not supported in this browser",
        );
        return;
      }

      try {
        const fonts = await window.queryLocalFonts();
        const families = [
          ...new Set(fonts.map((f) => f.family)),
        ].sort();

        if (families.length === 0) {
          announceStatus("No local fonts found");
          return;
        }

        const dialog = createElement("dialog", {
          class: `${CSS_PREFIX}-font-dialog`,
          "aria-label": "Select a local font",
        });

        const heading = createElement("h3", {}, "Select a local font");
        dialog.appendChild(heading);

        const search = createElement("input", {
          type: "search",
          placeholder: "Search fonts\u2026",
          class: `${CSS_PREFIX}-font-search`,
          "aria-label": "Search fonts",
        });
        dialog.appendChild(search);

        const list = createElement("ul", {
          class: `${CSS_PREFIX}-font-list`,
          role: "listbox",
          "aria-label": "Available fonts",
        });

        families.forEach((family) => {
          const item = createElement("li", {
            role: "option",
            tabindex: "0",
            "data-font": family,
            style: "font-family: '" + family + "'",
          });
          item.textContent = family;
          item.addEventListener("click", () => {
            applyLocalFont(family);
            dialog.close();
          });
          item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              applyLocalFont(family);
              dialog.close();
            }
          });
          list.appendChild(item);
        });

        dialog.appendChild(list);

        const closeBtn = createElement(
          "button",
          { class: `${CSS_PREFIX}-font-dialog-close`, "aria-label": "Close" },
          "Close",
        );
        closeBtn.addEventListener("click", () => {
          dialog.close();
        });
        dialog.appendChild(closeBtn);

        search.addEventListener("input", () => {
          const query = search.value.toLowerCase();
          Array.from(list.children).forEach((li) => {
            const matches = li.getAttribute("data-font").toLowerCase().includes(query);
            li.style.display = matches ? "" : "none";
          });
        });

        dialog.addEventListener("close", () => dialog.remove());

        document.body.appendChild(dialog);
        dialog.showModal();
        search.focus();
      } catch (_e) {
        announceStatus("Could not access local fonts");
      }
    }

    function applyLocalFont(family) {
      revealElement.style.setProperty("--a11y-font-override", "'" + family + "'");
      revealElement.classList.add(`${CSS_PREFIX}-font-override`);
      currentFontFamilyIndex = -1;
      storageSet("local-font", family);
      storageSet("font-family", "-1");
      announceStatus("Font: " + family);
    }

    // =========================================================================
    // Menu State Synchronisation
    // =========================================================================

    function syncMenuState() {
      const menu = document.getElementById("revealjs-a11y-menu");
      if (!menu) return;

      const hcSwitch = menu.querySelector('[data-setting="high-contrast"]');
      if (hcSwitch) {
        const active = revealElement.classList.contains(
          `${CSS_PREFIX}-high-contrast`,
        );
        hcSwitch.setAttribute("aria-checked", String(active));
      }

      const lhSwitch = menu.querySelector('[data-setting="link-highlight"]');
      if (lhSwitch) {
        const active = revealElement.classList.contains(
          `${CSS_PREFIX}-link-highlight`,
        );
        lhSwitch.setAttribute("aria-checked", String(active));
      }

      const fsRange = menu.querySelector('[data-setting="font-size"]');
      if (fsRange) {
        fsRange.value = String(currentFontSize);
        fsRange.setAttribute("aria-valuenow", String(currentFontSize));
        fsRange.setAttribute("aria-valuetext", currentFontSize + "%");
        const label = menu.querySelector('[data-label="font-size"]');
        if (label) label.textContent = currentFontSize + "%";
      }

      const ffSelect = menu.querySelector('[data-setting="font-family"]');
      if (ffSelect) {
        ffSelect.value = String(currentFontFamilyIndex);
      }

      const lhRange = menu.querySelector('[data-setting="line-height"]');
      if (lhRange) {
        const lhText =
          currentLineHeight === 0
            ? "Default"
            : (1.2 + currentLineHeight * 0.2).toFixed(1);
        lhRange.value = String(currentLineHeight);
        lhRange.setAttribute("aria-valuenow", String(currentLineHeight));
        lhRange.setAttribute("aria-valuetext", lhText);
        const label = menu.querySelector('[data-label="line-height"]');
        if (label) label.textContent = lhText;
      }

      const lsRange = menu.querySelector('[data-setting="letter-spacing"]');
      if (lsRange) {
        const lsText =
          currentLetterSpacing === 0
            ? "Default"
            : "+" + (currentLetterSpacing * 0.5).toFixed(1) + "px";
        lsRange.value = String(currentLetterSpacing);
        lsRange.setAttribute("aria-valuenow", String(currentLetterSpacing));
        lsRange.setAttribute("aria-valuetext", lsText);
        const label = menu.querySelector('[data-label="letter-spacing"]');
        if (label) label.textContent = lsText;
      }

      const wsRange = menu.querySelector('[data-setting="word-spacing"]');
      if (wsRange) {
        const wsText =
          currentWordSpacing === 0
            ? "Default"
            : "+" + (currentWordSpacing * 0.5).toFixed(1) + "px";
        wsRange.value = String(currentWordSpacing);
        wsRange.setAttribute("aria-valuenow", String(currentWordSpacing));
        wsRange.setAttribute("aria-valuetext", wsText);
        const label = menu.querySelector('[data-label="word-spacing"]');
        if (label) label.textContent = wsText;
      }

      const overlaySelect = menu.querySelector(
        '[data-setting="colour-overlay"]',
      );
      if (overlaySelect) {
        overlaySelect.value = storageGet("colour-overlay") || "none";
      }

      const vcSwitch = menu.querySelector(
        '[data-setting="visual-cue"]',
      );
      if (vcSwitch) {
        vcSwitch.setAttribute(
          "aria-checked",
          String(storageGet("visual-cue") !== "false"),
        );
      }

      const acSwitch = menu.querySelector(
        '[data-setting="audio-cue"]',
      );
      if (acSwitch) {
        acSwitch.setAttribute(
          "aria-checked",
          String(storageGet("audio-cue") !== "false"),
        );
      }

      const tpSwitch = menu.querySelector(
        '[data-setting="transcript-print"]',
      );
      if (tpSwitch) {
        const active =
          storageGet("transcript-print") === "true" ||
          config.transcript.print;
        tpSwitch.setAttribute("aria-checked", String(active));
      }
    }

    // =========================================================================
    // Accessibility Settings Menu
    // =========================================================================

    function createSwitch(id, label, settingKey, checked) {
      const row = createElement("div", { class: `${CSS_PREFIX}-menu-row` });
      const lbl = createElement(
        "span",
        { class: `${CSS_PREFIX}-menu-label`, id: `${CSS_PREFIX}-label-${id}` },
        label,
      );
      const btn = createElement("button", {
        role: "switch",
        "aria-checked": String(checked),
        "aria-labelledby": `${CSS_PREFIX}-label-${id}`,
        "data-setting": settingKey,
        class: `${CSS_PREFIX}-menu-switch`,
      });
      const track = createElement("span", {
        class: `${CSS_PREFIX}-menu-switch-track`,
        "aria-hidden": "true",
      });
      const thumb = createElement("span", {
        class: `${CSS_PREFIX}-menu-switch-thumb`,
        "aria-hidden": "true",
      });
      track.appendChild(thumb);
      btn.appendChild(track);
      row.appendChild(lbl);
      row.appendChild(btn);
      return row;
    }

    function createRange(id, label, settingKey, min, max, step, value, formatValue) {
      const row = createElement("div", { class: `${CSS_PREFIX}-menu-row` });
      const lbl = createElement(
        "label",
        { for: `${CSS_PREFIX}-input-${id}`, class: `${CSS_PREFIX}-menu-label` },
        label,
      );
      const valueLabel = createElement(
        "span",
        {
          class: `${CSS_PREFIX}-menu-value`,
          "data-label": settingKey,
          "aria-hidden": "true",
        },
        formatValue(value),
      );
      const input = createElement("input", {
        type: "range",
        id: `${CSS_PREFIX}-input-${id}`,
        "data-setting": settingKey,
        min: String(min),
        max: String(max),
        step: String(step),
        value: String(value),
        "aria-valuemin": String(min),
        "aria-valuemax": String(max),
        "aria-valuenow": String(value),
        "aria-valuetext": formatValue(value),
        class: `${CSS_PREFIX}-menu-range`,
      });
      row.appendChild(lbl);
      row.appendChild(valueLabel);
      row.appendChild(input);
      return row;
    }

    function createSelect(id, label, settingKey, options, selectedIndex) {
      const row = createElement("div", { class: `${CSS_PREFIX}-menu-row` });
      const lbl = createElement(
        "label",
        { for: `${CSS_PREFIX}-input-${id}`, class: `${CSS_PREFIX}-menu-label` },
        label,
      );
      const select = createElement("select", {
        id: `${CSS_PREFIX}-input-${id}`,
        "data-setting": settingKey,
        class: `${CSS_PREFIX}-menu-select`,
      });
      options.forEach((opt, i) => {
        const option = createElement("option", { value: String(i) }, opt.name);
        if (i === selectedIndex) option.selected = true;
        select.appendChild(option);
      });
      row.appendChild(lbl);
      row.appendChild(select);
      return row;
    }

    function getFocusableElements(container) {
      return Array.from(
        container.querySelectorAll(
          'button, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.disabled && el.offsetParent !== null);
    }

    function menuKeyHandler(e) {
      const menu = document.getElementById("revealjs-a11y-menu");
      if (!menu) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        return;
      }

      // Focus trap on Tab
      if (e.key === "Tab") {
        const focusable = getFocusableElements(menu);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    function openMenu() {
      if (menuOpen) return;

      const menu = document.getElementById("revealjs-a11y-menu");
      const backdrop = document.querySelector(`.${CSS_PREFIX}-menu-backdrop`);
      if (!menu) return;

      menuPreviousFocus = document.activeElement;
      menuOpen = true;

      syncMenuState();

      menu.setAttribute("aria-hidden", "false");
      if (backdrop) backdrop.setAttribute("aria-hidden", "false");

      menuPreviousKeyboard = deck.getConfig().keyboard;
      deck.configure({ keyboard: false });

      const closeBtn = menu.querySelector(`.${CSS_PREFIX}-menu-close`);
      if (closeBtn) closeBtn.focus();

      menu.addEventListener("keydown", menuKeyHandler);
    }

    function closeMenu() {
      const menu = document.getElementById("revealjs-a11y-menu");
      const backdrop = document.querySelector(`.${CSS_PREFIX}-menu-backdrop`);
      if (!menu) return;

      menuOpen = false;

      menu.setAttribute("aria-hidden", "true");
      if (backdrop) backdrop.setAttribute("aria-hidden", "true");

      if (menuPreviousKeyboard !== null) {
        deck.configure({ keyboard: menuPreviousKeyboard });
      }
      menuPreviousKeyboard = null;

      menu.removeEventListener("keydown", menuKeyHandler);

      if (menuPreviousFocus && menuPreviousFocus.focus) {
        menuPreviousFocus.focus();
      }
      menuPreviousFocus = null;
    }

    function toggleMenu() {
      if (menuOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    function setupMenu(menuConfig) {
      // Backdrop
      const backdrop = createElement("div", {
        class: `${CSS_PREFIX}-menu-backdrop`,
        "aria-hidden": "true",
      });
      backdrop.addEventListener("click", closeMenu);
      document.body.appendChild(backdrop);

      // Menu panel
      const posClass =
        menuConfig.position === "left" ? `${CSS_PREFIX}-menu--left` : "";
      const menu = createElement("aside", {
        class: `${CSS_PREFIX}-menu` + (posClass ? " " + posClass : ""),
        id: "revealjs-a11y-menu",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": `${CSS_PREFIX}-menu-title`,
        "aria-hidden": "true",
        tabindex: "-1",
      });

      // Header
      const header = createElement("div", {
        class: `${CSS_PREFIX}-menu-header`,
      });
      const title = createElement(
        "h2",
        { id: `${CSS_PREFIX}-menu-title` },
        "Accessibility Settings",
      );
      const closeBtn = createElement("button", {
        class: `${CSS_PREFIX}-menu-close`,
        "aria-label": "Close accessibility settings",
      });
      closeBtn.textContent = "\u00D7";
      closeBtn.addEventListener("click", closeMenu);
      header.appendChild(title);
      header.appendChild(closeBtn);
      menu.appendChild(header);

      // Body
      const body = createElement("div", {
        class: `${CSS_PREFIX}-menu-body`,
      });

      // --- Display group ---
      {
        const fieldset = createElement("fieldset", {
          class: `${CSS_PREFIX}-menu-group`,
        });
        fieldset.appendChild(createElement("legend", {}, "Display"));

        {
          const hcActive = revealElement.classList.contains(
            `${CSS_PREFIX}-high-contrast`,
          );
          const row = createSwitch("hc", "High contrast", "high-contrast", hcActive);
          const btn = row.querySelector('[data-setting="high-contrast"]');
          btn.addEventListener("click", () => {
            const current = btn.getAttribute("aria-checked") === "true";
            setHighContrast(!current);
          });
          fieldset.appendChild(row);
        }

        {
          const lhActive = revealElement.classList.contains(
            `${CSS_PREFIX}-link-highlight`,
          );
          const row = createSwitch(
            "lh",
            "Underline links",
            "link-highlight",
            lhActive,
          );
          const btn = row.querySelector('[data-setting="link-highlight"]');
          btn.addEventListener("click", () => {
            const current = btn.getAttribute("aria-checked") === "true";
            setLinkHighlight(!current);
          });
          fieldset.appendChild(row);
        }

        // Colour overlay
        const overlayOptions = [
          { name: "None", value: "none" },
          { name: "Yellow", value: "rgba(255, 255, 0, 0.15)" },
          { name: "Blue", value: "rgba(0, 100, 255, 0.1)" },
          { name: "Pink", value: "rgba(255, 100, 150, 0.12)" },
          { name: "Green", value: "rgba(0, 200, 100, 0.1)" },
        ];
        const overlayRow = createElement("div", {
          class: `${CSS_PREFIX}-menu-row`,
        });
        const overlayLabel = createElement(
          "label",
          {
            for: `${CSS_PREFIX}-input-overlay`,
            class: `${CSS_PREFIX}-menu-label`,
          },
          "Colour overlay",
        );
        const overlaySelect = createElement("select", {
          id: `${CSS_PREFIX}-input-overlay`,
          "data-setting": "colour-overlay",
          class: `${CSS_PREFIX}-menu-select`,
        });
        const storedOverlay = storageGet("colour-overlay") || "none";
        overlayOptions.forEach((opt) => {
          const option = createElement(
            "option",
            { value: opt.value },
            opt.name,
          );
          if (opt.value === storedOverlay) option.selected = true;
          overlaySelect.appendChild(option);
        });
        overlaySelect.addEventListener("change", () => {
          const val = overlaySelect.value;
          if (val === "none") {
            revealElement.classList.remove(`${CSS_PREFIX}-colour-overlay`);
            revealElement.style.removeProperty("--a11y-overlay-colour");
            storageSet("colour-overlay", "none");
            announceStatus("Colour overlay removed");
          } else {
            revealElement.style.setProperty("--a11y-overlay-colour", val);
            revealElement.classList.add(`${CSS_PREFIX}-colour-overlay`);
            storageSet("colour-overlay", val);
            const name = overlayOptions.find((o) => o.value === val);
            announceStatus(
              "Colour overlay: " + (name ? name.name : "custom"),
            );
          }
        });
        overlayRow.appendChild(overlayLabel);
        overlayRow.appendChild(overlaySelect);
        fieldset.appendChild(overlayRow);

        body.appendChild(fieldset);
      }

      // --- Typography group ---
      const hasTypography =
        config.fontSizeControls || config.fontSelection || config.textSpacing;
      if (hasTypography) {
        const fieldset = createElement("fieldset", {
          class: `${CSS_PREFIX}-menu-group`,
        });
        fieldset.appendChild(createElement("legend", {}, "Typography"));

        if (config.fontSizeControls) {
          const row = createRange(
            "fs",
            "Font size",
            "font-size",
            config.fontSizeMin,
            config.fontSizeMax,
            config.fontSizeStep,
            currentFontSize,
            (v) => v + "%",
          );
          const input = row.querySelector('[data-setting="font-size"]');
          input.addEventListener("input", () => {
            const val = parseInt(input.value, 10);
            setFontSize(val);
          });
          fieldset.appendChild(row);
        }

        if (config.fontSelection) {
          const row = createSelect(
            "ff",
            "Font family",
            "font-family",
            config.fontFamilies,
            currentFontFamilyIndex >= 0 ? currentFontFamilyIndex : 0,
          );
          const select = row.querySelector('[data-setting="font-family"]');
          select.addEventListener("change", () => {
            selectFontByIndex(parseInt(select.value, 10));
          });
          fieldset.appendChild(row);

          if ("queryLocalFonts" in window) {
            const localRow = createElement("div", {
              class: `${CSS_PREFIX}-menu-row`,
            });
            const localBtn = createElement(
              "button",
              {
                class: `${CSS_PREFIX}-menu-local-font`,
                "aria-label": "Choose a font installed on your system",
              },
              "System fonts\u2026",
            );
            localBtn.addEventListener("click", () => {
              closeMenu();
              openLocalFontPicker();
            });
            localRow.appendChild(localBtn);
            fieldset.appendChild(localRow);
          }
        }

        if (config.textSpacing) {
          const lhRow = createRange(
            "lh-spacing",
            "Line height",
            "line-height",
            0,
            4,
            1,
            currentLineHeight,
            (v) =>
              parseInt(v, 10) === 0
                ? "Default"
                : (1.2 + parseInt(v, 10) * 0.2).toFixed(1),
          );
          const lhInput = lhRow.querySelector('[data-setting="line-height"]');
          lhInput.addEventListener("input", () => {
            currentLineHeight = parseInt(lhInput.value, 10);
            applyTextSpacing();
            if (currentLineHeight === 0) {
              announceStatus("Line height reset to default");
            } else {
              announceStatus(
                "Line height: " +
                  (1.2 + currentLineHeight * 0.2).toFixed(1),
              );
            }
            syncMenuState();
          });
          fieldset.appendChild(lhRow);

          const lsRow = createRange(
            "ls-spacing",
            "Letter spacing",
            "letter-spacing",
            0,
            4,
            1,
            currentLetterSpacing,
            (v) =>
              parseInt(v, 10) === 0
                ? "Default"
                : "+" + (parseInt(v, 10) * 0.5).toFixed(1) + "px",
          );
          const lsInput = lsRow.querySelector(
            '[data-setting="letter-spacing"]',
          );
          lsInput.addEventListener("input", () => {
            currentLetterSpacing = parseInt(lsInput.value, 10);
            applyTextSpacing();
            if (currentLetterSpacing === 0) {
              announceStatus("Letter spacing reset to default");
            } else {
              announceStatus(
                "Letter spacing: +" +
                  (currentLetterSpacing * 0.5).toFixed(1) +
                  "px",
              );
            }
            syncMenuState();
          });
          fieldset.appendChild(lsRow);

          const wsRow = createRange(
            "ws-spacing",
            "Word spacing",
            "word-spacing",
            0,
            4,
            1,
            currentWordSpacing,
            (v) =>
              parseInt(v, 10) === 0
                ? "Default"
                : "+" + (parseInt(v, 10) * 0.5).toFixed(1) + "px",
          );
          const wsInput = wsRow.querySelector(
            '[data-setting="word-spacing"]',
          );
          wsInput.addEventListener("input", () => {
            currentWordSpacing = parseInt(wsInput.value, 10);
            applyTextSpacing();
            if (currentWordSpacing === 0) {
              announceStatus("Word spacing reset to default");
            } else {
              announceStatus(
                "Word spacing: +" +
                  (currentWordSpacing * 0.5).toFixed(1) +
                  "px",
              );
            }
            syncMenuState();
          });
          fieldset.appendChild(wsRow);
        }

        body.appendChild(fieldset);
      }

      // --- Motion & Cues group ---
      const hasCues =
        config.slideChangeCue.visual || config.slideChangeCue.audio;
      if (hasCues) {
        const fieldset = createElement("fieldset", {
          class: `${CSS_PREFIX}-menu-group`,
        });
        fieldset.appendChild(createElement("legend", {}, "Motion and Cues"));

        if (config.slideChangeCue.visual) {
          const indicator = document.querySelector(
            `.${CSS_PREFIX}-slide-change-indicator`,
          );
          const active = indicator !== null && !indicator.hidden;
          const row = createSwitch(
            "vc",
            "Visual slide cue",
            "visual-cue",
            active,
          );
          const btn = row.querySelector('[data-setting="visual-cue"]');
          btn.addEventListener("click", () => {
            const ind = document.querySelector(
              `.${CSS_PREFIX}-slide-change-indicator`,
            );
            if (ind) {
              ind.hidden = !ind.hidden;
              storageSet("visual-cue", String(!ind.hidden));
              btn.setAttribute("aria-checked", String(!ind.hidden));
              announceStatus(
                ind.hidden
                  ? "Visual slide cue disabled"
                  : "Visual slide cue enabled",
              );
            }
          });
          fieldset.appendChild(row);
        }

        if (config.slideChangeCue.audio) {
          const audioActive = storageGet("audio-cue") !== "false";
          const row = createSwitch(
            "ac",
            "Audio slide cue",
            "audio-cue",
            audioActive,
          );
          const btn = row.querySelector('[data-setting="audio-cue"]');
          btn.addEventListener("click", () => {
            const current = btn.getAttribute("aria-checked") === "true";
            btn.setAttribute("aria-checked", String(!current));
            storageSet("audio-cue", String(!current));
            announceStatus(
              !current
                ? "Audio slide cue enabled"
                : "Audio slide cue disabled",
            );
          });
          fieldset.appendChild(row);
        }

        body.appendChild(fieldset);
      }

      // --- Tools group ---
      {
        const hasTools = config.transcript.enabled;
        if (hasTools) {
          const fieldset = createElement("fieldset", {
            class: `${CSS_PREFIX}-menu-group`,
          });
          fieldset.appendChild(createElement("legend", {}, "Tools"));

          if (config.transcript.enabled) {
            const transcriptBtn = createElement(
              "button",
              {
                class: `${CSS_PREFIX}-menu-action`,
                "aria-label": "Open slide transcript",
              },
              "Open transcript",
            );
            transcriptBtn.addEventListener("click", () => {
              closeMenu();
              openTranscript();
            });
            const row = createElement("div", {
              class: `${CSS_PREFIX}-menu-row`,
            });
            row.appendChild(transcriptBtn);
            fieldset.appendChild(row);

            const printActive =
              storageGet("transcript-print") === "true" ||
              config.transcript.print;
            const printRow = createSwitch(
              "tp",
              "Print transcript",
              "transcript-print",
              printActive,
            );
            const printBtn = printRow.querySelector(
              '[data-setting="transcript-print"]',
            );
            printBtn.addEventListener("click", () => {
              const current =
                printBtn.getAttribute("aria-checked") === "true";
              printBtn.setAttribute("aria-checked", String(!current));
              storageSet("transcript-print", String(!current));
              announceStatus(
                !current
                  ? "Transcript will be included in print"
                  : "Transcript excluded from print",
              );
            });
            fieldset.appendChild(printRow);
          }

          body.appendChild(fieldset);
        }
      }

      menu.appendChild(body);

      // Footer
      const footer = createElement("div", {
        class: `${CSS_PREFIX}-menu-footer`,
      });
      const resetBtn = createElement(
        "button",
        { class: `${CSS_PREFIX}-menu-reset` },
        "Reset All",
      );
      resetBtn.addEventListener("click", () => {
        resetAllPreferences();
      });
      footer.appendChild(resetBtn);
      menu.appendChild(footer);

      document.body.appendChild(menu);

      // Open menu via Reveal.js key binding; Escape closes it.
      const shortcutKey = menuConfig.shortcut.toUpperCase();
      deck.addKeyBinding(
        {
          keyCode: shortcutKey.charCodeAt(0),
          key: shortcutKey,
          description: "Toggle accessibility settings menu",
        },
        toggleMenu,
      );

    }

    // =========================================================================
    // Slide Menu Accessibility (patches bundled reveal.js-menu plugin)
    // =========================================================================

    function setupSlideMenuA11y() {
      slideMenuObserver = new MutationObserver((_mutations, obs) => {
        const nav = document.querySelector(
          ".slide-menu-wrapper nav.slide-menu",
        );
        if (!nav) return;
        obs.disconnect();
        slideMenuObserver = null;

        nav.setAttribute("aria-label", "Slide navigation menu");

        const toolbar = nav.querySelector("ol.slide-menu-toolbar");
        if (toolbar) {
          toolbar.setAttribute("role", "tablist");
          toolbar
            .querySelectorAll("li.toolbar-panel-button")
            .forEach((li) => {
              li.setAttribute("role", "tab");
              li.setAttribute("tabindex", "0");
              const label = li.querySelector(".slide-menu-toolbar-label");
              if (label) {
                li.setAttribute("aria-label", label.textContent);
              }
            });
        }

        nav.querySelectorAll(".slide-menu-items").forEach((ul) => {
          ul.setAttribute("role", "menu");
        });
        nav.querySelectorAll(".slide-menu-item").forEach((li) => {
          li.setAttribute("role", "menuitem");
          li.setAttribute("tabindex", "0");
          const title = li.querySelector(".slide-menu-item-title");
          if (title) {
            li.setAttribute(
              "aria-label",
              "Go to slide: " + title.textContent,
            );
          }
        });

        nav.querySelectorAll(".slide-tool-item a").forEach((a) => {
          a.setAttribute("role", "button");
        });

        const wrapper = document.querySelector(".slide-menu-wrapper");
        if (wrapper) {
          wrapper.inert = true;

          slideMenuClassObserver = new MutationObserver(() => {
            const isOpen = nav.classList.contains("active");
            wrapper.inert = !isOpen;
            if (isOpen) {
              const firstItem = nav.querySelector(
                '[role="tab"], [role="menuitem"]',
              );
              if (firstItem) {
                requestAnimationFrame(() => firstItem.focus());
              }
            } else {
              requestAnimationFrame(() => {
                const current = deck.getCurrentSlide();
                if (current) {
                  current.setAttribute("tabindex", "-1");
                  current.focus();
                }
              });
            }
          });
          slideMenuClassObserver.observe(nav, {
            attributes: true,
            attributeFilter: ["class"],
          });
        }
      });

      slideMenuObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      setTimeout(() => {
        if (slideMenuObserver) {
          slideMenuObserver.disconnect();
          slideMenuObserver = null;
        }
      }, 5000);
    }

    // =========================================================================
    // Reset All Preferences
    // =========================================================================

    function resetAllPreferences() {
      revealElement.classList.remove(
        `${CSS_PREFIX}-high-contrast`,
        `${CSS_PREFIX}-link-highlight`,
        `${CSS_PREFIX}-font-override`,
        `${CSS_PREFIX}-line-height-override`,
        `${CSS_PREFIX}-letter-spacing-override`,
        `${CSS_PREFIX}-word-spacing-override`,
        `${CSS_PREFIX}-colour-overlay`,
      );
      revealElement.style.removeProperty("--a11y-font-override");
      revealElement.style.removeProperty("--a11y-line-height");
      revealElement.style.removeProperty("--a11y-letter-spacing");
      revealElement.style.removeProperty("--a11y-word-spacing");
      revealElement.style.removeProperty("--a11y-overlay-colour");

      currentFontSize = 100;
      currentFontFamilyIndex = 0;
      currentLineHeight = 0;
      currentLetterSpacing = 0;
      currentWordSpacing = 0;

      const container = getSlidesContainer();
      if (container) {
        container.style.fontSize = "";
      }

      const keys = [
        "high-contrast",
        "link-highlight",
        "font-size",
        "font-family",
        "local-font",
        "line-height",
        "letter-spacing",
        "word-spacing",
        "colour-overlay",
        "visual-cue",
        "audio-cue",
        "transcript-print",
      ];
      keys.forEach((key) => {
        try {
          localStorage.removeItem(STORAGE_PREFIX + key);
        } catch (_e) {
          // Ignore.
        }
      });

      const visualIndicator = document.querySelector(
        `.${CSS_PREFIX}-slide-change-indicator`,
      );
      if (visualIndicator) visualIndicator.hidden = false;

      if (config.highContrast) {
        revealElement.classList.add(`${CSS_PREFIX}-high-contrast`);
      }
      if (config.linkHighlight) {
        revealElement.classList.add(`${CSS_PREFIX}-link-highlight`);
      }

      announceStatus("All accessibility preferences reset");
      syncMenuState();
    }

    // =========================================================================
    // Plugin Entry Point
    // =========================================================================

    return {
      id: "revealjs-a11y",

      init: (reveal) => {
        deck = reveal;
        config = resolveConfig(deck.getConfig());
        revealElement = deck.getRevealElement();

        if (config.skipNavigation) setupSkipNavigation();
        if (config.focusIndicators) setupFocusIndicators();
        if (config.reducedMotion) setupReducedMotion();
        setupHighContrast();
        if (config.fontSizeControls) setupFontSizeControls();
        if (config.fontSelection) setupFontSelection();
        if (config.textSpacing) setupTextSpacing();
        setupLinkHighlight();
        if (config.slideLandmarks) setupSlideLandmarks();
        if (config.altTextWarnings) setupAltTextWarnings();
        if (config.announceSlideNumbers) setupSlideAnnouncements();
        if (config.announceFragments) setupFragmentAnnouncements();
        if (config.slideChangeCue.visual || config.slideChangeCue.audio) {
          setupSlideChangeCue(config.slideChangeCue);
        }
        if (config.transcript.enabled) setupTranscript();

        // Restore local font if one was previously selected.
        const storedLocalFont = storageGet("local-font");
        const storedFamilyIdx = storageGet("font-family");
        if (storedLocalFont && storedFamilyIdx === "-1") {
          applyLocalFont(storedLocalFont);
        }

        // Restore colour overlay if one was previously selected.
        const storedOverlay = storageGet("colour-overlay");
        if (storedOverlay && storedOverlay !== "none") {
          revealElement.style.setProperty(
            "--a11y-overlay-colour",
            storedOverlay,
          );
          revealElement.classList.add(`${CSS_PREFIX}-colour-overlay`);
        }

        if (config.menu.enabled) setupMenu(config.menu);
        if (config.slideMenuA11y) setupSlideMenuA11y();
      },

      destroy: () => {
        const skipLink = revealElement.querySelector(
          `.${CSS_PREFIX}-skip-link`,
        );
        if (skipLink) skipLink.remove();

        const statusEl = revealElement.querySelector(`.${CSS_PREFIX}-status`);
        if (statusEl) statusEl.remove();

        revealElement.classList.remove(
          `${CSS_PREFIX}-focus-indicators`,
          `${CSS_PREFIX}-reduced-motion`,
          `${CSS_PREFIX}-high-contrast`,
          `${CSS_PREFIX}-link-highlight`,
          `${CSS_PREFIX}-font-override`,
          `${CSS_PREFIX}-line-height-override`,
          `${CSS_PREFIX}-letter-spacing-override`,
          `${CSS_PREFIX}-word-spacing-override`,
          `${CSS_PREFIX}-colour-overlay`,
        );
        revealElement.style.removeProperty("--a11y-font-override");
        revealElement.style.removeProperty("--a11y-line-height");
        revealElement.style.removeProperty("--a11y-letter-spacing");
        revealElement.style.removeProperty("--a11y-word-spacing");
        revealElement.style.removeProperty("--a11y-overlay-colour");

        const container = getSlidesContainer();
        if (container) {
          container.style.fontSize = "";
        }

        revealElement
          .querySelectorAll(`.${CSS_PREFIX}-missing-alt-label`)
          .forEach((el) => el.remove());
        revealElement
          .querySelectorAll(`.${CSS_PREFIX}-missing-alt`)
          .forEach((el) => el.classList.remove(`${CSS_PREFIX}-missing-alt`));

        revealElement
          .querySelectorAll(".slides > section, .slides > section > section")
          .forEach((slide) => {
            slide.removeAttribute("aria-hidden");
            slide.removeAttribute("aria-current");
            slide.querySelectorAll("[data-a11y-tabindex]").forEach((el) => {
              el.setAttribute("tabindex", el.getAttribute("data-a11y-tabindex"));
              el.removeAttribute("data-a11y-tabindex");
            });
          });

        const changeIndicator = document.body.querySelector(
          `.${CSS_PREFIX}-slide-change-indicator`,
        );
        if (changeIndicator) changeIndicator.remove();

        if (transcriptOpen) closeTranscript();
        transcriptOpen = false;
        transcriptPreviousFocus = null;
        transcriptPreviousKeyboard = null;

        document
          .querySelectorAll("link[data-revealjs-a11y-font]")
          .forEach((el) => el.remove());

        const fontDialog = document.querySelector(
          `.${CSS_PREFIX}-font-dialog`,
        );
        if (fontDialog) fontDialog.remove();

        if (menuOpen) {
          if (menuPreviousKeyboard !== null) {
            deck.configure({ keyboard: menuPreviousKeyboard });
          }
          menuPreviousKeyboard = null;
          menuOpen = false;
        }

        if (reducedMotionMediaQuery && reducedMotionListener) {
          reducedMotionMediaQuery.removeEventListener(
            "change",
            reducedMotionListener,
          );
        }
        if (reducedMotionPreviousTransitions) {
          deck.configure({
            transition: reducedMotionPreviousTransitions.transition,
            backgroundTransition:
              reducedMotionPreviousTransitions.backgroundTransition,
          });
        }
        reducedMotionMediaQuery = null;
        reducedMotionListener = null;
        reducedMotionPreviousTransitions = null;

        deckHandlers.forEach(({ event, handler }) => {
          deck.off(event, handler);
        });
        deckHandlers.length = 0;

        if (primeAudioClick) {
          document.removeEventListener("click", primeAudioClick);
          document.removeEventListener("keydown", primeAudioKeydown);
          primeAudioClick = null;
          primeAudioKeydown = null;
        }

        if (audioCtx) {
          audioCtx.close();
          audioCtx = null;
        }

        if (slideMenuObserver) {
          slideMenuObserver.disconnect();
          slideMenuObserver = null;
        }
        if (slideMenuClassObserver) {
          slideMenuClassObserver.disconnect();
          slideMenuClassObserver = null;
        }

        const menuEl = document.getElementById("revealjs-a11y-menu");
        if (menuEl) menuEl.remove();
        const menuBackdrop = document.querySelector(
          `.${CSS_PREFIX}-menu-backdrop`,
        );
        if (menuBackdrop) menuBackdrop.remove();
      },
    };
  });
