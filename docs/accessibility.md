# Accessibility

**Target:** WCAG 2.1 Level AA across the entire wizard, plus a usable experience under
keyboard-only navigation and modern screen readers (VoiceOver / NVDA / Narrator).

This document describes what is currently in place, the manual-test checklist for releases, and
the items deliberately deferred.

## What's in place

- **Semantic landmarks**: `<header role="banner">`, `<nav aria-label>`, `<main role="main">`.
  The skip link at the top of the document jumps directly to `#app-main`.
- **Skip link** appears on first Tab press and routes focus into the main content area.
- **ARIA live region** (visually hidden, `aria-live="polite"`, `aria-atomic="true"`) used by
  the `A11y` module to announce route changes (e.g. *"Phase 5 of 15: Data — Input"*) and
  significant save-status transitions (errors and in-memory fallback). Routine save events
  during typing are deliberately silent — flooding the screen reader on every keystroke would
  defeat the purpose.
- **Focus management**: on every route change the H1 of the new view is focused
  (`tabindex="-1"` + `.focus()`), so screen readers read the new heading. On commit-style
  state changes (radio click, mode switch, etc.) focus is *not* moved — the user keeps focus on
  the control they just used.
- **Keyboard support**: every interactive control is reachable via Tab. Custom radio and
  checkbox styling is layered on top of real `<input type="radio">` / `<input type="checkbox">`
  elements, so native keyboard handling (arrow keys for radios, Space for toggling) works.
- **`aria-current="page"`** on the active sidebar entry. Screen readers announce "current
  page" when focus lands on it.
- **`aria-required="true"`** on inputs whose question is marked `required: true` in the
  taxonomy. **`aria-describedby`** links each input to its expanded "Why is this asked?"
  guidance text via a stable id.
- **`aria-pressed`** on the per-question Answer / Defer / Skip toggles so screen readers
  announce which one is currently active.
- **`aria-label`** on every input mirrors the question text so AT users hear the question
  even if the visual label is rendered by the surrounding card.
- **Save-status dot** has a hidden text label ("Saved" / "Saving…" / "Save failed" / "Saved
  in memory only") via the dot's `title` and the adjacent `.save-label` text.
- **Light / dark colour palette** designed against WCAG contrast thresholds:
  - Light: foreground `#1a1a1a` on background `#fafafa` — ratio ~14.5:1 (AAA).
  - Dark: foreground `#ececec` on background `#14151a` — ratio ~14.7:1 (AAA).
  - Muted text and the accent colour both clear AA in both modes.
  - The save-status colours (green / amber / red) are paired with explicit text labels —
    colour is never the only signal.
- **`prefers-reduced-motion: reduce`** disables every transition and animation, including
  the save-pulse keyframe.
- **`focus-visible`** styles on every focusable control: 2 px accent outline with
  `outline-offset: 2px`, suppressed for mouse clicks.
- **`<noscript>`** fallback explains that JavaScript is required and that the wizard runs
  entirely locally with no network calls.
- **Forbidden anti-patterns**: `innerHTML` is never used for user-entered content; the
  `Renderer.el` helper always uses `textContent`. This is also a security control (XSS
  prevention) and is reinforced in the per-commit sanitisation gate.

## Manual-test checklist (run before every release)

1. **Keyboard only — entire flow**.
   1. Press Tab from the address bar and confirm the skip link appears.
   2. Press Tab through the prereq screen, exercise Yes / No / Help paths.
   3. Walk through 5–6 phases using Tab and arrow keys; toggle Detailed / Simplified / Skip;
      use the Defer button on a question; type into a textarea and Tab out — confirm the
      sidebar status icon updates.
   4. Reach the Review screen and Preview, navigate the file tree, return to Review.
   5. Confirm Generate downloads a ZIP without ever needing a mouse.
2. **Screen reader spot checks** (≥1 of: VoiceOver, NVDA, Narrator).
   1. Announces the prereq screen heading on load.
   2. Announces "Phase X of 15: Title" when navigating between phases.
   3. Announces "current page" on the focused sidebar item.
   4. Reads question text + describedby guidance when entering a question input.
   5. Announces a save error if storage is full (test by overflowing localStorage in
      DevTools).
3. **Zoom test**: zoom to 200% in the browser; layout must not require horizontal scroll
   in normal usage (single-column mobile breakpoint kicks in below 760 px width).
4. **Reduced motion**: toggle the OS preference; confirm the save-pulse animation is
   disabled (the dot still changes colour, just without the pulse).
5. **Light + dark**: switch the OS theme; visually confirm contrast remains adequate in
   both modes.

## Known limitations / deferred

- **Automated axe-core run in CI**: not yet wired up. The plan's Phase 8 calls for this; it
  needs either jsdom (lossy) or Playwright (heavier dependency). Tracked as a follow-up.
- **i18n / RTL**: English only; no RTL support. Brain files are translatable but no UI
  scaffolding for it yet.
- **High-contrast mode (Windows)**: not specifically tested. The palette does not rely on
  colour-only signals, but a forced-colors pass would improve confidence.
- **Reduced-motion exceptions**: the colour transition on the save dot still runs at
  120 ms — that is the only animation that survives, and the duration is short enough to
  be subliminal. If the user reports otherwise, we can bracket it under
  `prefers-reduced-motion`.

## Reporting an accessibility issue

Open an issue at [github.com/sq2cet/prompt-wizard/issues](https://github.com/sq2cet/prompt-wizard/issues)
and describe what you tried, what assistive technology was active, and what you expected to
hear or see.
