/* Prompt Wizard — vanilla-JS app, single-file deliverable.
 *
 * Module layout (IIFE-scoped, see plan §"Modular layout"):
 *   Data       — loads JSON from inline <script type="application/json"> tags
 *   Storage    — localStorage with in-memory fallback
 *   State      — observable container; autosave; save-status reporting
 *   Router     — hash-based phase navigation; free in any direction
 *   Renderer   — DOM rendering; never innerHTML for user input
 *   PreflightScreen, HeaderBar, NavSidebar, PhaseShell, WizardApp — views
 *
 * Phase 2 scope: Storage + State + Router + the empty phase shell
 * (header, side nav, mode buttons, comment box). Per-question UI lands
 * in Phase 3.
 */

(function () {
  "use strict";

  const ANSWERS_SCHEMA_VERSION = "1.0";
  const STORAGE_KEY = "prompt-wizard:state:v1";

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

  // ----- Storage -------------------------------------------------------------

  const Storage = (function () {
    let mode = "memory";
    let memoryStore = null;

    function probe() {
      try {
        const test = "__probe__" + Math.random();
        localStorage.setItem(test, "1");
        localStorage.removeItem(test);
        mode = "localStorage";
        return true;
      } catch (e) {
        mode = "memory";
        return false;
      }
    }

    function load() {
      if (mode === "localStorage") {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          console.warn("Storage.load failed; falling back to in-memory", e);
          mode = "memory";
        }
      }
      return memoryStore;
    }

    function save(state) {
      if (mode === "localStorage") {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          return { ok: true };
        } catch (e) {
          // Quota or other failure → fall back to in-memory and report.
          memoryStore = state;
          mode = "memory";
          return { ok: false, reason: e && e.name === "QuotaExceededError" ? "quota" : "io" };
        }
      }
      memoryStore = state;
      return { ok: true, fallback: true };
    }

    function clear() {
      if (mode === "localStorage") {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      }
      memoryStore = null;
    }

    function currentMode() { return mode; }

    return { probe, load, save, clear, currentMode };
  })();

  // ----- State ---------------------------------------------------------------

  const State = (function () {
    let state = null;
    const listeners = new Set();
    let saveTimer = null;
    let saveStatus = "idle"; // "idle" | "pending" | "ok" | "error" | "fallback"

    function makeFreshState(taxonomy) {
      const phases = {};
      for (const p of (taxonomy && taxonomy.phases) || []) {
        phases[p.id] = {
          mode: "detailed",
          answers: {},
          phase_comment: "",
          stale_since: null,
          stale_reason: null,
          user_acknowledged_stale: false,
        };
      }
      const now = new Date().toISOString();
      return {
        answers_schema_version: ANSWERS_SCHEMA_VERSION,
        wizard_version: Data.buildInfo.wizard_version || "0.0.0",
        data_version: Data.buildInfo.data_version || "0.0.0",
        claude_code_target_version: Data.buildInfo.claude_code_target_version || "1.x",
        started_at: now,
        last_modified_at: now,
        project_slug: "",
        quality_bar: "personal",
        preflight: { claude_code_attested: false, attested_at: null },
        phases: phases,
        review: { followups_answered: {}, followups_deferred: [] },
      };
    }

    function init() {
      Storage.probe();
      Dependencies.init(Data.questionTaxonomy);
      const loaded = Storage.load();
      const fresh = makeFreshState(Data.questionTaxonomy);
      if (loaded && typeof loaded === "object") {
        // Merge: loaded wins for fields it has; fresh fills in missing phase entries
        // for any new phases added since the save.
        state = Object.assign({}, fresh, loaded, {
          phases: Object.assign({}, fresh.phases, loaded.phases || {}),
        });
        // Ensure every phase has all required keys if data evolved.
        for (const id of Object.keys(state.phases)) {
          state.phases[id] = Object.assign({}, fresh.phases[id] || {}, state.phases[id]);
        }
      } else {
        state = fresh;
      }
      saveStatus = "ok";
    }

    function get() { return state; }

    /**
     * Save and surface a brief "saving" → "ok" pulse so the user sees the
     * activity. Used after commit-style events and after explicit flushes.
     */
    function _saveAndPulse() {
      const result = Storage.save(state);
      const finalStatus =
        !result.ok ? "error" :
        result.fallback ? "fallback" : "ok";
      // Render with "saving" first.
      saveStatus = "saving";
      _notify();
      // Settle on the final status after a short delay so the dot visibly blinks.
      setTimeout(function () {
        saveStatus = finalStatus;
        _notify();
      }, 250);
    }

    /**
     * Quiet save: write to storage, only notify if the save status changed
     * (e.g. quota exceeded → fallback). Used by debounced text-input saves.
     */
    function _saveQuiet() {
      const result = Storage.save(state);
      const newStatus =
        !result.ok ? "error" :
        result.fallback ? "fallback" : "ok";
      if (newStatus !== saveStatus) {
        saveStatus = newStatus;
        _notify();
      } else {
        saveStatus = newStatus;
      }
    }

    /**
     * Apply a synchronous in-place mutation. Used for commit-style events
     * (radio, checkbox, select, mode switch, per-question state buttons).
     * Saves immediately, pulses the indicator, propagates dependency
     * staleness, and re-renders.
     */
    function commit(mutator) {
      const before = Dependencies.snapshotKeys(state);
      mutator(state);
      state.last_modified_at = new Date().toISOString();
      const changed = Dependencies.diff(before, state);
      if (changed.length > 0) {
        Dependencies.propagate(state, changed, Data.questionTaxonomy);
      }
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      _saveAndPulse();
    }

    /**
     * Apply a free-text mutation. Saves quietly in the background after
     * 250 ms of idle. Does NOT re-render — keeps text-input focus stable.
     */
    function deferredCommit(mutator) {
      mutator(state);
      state.last_modified_at = new Date().toISOString();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveTimer = null;
        _saveQuiet();
      }, 250);
    }

    /**
     * Flush any pending debounced save and trigger a re-render with a save
     * pulse. Called from text-input blur handlers so the user sees the save
     * activity on every focus-out, AND the sidebar status icons update.
     * The save itself is idempotent — running it again on every blur, even
     * when nothing changed, is harmless.
     */
    function flushPending() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      _saveAndPulse();
    }

    function flushNow() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      _saveQuiet();
    }

    function reset() {
      state = makeFreshState(Data.questionTaxonomy);
      Storage.clear();
      saveStatus = "ok";
      _notify();
    }

    function getSaveStatus() { return saveStatus; }

    function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }
    function _notify() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }

    return { init, get, commit, deferredCommit, flushPending, flushNow, reset, getSaveStatus, subscribe };
  })();

  // ----- Router --------------------------------------------------------------

  const Router = (function () {
    const listeners = new Set();

    function fromHash() {
      return (location.hash || "").replace(/^#/, "") || "";
    }

    function init() {
      window.addEventListener("hashchange", function () {
        const target = fromHash();
        listeners.forEach(function (fn) { try { fn(target); } catch (e) { console.error(e); } });
      });
    }

    function go(target) { location.hash = target; }
    function current() { return fromHash(); }
    function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }

    return { init, go, current, subscribe };
  })();

  // ----- Renderer ------------------------------------------------------------

  const Renderer = (function () {
    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) {
        for (const k in attrs) {
          const v = attrs[k];
          if (v === false || v == null) continue;
          if (k === "class") node.className = v;
          else if (k === "dataset") for (const dk in v) node.dataset[dk] = v[dk];
          else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
          else if (k === "hidden" && v === true) node.hidden = true;
          else if (k === "checked" && v === true) node.checked = true;
          else if (k === "value") node.value = v;
          else node.setAttribute(k, v);
        }
      }
      if (children != null) {
        const list = Array.isArray(children) ? children : [children];
        for (const c of list) {
          if (c == null) continue;
          if (typeof c === "string" || typeof c === "number") node.appendChild(document.createTextNode(String(c)));
          else node.appendChild(c);
        }
      }
      return node;
    }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    return { el, clear };
  })();

  const e = Renderer.el;

  // ----- Dependencies --------------------------------------------------------
  // Parse `depends_on` declarations from question-taxonomy.yaml and propagate
  // staleness when an upstream answer changes. Each dependency edge is keyed
  // by the upstream phase + question id; a downstream phase becomes stale when
  // any of its declared upstream values flips.

  const Dependencies = (function () {
    // upstreamKeys[downstreamPhaseId] = ["upstream.qid", ...]  (every key the
    //   downstream watches)
    // downstreamPhases[upstreamPhaseId][upstreamQid] = ["downstream", ...]
    let upstreamKeys = {};
    let downstreamMap = {};

    function _addEdge(downstreamPhaseId, upstreamPhaseId, upstreamQid) {
      const key = upstreamPhaseId + "/" + upstreamQid;
      if (!upstreamKeys[downstreamPhaseId]) upstreamKeys[downstreamPhaseId] = [];
      if (upstreamKeys[downstreamPhaseId].indexOf(key) < 0) {
        upstreamKeys[downstreamPhaseId].push(key);
      }
      if (!downstreamMap[upstreamPhaseId]) downstreamMap[upstreamPhaseId] = {};
      if (!downstreamMap[upstreamPhaseId][upstreamQid]) downstreamMap[upstreamPhaseId][upstreamQid] = [];
      if (downstreamMap[upstreamPhaseId][upstreamQid].indexOf(downstreamPhaseId) < 0) {
        downstreamMap[upstreamPhaseId][upstreamQid].push(downstreamPhaseId);
      }
    }

    function init(taxonomy) {
      upstreamKeys = {};
      downstreamMap = {};
      const phases = (taxonomy && taxonomy.phases) || [];
      for (const p of phases) {
        // Phase-level depends_on
        for (const dep of (p.depends_on || [])) {
          for (const qid of (dep.questions || [])) _addEdge(p.id, dep.phase, qid);
        }
        // Question-level depends_on (treated as a phase-level dependency for
        // staleness purposes — the phase itself is what is marked stale).
        for (const q of (p.questions || [])) {
          for (const dep of (q.depends_on || [])) {
            for (const qid of (dep.questions || [])) _addEdge(p.id, dep.phase, qid);
          }
        }
      }
    }

    function _readKey(state, key) {
      const parts = key.split("/");
      const phase = state.phases[parts[0]];
      if (!phase) return undefined;
      const a = phase.answers[parts[1]];
      if (!a) return undefined;
      // Use a deterministic string form so we can compare across mutations.
      return JSON.stringify(a.value === undefined ? null : a.value);
    }

    /**
     * Snapshot the values of every dependency-watched key. Compare the result
     * before and after a mutation to find which keys changed.
     */
    function snapshotKeys(state) {
      const out = {};
      for (const downstream in upstreamKeys) {
        for (const key of upstreamKeys[downstream]) {
          if (!(key in out)) out[key] = _readKey(state, key);
        }
      }
      return out;
    }

    function diff(beforeSnapshot, state) {
      const after = snapshotKeys(state);
      const changedKeys = [];
      for (const key in beforeSnapshot) {
        if (beforeSnapshot[key] !== after[key]) changedKeys.push(key);
      }
      return changedKeys;
    }

    /**
     * Given the keys that changed, mark every dependent phase stale.
     * Returns the array of phase ids that became newly stale.
     */
    function propagate(state, changedKeys, taxonomy) {
      const now = new Date().toISOString();
      const titleOf = (function () {
        const m = {};
        for (const p of ((taxonomy && taxonomy.phases) || [])) m[p.id] = p.title;
        return function (id) { return m[id] || id; };
      })();
      const newlyStale = [];
      for (const key of changedKeys) {
        const parts = key.split("/");
        const upstreamPhase = parts[0];
        const upstreamQ = parts[1];
        const dependents = (downstreamMap[upstreamPhase] || {})[upstreamQ] || [];
        for (const downstream of dependents) {
          const ph = state.phases[downstream];
          if (!ph) continue;
          // Only the very first change records the stale_since; subsequent
          // changes update the reason but keep the original timestamp so the
          // user sees "this has been waiting for review" rather than a moving
          // target.
          const wasStale = ph.stale_since && !ph.user_acknowledged_stale;
          ph.stale_reason = "Upstream phase “" + titleOf(upstreamPhase) + "” changed.";
          ph.user_acknowledged_stale = false;
          if (!wasStale) {
            ph.stale_since = now;
            newlyStale.push(downstream);
          }
        }
      }
      return newlyStale;
    }

    function dependentsOf(upstreamPhaseId) {
      const out = [];
      for (const q in (downstreamMap[upstreamPhaseId] || {})) {
        for (const d of downstreamMap[upstreamPhaseId][q]) {
          if (out.indexOf(d) < 0) out.push(d);
        }
      }
      return out;
    }

    return { init, snapshotKeys, diff, propagate, dependentsOf };
  })();

  // ----- Inconsistency engine ------------------------------------------------
  // Rule-based: each rule has a `when` map (path → expected literal or
  // operator object). All conditions must match for the rule to fire.
  // No AI; deterministic and inspectable.

  const Inconsistency = (function () {
    function getByPath(obj, path) {
      const parts = path.split(".");
      let cur = obj;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur;
    }

    function matchValue(actual, expected) {
      if (expected === null || typeof expected !== "object") return actual === expected;
      // Operator object — supports `contains` (array membership) and `equals`.
      if ("contains" in expected) return Array.isArray(actual) && actual.indexOf(expected.contains) >= 0;
      if ("equals" in expected)   return actual === expected.equals;
      if ("not_equals" in expected) return actual !== expected.not_equals;
      return false;
    }

    function evaluate(state, rules) {
      const violations = [];
      for (const rule of (rules || [])) {
        let allMatched = true;
        for (const path in (rule.when || {})) {
          if (!matchValue(getByPath(state, path), rule.when[path])) {
            allMatched = false;
            break;
          }
        }
        if (allMatched) violations.push(rule);
      }
      return violations;
    }

    function evaluateNow() {
      const rulesDoc = Data.inconsistencyRules || {};
      return evaluate(State.get(), rulesDoc.rules || []);
    }

    return { evaluate, evaluateNow };
  })();

  // ----- Generator (alias) --------------------------------------------------
  // The Generator implementation lives in src/generator.js (loaded above this
  // <script>); it exposes itself on window.PromptWizardGenerator. We alias it
  // here so the rest of this file keeps a clean local symbol. Code outside this
  // module that wants the Generator should also use window.PromptWizardGenerator.
  const Generator = (function () {
    const g = (typeof window !== "undefined" && window.PromptWizardGenerator) ||
              (typeof globalThis !== "undefined" && globalThis.PromptWizardGenerator);
    if (!g) throw new Error("PromptWizardGenerator not loaded — check that src/generator.js was bundled before src/app.js.");
    function dataBundle() {
      return {
        taxonomy:      Data.questionTaxonomy,
        techStacks:    Data.techStacks,
        prerequisites: Data.prerequisites,
        buildInfo:     Data.buildInfo || {},
      };
    }
    return {
      FILE_INDEX:  g.FILE_INDEX,
      generateAll: function (state /* , taxonomy (legacy, ignored) */) {
        return g.generateAll(state, dataBundle());
      },
      projectSlug: g.projectSlug,
    };
  })();


  // ----- Bundler -------------------------------------------------------------
  // Packs the Generator's filename→content map into a ZIP using vendored
  // JSZip (loaded into `window.JSZip`). The ZIP root is the project slug,
  // matching the bundle layout in the plan:
  //   <project-slug>-prompt.zip / <project-slug>/...

  const Bundler = (function () {
    function isAvailable() {
      return typeof window !== "undefined" && typeof window.JSZip === "function";
    }

    /**
     * Build a JSZip instance from a filename → content map. Returns the zip
     * object; caller chooses how to serialise (Blob / arraybuffer / etc.).
     */
    function build(slug, filesMap) {
      if (!isAvailable()) throw new Error("JSZip is not available; the wizard was built without it.");
      const zip = new window.JSZip();
      const root = zip.folder(slug);
      for (const name in filesMap) {
        root.file(name, filesMap[name]);
      }
      return zip;
    }

    /** Build + serialise to a Blob with the standard ZIP options. */
    function pack(slug, filesMap) {
      const zip = build(slug, filesMap);
      return zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
    }

    return { isAvailable, build, pack };
  })();

  // ----- Download helpers ----------------------------------------------------

  function downloadString(filename, content, mime) {
    const blob = new Blob([content], { type: (mime || "text/plain") + ";charset=utf-8" });
    downloadBlob(filename, blob);
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  // ----- PreflightScreen -----------------------------------------------------

  const PreflightScreen = (function () {
    function copyButton(text) {
      return e("button", {
        type: "button",
        onclick: function (ev) {
          if (!navigator.clipboard) return;
          navigator.clipboard.writeText(text).then(function () {
            const btn = ev.currentTarget;
            const original = btn.textContent;
            btn.textContent = "Copied";
            setTimeout(function () { btn.textContent = original; }, 1500);
          }).catch(function () {});
        },
      }, "Copy");
    }
    function copyRow(text) {
      return e("div", { class: "copy-row" }, [e("pre", null, text), copyButton(text)]);
    }

    function renderInitial(host, onChoice) {
      Renderer.clear(host);
      host.appendChild(e("main", { class: "screen" }, [
        e("p", { class: "kicker" }, "Step 0 of 15"),
        e("h1", null, "Prerequisite check"),
        e("p", null, [
          "This wizard generates a prompt for ", e("strong", null, "Claude Code"),
          " to run. You need Claude Code installed first. ",
          "Open a terminal and run the command below — if it prints a version number, you are good.",
        ]),
        copyRow("claude --version"),
        e("div", { class: "banner" }, [
          e("strong", null, "Local-storage notice. "),
          "Your answers are saved in this browser's localStorage as plaintext. ",
          "Anyone with access to this device can read them. Avoid pasting production secrets, API keys, ",
          "passwords, or unredacted personal data into the free-text fields. Use placeholders instead ",
          "(e.g. ", e("code", null, "<API_KEY>"), ").",
        ]),
        e("div", { class: "stack" }, [
          e("p", null, "Did the command print a version number?"),
          e("div", null, [
            e("button", { type: "button", class: "primary", onclick: function () { onChoice("yes"); } },
              "Yes — continue"),
            e("button", { type: "button", onclick: function () { onChoice("no"); } },
              "No — show me how to install"),
            e("button", { type: "button", onclick: function () { onChoice("help"); } },
              "I don't know what a terminal is"),
          ]),
        ]),
      ]));
    }

    function renderInstall(host, onBack) {
      Renderer.clear(host);
      host.appendChild(e("main", { class: "screen" }, [
        e("p", { class: "kicker" }, "Step 0 · Install Claude Code"),
        e("h1", null, "Install Claude Code"),
        e("p", null, [
          "Pick the row matching your operating system. After it finishes, run ",
          e("code", null, "claude --version"), " to confirm, then come back here.",
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
            "docs.claude.com — Claude Code quickstart"), ".",
        ]),
        e("p", null, [e("button", { type: "button", onclick: onBack }, "Back to the check")]),
      ]));
    }

    function renderTerminalHelp(host, onBack) {
      Renderer.clear(host);
      host.appendChild(e("main", { class: "screen" }, [
        e("p", { class: "kicker" }, "Step 0 · Help"),
        e("h1", null, "How to open a terminal"),
        e("p", null, "A terminal is a text window where you type commands directly to your computer. It is built in to every operating system."),
        e("h2", null, "macOS"),
        e("p", null, ["Press ", e("strong", null, "Cmd + Space"), ", type ", e("code", null, "Terminal"),
          ", and press ", e("strong", null, "Return"), "."]),
        e("h2", null, "Windows"),
        e("p", null, ["Press the ", e("strong", null, "Windows"), " key, type ", e("code", null, "Terminal"),
          " (or ", e("code", null, "PowerShell"), "), and press ", e("strong", null, "Enter"), "."]),
        e("h2", null, "Linux"),
        e("p", null, ["Most desktops respond to ", e("strong", null, "Ctrl + Alt + T"), "."]),
        e("p", null, [e("button", { type: "button", onclick: onBack }, "Back to the check")]),
      ]));
    }

    function mount(host, onAttested) {
      function showInitial() { renderInitial(host, onChoice); }
      function onChoice(choice) {
        if (choice === "yes") onAttested();
        else if (choice === "no") renderInstall(host, showInitial);
        else if (choice === "help") renderTerminalHelp(host, showInitial);
      }
      showInitial();
    }

    return { mount };
  })();

  // ----- HeaderBar -----------------------------------------------------------

  const HeaderBar = (function () {
    function statusDot() {
      const s = State.getSaveStatus();
      const cls = "dot dot-" + s;
      const labels = {
        ok: "Saved", pending: "Saving…", error: "Save failed", fallback: "Saved (in-memory only)",
        idle: "Ready",
      };
      const title = labels[s] || s;
      return e("span", { class: cls, "aria-label": title, title: title });
    }

    function render() {
      return e("header", { class: "appbar", role: "banner" }, [
        e("div", { class: "appbar-title" }, [
          e("strong", null, "Prompt Wizard"),
          e("span", { class: "muted" }, " for Claude Code"),
        ]),
        e("div", { class: "appbar-status" }, [
          statusDot(),
          e("span", { class: "save-label muted" }, _saveLabel()),
        ]),
      ]);
    }
    function _saveLabel() {
      const s = State.getSaveStatus();
      if (s === "saving")   return "Saving…";
      if (s === "pending")  return "Saving…";
      if (s === "error")    return "Save failed — Export answers";
      if (s === "fallback") return "In-memory only — Export answers";
      return "Saved";
    }
    return { render };
  })();

  // ----- NavSidebar ----------------------------------------------------------

  const NavSidebar = (function () {
    function statusIconFor(phaseState) {
      if (!phaseState) return "○";
      if (phaseState.mode === "skipped") return "↷";
      if (phaseState.stale_since && !phaseState.user_acknowledged_stale) return "⚠";
      const answers = phaseState.answers || {};
      let decided = 0;
      for (const key in answers) {
        const a = answers[key];
        if (!a) continue;
        if (a.state === "answered" || a.state === "skipped" || a.state === "deferred") decided++;
      }
      return decided > 0 ? "✓" : "○";
    }

    function render(currentId) {
      const taxonomy = Data.questionTaxonomy;
      const phases = (taxonomy && taxonomy.phases) || [];
      const state = State.get();
      const items = phases.map(function (p) {
        const ps = state.phases[p.id];
        const isCurrent = p.id === currentId;
        return e("li", null, [
          e("button", {
            type: "button",
            class: "nav-item" + (isCurrent ? " is-current" : ""),
            onclick: function () { Router.go(p.id); },
          }, [
            e("span", { class: "nav-num" }, String(p.number) + "."),
            e("span", { class: "nav-title" }, p.title),
            e("span", { class: "nav-status", "aria-label": _ariaForPhase(ps) }, statusIconFor(ps)),
          ]),
        ]);
      });
      const reviewItem = e("li", null, [
        e("button", {
          type: "button",
          class: "nav-item nav-item-review" + (currentId === "review" || currentId === "preview" ? " is-current" : ""),
          onclick: function () { Router.go("review"); },
        }, [
          e("span", { class: "nav-num" }, "▶"),
          e("span", { class: "nav-title" }, "Review & generate"),
          e("span", { class: "nav-status" }),
        ]),
      ]);
      return e("nav", { class: "sidebar", "aria-label": "Phase navigation" }, [
        e("p", { class: "kicker" }, "15 phases"),
        e("ul", { class: "nav-list" }, items.concat([reviewItem])),
      ]);
    }
    function _ariaForPhase(ps) {
      if (!ps) return "not started";
      if (ps.mode === "skipped") return "skipped";
      if (ps.stale_since && !ps.user_acknowledged_stale) return "needs review";
      const answers = ps.answers || {};
      for (const key in answers) {
        const a = answers[key];
        if (a && (a.state === "answered" || a.state === "skipped" || a.state === "deferred")) {
          return "in progress";
        }
      }
      return "not started";
    }
    return { render };
  })();

  // ----- Question view -------------------------------------------------------
  // Renders a single question by `kind`. Per-question state in
  //   state.phases[phaseId].answers[questionId] = {
  //     state: "answered" | "skipped" | "deferred" | "blank",
  //     value, answered_at, note, rationale
  //   }

  const Question = (function () {

    function ensureAnswerEntry(s, phaseId, questionId) {
      const phase = s.phases[phaseId];
      if (!phase.answers[questionId]) {
        phase.answers[questionId] = { state: "blank", value: null, note: "" };
      }
      return phase.answers[questionId];
    }

    function answerOf(phaseId, questionId) {
      const ph = State.get().phases[phaseId];
      return (ph && ph.answers && ph.answers[questionId]) || { state: "blank", value: null, note: "" };
    }

    function setValue(phaseId, q, newValue) {
      State.commit(function (s) {
        const a = ensureAnswerEntry(s, phaseId, q.id);
        a.value = newValue;
        a.state = (newValue == null || (Array.isArray(newValue) && newValue.length === 0) || newValue === "")
          ? "blank" : "answered";
        a.answered_at = new Date().toISOString();
      });
    }

    function setText(phaseId, q, newValue) {
      State.deferredCommit(function (s) {
        const a = ensureAnswerEntry(s, phaseId, q.id);
        a.value = newValue;
        a.state = (newValue == null || newValue === "") ? "blank" : "answered";
        a.answered_at = new Date().toISOString();
      });
    }

    function setNote(phaseId, q, newNote) {
      State.deferredCommit(function (s) {
        ensureAnswerEntry(s, phaseId, q.id).note = newNote;
      });
    }

    function setRationale(phaseId, q, newR) {
      State.deferredCommit(function (s) {
        ensureAnswerEntry(s, phaseId, q.id).rationale = newR;
      });
    }

    function setQuestionState(phaseId, q, newState) {
      State.commit(function (s) {
        const a = ensureAnswerEntry(s, phaseId, q.id);
        if (newState === "answered") {
          // "Answer" doesn't claim a value — it just clears Defer/Skip.
          // The actual state is derived from whether a value is present.
          const v = a.value;
          const hasValue =
            v != null &&
            !(Array.isArray(v) && v.length === 0) &&
            v !== "";
          a.state = hasValue ? "answered" : "blank";
        } else {
          a.state = newState;
        }
      });
    }

    // ---- Input renderers, one per kind ----

    function renderText(phaseId, q, a) {
      return e("input", {
        type: "text",
        class: "q-input",
        value: a.value || "",
        "aria-label": q.text,
        oninput: function (ev) { setText(phaseId, q, ev.currentTarget.value); },
        onblur: function () { State.flushPending(); },
      });
    }

    function renderLongtext(phaseId, q, a) {
      return e("textarea", {
        class: "q-input q-textarea",
        rows: "4",
        "aria-label": q.text,
        value: a.value || "",
        oninput: function (ev) { setText(phaseId, q, ev.currentTarget.value); },
        onblur: function () { State.flushPending(); },
      });
    }

    function renderNumber(phaseId, q, a) {
      return e("input", {
        type: "number",
        class: "q-input",
        value: (a.value == null ? "" : String(a.value)),
        "aria-label": q.text,
        oninput: function (ev) {
          const raw = ev.currentTarget.value;
          setText(phaseId, q, raw === "" ? null : Number(raw));
        },
      });
    }

    function renderList(phaseId, q, a) {
      const text = Array.isArray(a.value) ? a.value.join("\n") : (a.value || "");
      return e("div", null, [
        e("textarea", {
          class: "q-input q-textarea",
          rows: "5",
          placeholder: "One item per line",
          "aria-label": q.text,
          value: text,
          oninput: function (ev) {
            const v = ev.currentTarget.value;
            const lines = v.split("\n").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
            State.deferredCommit(function (s) {
              const aa = ensureAnswerEntry(s, phaseId, q.id);
              aa.value = lines;
              aa.state = lines.length === 0 ? "blank" : "answered";
              aa.answered_at = new Date().toISOString();
            });
          },
          onblur: function () { State.flushPending(); },
        }),
        e("p", { class: "muted q-hint" }, "One item per line."),
      ]);
    }

    function renderBoolean(phaseId, q, a) {
      const cur = a.value;
      function btn(label, value) {
        return e("button", {
          type: "button",
          class: "q-pill" + (cur === value ? " is-active" : ""),
          onclick: function () { setValue(phaseId, q, value); },
        }, label);
      }
      return e("div", { class: "q-pills", role: "radiogroup", "aria-label": q.text }, [
        btn("Yes", true),
        btn("No",  false),
      ]);
    }

    function renderSingleSelect(phaseId, q, a, allOptions) {
      const cur = a.value;
      const opts = allOptions || q.options || [];
      const list = opts.map(function (opt) {
        const checked = cur === opt.value;
        const id = "q-" + phaseId + "-" + q.id + "-" + opt.value;
        return e("label", { class: "q-radio" + (checked ? " is-active" : ""), for: id }, [
          e("input", {
            type: "radio",
            id: id,
            name: phaseId + "/" + q.id,
            value: opt.value,
            checked: checked,
            onchange: function () { setValue(phaseId, q, opt.value); },
          }),
          e("span", { class: "q-radio-body" }, [
            e("strong", null, opt.label),
            opt.description ? e("span", { class: "q-radio-desc" }, opt.description) : null,
          ]),
        ]);
      });
      return e("div", { class: "q-options", role: "radiogroup", "aria-label": q.text }, list);
    }

    function renderMultiSelect(phaseId, q, a) {
      const cur = Array.isArray(a.value) ? a.value : [];
      function toggle(value) {
        const next = cur.indexOf(value) >= 0 ? cur.filter(function (v) { return v !== value; }) : cur.concat([value]);
        setValue(phaseId, q, next);
      }
      const list = (q.options || []).map(function (opt) {
        const checked = cur.indexOf(opt.value) >= 0;
        const id = "q-" + phaseId + "-" + q.id + "-" + opt.value;
        return e("label", { class: "q-check" + (checked ? " is-active" : ""), for: id }, [
          e("input", {
            type: "checkbox",
            id: id,
            value: opt.value,
            checked: checked,
            onchange: function () { toggle(opt.value); },
          }),
          e("span", { class: "q-radio-body" }, [
            e("strong", null, opt.label),
            opt.description ? e("span", { class: "q-radio-desc" }, opt.description) : null,
          ]),
        ]);
      });
      return e("div", { class: "q-options", "aria-label": q.text }, list);
    }

    /**
     * For a single_select question that is the target of another question's
     * `primary_select_for`, narrow the visible options to whatever the upstream
     * multi_select has chosen, plus a "needs upstream answer" hint when empty.
     */
    function renderConstrainedSingleSelect(phaseId, q, a, drivingMultiselect) {
      const driver = drivingMultiselect ? answerOf(phaseId, drivingMultiselect.id) : null;
      const chosen = driver && Array.isArray(driver.value) ? driver.value : [];
      if (chosen.length === 0) {
        return e("p", { class: "muted q-hint" }, [
          "Pick one or more options in ",
          e("strong", null, drivingMultiselect ? drivingMultiselect.text : "the question above"),
          " first.",
        ]);
      }
      const filtered = (q.options || []).filter(function (opt) { return chosen.indexOf(opt.value) >= 0; });
      // If the previously stored value is no longer among the chosen, clear it.
      if (a.value && filtered.findIndex(function (o) { return o.value === a.value; }) < 0) {
        State.commit(function (s) {
          const ans = ensureAnswerEntry(s, phaseId, q.id);
          ans.value = null;
          ans.state = "blank";
        });
      }
      return renderSingleSelect(phaseId, q, a, filtered);
    }

    // ---- Top-level question card ----

    function render(phaseId, q, helpers) {
      const a = answerOf(phaseId, q.id);
      const required = q.required === true;

      // Per-question state buttons: Answered (default) / Defer / Skip
      function stateBtn(label, target) {
        return e("button", {
          type: "button",
          class: "q-state-btn" + (a.state === target ? " is-active" : ""),
          onclick: function () { setQuestionState(phaseId, q, target); },
        }, label);
      }

      let body;
      if (a.state === "deferred") {
        body = e("div", { class: "q-deferred banner" }, [
          e("strong", null, "Deferred — Claude will ask before deciding."),
          " You can still leave a hint in the notes below.",
        ]);
      } else if (a.state === "skipped") {
        body = e("div", { class: "q-skipped banner" }, [
          e("strong", null, "Skipped."),
          " A sensible default will be applied.",
        ]);
      } else {
        // Render the input by kind.
        if (q.kind === "text")              body = renderText(phaseId, q, a);
        else if (q.kind === "longtext")     body = renderLongtext(phaseId, q, a);
        else if (q.kind === "number")       body = renderNumber(phaseId, q, a);
        else if (q.kind === "list")         body = renderList(phaseId, q, a);
        else if (q.kind === "boolean")      body = renderBoolean(phaseId, q, a);
        else if (q.kind === "multi_select") body = renderMultiSelect(phaseId, q, a);
        else if (q.kind === "single_select") {
          const driver = helpers && helpers.driverFor && helpers.driverFor(q.id);
          body = driver
            ? renderConstrainedSingleSelect(phaseId, q, a, driver)
            : renderSingleSelect(phaseId, q, a);
        } else {
          body = e("p", { class: "muted" }, "Unsupported question kind: " + q.kind);
        }
      }

      const guidance = q.guidance
        ? e("details", { class: "q-guidance" }, [
            e("summary", null, "Why is this asked?"),
            e("p", { class: "muted" }, q.guidance),
          ])
        : null;

      const rationale = q.rationale_field === true
        ? e("details", { class: "q-rationale", open: a.rationale ? true : null }, [
            e("summary", null, "Why this choice? (optional)"),
            e("textarea", {
              class: "q-input q-textarea",
              rows: "2",
              placeholder: "Optional — recorded in the prompt for Claude and your future self.",
              "aria-label": "Rationale for " + q.text,
              value: a.rationale || "",
              oninput: function (ev) { setRationale(phaseId, q, ev.currentTarget.value); },
            }),
          ])
        : null;

      const notes = e("details", { class: "q-notes", open: a.note ? true : null }, [
        e("summary", null, "Notes (optional)"),
        e("textarea", {
          class: "q-input q-textarea",
          rows: "2",
          placeholder: "Anything Claude should know about this answer.",
          "aria-label": "Notes for " + q.text,
          value: a.note || "",
          oninput: function (ev) { setNote(phaseId, q, ev.currentTarget.value); },
        }),
      ]);

      return e("section", { class: "q-card", "data-state": a.state }, [
        e("div", { class: "q-head" }, [
          e("h3", { class: "q-text" }, [
            q.text,
            required ? e("span", { class: "q-required", "aria-label": "Required" }, " *") : null,
          ]),
          e("div", { class: "q-actions" }, [
            stateBtn("Answer", "answered"),
            stateBtn("Defer",  "deferred"),
            stateBtn("Skip",   "skipped"),
          ]),
        ]),
        guidance,
        body,
        rationale,
        notes,
      ]);
    }

    return { render };
  })();

  // ----- PhaseShell ----------------------------------------------------------

  const PhaseShell = (function () {
    function modeButton(label, value, current, onChange, disabled) {
      return e("button", {
        type: "button",
        class: "mode-btn" + (current === value ? " is-active" : ""),
        disabled: disabled === true,
        onclick: function () { onChange(value); },
      }, label);
    }

    function questionsForMode(phase, mode) {
      const all = phase.questions || [];
      if (mode === "skipped") return [];
      // Mode "detailed" shows everything; "simplified" shows only flagged.
      return all.filter(function (q) {
        const modes = q.modes || ["detailed", "simplified"];
        if (mode === "simplified") return modes.indexOf("simplified") >= 0;
        return modes.indexOf("detailed") >= 0;
      });
    }

    function buildHelpers(phase) {
      // Map each single_select that is the target of a multi_select's
      // primary_select_for back to the driving multi_select question.
      const driverByTarget = {};
      for (const q of (phase.questions || [])) {
        if (q.kind === "multi_select" && q.primary_select_for) {
          driverByTarget[q.primary_select_for] = q;
        }
      }
      return {
        driverFor: function (questionId) { return driverByTarget[questionId] || null; },
      };
    }

    function renderStaleBanner(phase, ps) {
      if (!ps.stale_since || ps.user_acknowledged_stale) return null;

      function reAnswer() {
        State.commit(function (s) {
          const ph = s.phases[phase.id];
          ph.stale_since = null;
          ph.stale_reason = null;
          ph.user_acknowledged_stale = false;
        });
      }
      function markStillValid() {
        State.commit(function (s) {
          s.phases[phase.id].user_acknowledged_stale = true;
        });
      }
      function resetPhase() {
        const msg = "Reset every answer in “" + phase.title + "”? This cannot be undone.";
        if (!window.confirm(msg)) return;
        State.commit(function (s) {
          const ph = s.phases[phase.id];
          ph.answers = {};
          ph.phase_comment = "";
          ph.stale_since = null;
          ph.stale_reason = null;
          ph.user_acknowledged_stale = false;
        });
      }

      return e("div", { class: "stale-banner", role: "alert" }, [
        e("p", null, [
          e("strong", null, "Needs review. "),
          ps.stale_reason || "An answer this phase depends on has changed.",
          " Some of your answers below may need updating.",
        ]),
        e("div", { class: "stale-actions" }, [
          e("button", { type: "button", class: "primary", onclick: reAnswer }, "Re-answer"),
          e("button", { type: "button", onclick: markStillValid }, "Mark still valid"),
          e("button", { type: "button", onclick: resetPhase }, "Reset this phase"),
        ]),
      ]);
    }

    function renderPhaseBody(phase, ps) {
      const stale = renderStaleBanner(phase, ps);
      if (ps.mode === "skipped") {
        return e("div", null, [
          stale,
          e("div", { class: "card phase-body" }, [
            e("p", { class: "muted" }, [
              "Phase marked Skipped. A sensible default will be applied. Switch to Detailed or Simplified above to answer.",
            ]),
          ]),
        ]);
      }
      const visibleQuestions = questionsForMode(phase, ps.mode);
      if (visibleQuestions.length === 0) {
        return e("div", null, [
          stale,
          e("div", { class: "card phase-body" }, [
            e("p", { class: "muted" }, "No questions yet for this phase. Detailed-mode content lands as the build advances."),
          ]),
        ]);
      }
      const helpers = buildHelpers(phase);
      const cards = visibleQuestions.map(function (q) {
        return Question.render(phase.id, q, helpers);
      });
      return e("div", null, [stale, e("div", { class: "phase-questions" }, cards)]);
    }

    function render(phaseId) {
      const taxonomy = Data.questionTaxonomy;
      const phase = ((taxonomy && taxonomy.phases) || []).find(function (p) { return p.id === phaseId; });
      if (!phase) {
        return e("main", { class: "main", role: "main" }, [
          e("p", { class: "kicker" }, "Unknown phase"),
          e("h1", null, "Phase not found"),
          e("p", null, "Pick a phase from the sidebar."),
        ]);
      }

      const state = State.get();
      const ps = state.phases[phase.id];
      const phases = (taxonomy && taxonomy.phases) || [];
      const idx = phases.findIndex(function (p) { return p.id === phase.id; });
      const prev = idx > 0 ? phases[idx - 1] : null;
      const next = idx < phases.length - 1 ? phases[idx + 1] : null;

      function setMode(m) {
        State.commit(function (s) { s.phases[phase.id].mode = m; });
      }

      function onPhaseCommentInput(ev) {
        const v = ev.currentTarget.value;
        State.deferredCommit(function (s) {
          s.phases[phase.id].phase_comment = v;
          s.phases[phase.id].phase_comment_at = new Date().toISOString();
        });
      }

      const skipDisabled = phase.skip_disabled === true;

      return e("main", { class: "main", role: "main" }, [
        e("p", { class: "kicker" }, "Phase " + phase.number + " of 15"),
        e("h1", null, phase.title),
        phase.summary ? e("p", { class: "muted" }, phase.summary) : null,

        e("div", { class: "card mode-bar", role: "radiogroup", "aria-label": "Phase mode" }, [
          modeButton("Detailed",   "detailed",   ps.mode, setMode),
          modeButton("Simplified", "simplified", ps.mode, setMode),
          modeButton(
            skipDisabled ? "Skip (disabled)" : "Skip",
            "skipped", ps.mode, setMode, skipDisabled
          ),
        ]),

        renderPhaseBody(phase, ps),

        e("div", { class: "card" }, [
          e("h2", null, "Your comments"),
          e("p", { class: "muted" }, "Anything you write here is included verbatim in the generated prompt as a user note."),
          e("textarea", {
            class: "comment-box",
            rows: "6",
            "aria-label": "Phase " + phase.number + " comment",
            value: ps.phase_comment || "",
            oninput: onPhaseCommentInput,
            onblur: function () { State.flushPending(); },
            placeholder: "Notes, edge cases, things you're not sure about…",
          }),
        ]),

        e("div", { class: "phase-nav" }, [
          prev
            ? e("button", { type: "button", onclick: function () { Router.go(prev.id); } },
                "← " + prev.number + ". " + prev.title)
            : e("span"),
          next
            ? e("button", { type: "button", class: "primary", onclick: function () { Router.go(next.id); } },
                next.number + ". " + next.title + " →")
            : e("button", { type: "button", class: "primary", onclick: function () { Router.go("review"); } },
                "Review & generate →"),
        ]),
      ]);
    }
    return { render };
  })();

  // ----- ReviewScreen --------------------------------------------------------

  const ReviewScreen = (function () {

    function staleIssues() {
      const taxonomy = Data.questionTaxonomy;
      const phases = (taxonomy && taxonomy.phases) || [];
      const out = [];
      for (const p of phases) {
        const ps = State.get().phases[p.id] || {};
        if (ps.stale_since && !ps.user_acknowledged_stale) {
          out.push({ phase: p, reason: ps.stale_reason || "Upstream answer changed." });
        }
      }
      return out;
    }

    function deferredCount() {
      const taxonomy = Data.questionTaxonomy;
      const phases = (taxonomy && taxonomy.phases) || [];
      let n = 0;
      for (const p of phases) {
        const ps = State.get().phases[p.id] || {};
        for (const a of Object.values(ps.answers || {})) {
          if (a && a.state === "deferred") n++;
        }
      }
      return n;
    }

    function renderIssuesPanel() {
      const stale = staleIssues();
      const inconsistencies = Inconsistency.evaluateNow();
      const deferred = deferredCount();
      if (stale.length === 0 && inconsistencies.length === 0 && deferred === 0) {
        return e("div", { class: "card review-issues review-issues-ok" }, [
          e("h2", null, "Issues"),
          e("p", { class: "muted" }, "No issues detected. Ready to generate."),
        ]);
      }
      const items = [];
      for (const s of stale) {
        items.push(e("li", { class: "review-issue review-issue-stale" }, [
          e("strong", null, "⚠ Needs review · Phase " + s.phase.number + " (" + s.phase.title + "). "),
          s.reason,
          " ",
          e("button", { type: "button", class: "link", onclick: function () { Router.go(s.phase.id); } },
            "Open phase →"),
        ]));
      }
      for (const r of inconsistencies) {
        const cls = "review-issue review-issue-" + (r.severity || "warning");
        items.push(e("li", { class: cls }, [
          e("strong", null, (r.severity === "conflict" ? "✗ Conflict" : "⚠ " + (r.severity || "warning")) + ". "),
          (r.message || "(no message)").trim(),
          r.suggested_fix ? e("p", { class: "muted" }, "Suggested fix: " + r.suggested_fix.trim()) : null,
        ]));
      }
      if (deferred > 0) {
        items.push(e("li", { class: "review-issue review-issue-deferred" }, [
          e("strong", null, "🛈 " + deferred + " deferred answer" + (deferred === 1 ? "" : "s") + ". "),
          "These will appear in `meta/open-questions.md` for Claude to ASK before deciding.",
        ]));
      }
      return e("div", { class: "card review-issues" }, [
        e("h2", null, "Issues"),
        e("ul", { class: "review-issue-list" }, items),
      ]);
    }

    function renderPhaseSummary() {
      const taxonomy = Data.questionTaxonomy;
      const phases = (taxonomy && taxonomy.phases) || [];
      const cards = phases.map(function (p) {
        const ps = State.get().phases[p.id] || {};
        const visible = (p.questions || []).filter(function (q) {
          const m = q.modes || ["detailed", "simplified"];
          if (ps.mode === "simplified") return m.indexOf("simplified") >= 0;
          if (ps.mode === "skipped") return false;
          return m.indexOf("detailed") >= 0;
        });
        const answered = visible.filter(function (q) {
          const a = (ps.answers || {})[q.id];
          return a && (a.state === "answered" || a.state === "deferred" || a.state === "skipped");
        }).length;
        return e("article", { class: "review-phase-card" }, [
          e("header", { class: "review-phase-head" }, [
            e("strong", null, p.number + ". " + p.title),
            e("span", { class: "muted" }, " · " + (ps.mode || "detailed")),
            e("span", { class: "muted" }, " · " + answered + "/" + visible.length + " answered"),
            e("button", { type: "button", class: "link",
              onclick: function () { Router.go(p.id); } }, "Edit →"),
          ]),
          ps.phase_comment
            ? e("blockquote", { class: "review-comment" }, "[note] " + ps.phase_comment)
            : null,
        ]);
      });
      return e("section", { class: "review-phases" }, [
        e("h2", null, "Per-phase summary"),
        e("p", { class: "muted" }, "Click any phase to jump back and edit it. Counts show how many of the visible questions in the current phase mode have a decision recorded."),
        e("div", { class: "review-phase-grid" }, cards),
      ]);
    }

    function renderActionsPanel() {
      const slug = Generator.projectSlug(State.get());

      function downloadAnswers() {
        downloadString(slug + "-answers.json", JSON.stringify(State.get(), null, 2), "application/json");
      }
      function openPreview() { Router.go("preview"); }

      function generateBundle(ev) {
        const btn = ev && ev.currentTarget;
        const original = btn ? btn.textContent : null;
        if (btn) { btn.disabled = true; btn.textContent = "Packing…"; }
        try {
          if (!Bundler.isAvailable()) {
            alert(
              "JSZip is not available in this build, so the ZIP cannot be packed.\n" +
              "answers.json will be downloaded instead."
            );
            downloadAnswers();
            return;
          }
          const files = Generator.generateAll(State.get(), Data.questionTaxonomy);
          Bundler.pack(slug, files).then(function (blob) {
            downloadBlob(slug + "-prompt.zip", blob);
          }).catch(function (err) {
            console.error("ZIP packing failed", err);
            alert(
              "Could not pack the ZIP: " + (err && err.message ? err.message : err) + "\n" +
              "Falling back to answers.json download."
            );
            downloadAnswers();
          }).then(function () {
            if (btn) { btn.disabled = false; btn.textContent = original; }
          });
        } catch (err) {
          console.error(err);
          if (btn) { btn.disabled = false; btn.textContent = original; }
          alert("Generate failed: " + (err && err.message ? err.message : err));
        }
      }

      return e("div", { class: "card review-actions" }, [
        e("h2", null, "Generate"),
        e("p", { class: "muted" }, [
          "Run a Preview to see exactly what Claude Code will receive. ",
          "When you are happy, click Generate — a ZIP named ",
          e("code", null, slug + "-prompt.zip"),
          " downloads to your Downloads folder.",
        ]),
        e("div", { class: "review-actions-row" }, [
          e("button", { type: "button", class: "primary", onclick: openPreview }, "Preview prompt"),
          e("button", { type: "button", onclick: generateBundle }, "Generate bundle"),
          e("button", { type: "button", onclick: downloadAnswers }, "Export answers.json"),
        ]),
      ]);
    }

    function render() {
      return e("main", { class: "main review", role: "main" }, [
        e("p", { class: "kicker" }, "Review · Phase 16 of 16"),
        e("h1", null, "Review & generate"),
        e("p", { class: "muted" }, [
          "This is the dry run. Nothing is shipped to GitHub or to Claude until you click Generate. ",
          "Below: any open issues, then a per-phase summary, then the actions.",
        ]),
        renderIssuesPanel(),
        renderActionsPanel(),
        renderPhaseSummary(),
      ]);
    }

    return { render };
  })();

  // ----- PreviewScreen -------------------------------------------------------

  const PreviewScreen = (function () {
    let cachedFiles = null;
    let cachedFilesAt = 0;
    let selected = "PROMPT.md";

    function files() {
      // Generation is cheap (string concat). Recompute on every entry; cache
      // for back-and-forth navigation within the same session.
      const lastModified = State.get().last_modified_at || "";
      const cacheKey = String(cachedFilesAt) + "|" + lastModified;
      if (cachedFiles && cacheKey === String(cachedFiles._key)) return cachedFiles;
      const out = Generator.generateAll(State.get(), Data.questionTaxonomy);
      Object.defineProperty(out, "_key", { value: cacheKey, enumerable: false });
      cachedFiles = out;
      cachedFilesAt = Date.now();
      return out;
    }

    function selectFile(name) {
      selected = name;
      WizardApp.rerender();
    }

    function renderTree() {
      const all = files();
      const groups = [
        { label: "Top level", names: ["README.md", "PROMPT.md", "answers.json"] },
        { label: "docs/",     names: Object.keys(all).filter(function (n) { return n.startsWith("docs/"); }).sort() },
        { label: "meta/",     names: Object.keys(all).filter(function (n) { return n.startsWith("meta/"); }).sort() },
        { label: "notes/",    names: Object.keys(all).filter(function (n) { return n.startsWith("notes/"); }).sort() },
      ];
      const sections = groups.map(function (g) {
        return e("div", { class: "preview-tree-group" }, [
          e("p", { class: "kicker" }, g.label),
          e("ul", { class: "preview-tree-list" }, g.names.map(function (n) {
            return e("li", null, [
              e("button", {
                type: "button",
                class: "preview-tree-item" + (n === selected ? " is-current" : ""),
                onclick: function () { selectFile(n); },
              }, n),
            ]);
          })),
        ]);
      });
      return e("nav", { class: "preview-tree", "aria-label": "Bundle file tree" }, sections);
    }

    function renderViewer() {
      const all = files();
      const content = all[selected] != null ? all[selected] : "(file not found)";
      const sizeKb = (new Blob([content]).size / 1024).toFixed(1);
      return e("section", { class: "preview-viewer" }, [
        e("header", { class: "preview-viewer-head" }, [
          e("strong", null, selected),
          e("span", { class: "muted" }, " · " + sizeKb + " KB"),
        ]),
        e("pre", { class: "preview-content" }, content),
      ]);
    }

    function render() {
      return e("main", { class: "main preview", role: "main" }, [
        e("p", { class: "kicker" }, "Preview"),
        e("div", { class: "preview-head" }, [
          e("h1", null, "Bundle preview"),
          e("button", { type: "button", onclick: function () { Router.go("review"); } }, "← Back to review"),
        ]),
        e("p", { class: "muted" }, [
          "Read-only view of every file the bundle will contain when you Generate. ",
          "Use the tree on the left to navigate.",
        ]),
        e("div", { class: "preview-grid" }, [
          renderTree(),
          renderViewer(),
        ]),
      ]);
    }

    return { render };
  })();

  // ----- WizardApp -----------------------------------------------------------

  const WizardApp = (function () {
    let host = null;

    function _phaseIds() {
      return ((Data.questionTaxonomy && Data.questionTaxonomy.phases) || []).map(function (p) { return p.id; });
    }

    function _resolveTarget() {
      const target = Router.current();
      if (target === "review" || target === "preview") return target;
      const phases = _phaseIds();
      if (phases.indexOf(target) >= 0) return target;
      return phases.length ? phases[0] : "review";
    }

    function rerender() {
      if (!host) return;
      const target = _resolveTarget();
      Renderer.clear(host);
      let mainView;
      if (target === "review")       mainView = ReviewScreen.render();
      else if (target === "preview") mainView = PreviewScreen.render();
      else                           mainView = PhaseShell.render(target);

      host.appendChild(e("div", { class: "app-shell" }, [
        HeaderBar.render(),
        e("div", { class: "app-body" }, [
          NavSidebar.render(target),
          mainView,
        ]),
      ]));
      if (Router.current() !== target) Router.go(target);
    }

    function mount(target) {
      host = target;
      Router.init();
      Router.subscribe(rerender);
      State.subscribe(rerender);
      window.addEventListener("beforeunload", function () { State.flushNow(); });
      if (!Router.current()) {
        const phases = _phaseIds();
        if (phases.length) Router.go(phases[0]);
      }
      rerender();
    }

    return { mount, rerender };
  })();

  // ----- Boot ----------------------------------------------------------------

  function attestAndEnter() {
    State.commit(function (s) {
      s.preflight.claude_code_attested = true;
      s.preflight.attested_at = new Date().toISOString();
    });
    const host = document.getElementById("app");
    if (host) WizardApp.mount(host);
  }

  function boot() {
    const host = document.getElementById("app");
    if (!host) return;
    State.init();

    host.hidden = false;
    if (State.get().preflight && State.get().preflight.claude_code_attested) {
      WizardApp.mount(host);
    } else {
      PreflightScreen.mount(host, attestAndEnter);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
