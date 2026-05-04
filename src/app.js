/* Prompt Wizard — vanilla-JS app, single-file deliverable.
 *
 * Module layout (IIFE-scoped, see plan §"Modular layout"):
 *   Data       — loads JSON from inline <script type="application/json"> tags
 *   Storage    — localStorage with in-memory fallback (Phase 2+)
 *   State      — observable state container (Phase 2+)
 *   Router     — phase navigation & deep-link via #hash (Phase 2+)
 *   Renderer   — DOM rendering, never innerHTML for user input
 *   A11y       — focus management & ARIA live regions (Phase 2+)
 *
 * Phase 1 scope: Step 0 prerequisite check (Yes / No / Help). Subsequent phases
 * fill in the modules above and add the 15-phase navigation shell.
 */

(function () {
  "use strict";

  // ----- Data ----------------------------------------------------------------

  const Data = (function () {
    function readJsonScript(id) {
      const el = document.getElementById(id);
      if (!el) return null;
      try { return JSON.parse(el.textContent); }
      catch (e) { console.error("Failed to parse " + id, e); return null; }
    }
    return {
      questionTaxonomy:   readJsonScript("data-question-taxonomy"),
      techStacks:         readJsonScript("data-tech-stacks"),
      prerequisites:      readJsonScript("data-prerequisites"),
      compliance:         readJsonScript("data-compliance"),
      inconsistencyRules: readJsonScript("data-inconsistency-rules"),
      templateBindings:   readJsonScript("data-template-bindings"),
      buildInfo:          readJsonScript("data-build-info") || {},
    };
  })();

  // ----- Renderer (escaping helpers + DOM builders) --------------------------

  const Renderer = (function () {
    /**
     * Build a DOM element. Children may be strings (rendered as text via textContent),
     * other Elements, or arrays of either. NEVER builds via innerHTML — the wizard
     * passes user input through this without HTML escaping concerns.
     */
    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          if (v === false || v == null) continue;
          if (k === "class") node.className = v;
          else if (k === "dataset") for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
          else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
          else if (k === "hidden" && v === true) node.hidden = true;
          else node.setAttribute(k, v);
        }
      }
      if (children != null) {
        const list = Array.isArray(children) ? children : [children];
        for (const c of list) {
          if (c == null) continue;
          if (typeof c === "string" || typeof c === "number") {
            node.appendChild(document.createTextNode(String(c)));
          } else {
            node.appendChild(c);
          }
        }
      }
      return node;
    }

    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

    return { el, clear };
  })();

  const e = Renderer.el;

  // ----- Step 0: prerequisite check ------------------------------------------

  const PreflightScreen = (function () {
    function copyButton(text) {
      return e("button", {
        type: "button",
        onclick: function (ev) {
          navigator.clipboard.writeText(text).then(
            function () {
              const btn = ev.currentTarget;
              const original = btn.textContent;
              btn.textContent = "Copied";
              setTimeout(function () { btn.textContent = original; }, 1500);
            },
            function () { /* clipboard unavailable — silently no-op */ }
          );
        },
      }, "Copy");
    }

    function copyRow(text) {
      return e("div", { class: "copy-row" }, [
        e("pre", null, text),
        copyButton(text),
      ]);
    }

    function renderInitial(host, onChoice) {
      Renderer.clear(host);
      host.appendChild(
        e("main", { class: "screen" }, [
          e("p", { class: "kicker" }, "Step 0 of 15"),
          e("h1", null, "Prerequisite check"),
          e("p", null, [
            "This wizard generates a prompt for ",
            e("strong", null, "Claude Code"),
            " to run. You need Claude Code installed first. ",
            "Open a terminal and run the command below — if it prints a version number, you are good.",
          ]),
          copyRow("claude --version"),
          e("div", { class: "stack" }, [
            e("p", null, "Did the command print a version number?"),
            e("div", null, [
              e("button", {
                type: "button",
                class: "primary",
                onclick: function () { onChoice("yes"); },
              }, "Yes — continue"),
              e("button", {
                type: "button",
                onclick: function () { onChoice("no"); },
              }, "No — show me how to install"),
              e("button", {
                type: "button",
                onclick: function () { onChoice("help"); },
              }, "I don't know what a terminal is"),
            ]),
          ]),
          e("p", { class: "muted footer" }, [
            "prompt-wizard ",
            String(Data.buildInfo.wizard_version || "dev"),
            " · data ",
            String(Data.buildInfo.data_version || "dev"),
            Data.buildInfo.commit_sha ? " · " + String(Data.buildInfo.commit_sha) : "",
          ]),
        ])
      );
    }

    function renderInstall(host, onBack) {
      Renderer.clear(host);
      host.appendChild(
        e("main", { class: "screen" }, [
          e("p", { class: "kicker" }, "Step 0 of 15 · Install Claude Code"),
          e("h1", null, "Install Claude Code"),
          e("p", null, [
            "Pick the row matching your operating system. Each command installs Claude Code into ",
            "your terminal. After it finishes, run ",
            e("code", null, "claude --version"),
            " to confirm, then come back here and click ",
            e("strong", null, "Yes — continue"),
            ".",
          ]),
          e("h2", null, "macOS (Homebrew)"),
          copyRow("brew install --cask claude-code"),
          e("h2", null, "Windows"),
          copyRow("winget install Anthropic.ClaudeCode"),
          e("h2", null, "Linux"),
          copyRow("curl -fsSL https://claude.ai/install.sh | sh"),
          e("p", { class: "muted" }, [
            "Official documentation: ",
            e("a", { href: "https://docs.claude.com/en/docs/claude-code/quickstart", target: "_blank", rel: "noopener noreferrer" },
              "docs.claude.com — Claude Code quickstart"),
            ".",
          ]),
          e("p", null, [
            e("button", { type: "button", onclick: onBack }, "Back to the check"),
          ]),
        ])
      );
    }

    function renderTerminalHelp(host, onBack) {
      Renderer.clear(host);
      host.appendChild(
        e("main", { class: "screen" }, [
          e("p", { class: "kicker" }, "Step 0 of 15 · Help"),
          e("h1", null, "How to open a terminal"),
          e("p", null, [
            "A terminal is a text window where you type commands directly to your computer. ",
            "It is built in to every operating system. Pick yours below.",
          ]),
          e("h2", null, "macOS"),
          e("p", null, [
            "Press ",
            e("strong", null, "Cmd + Space"),
            ", type ",
            e("code", null, "Terminal"),
            ", and press ",
            e("strong", null, "Return"),
            ". A black window opens. Click into it and you can type commands.",
          ]),
          e("h2", null, "Windows"),
          e("p", null, [
            "Press the ",
            e("strong", null, "Windows"),
            " key, type ",
            e("code", null, "Terminal"),
            " (or ",
            e("code", null, "PowerShell"),
            "), and press ",
            e("strong", null, "Enter"),
            ".",
          ]),
          e("h2", null, "Linux"),
          e("p", null, [
            "Most desktops respond to ",
            e("strong", null, "Ctrl + Alt + T"),
            ". Otherwise look for an app called ",
            e("code", null, "Terminal"),
            " in your applications menu.",
          ]),
          e("h2", null, "Once it is open"),
          e("p", null, "Click into the window, type the command from the previous screen, then press Enter."),
          e("p", null, [
            e("button", { type: "button", onclick: onBack }, "Back to the check"),
          ]),
        ])
      );
    }

    function renderConfirmed(host) {
      Renderer.clear(host);
      host.appendChild(
        e("main", { class: "screen" }, [
          e("p", { class: "kicker" }, "Step 0 cleared"),
          e("h1", null, "Prerequisites OK"),
          e("div", { class: "banner ok" }, [
            e("strong", null, "Claude Code is installed."),
            " The 15-phase wizard will appear here in the next build phase.",
          ]),
          e("p", { class: "muted" }, [
            "This is a Phase 1 scaffold. Phases 2–15 (vision, audience, form factor, …) are not ",
            "yet wired in — they ship in the next milestones.",
          ]),
        ])
      );
    }

    function mount(host) {
      function showInitial() { renderInitial(host, onChoice); }
      function onChoice(choice) {
        if (choice === "yes")       renderConfirmed(host);
        else if (choice === "no")   renderInstall(host, showInitial);
        else if (choice === "help") renderTerminalHelp(host, showInitial);
      }
      showInitial();
    }

    return { mount };
  })();

  // ----- Boot ----------------------------------------------------------------

  function boot() {
    const host = document.getElementById("app");
    if (!host) return;
    host.hidden = false;
    PreflightScreen.mount(host);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
