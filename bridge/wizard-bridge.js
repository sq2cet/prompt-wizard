#!/usr/bin/env node
/* prompt-wizard local Claude Code bridge.
 *
 * A tiny HTTP server that lets the wizard's "Get AI review" button hit a
 * locally-installed `claude` CLI instead of api.anthropic.com. No npm install
 * required — vanilla Node 18+ only.
 *
 * Usage:
 *   node wizard-bridge.js               # listens on http://localhost:4179
 *   node wizard-bridge.js 4500          # custom port
 *   WIZARD_BRIDGE_PORT=4500 node ...    # via env var
 *
 * The wizard's Settings modal (in "Local Claude Code" mode) will:
 *   - probe GET /health to confirm the bridge is up
 *   - POST /review with the same body shape it would send to Anthropic
 *
 * The bridge spawns `claude -p ... --append-system-prompt ... --output-format json`,
 * extracts the request_review JSON from Claude's response, and wraps it in an
 * envelope shaped like the Anthropic Messages API so the wizard's parser is
 * unchanged.
 *
 * No persistent state. No logging beyond stderr. Stop with Ctrl-C.
 */

"use strict";

const http = require("node:http");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");

const VERSION = "2.1.0";
const DEFAULT_PORT = 4179;
const port = parseInt(
  process.argv[2] || process.env.WIZARD_BRIDGE_PORT || DEFAULT_PORT,
  10,
);

// --------------------------------------------------------------------------
// HTTP plumbing
// --------------------------------------------------------------------------

function setCors(res) {
  // file:// origins send Origin: null. * is acceptable here because the
  // bridge binds to 127.0.0.1 only — there's no exposure beyond the local
  // machine. The wizard never sends credentials.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
}

function jsonResponse(res, status, body) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req, maxBytes) {
  const cap = maxBytes || 4_000_000;
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let total = 0;
    req.on("data", function (d) {
      total += d.length;
      if (total > cap) {
        req.destroy();
        return reject(new Error("Request body exceeded " + cap + " bytes."));
      }
      chunks.push(d);
    });
    req.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}

// --------------------------------------------------------------------------
// Claude Code invocation
// --------------------------------------------------------------------------

// claude -p doesn't expose Anthropic-style tool-use forcing, so the bridge
// instead asks Claude to emit a JSON code block. The wizard's system prompt
// is appended verbatim after this preamble — Claude reads both and produces
// JSON that matches the request_review schema.
const BRIDGE_PREAMBLE = [
  "You are running via the Claude Code CLI as a bridge for the Prompt Wizard.",
  "Tool-use is unavailable in this mode. The original system prompt below tells",
  "you to call a tool named `request_review`. Instead, respond with **ONLY**",
  "a single JSON code block whose contents match the `request_review` tool's",
  "`input_schema`. Do not write any prose, headings, or commentary outside the",
  "code block. The wizard parses your response by extracting the first",
  "fenced JSON block.",
  "",
  "Required shape:",
  "```json",
  "{",
  "  \"ready_to_generate\": false,",
  "  \"summary\": \"one-sentence overview, optional\",",
  "  \"issues\": [",
  "    {",
  "      \"id\": \"iss-1\",",
  "      \"kind\": \"ambiguity|conflict|duplicate|misplaced|redundant|missing_context\",",
  "      \"phase_id\": \"<phase id from the taxonomy>\",",
  "      \"question_id\": \"<question id, optional>\",",
  "      \"comment\": \"plain-English explanation, <= 400 chars\",",
  "      \"suggestion\": \"concrete proposed change, <= 400 chars\",",
  "      \"severity\": \"info|warning|conflict\",",
  "      \"related\": [{ \"phase_id\": \"...\", \"question_id\": \"...\" }]",
  "    }",
  "  ]",
  "}",
  "```",
  "",
  "The `id` field is optional — the wizard assigns its own iss-N ids on",
  "receipt. Set `ready_to_generate: true` and `issues: []` if you have",
  "nothing to flag.",
  "",
  "----- ORIGINAL SYSTEM PROMPT BELOW -----",
  "",
].join("\n");

function runClaude(systemPrompt, userPrompt, model) {
  return new Promise(function (resolve, reject) {
    const fullSystem = BRIDGE_PREAMBLE + (systemPrompt || "");
    const args = [
      "-p", userPrompt,
      "--append-system-prompt", fullSystem,
      "--output-format", "json",
    ];
    if (model) {
      args.push("--model", model);
    }
    const proc = spawn("claude", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", function (d) { stdout += d; });
    proc.stderr.on("data", function (d) { stderr += d; });
    proc.on("close", function (code) {
      if (code !== 0) {
        return reject(new Error(
          "claude exited with code " + code + ". stderr: " +
          (stderr.trim() || "(empty)") + ". stdout: " + (stdout.trim().slice(0, 500) || "(empty)")
        ));
      }
      resolve({ stdout: stdout, stderr: stderr });
    });
    proc.on("error", function (err) {
      reject(new Error(
        "Failed to spawn `claude`: " + err.message + ". " +
        "Is Claude Code installed and on PATH? Try `which claude` in your terminal."
      ));
    });
  });
}

function extractJson(text) {
  // Try the first fenced JSON block. Falls back to the first balanced {...}.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch (_) { /* fall through */ }
  }
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === "\"") { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch (_) { return null; }
      }
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Request handlers
// --------------------------------------------------------------------------

