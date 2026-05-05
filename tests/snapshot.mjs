#!/usr/bin/env node
/* Snapshot test runner for prompt-wizard.
 *
 * Reads:
 *   --data-bundle <path>   JSON containing {taxonomy, techStacks, prerequisites, buildInfo}.
 *                          Caller (build.py) pre-converts the YAML data files.
 *   --examples-root <path> Directory holding one subdirectory per example, each with
 *                            state.json
 *                            expected-bundle/...   (the expected directory tree)
 *   --update               When set, re-bake every expected-bundle/ from current state.
 *
 * Without --update, exits non-zero if any generated file differs from its committed
 * counterpart, with a precise file-by-file diff report.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);

function parseArgs(argv) {
  const out = { update: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--update") out.update = true;
    else if (a === "--data-bundle")    out.dataBundle = argv[++i];
    else if (a === "--examples-root")  out.examplesRoot = argv[++i];
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!out.dataBundle)   throw new Error("--data-bundle is required");
  if (!out.examplesRoot) throw new Error("--examples-root is required");
  return out;
}

function listExpectedFiles(dir) {
  const out = [];
  function walk(rel) {
    const abs = path.join(dir, rel);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(abs)) walk(path.join(rel, entry));
    } else if (stat.isFile()) {
      out.push(rel);
    }
  }
  if (fs.existsSync(dir)) walk("");
  return out.sort();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function diffSummary(actual, expected) {
  // Cheap line-level summary — show the first 8 differing lines.
  const aLines = actual.split("\n");
  const eLines = expected.split("\n");
  const diffs = [];
  const max = Math.max(aLines.length, eLines.length);
  for (let i = 0; i < max && diffs.length < 8; i++) {
    if (aLines[i] !== eLines[i]) {
      diffs.push(`  L${i + 1}:`);
      diffs.push(`    expected: ${JSON.stringify(eLines[i] ?? "(missing line)")}`);
      diffs.push(`    actual:   ${JSON.stringify(aLines[i] ?? "(missing line)")}`);
    }
  }
  return diffs.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);

  const Generator = require(path.resolve(__dirname, "..", "src", "generator.js"));
  const dataBundle = JSON.parse(fs.readFileSync(args.dataBundle, "utf8"));

  const examplesRoot = path.resolve(args.examplesRoot);
  const exampleNames = fs.readdirSync(examplesRoot).filter(function (name) {
    const p = path.join(examplesRoot, name);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "state.json"));
  }).sort();

  if (exampleNames.length === 0) {
    console.error(`no examples found under ${examplesRoot}`);
    process.exit(2);
  }

  let totalFails = 0;
  for (const name of exampleNames) {
    const exampleDir   = path.join(examplesRoot, name);
    const statePath    = path.join(exampleDir, "state.json");
    const expectedRoot = path.join(exampleDir, "expected-bundle");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const generated = Generator.generateAll(state, dataBundle);

    if (args.update) {
      // Wipe and re-bake.
      fs.rmSync(expectedRoot, { recursive: true, force: true });
      ensureDir(expectedRoot);
      for (const [rel, content] of Object.entries(generated)) {
        writeFile(path.join(expectedRoot, rel), content);
      }
      console.log(`updated ${name} (${Object.keys(generated).length} files)`);
      continue;
    }

    let exampleFails = 0;
    const actualFiles = Object.keys(generated).sort();
    const expectedFiles = listExpectedFiles(expectedRoot);

    // Files missing from one side or the other.
    const onlyInActual   = actualFiles.filter(function (f) { return expectedFiles.indexOf(f) < 0; });
    const onlyInExpected = expectedFiles.filter(function (f) { return actualFiles.indexOf(f) < 0; });

    for (const f of onlyInActual) {
      console.error(`FAIL ${name}: extra file in generated output: ${f}`);
      exampleFails++;
    }
    for (const f of onlyInExpected) {
      console.error(`FAIL ${name}: missing from generated output: ${f}`);
      exampleFails++;
    }

    // Common files: byte-compare (after normalising the JSON answers file
    // for predictable formatting).
    for (const rel of actualFiles) {
      if (expectedFiles.indexOf(rel) < 0) continue;
      const actual = generated[rel];
      const expected = fs.readFileSync(path.join(expectedRoot, rel), "utf8");
      if (actual !== expected) {
        console.error(`FAIL ${name}: ${rel} differs`);
        const summary = diffSummary(actual, expected);
        if (summary) console.error(summary);
        exampleFails++;
      }
    }

    if (exampleFails === 0) {
      console.log(`OK   ${name} — ${actualFiles.length} files match`);
    } else {
      totalFails += exampleFails;
    }
  }

  if (args.update) {
    console.log("--update: snapshots refreshed. Run again without --update to verify.");
    process.exit(0);
  }

  if (totalFails > 0) {
    console.error(`\n${totalFails} snapshot failure(s) across ${exampleNames.length} example(s).`);
    process.exit(1);
  }
  console.log(`\nAll ${exampleNames.length} examples match their snapshots.`);
}

main().catch(function (err) {
  console.error(err && err.stack || err);
  process.exit(2);
});
