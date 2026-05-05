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

    // V2.1: when an active project file is configured (via ProjectStore in
    // Chromium), saves go to that file instead of localStorage. localStorage
    // is the fallback for non-Chromium browsers and for the no-directory state.
    let activeProjectSlug = null;
    let pendingFileWrite = null;     // Promise of in-flight write, to serialise.

    function setActiveProject(slug) { activeProjectSlug = slug || null; }
    function getActiveProject() { return activeProjectSlug; }

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
     * Persist state. Routes to the active project file (V2.1 file-backed
     * mode) when available, otherwise to localStorage. Returns a promise
     * resolving to `{ ok, fallback?, error? }`.
     */
    async function _persist() {
      if (activeProjectSlug && ProjectStore.available()) {
        try {
          // Serialise concurrent writes — the writable stream API doesn't
          // support overlapping writes to the same file.
          const prev = pendingFileWrite || Promise.resolve();
          pendingFileWrite = prev.then(function () {
            return ProjectStore.saveProjectFile(activeProjectSlug, state);
          });
          await pendingFileWrite;
          return { ok: true, fallback: false };
        } catch (err) {
          console.error("Project file save failed:", err);
          // Fall through to localStorage as a last resort.
          const ls = Storage.save(state);
          return { ok: true, fallback: true };
        }
      }
      // No active file: write to localStorage as in V1.
      const result = Storage.save(state);
      return { ok: result.ok, fallback: !!result.fallback };
    }

    /**
     * Save and surface a brief "saving" → "ok" pulse so the user sees the
     * activity. Used after commit-style events and after explicit flushes.
     */
    function _saveAndPulse() {
      saveStatus = "saving";
      _notify();
      _persist().then(function (result) {
        const finalStatus =
          !result.ok ? "error" :
          result.fallback ? "fallback" : "ok";
        setTimeout(function () {
          saveStatus = finalStatus;
          _notify();
        }, 250);
      });
    }

    /**
     * Quiet save: write to storage, only notify if the save status changed
     * (e.g. quota exceeded → fallback). Used by debounced text-input saves.
     */
    function _saveQuiet() {
      _persist().then(function (result) {
        const newStatus =
          !result.ok ? "error" :
          result.fallback ? "fallback" : "ok";
        if (newStatus !== saveStatus) {
          saveStatus = newStatus;
          _notify();
        } else {
          saveStatus = newStatus;
        }
      });
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

    /**
     * Defensive periodic save (V2.0 R1 mitigation).
     *
     * The user-test bundle showed a `must_have` list arriving in storage with
     * 5 items where 9 had been typed; the last item was cut mid-word at 40
     * chars. Code-walking V1 did not surface a reproducible cause. The most
     * plausible candidate remaining is a browser-specific event-ordering
     * scenario (IME composition, paste race) where `oninput` did not fire
     * for the last segment of typing before another action triggered a
     * re-render.
     *
     * As a defensive measure independent of root-cause, run a low-frequency
     * periodic flush of state. If the in-memory state was updated since the
     * last sync, write it now. Catches any path where a debounced save
     * timer was somehow lost. Cost is one localStorage write every 5 s while
     * the wizard is active and modified; negligible.
     */
    let lastSyncedModifiedAt = null;
    function _periodicCatchUp() {
      if (state && state.last_modified_at && state.last_modified_at !== lastSyncedModifiedAt) {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        _saveQuiet();
        lastSyncedModifiedAt = state.last_modified_at;
      }
    }
    setInterval(_periodicCatchUp, 5000);

    function reset() {
      state = makeFreshState(Data.questionTaxonomy);
      Storage.clear();
      saveStatus = "ok";
      _notify();
    }

    /**
     * Replace the in-memory state wholesale (used by the Load-from-file flow).
     * Validates schema fields lightly; the caller is expected to have already
     * checked structural shape via `_validateImportedState` before calling.
     * Saves immediately and notifies.
     */
    function replace(newState) {
      const fresh = makeFreshState(Data.questionTaxonomy);
      // Merge: imported wins for fields it has; fresh fills in missing phase
      // entries for phases added since the imported file was saved.
      state = Object.assign({}, fresh, newState, {
        phases: Object.assign({}, fresh.phases, newState.phases || {}),
      });
      for (const id of Object.keys(state.phases)) {
        state.phases[id] = Object.assign({}, fresh.phases[id] || {}, state.phases[id]);
      }
      Storage.save(state);
      saveStatus = "ok";
      _notify();
    }

    function getSaveStatus() { return saveStatus; }

    function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }
    function _notify() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }

    return {
      init, get, commit, deferredCommit, flushPending, flushNow,
      reset, replace, getSaveStatus, subscribe,
      // V2.1 file-backed mode helpers:
      setActiveProject, getActiveProject,
    };
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

  // ----- A11y ----------------------------------------------------------------
  // Announces changes (route, save status) to assistive tech via a single
  // visually-hidden ARIA live region. Manages programmatic focus moves on
  // route changes so screen readers read the new heading.
  //
  // Note: this module deliberately does NOT announce every save event — that
  // would flood screen readers during a typing session. Only non-OK save
  // states are surfaced.

  const A11y = (function () {
    const LIVE_ID = "aria-live-region";
    let lastSaveStatusAnnounced = null;

    function _ensureRegion() {
      let node = document.getElementById(LIVE_ID);
      if (!node) {
        node = document.createElement("div");
        node.id = LIVE_ID;
        node.className = "sr-only";
        node.setAttribute("aria-live", "polite");
        node.setAttribute("aria-atomic", "true");
        document.body.appendChild(node);
      }
      return node;
    }

    function announce(text) {
      if (!text) return;
      const node = _ensureRegion();
      node.textContent = "";
      setTimeout(function () { node.textContent = String(text); }, 30);
    }

    function announcePhaseChange(target) {
      if (target === "review") {
        announce("Review and generate. Step 16 of 16.");
        return;
      }
      if (target === "preview") {
        announce("Bundle preview. Read-only viewer.");
        return;
      }
      const taxonomy = Data && Data.questionTaxonomy;
      const phases = (taxonomy && taxonomy.phases) || [];
      const p = phases.find(function (ph) { return ph.id === target; });
      if (!p) return;
      announce("Phase " + p.number + " of 15: " + p.title);
    }

    function announceSaveStatusIfNotable() {
      const s = State.getSaveStatus();
      if (s === lastSaveStatusAnnounced) return;
      lastSaveStatusAnnounced = s;
      if (s === "error") announce("Save failed. Use Export answers to keep your progress.");
      else if (s === "fallback") announce("Saved in memory only. Export answers to keep your progress.");
      // ok / saving / idle / pending → silent; the dot suffices.
    }

    function focusHeading(host) {
      if (!host) return;
      const h1 = host.querySelector("main h1");
      if (!h1) return;
      h1.setAttribute("tabindex", "-1");
      try { h1.focus({ preventScroll: false }); }
      catch (_) { h1.focus(); }
    }

    return { announce, announcePhaseChange, announceSaveStatusIfNotable, focusHeading };
  })();

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
        taxonomy:           Data.questionTaxonomy,
        techStacks:         Data.techStacks,
        prerequisites:      Data.prerequisites,
        inconsistencyRules: Data.inconsistencyRules,
        buildInfo:          Data.buildInfo || {},
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

  // ----- ProjectStore (V2.1) -------------------------------------------------
  //
  // File-based persistence using the File System Access API. The user picks a
  // directory once; the handle is persisted in IndexedDB so the wizard
  // remembers it across sessions. New projects are created as <slug>.json
  // files in that directory, and every state change writes the whole JSON
  // back to the project's file (debounced for free-text, immediate for
  // commit-style events).
  //
  // In browsers without the File System Access API (Safari / Firefox), the
  // ProjectStore reports `available: false` and the wizard falls back to
  // localStorage as in V1.

  const ProjectStore = (function () {
    const DB_NAME      = "prompt-wizard-store";
    const DB_VERSION   = 1;
    const STORE_NAME   = "handles";
    const KEY_DIR      = "projects-dir";

    function available() {
      return typeof window !== "undefined" &&
             typeof window.showDirectoryPicker === "function" &&
             typeof window.indexedDB !== "undefined";
    }

    // ---- IndexedDB helpers ----

    function _openDB() {
      return new Promise(function (resolve, reject) {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }

    async function _idbGet(key) {
      const db = await _openDB();
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }

    async function _idbPut(key, value) {
      const db = await _openDB();
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }

    async function _idbDelete(key) {
      const db = await _openDB();
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }

    // ---- Directory handle: pick + persist + permission ----

    /**
     * Returns the stored directory handle, asking permission if necessary.
     * Returns null if no handle is stored or permission denied.
     */
    async function getDirectoryHandle() {
      if (!available()) return null;
      const handle = await _idbGet(KEY_DIR);
      if (!handle) return null;
      // The browser can require us to re-request permission after a relaunch.
      const perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm === "granted") return handle;
      const requested = await handle.requestPermission({ mode: "readwrite" });
      if (requested === "granted") return handle;
      return null;
    }

    /**
     * Open the OS directory picker, store the chosen handle in IndexedDB.
     * Returns the handle on success, null on cancel.
     */
    async function pickDirectory() {
      if (!available()) throw new Error("File System Access API not supported in this browser.");
      try {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        await _idbPut(KEY_DIR, handle);
        return handle;
      } catch (err) {
        if (err && err.name === "AbortError") return null;
        throw err;
      }
    }

    async function forgetDirectory() {
      await _idbDelete(KEY_DIR);
    }

    // ---- Project files: list / create / load / save / delete ----

    function _slugFromFilename(name) {
      // Strip a trailing ".json" (case-insensitive).
      return name.replace(/\.json$/i, "");
    }

    /**
     * Enumerate *.json files in the chosen directory. Returns an array of
     * { slug, file_name, modified_at, size } sorted by modification time
     * descending.
     */
    async function listProjects() {
      const dir = await getDirectoryHandle();
      if (!dir) return [];
      const out = [];
      // FileSystemDirectoryHandle is async-iterable in Chromium.
      for await (const [name, entry] of dir.entries()) {
        if (entry.kind !== "file") continue;
        if (!/\.json$/i.test(name)) continue;
        try {
          const file = await entry.getFile();
          out.push({
            slug: _slugFromFilename(name),
            file_name: name,
            modified_at: file.lastModified,
            size: file.size,
          });
        } catch (_) { /* skip */ }
      }
      out.sort(function (a, b) { return b.modified_at - a.modified_at; });
      return out;
    }

    async function _getFileHandle(slug, opts) {
      const dir = await getDirectoryHandle();
      if (!dir) throw new Error("No projects directory selected.");
      return await dir.getFileHandle(slug + ".json", opts || {});
    }

    async function createProjectFile(slug, initialState) {
      const handle = await _getFileHandle(slug, { create: true });
      await _writeJson(handle, initialState);
      return handle;
    }

    async function loadProjectFile(slug) {
      const handle = await _getFileHandle(slug);
      const file = await handle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    }

    async function saveProjectFile(slug, state) {
      const handle = await _getFileHandle(slug);
      await _writeJson(handle, state);
    }

    async function deleteProjectFile(slug) {
      const dir = await getDirectoryHandle();
      if (!dir) throw new Error("No projects directory selected.");
      await dir.removeEntry(slug + ".json");
    }

    async function projectFileExists(slug) {
      const dir = await getDirectoryHandle();
      if (!dir) return false;
      try {
        await dir.getFileHandle(slug + ".json");
        return true;
      } catch (_) {
        return false;
      }
    }

    async function _writeJson(handle, value) {
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(value, null, 2));
      await writable.close();
    }

    return {
      available,
      pickDirectory,
      getDirectoryHandle,
      forgetDirectory,
      listProjects,
      createProjectFile,
      loadProjectFile,
      saveProjectFile,
      deleteProjectFile,
      projectFileExists,
    };
  })();

  // ----- FilePicker (V2.1) ---------------------------------------------------
  //
  // Wraps the File System Access API (Chromium 86+) so the user can pick a
  // location once and the browser will default future picks to the same
  // place — addressing the "where did the wizard save my file?" problem in
  // V1. Falls back to the classic download anchor / <input type="file">
  // approach in Safari and Firefox.

  const FilePicker = (function () {
    function hasSaveAPI() {
      return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
    }
    function hasOpenAPI() {
      return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
    }

    /**
     * Save `blob` as `filename`, asking the user where via the OS's native
     * Save dialog when supported. Returns a promise resolving to an object
     * with `{ ok, name?, cancelled?, fallback? }`.
     */
    async function pickToSave(filename, blob, mimeType) {
      if (hasSaveAPI()) {
        try {
          const opts = { suggestedName: filename };
          if (mimeType === "application/zip") {
            opts.types = [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }];
          } else if (mimeType === "application/json") {
            opts.types = [{ description: "JSON file", accept: { "application/json": [".json"] } }];
          }
          const handle = await window.showSaveFilePicker(opts);
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return { ok: true, name: handle.name };
        } catch (err) {
          if (err && err.name === "AbortError") return { ok: false, cancelled: true };
          console.warn("showSaveFilePicker failed; falling back to download anchor:", err);
        }
      }
      // Fallback: classic download anchor — saves to the browser's Downloads
      // folder. The user has no choice of location.
      downloadBlob(filename, blob);
      return { ok: true, name: filename, fallback: true };
    }

    /**
     * Open a file picker. When available, the browser remembers the last
     * location and defaults subsequent picks there. Returns a promise
     * resolving to `{ ok, text?, name?, cancelled?, error? }`.
     */
    async function pickToOpen(accept) {
      const acceptObj = accept || { "application/json": [".json"] };
      if (hasOpenAPI()) {
        try {
          const handles = await window.showOpenFilePicker({
            types: [{ description: "Saved project", accept: acceptObj }],
            multiple: false,
            excludeAcceptAllOption: false,
          });
          const file = await handles[0].getFile();
          const text = await file.text();
          return { ok: true, text: text, name: file.name };
        } catch (err) {
          if (err && err.name === "AbortError") return { ok: false, cancelled: true };
          console.warn("showOpenFilePicker failed; falling back to <input type=file>:", err);
        }
      }
      // Fallback: classic <input type="file">.
      return new Promise(function (resolve) {
        const input = document.createElement("input");
        input.type = "file";
        const exts = [];
        for (const mime in acceptObj) {
          for (const ext of acceptObj[mime]) exts.push(ext);
        }
        input.accept = exts.concat(Object.keys(acceptObj)).join(",");
        input.style.display = "none";
        input.onchange = function () {
          const file = input.files && input.files[0];
          if (!file) {
            if (input.parentNode) input.parentNode.removeChild(input);
            resolve({ ok: false, cancelled: true });
            return;
          }
          const reader = new FileReader();
          reader.onload = function () {
            resolve({ ok: true, text: reader.result, name: file.name });
          };
          reader.onerror = function () {
            resolve({ ok: false, error: "read_failed" });
          };
          reader.readAsText(file);
          setTimeout(function () { if (input.parentNode) input.parentNode.removeChild(input); }, 1000);
        };
        document.body.appendChild(input);
        input.click();
      });
    }

    return { pickToSave, pickToOpen, hasSaveAPI, hasOpenAPI };
  })();

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

    function _headerActions() {
      return (typeof window !== "undefined" && window.PromptWizard && window.PromptWizard.headerActions) || {};
    }

    function render() {
      const actions = _headerActions();
      const slug = (State.get() || {}).project_slug || "";
      return e("header", { class: "appbar", role: "banner" }, [
        e("div", { class: "appbar-title" }, [
          e("strong", null, "Prompt Wizard"),
          slug ? e("span", { class: "muted" }, " · " + slug) : e("span", { class: "muted" }, " for Claude Code"),
        ]),
        e("div", { class: "appbar-actions" }, [
          actions.newProject
            ? e("button", {
                type: "button",
                class: "appbar-btn",
                onclick: actions.newProject,
                "aria-label": "Start a new project",
                title: "Start a new project (with confirmation)",
              }, "↺ New project")
            : null,
          actions.openSettings
            ? e("button", {
                type: "button",
                class: "appbar-btn appbar-gear",
                onclick: actions.openSettings,
                "aria-label": "Settings",
                title: "Settings",
              }, "⚙")
            : null,
          e("div", { class: "appbar-status" }, [
            statusDot(),
            e("span", { class: "save-label muted" }, _saveLabel()),
          ]),
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
        const attrs = {
          type: "button",
          class: "nav-item" + (isCurrent ? " is-current" : ""),
          onclick: function () { Router.go(p.id); },
        };
        if (isCurrent) attrs["aria-current"] = "page";
        return e("li", null, [
          e("button", attrs, [
            e("span", { class: "nav-num", "aria-hidden": "true" }, String(p.number) + "."),
            e("span", { class: "nav-title" }, "Phase " + p.number + ": " + p.title),
            e("span", { class: "nav-status", "aria-label": _ariaForPhase(ps), "aria-hidden": "false" }, statusIconFor(ps)),
          ]),
        ]);
      });
      const reviewIsCurrent = currentId === "review" || currentId === "preview";
      const reviewAttrs = {
        type: "button",
        class: "nav-item nav-item-review" + (reviewIsCurrent ? " is-current" : ""),
        onclick: function () { Router.go("review"); },
      };
      if (reviewIsCurrent) reviewAttrs["aria-current"] = "page";
      const reviewItem = e("li", null, [
        e("button", reviewAttrs, [
          e("span", { class: "nav-num", "aria-hidden": "true" }, "▶"),
          e("span", { class: "nav-title" }, "Review and generate"),
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

    /**
     * V2.1: Clear an answer. Returns the question to "blank" state with no
     * stored value. The user gets a way to "un-tick" a radio without changing
     * native HTML radio semantics — fixes the user-reported "checkmark
     * forever" issue.
     */
    function clearAnswer(phaseId, q) {
      State.commit(function (s) {
        const a = ensureAnswerEntry(s, phaseId, q.id);
        a.value = null;
        a.state = "blank";
        // Notes / rationale survive a Clear — they may still be useful next
        // time the user revisits the question.
      });
    }

    // ---- Input renderers, one per kind ----

    function _commonAttrs(q, guidanceId) {
      const attrs = { "aria-label": q.text };
      if (q.required === true) attrs["aria-required"] = "true";
      if (guidanceId) attrs["aria-describedby"] = guidanceId;
      return attrs;
    }

    function renderText(phaseId, q, a, guidanceId) {
      return e("input", Object.assign({
        type: "text",
        class: "q-input",
        value: a.value || "",
        oninput: function (ev) { setText(phaseId, q, ev.currentTarget.value); },
        onblur: function () { State.flushPending(); },
        oncompositionend: function (ev) {
          // IME committed a composition — re-read the input value and flush,
          // in case the trailing characters of the composition didn't fire input.
          setText(phaseId, q, ev.currentTarget.value);
          State.flushPending();
        },
      }, _commonAttrs(q, guidanceId)));
    }

    function renderLongtext(phaseId, q, a, guidanceId) {
      return e("textarea", Object.assign({
        class: "q-input q-textarea",
        rows: "4",
        value: a.value || "",
        oninput: function (ev) { setText(phaseId, q, ev.currentTarget.value); },
        onblur: function () { State.flushPending(); },
        oncompositionend: function (ev) {
          setText(phaseId, q, ev.currentTarget.value);
          State.flushPending();
        },
      }, _commonAttrs(q, guidanceId)));
    }

    function renderNumber(phaseId, q, a, guidanceId) {
      return e("input", Object.assign({
        type: "number",
        class: "q-input",
        value: (a.value == null ? "" : String(a.value)),
        oninput: function (ev) {
          const raw = ev.currentTarget.value;
          setText(phaseId, q, raw === "" ? null : Number(raw));
        },
        onblur: function () { State.flushPending(); },
      }, _commonAttrs(q, guidanceId)));
    }

    function renderList(phaseId, q, a) {
      const text = Array.isArray(a.value) ? a.value.join("\n") : (a.value || "");

      // Centralised parse + commit so input / paste / compositionend share
      // the same code path. R1 mitigation — see State._periodicCatchUp comment.
      function commitListFromTextarea(textareaEl) {
        const v = textareaEl.value;
        const lines = v.split("\n").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
        State.deferredCommit(function (s) {
          const aa = ensureAnswerEntry(s, phaseId, q.id);
          aa.value = lines;
          aa.state = lines.length === 0 ? "blank" : "answered";
          aa.answered_at = new Date().toISOString();
        });
      }

      return e("div", null, [
        e("textarea", {
          class: "q-input q-textarea",
          rows: "5",
          placeholder: "One item per line",
          "aria-label": q.text,
          value: text,
          oninput: function (ev) { commitListFromTextarea(ev.currentTarget); },
          // Paste fires before the input event applies the pasted content;
          // schedule an extra commit on the next tick to catch any browser
          // path where input doesn't fire immediately after paste.
          onpaste: function (ev) {
            const target = ev.currentTarget;
            setTimeout(function () { commitListFromTextarea(target); }, 0);
          },
          oncompositionend: function (ev) { commitListFromTextarea(ev.currentTarget); State.flushPending(); },
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
      const guidanceId = q.guidance ? ("guidance-" + phaseId + "-" + q.id) : null;

      // Per-question state buttons: Answered (default) / Defer / Skip / Clear
      function stateBtn(label, target, extraLabel) {
        return e("button", {
          type: "button",
          class: "q-state-btn" + (a.state === target ? " is-active" : ""),
          onclick: function () { setQuestionState(phaseId, q, target); },
          "aria-label": extraLabel || (label + " — " + q.text),
          "aria-pressed": a.state === target ? "true" : "false",
        }, label);
      }

      // Clear is shown only when there IS something to clear.
      const hasValueOrPicked =
        (a.state === "answered") ||
        (a.value != null && !(Array.isArray(a.value) && a.value.length === 0) && a.value !== "");
      const clearBtn = hasValueOrPicked
        ? e("button", {
            type: "button",
            class: "q-state-btn q-state-btn-clear",
            onclick: function () { clearAnswer(phaseId, q); },
            "aria-label": "Clear answer — " + q.text,
            title: "Clear this answer (returns to blank)",
          }, "Clear")
        : null;

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
        if (q.kind === "text")              body = renderText(phaseId, q, a, guidanceId);
        else if (q.kind === "longtext")     body = renderLongtext(phaseId, q, a, guidanceId);
        else if (q.kind === "number")       body = renderNumber(phaseId, q, a, guidanceId);
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
            e("p", { class: "muted", id: guidanceId }, q.guidance),
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
            clearBtn,
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
        return e("main", { class: "main", role: "main", id: "app-main" }, [
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

      return e("main", { class: "main", role: "main", id: "app-main" }, [
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
            // Defensive R1 mitigation — see State._periodicCatchUp comment.
            oncompositionend: function (ev) { onPhaseCommentInput(ev); State.flushPending(); },
            onpaste: function (ev) {
              const target = ev.currentTarget;
              setTimeout(function () { onPhaseCommentInput({ currentTarget: target }); }, 0);
            },
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
      const dataBundle = Data; // Generator's call site builds its own dataBundle from Data.

      async function downloadAnswers() {
        const json = JSON.stringify(State.get(), null, 2);
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const result = await FilePicker.pickToSave(slug + "-answers.json", blob, "application/json");
        if (result.cancelled) return;
        if (result.ok && !result.fallback) {
          // The user picked a location; the browser will remember it for next time.
          // No further toast needed; the OS dialog already confirmed the save.
        }
      }
      function openPreview() { Router.go("preview"); }

      async function generateBundle(ev) {
        const btn = ev && ev.currentTarget;
        const original = btn ? btn.textContent : null;
        if (btn) { btn.disabled = true; btn.textContent = "Packing…"; }
        try {
          if (!Bundler.isAvailable()) {
            window.alert(
              "JSZip is not available in this build, so the ZIP cannot be packed.\n" +
              "answers.json will be downloaded instead."
            );
            await downloadAnswers();
            return;
          }
          const files = Generator.generateAll(State.get(), Data.questionTaxonomy);
          const blob = await Bundler.pack(slug, files);
          const result = await FilePicker.pickToSave(slug + "-prompt.zip", blob, "application/zip");
          if (result.cancelled) {
            // User cancelled the OS save dialog; do nothing.
          } else if (!result.ok) {
            window.alert("Could not save the ZIP: " + (result.error || "unknown error"));
          }
        } catch (err) {
          console.error("ZIP packing failed", err);
          window.alert("Generate failed: " + (err && err.message ? err.message : err));
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = original; }
        }
      }

      // V2.1: hint adjusts based on whether we have the File System Access API.
      const filePickerHint = FilePicker.hasSaveAPI()
        ? "When you click Generate, your operating system will ask where to save the ZIP. Pick once; the browser remembers the location for future saves and for Load."
        : "The ZIP downloads to your browser's default download folder (typically ~/Downloads on macOS, the Downloads folder on Windows / Linux). Use the same folder when you Load a saved project.";

      return e("div", { class: "card review-actions" }, [
        e("h2", null, "Generate"),
        e("p", { class: "muted" }, [
          "Run a Preview to see exactly what Claude Code will receive. ",
          "When you are happy, click Generate — a ZIP named ",
          e("code", null, slug + "-prompt.zip"),
          " is saved.",
        ]),
        e("p", { class: "muted q-hint" }, filePickerHint),
        e("div", { class: "review-actions-row" }, [
          e("button", { type: "button", class: "primary", onclick: openPreview }, "Preview prompt"),
          e("button", { type: "button", onclick: generateBundle }, "Generate bundle"),
          e("button", { type: "button", onclick: downloadAnswers }, "Export answers.json"),
        ]),
      ]);
    }

    function render() {
      return e("main", { class: "main review", role: "main", id: "app-main" }, [
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
      return e("main", { class: "main preview", role: "main", id: "app-main" }, [
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

  // ----- StartupScreen (V2.1) ------------------------------------------------
  //
  // Three states:
  //
  //   (1) File System Access API not supported. Show legacy choice screen
  //       with Continue / Start a new project / Load from file (one-off pick).
  //
  //   (2) API supported but no projects directory configured yet. Show a
  //       "Choose where your projects will be saved" prompt with one button.
  //
  //   (3) API supported AND directory configured. List all *.json projects
  //       in that directory with Load / Delete buttons each, plus a
  //       "+ New project" button and a "Change folder" link.

  const StartupScreen = (function () {
    function hasMeaningfulLocalState() {
      const s = State.get();
      if (!s) return false;
      if (s.project_slug) return true;
      const phases = s.phases || {};
      for (const id in phases) {
        const phase = phases[id];
        if (!phase) continue;
        if (phase.phase_comment) return true;
        const answers = phase.answers || {};
        for (const qid in answers) {
          const a = answers[qid];
          if (a && a.state && a.state !== "blank") return true;
        }
      }
      return false;
    }

    function _humanSize(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function _humanWhen(ts) {
      const d = new Date(ts);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) return d.toTimeString().slice(0, 5);
      return d.toISOString().slice(0, 10);
    }

    // --- Legacy startup (no File System Access API) ----------------------------
    function _renderLegacy(host, onChoice) {
      const showContinue = hasMeaningfulLocalState();
      const slug = (State.get() || {}).project_slug || "";
      Renderer.clear(host);
      const buttons = [];
      if (showContinue) {
        buttons.push(e("button", {
          type: "button",
          class: "primary startup-btn",
          onclick: function () { onChoice("continue"); },
        }, [
          e("strong", null, "▸ Continue with my saved project"),
          slug ? e("span", { class: "muted startup-btn-aside" }, " — " + slug) : null,
        ]));
      }
      buttons.push(e("button", {
        type: "button",
        class: (showContinue ? "" : "primary ") + "startup-btn",
        onclick: function () { onChoice("new"); },
      }, [e("strong", null, "▸ Start a new project")]));
      buttons.push(e("button", {
        type: "button",
        class: "startup-btn",
        onclick: function () { onChoice("load"); },
      }, [e("strong", null, "▸ Load a saved project from file")]));

      host.appendChild(e("main", { class: "screen startup", id: "app-main" }, [
        e("div", { class: "banner" }, [
          e("strong", null, "Browser-storage mode. "),
          "This browser does not support saving directly to the filesystem. ",
          "Your work is kept in this browser's localStorage; export answers.json regularly to avoid loss. ",
          "Chrome / Edge unlock automatic file-based saves with a list of all your projects.",
        ]),
        e("p", { class: "kicker" }, "Welcome"),
        e("h1", null, "Prompt Wizard for Claude Code"),
        e("div", { class: "startup-actions" }, buttons),
        _versionFooter(),
      ]));
    }

    // --- Pick-directory first-run --------------------------------------------
    function _renderPickDir(host, onPick) {
      Renderer.clear(host);
      host.appendChild(e("main", { class: "screen startup", id: "app-main" }, [
        e("p", { class: "kicker" }, "Welcome"),
        e("h1", null, "Choose where your projects live"),
        e("p", { class: "muted" },
          "The wizard saves each project as a JSON file in a folder you choose. " +
          "Pick one now — the next time you open the wizard, it will open in this folder and " +
          "list your saved projects."),
        e("div", { class: "startup-actions" }, [
          e("button", {
            type: "button",
            class: "primary startup-btn",
            onclick: function () { onPick(); },
          }, [e("strong", null, "▸ Choose folder")]),
        ]),
        _versionFooter(),
      ]));
    }

    // --- Project list (file-backed mode) -------------------------------------
    function _renderProjectList(host, projects, handlers) {
      Renderer.clear(host);
      const items = projects.length === 0
        ? [e("li", { class: "muted project-list-empty" }, "No projects yet. Create one below.")]
        : projects.map(function (p) {
            return e("li", { class: "project-row" }, [
              e("div", { class: "project-row-info" }, [
                e("strong", null, p.slug),
                e("span", { class: "muted project-row-meta" },
                  " · " + _humanWhen(p.modified_at) + " · " + _humanSize(p.size)),
              ]),
              e("div", { class: "project-row-actions" }, [
                e("button", {
                  type: "button",
                  class: "primary",
                  onclick: function () { handlers.onLoad(p.slug); },
                }, "Load"),
                e("button", {
                  type: "button",
                  class: "danger-btn",
                  onclick: function () { handlers.onDelete(p.slug); },
                  "aria-label": "Delete " + p.slug,
                }, "Delete"),
              ]),
            ]);
          });

      host.appendChild(e("main", { class: "screen startup", id: "app-main" }, [
        e("p", { class: "kicker" }, "Welcome"),
        e("h1", null, "Your projects"),
        e("p", { class: "muted" }, [
          "Saved as JSON files in your chosen folder. ",
          e("button", {
            type: "button",
            class: "link",
            onclick: handlers.onChangeFolder,
          }, "Change folder"),
        ]),
        e("ul", { class: "project-list" }, items),
        e("div", { class: "startup-actions" }, [
          e("button", {
            type: "button",
            class: "primary startup-btn",
            onclick: handlers.onNew,
          }, [e("strong", null, "+ New project")]),
        ]),
        _versionFooter(),
      ]));
    }

    function _versionFooter() {
      return e("p", { class: "muted footer" }, [
        "prompt-wizard ",
        String((Data.buildInfo || {}).wizard_version || "dev"),
        (Data.buildInfo && Data.buildInfo.commit_sha) ? " · " + Data.buildInfo.commit_sha : "",
      ]);
    }

    // --- Mount: dispatch to the right state ----------------------------------
    async function mount(host, handlers) {
      // Legacy mode: API not supported.
      if (!ProjectStore.available()) {
        _renderLegacy(host, handlers.onLegacyChoice);
        return;
      }
      // Try to get the directory; if none, prompt the user.
      const dir = await ProjectStore.getDirectoryHandle();
      if (!dir) {
        _renderPickDir(host, async function () {
          try {
            const picked = await ProjectStore.pickDirectory();
            if (picked) await mount(host, handlers); // re-mount in list mode
          } catch (err) {
            window.alert("Could not access that folder: " + (err && err.message ? err.message : err));
          }
        });
        return;
      }
      // List mode.
      try {
        const projects = await ProjectStore.listProjects();
        _renderProjectList(host, projects, {
          onLoad: handlers.onLoadFromList,
          onDelete: async function (slug) {
            if (!window.confirm("Delete project '" + slug + "'? This deletes the JSON file from your folder; it cannot be undone.")) return;
            try {
              await ProjectStore.deleteProjectFile(slug);
              await mount(host, handlers); // re-render the list
            } catch (err) {
              window.alert("Could not delete that project: " + (err && err.message ? err.message : err));
            }
          },
          onNew: handlers.onNewInDir,
          onChangeFolder: async function () {
            if (!window.confirm("Change to a different folder? Your existing projects will stay where they are; the wizard will simply look in the new folder from now on.")) return;
            try {
              const picked = await ProjectStore.pickDirectory();
              if (picked) await mount(host, handlers);
            } catch (err) {
              window.alert("Could not change folder: " + (err && err.message ? err.message : err));
            }
          },
        });
      } catch (err) {
        console.error("Could not list projects:", err);
        window.alert("Could not read the projects folder: " + (err && err.message ? err.message : err));
      }
    }

    return { mount, hasMeaningfulLocalState };
  })();

  // ----- ProjectNameDialog ---------------------------------------------------

  const ProjectNameDialog = (function () {
    const PATTERN = /^[a-z][a-z0-9-]{2,59}$/;

    function isValid(name) { return PATTERN.test(name); }

    function suggestFromString(s) {
      return String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    }

    function mount(host, opts) {
      let value = opts.initial || "";

      function rerender() {
        Renderer.clear(host);
        const valid = isValid(value);
        const error = !valid && value.length > 0
          ? "Name must be 3–60 lowercase letters/digits/hyphens, starting with a letter."
          : null;

        host.appendChild(e("main", { class: "screen project-name", id: "app-main" }, [
          e("p", { class: "kicker" }, "Step 1 of 2"),
          e("h1", null, opts.title || "Name your project"),
          e("p", { class: "muted" },
            "Used as the ZIP directory name and shown throughout the app. " +
            "Lowercase letters, digits, and hyphens; 3–60 characters; must start with a letter."),
          e("p", null, [
            e("input", {
              type: "text",
              class: "q-input",
              placeholder: "my-cool-project",
              value: value,
              autofocus: true,
              "aria-label": "Project name",
              "aria-invalid": (!valid && value.length > 0) ? "true" : "false",
              oninput: function (ev) {
                value = ev.currentTarget.value;
                // Re-render if the validity state flips, so the error / button enables.
                rerender();
                // Refocus the input and restore caret position.
                const input = host.querySelector('input[type="text"]');
                if (input) {
                  input.focus();
                  const len = input.value.length;
                  try { input.setSelectionRange(len, len); } catch (_) {}
                }
              },
              onkeydown: function (ev) {
                if (ev.key === "Enter" && valid) { onCreate(); }
              },
            }),
          ]),
          error ? e("p", { class: "danger" }, error) : null,
          e("div", { class: "project-name-actions" }, [
            e("button", { type: "button", onclick: opts.onCancel }, "Cancel"),
            e("button", {
              type: "button",
              class: "primary",
              disabled: !valid,
              onclick: onCreate,
            }, "Create project"),
          ]),
        ]));
      }

      function onCreate() {
        if (!isValid(value)) return;
        opts.onCreate(value);
      }

      rerender();
    }

    return { mount, isValid, suggestFromString };
  })();

  // ----- WizardApp -----------------------------------------------------------

  const WizardApp = (function () {
    let host = null;
    let lastRoute = null;

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
        e("a", { href: "#app-main", class: "skip-link" }, "Skip to main content"),
        HeaderBar.render(),
        e("div", { class: "app-body" }, [
          NavSidebar.render(target),
          mainView,
        ]),
      ]));
      if (Router.current() !== target) Router.go(target);

      // After paint, surface the change to assistive tech.
      // Only move focus and announce on actual route changes — re-rendering
      // for state updates (radio click, mode switch, etc.) must not steal
      // focus away from the control the user just interacted with.
      if (target !== lastRoute) {
        lastRoute = target;
        // Defer to the next tick so the new DOM is in place.
        setTimeout(function () {
          A11y.focusHeading(host);
          A11y.announcePhaseChange(target);
        }, 0);
      }
      // Save status changes are surfaced separately (only non-OK states).
      A11y.announceSaveStatusIfNotable();
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

  function _routeToWizardOrPreflight(host) {
    if (State.get().preflight && State.get().preflight.claude_code_attested) {
      WizardApp.mount(host);
    } else {
      PreflightScreen.mount(host, attestAndEnter);
    }
  }

  function _showStartup() {
    const host = document.getElementById("app");
    if (!host) return;
    StartupScreen.mount(host, {
      // Legacy (no FileSystem API) handlers
      onLegacyChoice: _onLegacyStartupChoice,
      // File-backed handlers
      onLoadFromList: _loadFromProjectList,
      onNewInDir: _newProjectInDirFlow,
    });
  }

  // ---- Legacy (localStorage-backed) startup -------------------------------

  function _onLegacyStartupChoice(choice) {
    const host = document.getElementById("app");
    if (!host) return;
    if (choice === "continue") {
      _routeToWizardOrPreflight(host);
    } else if (choice === "new") {
      if (StartupScreen.hasMeaningfulLocalState()) {
        if (!window.confirm("Discard the current project and start a new one? This cannot be undone.")) {
          return;
        }
      }
      _askProjectNameAndStart();
    } else if (choice === "load") {
      _triggerFilePicker();
    }
  }

  function _askProjectNameAndStart() {
    const host = document.getElementById("app");
    ProjectNameDialog.mount(host, {
      title: "Name your new project",
      initial: "",
      onCreate: function (slug) {
        State.reset();
        State.commit(function (s) { s.project_slug = slug; });
        _routeToWizardOrPreflight(host);
      },
      onCancel: function () { _showStartup(); },
    });
  }

  // ---- File-backed (Chromium) startup -------------------------------------

  async function _loadFromProjectList(slug) {
    const host = document.getElementById("app");
    try {
      const data = await ProjectStore.loadProjectFile(slug);
      if (!_validateImportedState(data)) {
        window.alert("Project file '" + slug + ".json' is not a recognised wizard project.");
        return;
      }
      State.replace(data);
      State.setActiveProject(slug);
      _routeToWizardOrPreflight(host);
    } catch (err) {
      console.error(err);
      window.alert("Could not open that project: " + (err && err.message ? err.message : err));
    }
  }

  async function _newProjectInDirFlow() {
    const host = document.getElementById("app");
    ProjectNameDialog.mount(host, {
      title: "Name your new project",
      initial: "",
      onCreate: async function (slug) {
        try {
          // Refuse to overwrite an existing project with the same name.
          if (await ProjectStore.projectFileExists(slug)) {
            window.alert("A project named '" + slug + "' already exists in this folder. Choose a different name.");
            return;
          }
          State.reset();
          State.commit(function (s) { s.project_slug = slug; });
          // Create the file immediately, even though it's empty — that's the
          // user's explicit V2.1 directive: "must be created even empty and
          // gradually fill up when user go through the forms".
          await ProjectStore.createProjectFile(slug, State.get());
          State.setActiveProject(slug);
          _routeToWizardOrPreflight(host);
        } catch (err) {
          console.error(err);
          window.alert("Could not create the project file: " + (err && err.message ? err.message : err));
        }
      },
      onCancel: function () { _showStartup(); },
    });
  }

  function _validateImportedState(data) {
    return data
      && typeof data === "object"
      && typeof data.answers_schema_version === "string"
      && data.phases && typeof data.phases === "object";
  }

  async function _triggerFilePicker() {
    const result = await FilePicker.pickToOpen({ "application/json": [".json"] });
    if (!result.ok) {
      // User cancelled or read failed silently. Stay on startup screen.
      return;
    }
    try {
      const data = JSON.parse(result.text);
      if (!_validateImportedState(data)) {
        window.alert("This file does not look like a saved prompt-wizard project (answers.json).");
        return;
      }
      State.replace(data);
      const host = document.getElementById("app");
      _routeToWizardOrPreflight(host);
    } catch (e) {
      window.alert("Could not parse this file as JSON: " + (e && e.message ? e.message : e));
    }
  }

  // Header gear / new-project button helpers (used by HeaderBar).
  function _onHeaderNewProject() {
    // In file-backed mode, return to the startup screen so the user can pick
    // an existing project from the list OR create a new one in their folder.
    // In legacy mode, fall through to the local-state confirm + name dialog.
    if (ProjectStore.available()) {
      _showStartup();
      return;
    }
    if (StartupScreen.hasMeaningfulLocalState()) {
      if (!window.confirm("Discard the current project and start a new one? This cannot be undone.")) return;
    }
    _askProjectNameAndStart();
  }
  function _onHeaderSettings() {
    // V2.1 stub. V2.3 mounts the AISettings modal here.
    window.alert("Settings — coming in V2.3 (AI configuration: API key, model, cost meter).");
  }
  // Expose them so HeaderBar (defined earlier in this IIFE) can wire its buttons.
  // HeaderBar.render() reads window.PromptWizard.headerActions.
  if (typeof window !== "undefined") {
    window.PromptWizard = window.PromptWizard || {};
    window.PromptWizard.headerActions = {
      newProject: _onHeaderNewProject,
      openSettings: _onHeaderSettings,
    };
  }

  function boot() {
    const host = document.getElementById("app");
    if (!host) return;
    State.init();

    host.hidden = false;
    _showStartup();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