async function handleReview(req, res) {
  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch (err) {
    return jsonResponse(res, 400, {
      error: { type: "bad_request", message: "Invalid JSON body: " + err.message },
    });
  }

  const systemPrompt = body.system || "";
  const userPrompt = (body.messages && body.messages[0] && body.messages[0].content) || "";
  const model = body.model || null;
  if (!userPrompt) {
    return jsonResponse(res, 400, {
      error: { type: "bad_request", message: "Empty messages[0].content" },
    });
  }

  let claudeOut;
  try {
    claudeOut = await runClaude(systemPrompt, userPrompt, model);
  } catch (err) {
    return jsonResponse(res, 502, {
      error: { type: "claude_failed", message: err.message },
    });
  }

  let envelope;
  try {
    envelope = JSON.parse(claudeOut.stdout);
  } catch (err) {
    return jsonResponse(res, 502, {
      error: {
        type: "parse_failed",
        message:
          "Could not parse `claude --output-format json` stdout. Did you upgrade Claude Code recently? Error: " +
          err.message,
        raw: claudeOut.stdout.slice(0, 500),
      },
    });
  }

  if (envelope.is_error) {
    return jsonResponse(res, 502, {
      error: {
        type: "claude_error",
        message: envelope.result || "Claude returned an error envelope.",
        subtype: envelope.subtype || "unknown",
      },
    });
  }

  const reviewJson = extractJson(envelope.result || "");
  if (!reviewJson) {
    return jsonResponse(res, 502, {
      error: {
        type: "no_json",
        message:
          "Claude's response did not contain a JSON block matching `request_review`. " +
          "The bridge looked for a ```json fenced block, then for a balanced {...}. " +
          "First 500 chars of Claude's response below.",
        raw: (envelope.result || "").slice(0, 500),
      },
    });
  }

  const usage = envelope.usage || {};
  const messagesEnvelope = {
    content: [{
      type: "tool_use",
      name: "request_review",
      input: reviewJson,
    }],
    model: model || "claude-code-local",
    usage: {
      input_tokens: usage.input_tokens | 0,
      output_tokens: usage.output_tokens | 0,
    },
    stop_reason: "tool_use",
    // Bridge-specific fields the wizard may surface in the AI panel meta line.
    bridge: {
      version: VERSION,
      cost_usd: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : null,
      duration_ms: envelope.duration_ms || null,
      session_id: envelope.session_id || null,
    },
  };
  jsonResponse(res, 200, messagesEnvelope);
}

// --------------------------------------------------------------------------
// Server bootstrap
// --------------------------------------------------------------------------

const server = http.createServer(async function (req, res) {
  let url;
  try { url = new URL(req.url, "http://127.0.0.1:" + port); }
  catch (_) { return jsonResponse(res, 400, { error: { type: "bad_url", message: "Bad request URL." } }); }

  if (req.method === "OPTIONS") {
    setCors(res);
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return jsonResponse(res, 200, {
      ok: true,
      name: "wizard-bridge",
      version: VERSION,
      claude_command: "claude",
      port: port,
    });
  }

  if (req.method === "POST" && url.pathname === "/review") {
    try {
      await handleReview(req, res);
    } catch (err) {
      // Last-resort guard so the server doesn't crash on unexpected throws.
      try {
        jsonResponse(res, 500, { error: { type: "internal", message: err.message } });
      } catch (_) { /* ignore */ }
    }
    return;
  }

  jsonResponse(res, 404, {
    error: {
      type: "not_found",
      message: req.method + " " + url.pathname + " is not a bridge endpoint. Try GET /health or POST /review.",
    },
  });
});

server.listen(port, "127.0.0.1", function () {
  process.stderr.write(
    "wizard-bridge " + VERSION + " listening on http://localhost:" + port + "\n" +
    "  endpoints: GET /health, POST /review\n" +
    "  press Ctrl-C to stop\n"
  );
});

server.on("error", function (err) {
  if (err.code === "EADDRINUSE") {
    process.stderr.write(
      "ERROR: port " + port + " is already in use.\n" +
      "Pass a different port: node wizard-bridge.js 4180\n"
    );
    process.exit(1);
  }
  process.stderr.write("Bridge error: " + err.message + "\n");
  process.exit(1);
});
