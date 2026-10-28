#!/usr/bin/env node

// ../host/src/delegation/main.ts
import fs32 from "node:fs";
import path32 from "node:path";

// ../host/src/delegation/mcp.ts
import { execFileSync as execFileSync3 } from "node:child_process";
import fs26 from "node:fs";
import os7 from "node:os";
import path26 from "node:path";

// ../host/src/mcp/server.ts
import readline from "node:readline";
var PROTOCOL_VERSION = "2025-06-18";
var SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
function toolText(result) {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}
function argError(tool, args) {
  for (const key2 of tool.inputSchema.required ?? []) {
    const v = args[key2];
    if (typeof v !== "string" || !v.trim()) return `Missing required argument: ${key2}`;
  }
  for (const [key2, v] of Object.entries(args)) {
    if (!(key2 in tool.inputSchema.properties)) return `Unknown argument: ${key2}`;
    if (v === void 0) continue;
    const type = tool.inputSchema.properties[key2]?.type;
    if (Array.isArray(type) && type.length === 2 && type.includes("integer") && type.includes("array")) {
      const count4 = Number.isInteger(v) || typeof v === "string" && /^\s*\d+\s*$/.test(v);
      if (!count4 && !(Array.isArray(v) && v.every((x) => typeof x === "string"))) return `Argument ${key2} must be an integer or a list of strings`;
    } else if (type === "integer") {
      if (!(Number.isInteger(v) || typeof v === "string" && /^\s*\d+\s*$/.test(v))) return `Argument ${key2} must be an integer`;
    } else if (type === "boolean") {
      if (!(typeof v === "boolean" || v === "true" || v === "false")) return `Argument ${key2} must be true or false`;
    } else if (type === "array") {
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return `Argument ${key2} must be a list of strings`;
    } else if (typeof v !== "string") return `Argument ${key2} must be a string`;
  }
  return void 0;
}
function createStdioMcp(tools, handlers, io = { stdin: process.stdin, stdout: process.stdout }, info = {}) {
  const rl = readline.createInterface({ input: io.stdin, crlfDelay: Infinity });
  const pending = /* @__PURE__ */ new Set();
  const send = (msg) => {
    io.stdout.write(JSON.stringify(msg) + "\n");
  };
  const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
  const error = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
  async function callTool2(id, params) {
    const name = params.name;
    const tool = tools.find((t) => t.name === name);
    if (!tool) return error(id, -32602, `Unknown tool: ${String(name)}`);
    const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {};
    const bad = argError(tool, args);
    if (bad) return reply(id, { content: [{ type: "text", text: bad }], isError: true });
    try {
      const handler = handlers[tool.name];
      if (!handler) return reply(id, { content: [{ type: "text", text: `No handler for ${tool.name}` }], isError: true });
      const result = await handler(args);
      const out = { content: [{ type: "text", text: toolText(result) }], isError: false };
      if (result && typeof result === "object" && !Array.isArray(result)) out.structuredContent = result;
      reply(id, out);
    } catch (e) {
      reply(id, { content: [{ type: "text", text: `Nudge couldn't do that: ${e.message}` }], isError: true });
    }
  }
  async function handle(msg) {
    const hasId = typeof msg.id === "string" || typeof msg.id === "number";
    const id = hasId ? msg.id : null;
    if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      if (hasId && msg.method === void 0 && ("result" in msg || "error" in msg)) return;
      return error(id, -32600, "Invalid request");
    }
    const params = msg.params && typeof msg.params === "object" ? msg.params : {};
    if (!hasId) return;
    switch (msg.method) {
      case "initialize": {
        const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
        return reply(id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: info.name ?? "nudge", version: info.version ?? "0.0.0" },
          ...info.instructions ? { instructions: info.instructions } : {}
        });
      }
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, { tools });
      case "tools/call":
        return callTool2(id, params);
      default:
        return error(id, -32601, `Method not found: ${msg.method}`);
    }
  }
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return error(null, -32700, "Parse error");
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return error(null, -32600, "Invalid request");
    const p = handle(msg).catch((e) => {
      const m = msg;
      const id = typeof m.id === "string" || typeof m.id === "number" ? m.id : null;
      error(id, -32603, `Internal error: ${e.message}`);
    });
    pending.add(p);
    void p.finally(() => pending.delete(p));
  });
  const done = new Promise((resolve) => {
    rl.on("close", () => {
      void Promise.allSettled([...pending]).then(() => resolve());
    });
  });
  return { done, close: () => rl.close() };
}

// ../host/src/oversight/helpers.ts
import fs3 from "node:fs";
import os from "node:os";
import path3 from "node:path";
import readline2 from "node:readline";

// ../host/src/oversight/prices.ts
import { createHash } from "node:crypto";
import fs2 from "node:fs";
import path2 from "node:path";

// ../host/src/oversight/price-feed.ts
import fs from "node:fs";
import path from "node:path";
var FEED_MAX_AGE_MS = 24 * 36e5;
var feedFile = (home3) => path.join(home3, "prices.json");
function feedDisabled(home3, env = process.env) {
  if (/^(?:off|0|false|no)$/i.test(env.NUDGE_PRICE_FEED ?? "")) return true;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(home3, "config.json"), "utf8"));
    return raw.prices?.feed === false;
  } catch {
    return false;
  }
}
function readFeed(home3) {
  try {
    const f = JSON.parse(fs.readFileSync(feedFile(home3), "utf8"));
    return f && f.v === 1 && f.prices && typeof f.prices === "object" ? f : void 0;
  } catch {
    return void 0;
  }
}
function loadPriceFeed(home3, env = process.env) {
  if (feedDisabled(home3, env)) return {};
  return readFeed(home3)?.prices ?? {};
}

// ../host/src/oversight/prices.ts
var PRICES = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-mythos-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-mythos-5*": { input: 10, output: 50, cacheRead: 1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-opus-4-1": { input: 15, output: 75 },
  "claude-opus-4": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet*": { input: 3, output: 15, verify: true },
  "claude-haiku-4-5*": { input: 1, output: 5 },
  "gpt-5": { input: 1.25, output: 10, verify: true },
  "gpt-5-mini": { input: 0.25, output: 2, verify: true },
  "kimi-k2*": { input: 0.6, output: 2.5, verify: true },
  "deepseek-*": { input: 0.28, output: 1.1, verify: true },
  "glm-*": { input: 0.6, output: 2.2, verify: true },
  "qwen*": { input: 0.4, output: 1.2, verify: true }
};
var FALLBACK_PRICE = { input: 5, output: 25, verify: true, unknown: true };
var CACHE_WRITE_5M = 1.25;
var CACHE_WRITE_1H = 2;
var CACHE_READ = 0.1;
function normalizeModel(model) {
  let m = model.trim().toLowerCase().replace(/\[[^\]]*\]$/, "");
  m = m.slice(m.lastIndexOf("/") + 1);
  m = m.replace(/^(?:[a-z]{2}\.)?anthropic\./, "").replace(/-v\d+(?::\d+)?$/, "");
  return m;
}
function matches(model, key2) {
  if (key2.endsWith("*")) return model.startsWith(key2.slice(0, -1));
  if (model === key2) return true;
  return model.startsWith(key2) && /^-(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(model.slice(key2.length));
}
function loadPriceOverrides(root) {
  try {
    const raw = JSON.parse(fs2.readFileSync(path2.join(root, "config.json"), "utf8"));
    if (!raw.prices || typeof raw.prices !== "object") return {};
    const out = {};
    for (const [key2, v] of Object.entries(raw.prices)) {
      const p = v;
      if (!p || typeof p.input !== "number" || typeof p.output !== "number") continue;
      out[key2.toLowerCase()] = { input: p.input, output: p.output, ...typeof p.cacheRead === "number" ? { cacheRead: p.cacheRead } : {} };
    }
    return out;
  } catch {
    return {};
  }
}
function loadPrices(root, env = process.env) {
  return { ...loadPriceFeed(root, env), ...loadPriceOverrides(root) };
}
function createPriceTable(overrides = {}) {
  const table = { ...PRICES, ...overrides };
  const keys = Object.keys(table).sort((a, b) => b.replace("*", "").length - a.replace("*", "").length);
  let stamp;
  return {
    get stamp() {
      return stamp ??= createHash("sha1").update(JSON.stringify(table)).digest("hex").slice(0, 12);
    },
    priceFor(model) {
      const m = normalizeModel(model);
      const key2 = keys.find((k3) => matches(m, k3));
      return key2 ? table[key2] : FALLBACK_PRICE;
    }
  };
}
function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
}
function costUsd(t, p) {
  const readPrice = p.cacheRead ?? p.input * CACHE_READ;
  return (t.input * p.input + t.output * p.output + t.cacheRead * readPrice + t.cacheWrite5m * (p.cacheWrite5m ?? p.input * CACHE_WRITE_5M) + t.cacheWrite1h * (p.cacheWrite1h ?? p.input * CACHE_WRITE_1H)) / 1e6;
}
var TIERS = [
  { name: "haiku", label: "Haiku", model: "claude-haiku-4-5" },
  { name: "sonnet", label: "Sonnet", model: "claude-sonnet-5" },
  { name: "opus", label: "Opus", model: "claude-opus-5" },
  { name: "fable", label: "Fable", model: "claude-fable-5-1" }
];
function tierOf(model) {
  const m = normalizeModel(model);
  if (!m.startsWith("claude-")) return void 0;
  if (m.includes("haiku")) return 0;
  if (m.includes("sonnet")) return 1;
  if (m.includes("opus")) return 2;
  if (m.includes("fable") || m.includes("mythos")) return 3;
  return void 0;
}
function tierDown(model) {
  const t = tierOf(model);
  return t === void 0 || t === 0 ? void 0 : TIERS[t - 1].model;
}

// ../host/src/oversight/commands.ts
var TEST_HINT = /(?:^|\s|&&|;|\|)(?:(?:pnpm|npm|yarn|bun)(?:\s+(?:-r|-w|--filter\s+\S+))*\s+(?:run\s+)?test\b|(?:npx\s+|pnpm\s+(?:exec\s+)?)?vitest\b|(?:npx\s+)?jest\b|(?:python3?\s+-m\s+)?pytest\b|go\s+test\b|cargo\s+test\b|swift\s+test\b|xcodebuild\b.*\stest\b|make\s+test\b)/;
function looksLikeTestCommand(cmd) {
  return TEST_HINT.test(cmd);
}
var READ_ONLY_PROGRAMS = /* @__PURE__ */ new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "pwd",
  "echo",
  "grep",
  "rg",
  "ag",
  "which",
  "file",
  "stat",
  "du",
  "df",
  "tree",
  "sort",
  "uniq",
  "cut",
  "jq",
  "diff",
  "cd",
  "true",
  "date",
  "env",
  "printenv"
]);
var READ_ONLY_GIT = /* @__PURE__ */ new Set(["status", "log", "diff", "show", "branch", "rev-parse", "blame", "ls-files", "remote", "describe", "shortlog"]);
function isReadOnlyBash(cmd) {
  const cleaned = cmd.replace(/\d?>&\d/g, "").replace(/2>\s*\/dev\/null/g, "");
  if (/[<>`]|\$\(/.test(cleaned)) return false;
  const segments = cleaned.split(/&&|\|\||;|\|/).map((s2) => s2.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((seg) => {
    if (looksLikeTestCommand(seg)) return true;
    const words = seg.split(/\s+/);
    const prog = words[0] ?? "";
    if (prog === "git") {
      const sub = words.find((w, i) => i > 0 && !w.startsWith("-") && words[i - 1] !== "-C");
      return !!sub && READ_ONLY_GIT.has(sub);
    }
    if (prog === "find") return !/\s-(?:delete|exec|execdir|ok)\b/.test(seg);
    return READ_ONLY_PROGRAMS.has(prog);
  });
}
function outputLooksFailed(output) {
  const tail3 = output.slice(-4e3);
  if (/\b[1-9]\d*\s+(?:failed|failing|failures?|errors?)\b/i.test(tail3)) return true;
  if (/^\s*(?:FAIL|FAILED|✗|×)\b/m.test(tail3)) return true;
  if (/\b(?:AssertionError|Unhandled error|Test(?:s)? failed|Build failed|Compilation failed)\b/i.test(tail3)) return true;
  return /^Exit code [1-9]/m.test(output.slice(0, 200));
}
var ARG = String.raw`(?:\s+[A-Za-z0-9_./:@=,+-]+)*`;
var ALLOWED = [
  new RegExp(String.raw`^(?:pnpm|npm|yarn|bun)(?:\s+(?:-r|-w|--filter\s+[A-Za-z0-9_@./-]+))*\s+(?:run\s+)?test${ARG}$`),
  new RegExp(String.raw`^(?:(?:npx|pnpm|yarn|bunx)\s+(?:exec\s+)?)?vitest\s+run${ARG}$`),
  new RegExp(String.raw`^(?:(?:npx|pnpm|yarn)\s+(?:exec\s+)?)?jest${ARG}$`),
  new RegExp(String.raw`^(?:python3?\s+-m\s+)?pytest${ARG}$`),
  new RegExp(String.raw`^go\s+test${ARG}$`),
  new RegExp(String.raw`^cargo\s+test${ARG}$`),
  new RegExp(String.raw`^swift\s+test${ARG}$`),
  new RegExp(String.raw`^xcodebuild${ARG}\s+test${ARG}$`),
  new RegExp(String.raw`^make\s+test$`)
];

// ../host/src/oversight/usage.ts
var READ_TOOLS = /* @__PURE__ */ new Set(["Read", "Grep", "Glob", "LS", "WebFetch", "WebSearch"]);
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var BASH_TOOLS = /* @__PURE__ */ new Set(["Bash", "bash", "shell", "exec_command"]);
var STREAK_IDLE_TURNS = 10;
var QUESTION_TOOLS = /* @__PURE__ */ new Set(["AskUserQuestion", "ExitPlanMode"]);
var DONE_WORDS = /\b(?:done|pass(?:es|ed|ing)?|green|complete[ds]?|finished|fixed|implemented|working|shipped|ready)\b/i;
var CORRECTIONS = [
  /(?:^|[.!?]\s+)no,/i,
  /\bthat'?s (?:wrong|not right|incorrect)\b/i,
  /\bstill (?:not|doesn'?t|broken|failing|fails)\b/i,
  /\bdoesn'?t work\b/i,
  /\bnot what I (?:asked|wanted|meant)\b/i
];
function isCorrection(text2) {
  return CORRECTIONS.some((re) => re.test(text2));
}
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
function readUsage(u) {
  const t = emptyUsage();
  t.input = num(u.input_tokens);
  t.output = num(u.output_tokens);
  t.cacheRead = num(u.cache_read_input_tokens);
  const split = u.cache_creation;
  const has1h = split && typeof split.ephemeral_1h_input_tokens === "number";
  const has5m = split && typeof split.ephemeral_5m_input_tokens === "number";
  if (has1h || has5m) {
    t.cacheWrite1h = num(split.ephemeral_1h_input_tokens);
    t.cacheWrite5m = num(split.ephemeral_5m_input_tokens);
  } else {
    t.cacheWrite5m = num(u.cache_creation_input_tokens);
  }
  return t;
}
function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((b) => b && typeof b === "object" && b.type === "text" ? String(b.text ?? "") : "").join("\n");
}
function newScan() {
  return { messages: /* @__PURE__ */ new Map(), events: [], failures: 0, corrections: 0, edits: /* @__PURE__ */ new Map(), activity: [], waits: [] };
}
function typedWords(text2) {
  const t = text2.trim();
  if (!t || t.startsWith("<") || t.startsWith("[Request interrupted") || t.startsWith("Caveat:") || t.startsWith("This session is being continued from a previous conversation")) return void 0;
  return t;
}
function scanLine(scan, toolCalls, raw) {
  if (!raw.trim()) return;
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof d.timestamp === "string") {
    if (!scan.started || d.timestamp < scan.started) scan.started = d.timestamp;
    if (!scan.ended || d.timestamp > scan.ended) scan.ended = d.timestamp;
  }
  if (!scan.cwd && typeof d.cwd === "string") scan.cwd = d.cwd;
  const message = d.message;
  if (!message) return;
  if (d.type === "assistant") {
    const id = typeof message.id === "string" ? message.id : void 0;
    const model = typeof message.model === "string" ? message.model : void 0;
    if (!id || !model || model === "<synthetic>") return;
    const at = typeof d.timestamp === "string" ? d.timestamp : void 0;
    if (at) {
      const t = Date.parse(at);
      if (!Number.isNaN(t)) scan.activity.push(t);
    }
    let msg = scan.messages.get(id);
    if (!msg) {
      msg = { id, model, usage: emptyUsage(), tools: [], ...at ? { at } : {}, ...scan.lastPromptChars !== void 0 ? { afterPromptChars: scan.lastPromptChars } : {} };
      scan.messages.set(id, msg);
      scan.events.push({ kind: "msg", id });
      scan.lastPromptChars = void 0;
    }
    if (message.usage && typeof message.usage === "object") msg.usage = readUsage(message.usage);
    if (Array.isArray(message.content)) {
      for (const b of message.content) {
        if (b?.type === "text" && d.isSidechain !== true) {
          const text2 = String(b.text ?? "");
          if (DONE_WORDS.test(text2)) msg.doneText = `${msg.doneText ? `${msg.doneText}
` : ""}${text2.slice(0, 600)}`.slice(0, 1200);
        }
        if (b?.type !== "tool_use") continue;
        const input = b.input ?? {};
        const call = {
          name: String(b.name ?? "tool"),
          ...at ? { at } : {},
          ...typeof input.command === "string" ? { command: input.command } : {},
          ...typeof input.file_path === "string" ? { file: input.file_path } : typeof input.notebook_path === "string" ? { file: input.notebook_path } : typeof input.path === "string" ? { file: input.path } : {}
        };
        msg.tools.push(call);
        if (typeof b.id === "string") toolCalls.set(b.id, call);
        if (EDIT_TOOLS.has(call.name) && call.file) scan.edits.set(call.file, (scan.edits.get(call.file) ?? 0) + 1);
      }
    }
    return;
  }
  if (d.type === "user" && d.isMeta !== true) {
    const at = typeof d.timestamp === "string" ? d.timestamp : void 0;
    const content = message.content;
    const typed = (text2) => {
      const words = d.isSidechain === true ? void 0 : typedWords(text2);
      if (words) {
        scan.lastPromptChars = words.length;
        scan.firstPrompt ??= words.slice(0, 300);
      }
      if (!text2.startsWith("<") && isCorrection(text2)) {
        scan.corrections++;
        scan.events.push({ kind: "fail", ...at ? { at } : {} });
      }
    };
    if (typeof content === "string") {
      typed(content);
      return;
    }
    if (!Array.isArray(content)) return;
    for (const b of content) {
      if (b?.type === "text") {
        typed(String(b.text ?? ""));
      } else if (b?.type === "tool_result") {
        scan.lastPromptChars = void 0;
        if (at) {
          const t = Date.parse(at);
          if (!Number.isNaN(t)) scan.activity.push(t);
        }
        const call = toolCalls.get(String(b.tool_use_id ?? ""));
        if (call && QUESTION_TOOLS.has(call.name) && call.at && at && at > call.at) scan.waits.push({ from: call.at, to: at });
        if (!call || !BASH_TOOLS.has(call.name)) continue;
        const isTest = !!call.command && looksLikeTestCommand(call.command);
        const failed = b.is_error === true || isTest && outputLooksFailed(resultText(b.content));
        if (failed) {
          scan.failures++;
          scan.events.push({ kind: "fail", ...at ? { at } : {} });
        } else if (isTest) {
          scan.events.push({ kind: "pass", ...at ? { at } : {} });
        }
      }
    }
  }
}
function classifyStep(tools) {
  if (tools.length === 0) return "complex";
  const files = new Set(tools.map((t) => t.file).filter(Boolean));
  if (files.size >= 3) return "complex";
  const routine = tools.every((t) => READ_TOOLS.has(t.name) || BASH_TOOLS.has(t.name) && !!t.command && isReadOnlyBash(t.command));
  return routine ? "routine" : "complex";
}
function isTroubled(scan) {
  return scan.failures >= 3 || Math.max(0, ...scan.edits.values()) >= 4 || scan.corrections >= 2;
}
function failureStreaks(scan) {
  const out = [];
  let streak = null;
  const close = (all) => {
    if (streak && streak.failures >= 2) {
      const ids = all ? streak.ids : streak.ids.slice(0, streak.markAt + 1);
      out.push({ ids, failures: streak.failures, ...streak.startAt ? { startAt: streak.startAt } : {} });
    }
    streak = null;
  };
  for (const ev of scan.events) {
    if (ev.kind === "fail") {
      if (!streak) streak = { failures: 1, ids: [], markAt: 0, idle: 0, ...ev.at ? { startAt: ev.at } : {} };
      else {
        streak.failures++;
        streak.markAt = streak.ids.length;
        streak.idle = 0;
      }
    } else if (ev.kind === "pass") {
      close(true);
    } else if (streak) {
      streak.ids.push(ev.id);
      streak.idle++;
      if (streak.idle > STREAK_IDLE_TURNS) close(false);
    }
  }
  close(false);
  return out;
}

// ../host/src/oversight/helpers.ts
var toCounts = (t) => ({ input: t.input, output: t.output, cacheRead: t.cacheRead, cacheWrite: t.cacheWrite5m + t.cacheWrite1h });
var TASK_CLIP = 400;
function firstText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  for (const b of content) {
    if (b?.type === "text") return String(b.text ?? "");
  }
  return "";
}
function finish(scan, prices, meta) {
  if (scan.messages.size === 0) return void 0;
  const msgCost = /* @__PURE__ */ new Map();
  const byModel = /* @__PURE__ */ new Map();
  const total = emptyUsage();
  let usd4 = 0;
  let couldHave = 0;
  let routineSteps = 0;
  for (const m of scan.messages.values()) {
    const c = costUsd(m.usage, prices.priceFor(m.model));
    msgCost.set(m.id, c);
    usd4 += c;
    byModel.set(m.model, (byModel.get(m.model) ?? 0) + c);
    for (const k3 of Object.keys(total)) total[k3] += m.usage[k3];
    const down = tierDown(m.model);
    if (classifyStep(m.tools) === "routine") {
      routineSteps++;
      couldHave += down ? costUsd(m.usage, prices.priceFor(down)) : c;
    } else {
      couldHave += c;
    }
  }
  const model = [...byModel.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const waste = isTroubled(scan) ? failureStreaks(scan).reduce((sum3, s2) => sum3 + s2.ids.reduce((n2, id) => n2 + (msgCost.get(id) ?? 0), 0), 0) : 0;
  const tier = tierOf(model);
  return {
    id: meta.agentId ?? `run-${scan.started ?? "unknown"}`,
    at: scan.started ?? "",
    ...scan.ended ? { endedAt: scan.ended } : {},
    sessionId: meta.sessionId ?? "",
    agent: meta.agent ?? "unknown",
    model,
    ...tier === void 0 ? {} : { tier },
    task: meta.task ?? "",
    steps: scan.messages.size,
    routineSteps,
    tokens: toCounts(total),
    usd: usd4,
    couldHaveUsd: couldHave,
    failures: scan.failures,
    corrections: scan.corrections,
    wasteUsd: waste
  };
}
async function helperRunFromFile(file, prices) {
  const scan = newScan();
  const toolCalls = /* @__PURE__ */ new Map();
  const meta = {};
  const rl = readline2.createInterface({ input: fs3.createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    scanLine(scan, toolCalls, line);
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof d.agentId === "string") meta.agentId ??= d.agentId;
    if (typeof d.sessionId === "string") meta.sessionId ??= d.sessionId;
    if (typeof d.attributionAgent === "string") meta.agent ??= d.attributionAgent;
    if (meta.task === void 0 && d.type === "user") {
      const t = firstText(d.message?.content).trim();
      if (t) meta.task = t.slice(0, TASK_CLIP);
    }
  }
  return finish(scan, prices, meta);
}
var DEFAULT_PROJECTS_ROOT = path3.join(os.homedir(), ".claude", "projects");
function findHelperFiles(projectsRoot) {
  const out = [];
  let projects;
  try {
    projects = fs3.readdirSync(projectsRoot).map((p) => path3.join(projectsRoot, p));
  } catch {
    return out;
  }
  for (const project of projects) {
    let sessions;
    try {
      sessions = fs3.readdirSync(project, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path3.join(project, e.name));
    } catch {
      continue;
    }
    for (const session of sessions) {
      const dir = path3.join(session, "subagents");
      try {
        for (const f of fs3.readdirSync(dir).sort()) if (f.endsWith(".jsonl")) out.push(path3.join(dir, f));
      } catch {
      }
    }
  }
  return out.sort();
}

// ../host/src/delegation/advise.ts
var LADDER = ["haiku", "sonnet", "opus", "fable"];
var MIN_RUNS = 5;
var tierOf2 = (model) => {
  const m = (model ?? "").toLowerCase();
  return LADDER.findIndex((t) => m.includes(t));
};
function byTier(yours, team = []) {
  const merge = (cells, source) => {
    const out = /* @__PURE__ */ new Map();
    for (const c of cells) {
      const t = tierOf2(c.model);
      if (t < 0) continue;
      const had = out.get(t);
      const runs = (had?.runs ?? 0) + c.runs;
      const weigh = (a, b) => ((had ? a * had.runs : 0) + b * c.runs) / runs;
      out.set(t, { tier: LADDER[t], runs, failedShare: weigh(had?.failedShare ?? 0, c.failedShare), takenOverShare: weigh(had?.takenOverShare ?? 0, c.takenOverShare ?? 0), source });
    }
    return out;
  };
  const enough = (m) => new Map([...m].filter(([, r]) => r.runs >= MIN_RUNS));
  const mine = enough(merge(yours, "yours"));
  for (const [t, r] of enough(merge(team, "team"))) if (!mine.has(t)) mine.set(t, r);
  return [...mine.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

// ../host/src/delegation/api-client.ts
import fs4 from "node:fs";
import path4 from "node:path";
var OPERATIONS = [
  "transform-by-rule",
  "locate-definition",
  "list-from-registry",
  "answer-code-question",
  "explain-named-code",
  "test-named-branches",
  "implement-from-spec",
  "change-one-function",
  "add-config-entry",
  "fix-compiler-listed",
  "copy-existing-pattern",
  "rename-in-one-file",
  "research-note",
  "fact-check-doc",
  "place-given-content",
  "fix-many-sites",
  "diagnose-from-symptoms",
  "trace-across-files",
  "pin-algorithm-behaviour",
  "debug-unknown-causes",
  "change-protected-behaviour",
  "other"
];
var isOperation = (v) => typeof v === "string" && OPERATIONS.includes(v);
var SPLIT_KEYS = ["all-new", "tested", "named-files", "small-existing", "large-existing", "few-files", "browser"];
var KIND = /^([a-z-]+)~(?:not-)?([a-z-]+)$/;
var isKind = (v) => {
  if (isOperation(v)) return true;
  const m = typeof v === "string" ? KIND.exec(v) : null;
  return !!m && isOperation(m[1]) && SPLIT_KEYS.includes(m[2].replace(/^not-/, ""));
};
var API_MODELS = ["gpt-oss-20b", "haiku", "sonnet", "opus"];
var CANDIDATES = ["gpt-oss-20b", "haiku"];
function apiRank(model) {
  const m = (model ?? "").toLowerCase();
  if (m.includes("fable")) return API_MODELS.length;
  return API_MODELS.findIndex((t) => m.includes(t));
}
var CONFIG_FILE = "delegation-api.json";
var ADVICE_FILE = "delegation-advice.json";
var LIVE_TIMEOUT_MS = 2e3;
var REFRESH_TIMEOUT_MS = 1e4;
var PUBLIC_API_URL = "https://nudge-delegation-api.nudge-delegation-api.workers.dev";
function readConfig(home3, env = process.env) {
  const own = apiConfig(home3);
  if (own) return own;
  if (env.NUDGE_PUBLIC_API === "off") return void 0;
  try {
    const c = JSON.parse(fs4.readFileSync(path4.join(home3, CONFIG_FILE), "utf8"));
    if (c?.public === false || c?.url !== void 0) return void 0;
  } catch {
  }
  return { url: PUBLIC_API_URL };
}
var readHeaders = (cfg) => cfg.key ? { authorization: `Bearer ${cfg.key}` } : {};
function apiConfig(home3) {
  try {
    const c = JSON.parse(fs4.readFileSync(path4.join(home3, CONFIG_FILE), "utf8"));
    if (typeof c.url !== "string" || !/^https:\/\//.test(c.url) || typeof c.key !== "string" || !c.key) return void 0;
    return { url: c.url.replace(/\/+$/, ""), key: c.key };
  } catch {
    return void 0;
  }
}
function guardOn(home3, env = process.env) {
  const admin = (env.NUDGE_GUARD ?? "").trim().toLowerCase();
  if (/^(on|1|true|yes)$/.test(admin)) return true;
  if (/^(off|0|false|no)$/.test(admin)) return false;
  try {
    return JSON.parse(fs4.readFileSync(path4.join(home3, CONFIG_FILE), "utf8")).guard === true;
  } catch {
    return false;
  }
}
function readAdvice(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const o = raw;
  if (!isKind(o.operation)) return void 0;
  if (o.why !== "cheapest-proven" && o.why !== "none-proven") return void 0;
  if (o.why === "cheapest-proven" && !API_MODELS.includes(o.model)) return void 0;
  const advised = o.why === "cheapest-proven" && CANDIDATES.includes(o.model) ? o.model : null;
  if (!Array.isArray(o.ladder)) return void 0;
  const n2 = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  const ladder = [];
  for (const r of o.ladder) {
    if (!r || !API_MODELS.includes(r.model)) continue;
    ladder.push({
      model: r.model,
      runs: n2(r.runs),
      passes: n2(r.passes),
      failures: n2(r.failures),
      proven: r.proven === true,
      medianUsd: typeof r.medianUsd === "number" && Number.isFinite(r.medianUsd) ? r.medianUsd : null
    });
  }
  return { operation: o.operation, model: advised, why: advised ? "cheapest-proven" : "none-proven", ladder };
}
function readCache(home3) {
  try {
    const c = JSON.parse(fs4.readFileSync(path4.join(home3, ADVICE_FILE), "utf8"));
    if (c.version !== 1 || typeof c.fetchedAt !== "string" || !Array.isArray(c.operations)) return void 0;
    return { version: 1, fetchedAt: c.fetchedAt, operations: c.operations.map(readAdvice).filter((a) => !!a) };
  } catch {
    return void 0;
  }
}
function writeCache(home3, cache) {
  try {
    fs4.mkdirSync(home3, { recursive: true });
    const file = path4.join(home3, ADVICE_FILE);
    const tmp = `${file}.${process.pid}.tmp`;
    fs4.writeFileSync(tmp, `${JSON.stringify(cache, null, 2)}
`);
    fs4.renameSync(tmp, file);
  } catch {
  }
}
function cachedAdvice(home3, operation) {
  const c = readCache(home3);
  const advice = c?.operations.find((a) => a.operation === operation);
  return c && advice ? { advice, fetchedAt: c.fetchedAt } : void 0;
}
async function adviceFor(home3, operation, fetchImpl = fetch) {
  const cfg = readConfig(home3);
  if (cfg) {
    try {
      const r = await fetchImpl(`${cfg.url}/v1/advice?operation=${encodeURIComponent(operation)}`, {
        headers: readHeaders(cfg),
        signal: AbortSignal.timeout(LIVE_TIMEOUT_MS)
      });
      const advice = r.ok ? readAdvice(await r.json()) : void 0;
      if (advice) {
        const at = (/* @__PURE__ */ new Date()).toISOString();
        const old = readCache(home3);
        writeCache(home3, {
          version: 1,
          fetchedAt: old?.fetchedAt ?? at,
          operations: [...(old?.operations ?? []).filter((a) => a.operation !== operation), advice]
        });
        return { from: "live", advice, fetchedAt: at };
      }
    } catch {
    }
  }
  const cached = cachedAdvice(home3, operation);
  return cached ? { from: "cache", ...cached } : { from: "none" };
}
async function refreshAdvice(home3, fetchImpl = fetch) {
  const cfg = readConfig(home3);
  if (!cfg) return "not_configured";
  try {
    const r = await fetchImpl(`${cfg.url}/v1/stats`, { headers: readHeaders(cfg), signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) });
    if (!r.ok) return "failed";
    const body = await r.json();
    if (!Array.isArray(body.operations)) return "failed";
    const operations = body.operations.map(readAdvice).filter((a) => !!a);
    writeCache(home3, { version: 1, fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), operations });
    return "refreshed";
  } catch {
    return "failed";
  }
}

// ../host/src/delegation/handover.ts
import { randomBytes } from "node:crypto";
import fs14 from "node:fs";
import path14 from "node:path";

// ../delegation-api/src/policy.ts
var PRICES2 = {
  "claude-fable-5-1": 50,
  "claude-opus-5-5": 20,
  "claude-sonnet-5-5": 10,
  "claude-haiku-4-5": 5,
  "deepseek/deepseek-v4-flash": 0.26,
  "openai/gpt-5-nano": 0.4,
  // gateway list prices of the models chosen for the screen (C:/nudge-review/program/models.json, 3 Oct 2026)
  "inclusionai/ling-3.0-flash": 0.063,
  "amazon/nova-micro": 0.14,
  "inception/mercury-2.5": 0.15,
  "mistral/ministral-14b": 0.2,
  "nvidia/nemotron-3-nano-30b-a3b": 0.2,
  "poolside/laguna-s-2.1": 0.2,
  "xiaomi/mimo-v2.5": 0.28,
  "openai/gpt-6-luna": 0.5,
  "zai/glm-5.3-flash": 0.5,
  "tencent/hy3": 0.58,
  "alibaba/qwen3-coder-30b-a3b": 0.6,
  "google/gemma-4-26b-a4b-it": 0.6,
  "nvidia/nemotron-3-super-120b-a12b": 0.65,
  "mixedbread/toast-1": 0.72,
  "xiaomi/mimo-v2.6-pro": 0.87,
  "arcee-ai/trinity-large-thinking": 0.9,
  "mistral/codestral": 0.9,
  "meta/llama-4-maverick": 0.97,
  "stepfun/step-3.7-flash": 1.15,
  "alibaba/qwen3-coder-next": 1.2,
  "deepseek/deepseek-v4.1-flash": 1.2,
  "minimax/minimax-m3": 1.2,
  "thinkingmachines/inkling-small": 1.2,
  "xiaomi/mimo-v2.6-flash": 1.28,
  "meta/muse-glimmer-30b": 1.5,
  "mistral/mistral-large-3": 1.5,
  "deepseek/deepseek-v3.2": 1.85,
  "deepseek/deepseek-v4-pro": 1.98,
  "bytedance/seed-1.6": 2,
  "moonshotai/kimi-k2-thinking": 2,
  "openai/gpt-5.1-codex-mini": 2,
  "spacexai/grok-build-0.1": 2,
  "nvidia/nemotron-3-ultra-550b-a55b": 2.4,
  "amazon/nova-2-lite": 2.5,
  "bytedance/seed-2.1-turbo": 2.5,
  "google/gemini-3.5-flash-lite": 2.5,
  "spacexai/grok-4.3": 2.5,
  "spacexai/grok-4.20-reasoning": 2.5,
  "amazon/nova-pro": 3.2,
  "google/gemini-3.8-flash": 3.75,
  "moonshotai/kimi-k2.7-code": 4,
  "moonshotai/kimi-k2.6": 4,
  "sakana/namazu": 4,
  "zai/glm-5v-turbo": 4,
  "thinkingmachines/inkling": 4.05,
  "meta/muse-spark-1.3": 4.25,
  "zai/glm-5.3": 4.4,
  "openai/gpt-5.4-mini": 4.5,
  "alibaba/qwen3-coder-plus": 5
};
var median = (xs) => {
  if (!xs.length) return null;
  const s2 = [...xs].sort((a, b) => a - b);
  const m = s2.length >> 1;
  return s2.length % 2 ? s2[m] : (s2[m - 1] + s2[m]) / 2;
};
var LEAD = "claude-opus-5-5";
var S0 = {
  small: { usd: [0.4384266, 0.4033942, 0.1910426, 0.217037, 0.276598], passes: 5, takeovers: 0 },
  medium: { usd: [0.5353208, 0.2891382, 0.4189, 0.34355, 0.3317714], passes: 5, takeovers: 0 },
  large: { usd: [1.2417662, 0.5751372], passes: 2, takeovers: 0 }
};
var S1 = {
  small: { usd: [0.2546, 0.3298, 0.1254, 0.1892, 0.2141], passes: 5, takeovers: 0 },
  medium: { usd: [0.2854, 0.2746, 0.6982, 0.2786, 0.3265], passes: 5, takeovers: 0 },
  large: { usd: [2.8339, 0.3597, 0.6899, 0.9581, 1.1342], passes: 5, takeovers: 0 }
};
var S2 = {
  small: { usd: [0.0179, 0.1347, 6e-3, 0.0198, 86e-4], passes: 5, takeovers: 0 },
  medium: { usd: [0.0405, 0.0173, 0.035, 0.021, 0.0173], passes: 5, takeovers: 0 },
  large: { usd: [0.251, 0.0754, 0.1103, 0.1806, 0.2405], passes: 5, takeovers: 0 }
};
var S3 = {
  small: { usd: [0.1113, 0.1145, 0.0166, 0.0514, 0.0417], passes: 2, takeovers: 3 },
  medium: { usd: [0.0939, 0.0946, 0.0749, 0.0868, 0.0474], passes: 1, takeovers: 4 },
  large: { usd: [0.1531, 0.0913, 0.1203, 0.0578, 0.0897], passes: 2, takeovers: 3 }
};
var SIZES = ["small", "medium", "large"];
function rows(stage, worker, harness, verdict, basis, note) {
  return SIZES.map((size) => {
    const b = stage[size];
    const m = median(b.usd);
    const n2 = note?.(size);
    return {
      lead: LEAD,
      worker,
      harness,
      kind: "code-edit",
      size,
      verdict: verdict(size),
      runs: b.usd.length,
      passes: b.passes,
      takeovers: b.takeovers,
      workerUsd: worker === null ? null : m,
      loadedUsd: worker === null ? m : null,
      basis: `${b.usd.length} ${size} job${b.usd.length === 1 ? "" : "s"}, lab, ${basis}`,
      confidence: "low",
      ...n2 ? { note: n2 } : {}
    };
  });
}
var REPLAY_BASIS = "real creatos commits, replay 10-23 Oct";
var replayRow = (worker, size, runs, passes, usd4) => ({
  lead: LEAD,
  worker,
  // the lead alone is filed under the gateway harness: it is the baseline a gateway handover is weighed against
  harness: "gateway",
  kind: "code-edit",
  size,
  verdict: worker === null ? "keep" : "measured",
  runs,
  passes,
  takeovers: 0,
  workerUsd: worker === null ? null : usd4,
  loadedUsd: worker === null ? usd4 : null,
  basis: `${runs} ${size} job${runs === 1 ? "" : "s"}, ${REPLAY_BASIS}${worker === null ? ", Claude's own turns, a lower bound" : ""}`,
  confidence: runs >= 20 ? "medium" : "low"
});
var REPLAY = [
  replayRow("poolside/laguna-s-2.1", "small", 11, 11, 0.013),
  replayRow("poolside/laguna-s-2.1", "medium", 40, 39, 0.015),
  replayRow("poolside/laguna-s-2.1", "large", 59, 53, 0.099),
  replayRow("deepseek/deepseek-v4.1-flash", "small", 2, 2, 0.02),
  replayRow("deepseek/deepseek-v4.1-flash", "medium", 9, 9, 0.035),
  replayRow("deepseek/deepseek-v4.1-flash", "large", 12, 12, 0.068),
  replayRow(null, "medium", 9, 9, 2.39),
  replayRow(null, "large", 23, 23, 3.44)
];
var POLICY = [
  ...rows(
    S0,
    null,
    "claude-code",
    () => "keep",
    "3-4 Oct",
    (size) => size === "large" ? "lead-alone baseline still filling for large jobs: 2 of 5 in as of 4 Oct 03:04Z" : void 0
  ),
  ...rows(
    S1,
    "claude-haiku-4-5",
    "claude-code",
    (size) => size === "large" ? "delegate" : "keep",
    "3 Oct",
    (size) => size === "large" ? void 0 : "kept under an Opus lead: Haiku's output price is a quarter of Opus's, not a tenth (rule 5); admitted under a Fable lead"
  ),
  ...rows(S2, "deepseek/deepseek-v4-flash", "gateway", (size) => size === "small" ? "keep" : "delegate", "3-4 Oct"),
  // the do-not-delegate line (s3 profile.md): code edits through tool calls on the gateway harness; next rung Haiku
  ...rows(
    S3,
    "openai/gpt-5-nano",
    "gateway",
    () => "do-not-delegate",
    "3-4 Oct",
    () => "do not delegate code edits on the gateway harness: 5 of 15 passed, 10 takeovers; literal escapes written into source, unmatched edit strings, false reports"
  ),
  ...REPLAY
];

// ../delegation-api/src/runs.ts
var READ_ONLY = /* @__PURE__ */ new Set([
  "locate-definition",
  "list-from-registry",
  "answer-code-question",
  "explain-named-code",
  "research-note",
  "fact-check-doc"
]);

// ../delegation-api/src/handover.ts
function sizeBucket(size) {
  if (size.lines >= 100 || size.files >= 3) return "large";
  if (size.lines < 30 && size.files <= 1) return "small";
  return "medium";
}
var usd = (n2) => `$${n2 < 0.1 ? n2.toFixed(3) : n2.toFixed(2)}`;
function byPrice(models, price) {
  return models.map((m, i) => ({ m, i, p: price(m) ?? Number.POSITIVE_INFINITY })).sort((a, b) => a.p - b.p || a.i - b.i).map((x) => x.m);
}
var PROVEN_RUNS = 20;
function measuredCosts(policy, req, kind, size, workers) {
  const out = /* @__PURE__ */ new Map();
  const alone = policy.filter((p) => p.lead === req.lead && p.worker === null && p.kind === kind && p.size === size && p.loadedUsd != null).sort((a, b) => b.runs - a.runs)[0];
  if (!alone) return out;
  for (const w of workers) {
    const r = row(policy, req, w, kind, size);
    if (!r || r.runs < PROVEN_RUNS || r.workerUsd == null) continue;
    out.set(w, { usd: r.workerUsd + (1 - r.passes / r.runs) * alone.loadedUsd, row: r });
  }
  return out;
}
function byMeasured(ordered, measured) {
  const proven = ordered.filter((w) => measured.has(w)).sort((a, b) => measured.get(a).usd - measured.get(b).usd);
  return [...proven, ...ordered.filter((w) => !measured.has(w))];
}
var measuredWords = (w, measured) => {
  const m = measured.get(w);
  return m ? `; ranked by measured ${usd(m.usd)} a job expected (${m.row.passes} of ${m.row.runs} passed, ${m.row.basis})` : "";
};
function fires(rule, req, size, worker, level) {
  const t = rule.trigger;
  if (t.features && !t.features.some((f) => req.features.includes(f))) return false;
  if (t.operations && !t.operations.includes(req.operation)) return false;
  if (t.sizes && !t.sizes.includes(size)) return false;
  if (t.workers && !t.workers.includes(worker)) return false;
  if (t.levels && !t.levels.includes(level)) return false;
  return true;
}
function playbook(rules, req, size, worker, level) {
  const out = { lead: [], worker: [], checker: [], gates: [] };
  for (const r of rules) {
    if (r.status !== "live" || !fires(r, req, size, worker, level)) continue;
    if (r.audience === "gate") out.gates.push({ id: r.id, v: r.v });
    else if (r.audience === "checker") out.checker.push(r.phase ? { id: r.id, v: r.v, phase: r.phase, text: r.text } : { id: r.id, v: r.v, text: r.text });
    else out[r.audience].push({ id: r.id, v: r.v, text: r.text });
  }
  return out;
}
function row(policy, req, worker, kind, size) {
  const mine = policy.filter((p) => p.lead === req.lead && p.worker === worker && p.kind === kind && p.size === size);
  return mine.find((p) => p.harness === req.harness) ?? mine[0];
}
function expected(policy, req, worker, kind, size) {
  const alone = row(policy, req, null, kind, size);
  const managed = worker === null ? void 0 : row(policy, req, worker, kind, size);
  if (!alone && !managed) return null;
  const basis = [alone && `lead alone: ${alone.basis}`, managed && `${managed.worker}: ${managed.basis}`].filter(Boolean).join("; ");
  const levels = { low: 0, medium: 1, high: 2 };
  const confidence = [alone, managed].filter((r) => !!r).reduce(
    (c, r) => levels[r.confidence] < levels[c] ? r.confidence : c,
    "high"
  );
  return {
    aloneUsd: alone?.loadedUsd ?? null,
    managedUsd: managed?.loadedUsd ?? null,
    workerUsd: managed?.workerUsd ?? null,
    basis,
    // §3 rule 5: low until the checker runs are in
    confidence: worker !== null && size === "medium" ? "low" : confidence
  };
}
function costWords(policy, req, worker, kind, size) {
  const alone = row(policy, req, null, kind, size);
  const managed = worker === null ? void 0 : row(policy, req, worker, kind, size);
  const parts = [];
  if (managed?.workerUsd != null) parts.push(`${managed.worker} worker median ${usd(managed.workerUsd)} a job, ${managed.passes} of ${managed.runs} passed (${managed.basis})`);
  if (alone?.loadedUsd != null) parts.push(`${req.lead} alone median ${usd(alone.loadedUsd)} a job (${alone.basis})`);
  return parts.join("; ");
}
function decide(req, rules, policy, prices = PRICES2) {
  const price = (model) => prices[model];
  const size = sizeBucket(req.size);
  const kind = READ_ONLY.has(req.operation) ? "read-only" : "code-edit";
  const keep = (why) => ({
    decision: "keep",
    why,
    worker: null,
    level: null,
    ladder: ["lead"],
    expected: expected(policy, req, null, kind, size),
    playbook: null,
    heldBack: []
  });
  const delegate = (worker, level, why, ladder) => ({
    decision: "delegate",
    why,
    worker,
    level,
    ladder: [worker, ...ladder.filter((w2) => w2 !== worker), "lead"],
    expected: expected(policy, req, worker, kind, size),
    playbook: playbook(rules, req, size, worker, level),
    heldBack: []
  });
  if (!req.hasCheck && kind === "code-edit") return keep(`no check, no delegation: ${req.operation} changes code and nothing can grade it`);
  const banned = (w2) => policy.some((p) => p.worker === w2 && p.kind === kind && p.harness === req.harness && p.verdict === "do-not-delegate");
  const removed = req.workers.filter(banned);
  const priced = byPrice([...new Set(req.workers)].filter((w2) => !banned(w2)), price);
  const measured = measuredCosts(policy, req, kind, size, priced);
  const left = byMeasured(priced, measured);
  const removedWords = removed.length ? `; removed ${removed.join(", ")} (do-not-delegate line for ${kind} on the ${req.harness} harness)` : "";
  if (kind === "read-only") {
    if (!left.length) return keep(`read-only ${req.operation}, but no worker left${removedWords}`);
    return delegate(left[0], 4, `read-only ${req.operation}: cheapest worker, brief and check, test at the end${removedWords}`, left);
  }
  if (size === "small") {
    const cost2 = costWords(policy, req, null, kind, size);
    return keep(
      `small job (${req.size.lines} lines, ${req.size.files} file${req.size.files === 1 ? "" : "s"}): the lead's management cost as much as doing it` + (cost2 ? `; ${cost2}` : "")
    );
  }
  if (!left.length) return keep(`${size} job, but no worker left${removedWords || "; none offered"}`);
  if (req.harness === "claude-code" && req.features.includes("tests-first")) {
    const onPlan = left.filter((w2) => /^claude-/.test(w2));
    if (onPlan.length)
      return delegate(
        onPlan[0],
        3,
        `${size} job with its failing test written first: ${onPlan[0]} on your own plan; Haiku passed 26 of 26 real commits replayed this way (25 Oct), about $0.06 a job at list prices against $5.52 for the lead, no cash${removedWords}`,
        left
      );
  }
  if (size === "medium") {
    const leadPrice = price(req.lead);
    if (leadPrice === void 0) return keep(`medium job: no listed price for the lead ${req.lead}, so no worker can be shown to cost a tenth of it${removedWords}`);
    const cheap = left.filter((w3) => (price(w3) ?? Number.POSITIVE_INFINITY) <= leadPrice / 10);
    if (!cheap.length)
      return keep(
        `medium job: no worker at most a tenth of ${req.lead}'s output price ($${leadPrice}/M; cheapest offered ${left[0]} at ${price(left[0]) === void 0 ? "no listed price" : `$${price(left[0])}/M`}); managed Haiku cost 1.9 times Opus alone on ten small and medium jobs (3-4 Oct)${removedWords}`
      );
    const w2 = cheap[0];
    const cost2 = costWords(policy, req, w2, kind, size);
    return delegate(
      w2,
      3,
      `medium job; ${w2} at $${price(w2)}/M is at most a tenth of ${req.lead}'s $${leadPrice}/M` + measuredWords(w2, measured) + (cost2 ? `; ${cost2}` : "") + `; checker instead of lead review${removedWords}`,
      left
    );
  }
  const w = left[0];
  const cost = costWords(policy, req, w, kind, size);
  return delegate(w, 2, `large job: interfaces first, read-back, checker, lead on dispute; cheapest worker left` + measuredWords(w, measured) + (cost ? `; ${cost}` : "") + removedWords, left);
}

// ../delegation-api/src/rulebook.ts
var HAIKU = "claude-haiku-4-5";
var DEEPSEEK = "deepseek/deepseek-v4-flash";
var NANO = "openai/gpt-5-nano";
var READBACK = [1, 2];
var RULES = [
  // ---- lead: how to brief ----
  {
    id: "brief-check-baseline",
    v: 1,
    status: "live",
    audience: "lead",
    text: "State the check's baseline on this machine in the brief: how many tests fail now, how many pass or are skipped, and which typecheck errors already exist and are not the worker's.",
    trigger: {},
    evidence: "MC 5; 11 jobs (3fbdf9d3cf, 481d346de1, fe0e02ccca and 8 more): done became checkable by number, no worker misread a baseline."
  },
  {
    id: "brief-test-fakes",
    v: 1,
    status: "live",
    audience: "lead",
    text: "Point the worker at the test's fakes, helpers and fixtures (what they return by default, how they capture output) in the background files, and ask about them in a read-back item.",
    trigger: {},
    evidence: "MC 4; 6 jobs (2409c11b6e, fe0e02ccca, ded2802194, bbc95d38b5, 3fbdf9d3cf, 481d346de1): fe0e02ccca piece A passed first run because the worker read how the fake db answers."
  },
  {
    id: "brief-source-contract",
    v: 1,
    status: "live",
    audience: "lead",
    text: "When the failing test reads a source file and matches exact strings, say so in the brief: match character for character, keep the NOT-present and ordering assertions passing, and note that a failing expect hides the ones after it.",
    trigger: { features: ["test-pins-exact-string"] },
    evidence: "MC 6 and the pitfall card 'a test pins an exact string in a source file'; 28abd0fba6, 3c3b4dcd7c, 888c325a1b: 3c3b4dcd7c went 24/24 with exact strings first time."
  },
  {
    id: "brief-out-of-scope",
    v: 1,
    status: "live",
    audience: "lead",
    text: "Write the out-of-scope lines in the brief: what must not change, no data backfill, and 'if something outside the allowed files must change, say so in the read-back instead of changing it'.",
    trigger: {},
    evidence: "MC 7; 3c3b4dcd7c, 44b7222f25, 888c325a1b, ded2802194: no file outside the commit's files changed in any s1 job."
  },
  {
    id: "brief-no-spend",
    v: 1,
    status: "candidate",
    audience: "lead",
    text: "Forbid running anything that spends money or touches a real database or API; the checks are the test command and the typecheck only.",
    trigger: {},
    evidence: "MC 8; fe0e02ccca only, added after a peer MISSING item; a safeguard, nothing was caught."
  },
  {
    id: "brief-file-hazard",
    v: 1,
    status: "live",
    audience: "lead",
    text: "For a very large file or code inside a string, tell the worker to grep and read around the hits, give approximate line anchors marked '~', and name the file's hazard (for example escaping inside a template string).",
    trigger: { features: ["generated-code-in-string"] },
    evidence: "MC 9; 3c3b4dcd7c, 3fbdf9d3cf, 54d3904b96, ded2802194: Haiku navigated the 2,450-line script in 3fbdf9d3cf with no escaping fault."
  },
  {
    id: "brief-untested-acceptance",
    v: 1,
    status: "live",
    audience: "lead",
    text: "For a piece no test covers, say in the brief that it will be reviewed, and write the behaviour that must not change as acceptance criteria.",
    trigger: { features: ["untested-part"] },
    evidence: "MC 10; 7 jobs (b270291193, 481d346de1, 54d3904b96, bbc95d38b5, bea2229f4a, ded2802194, fe0e02ccca): the pieces where later defects appeared; the criteria made the review possible."
  },
  {
    id: "brief-verify-claims",
    v: 1,
    status: "live",
    audience: "lead",
    text: "Check every factual claim in the brief and the interfaces file against the code before sending (line numbers, constants, columns, signatures, field names).",
    trigger: {},
    evidence: "MC 11; 6 jobs (3fbdf9d3cf, 54d3904b96, bbc95d38b5, bea2229f4a, ddb39b77ba, fe0e02ccca): no brief carried a false line number."
  },
  {
    id: "brief-checker-sees-all",
    v: 1,
    status: "live",
    audience: "lead",
    text: "Give the checker every file the worker sees, including _context/interfaces.md.",
    trigger: { features: ["multi-piece"] },
    evidence: "MC 12; bbc95d38b5, bea2229f4a, ded2802194, 54d3904b96, fe0e02ccca: the peer without interfaces.md produced noise; re-run with it, it found four real gaps in bbc95d38b5."
  },
  {
    id: "brief-question-not-answer",
    v: 1,
    status: "live",
    audience: "lead",
    text: "When stating something in the brief would hand over the plan the worker is meant to find, ask it as a read-back question instead; state only constraints, never decisions.",
    trigger: { levels: READBACK },
    evidence: "MC 13; 9 jobs (2409c11b6e, 3fbdf9d3cf, 44b7222f25 and 6 more): kept the brief free of the answer while the item was still checked at read-back."
  },
  {
    id: "brief-no-priming-words",
    v: 1,
    status: "live",
    audience: "lead",
    text: "Remove from the brief any word that primes a wrong plan, even if it is true of the change (for example '1-based', 'halfway to 300K').",
    trigger: {},
    evidence: "MC 14; 28abd0fba6, 3fbdf9d3cf, ddb39b77ba, 54d3904b96, ded2802194: '1-based' suggested ordinal+1 in 28abd0fba6."
  },
  {
    id: "brief-record-what-measured",
    v: 1,
    status: "candidate",
    audience: "lead",
    text: "When the brief quotes the task statement's own wording of the rule, record that the job then measures implementation and care, not diagnosis.",
    trigger: {},
    evidence: "MC 15; 9 jobs, but it is lab bookkeeping for the supervisor, not an instruction for a handover; held as candidate on purpose."
  },
  {
    id: "brief-no-quoted-anchors",
    v: 1,
    status: "live",
    audience: "lead",
    text: "Do not add identifiers or grep anchors to the brief when a test already quotes them verbatim or the worker is told to grep.",
    trigger: {},
    evidence: "MC 16; 7 jobs (3c3b4dcd7c, 28abd0fba6, 3fbdf9d3cf, 44b7222f25, 2409c11b6e, 54d3904b96, fe0e02ccca): shorter briefs, no job suffered from the omitted anchors."
  },
  {
    id: "brief-question-per-line",
    v: 1,
    status: "live",
    audience: "lead",
    text: "Turn each open question you want answered into its own named line of the report form.",
    trigger: {},
    evidence: "MC 18; b270291193, 3c3b4dcd7c, ded2802194, bea2229f4a, 888c325a1b: in 888c325a1b a finding not given its own line was dropped."
  },
  {
    id: "brief-structure-for-hazard",
    v: 1,
    status: "live",
    audience: "lead",
    text: "When the plan has an ordering, concurrency or shared-catch hazard no test can see, hand over the structure that removes it at the go, and say why.",
    trigger: { features: ["concurrent-loop"] },
    evidence: "MC 25; bbc95d38b5 (two catch paths separated), fe0e02ccca (two passes sharing one function), 54d3904b96 (contained failure)."
  },
  {
    id: "brief-pin-and-bound",
    v: 1,
    status: "live",
    audience: "lead",
    text: "When the worker asks a design question the tests do not decide, say which part is pinned and leave the rest to it with a bound.",
    trigger: {},
    evidence: "MC 26; 28abd0fba6, 2409c11b6e, 3fbdf9d3cf, bea2229f4a: minimal diffs, no wasted rounds."
  },
  {
    id: "brief-no-second-readback",
    v: 1,
    status: "live",
    audience: "lead",
    text: "After correcting a plan at the read-back, say in the go message that no new read-back is needed.",
    trigger: { levels: READBACK },
    evidence: "MC 27; 44b7222f25 (an extra round trip without it), fe0e02ccca, ded2802194."
  },
  {
    id: "brief-light-readback",
    v: 1,
    status: "candidate",
    audience: "lead",
    text: "For a small untested piece whose interface is fully fixed in interfaces.md, drop its read-back and ask for the plan in two or three lines at the top of the report.",
    trigger: { features: ["multi-piece"] },
    evidence: "MC 28; bbc95d38b5, bea2229f4a, ded2802194, but contradicted by 54d3904b96 and fe0e02ccca, which kept the full read-back; the cut-off is unwritten, so held as candidate."
  },
  {
    id: "brief-conventions-next-turn",
    v: 1,
    status: "candidate",
    audience: "lead",
    text: "When a piece passes, read its code for the repository's conventions and fold the fixes into the next piece's message.",
    trigger: { features: ["multi-piece"] },
    evidence: "MC 30; 54d3904b96 only (unused import, a CRLF hazard, a missing header comment)."
  },
  {
    id: "interfaces-first",
    v: 1,
    status: "live",
    audience: "lead",
    text: "Write the interfaces between the pieces first (_context/interfaces.md: names, signatures, who calls whom) and have each piece built to them; pieces must agree at the seams.",
    trigger: { levels: [1, 2] },
    evidence: "Pitfall card 'pieces must agree at the seams'; all 5 large jobs in s1 and s2 (fe0e02ccca, bbc95d38b5, 54d3904b96, ded2802194, bea2229f4a) passed against a lead-written interfaces.md."
  },
  // ---- worker: standing instructions ----
  {
    id: "report-form",
    v: 1,
    status: "live",
    audience: "worker",
    text: "End with: Done; Evidence (each command and its pass/fail counts); Not done, unsure, deviations. If a test still fails after one fix attempt, stop and report what it expects versus what you produce.",
    trigger: {},
    evidence: "MC 17; 10 jobs (28abd0fba6, 3c3b4dcd7c, 044f9ef79d and 7 more): no worker ran on after a failure."
  },
  {
    id: "ask-do-not-guess",
    v: 1,
    status: "live",
    audience: "worker",
    text: "When the brief and the files do not settle a question, ask it in your read-back or report instead of guessing; never invent a fact such as a date, a line number or a default.",
    trigger: {},
    evidence: "28abd0fba6 (Claude Code Haiku saw the '+1' conflict and asked); DeepSeek invented a date in a comment (481d346de1); Haiku's unverified beliefs in 5 jobs (s1 REVIEW traits)."
  },
  {
    id: "match-exact-strings",
    v: 1,
    status: "live",
    audience: "worker",
    text: "The test reads the source file for exact strings: write them character for character in live code, never in a comment or dead code, and keep every NOT-present and ordering assertion passing.",
    trigger: { features: ["test-pins-exact-string"] },
    evidence: "Pitfall card; 28abd0fba6, 3c3b4dcd7c, 888c325a1b; GPT-5 nano pasted contract strings into comments and a dead variable (3c3b4dcd7c)."
  },
  {
    id: "escape-like-surroundings",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Code you write inside a template string is generated code: escape backslashes, backticks and dollar-brace exactly as the surrounding code does (often doubled backslashes, no live ${} meant for the generated code).",
    trigger: { features: ["generated-code-in-string"] },
    evidence: "Pitfall card; 3fbdf9d3cf (GPT-5 nano over-escaped a nested template, a real defect), 28abd0fba6 (doubled backslash in a regex)."
  },
  {
    id: "same-type-args",
    v: 1,
    status: "candidate",
    audience: "worker",
    text: "Two parameters share a type, so the compiler will not catch them swapped: at every call you add or change, check each argument against the parameter's name and list the calls you checked.",
    trigger: { features: ["two-same-type-args"] },
    evidence: "Pitfall card from the pilot; no recurrence recorded in the 45 stage jobs."
  },
  {
    id: "no-assumed-order",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Do not assume an order between things that run concurrently or come back from a query without an ORDER BY; if your code needs an order, make it explicit and name the line that enforces it.",
    trigger: { features: ["concurrent-loop"] },
    evidence: "Pitfall card 'an ordering assumed under concurrency'; fe0e02ccca piece C race, 2409c11b6e ('pass order wins' for a sorted pool, wrong), 54d3904b96 (vault.list default order assumed)."
  },
  {
    id: "build-to-interfaces",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Build each piece exactly to _context/interfaces.md; if a piece needs the interface changed, say so in your report instead of changing it.",
    trigger: { features: ["multi-piece"] },
    evidence: "Pitfall card 'interfaces first'; the 5 large jobs in s1 and s2 passed against the lead's interfaces.md."
  },
  {
    id: "report-untested",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Say in your report which parts of the change no test covers and what you checked by hand there.",
    trigger: { features: ["untested-part"] },
    evidence: "s2 fe0e02ccca: DeepSeek self-reported the dropped bytes-unavailable reason, which made the regression easy to catch and fix."
  },
  {
    id: "keep-guards",
    v: 1,
    status: "live",
    audience: "worker",
    text: "When you move or rewrite existing code, keep every condition, guard and message it had unless the brief says to drop one, and list any you changed.",
    trigger: { features: ["refactor-existing"] },
    evidence: "fe0e02ccca: Haiku dropped the !force guard (s1), DeepSeek dropped the two-case reason (s2); both were real defects no test covered."
  },
  // ---- checker: questions for the read-back and the diff ----
  {
    id: "trace-existing-test",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "readback",
    text: "Ask the worker to trace a test that passes today (not only the failing one) through its planned code and say what it now produces.",
    trigger: { levels: READBACK },
    evidence: "MC 1; 12 jobs (2409c11b6e, 28abd0fba6, ddb39b77ba and 9 more): plan errors caught before any edit."
  },
  {
    id: "uncovered-cases",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "readback",
    text: "Ask what the plan does in the cases no test covers, naming them (a null or empty value, mixed inputs, a flag, a side effect).",
    trigger: { levels: READBACK },
    evidence: "MC 2; 7 jobs; 44b7222f25: exposed a plan to drop a whole session instead of ignoring one future-dated piece."
  },
  {
    id: "callers-and-siblings",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "readback",
    text: "Ask for every caller or sibling site of what changes (from a grep) and what the plan does at each.",
    trigger: { levels: READBACK },
    evidence: "MC 3; 44b7222f25, 888c325a1b, 3c3b4dcd7c."
  },
  {
    id: "quote-not-conclusion",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "readback",
    text: "Where the read-back states a belief about existing code ('likely', 'driven by', 'orders by', 'relies on'), ask for the quoted line or the command output, naming the file and function.",
    trigger: { levels: READBACK },
    evidence: "MC 19; 6 jobs; caught vault.list ordering (54d3904b96), 'line 232' vs 234 (44b7222f25), marketplaceVersion reads (3fbdf9d3cf)."
  },
  {
    id: "point-to-file",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "readback",
    text: "When the worker asks something a background file answers, do not answer: name the file or function to read and what to report.",
    trigger: { levels: READBACK },
    evidence: "MC 20; bea2229f4a, 54d3904b96, ded2802194, fe0e02ccca: the route finding came back in bea2229f4a."
  },
  {
    id: "correct-by-question",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "readback",
    text: "Correct a wrong plan with a concrete question or scenario that names the fact or the case, never with the answer.",
    trigger: { levels: READBACK },
    evidence: "MC 21; 44b7222f25, 54d3904b96, fe0e02ccca (three faults), 28abd0fba6, b270291193: each fixed on the first question."
  },
  {
    id: "review-untested-diff",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Read the diff for code no test covers (untested pieces, restructured conditions, UI geometry, CSS, state handling, concurrency) and ask about each defect as a question.",
    trigger: { features: ["untested-part"] },
    evidence: "MC 22; 7 jobs; found every post-grade defect of s1 (chevron as triangle, dropped !force, setState in an updater) and both s2 rounds."
  },
  {
    id: "before-after-condition",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Where the diff moves or rewrites an existing condition or guard, ask the worker to compare it before and after and say what each does for the edge input.",
    trigger: { features: ["refactor-existing"] },
    evidence: "MC 23; fe0e02ccca: found the dropped !force guard no test covers (a real defect)."
  },
  {
    id: "data-path-provided",
    v: 1,
    status: "candidate",
    audience: "checker",
    phase: "diff",
    text: "For a new line that prints or uses data, ask the worker to show the code path provides it (the selected columns, the existing fields).",
    trigger: { features: ["untested-part"] },
    evidence: "MC 24; 481d346de1 only; the check passed, nothing caught."
  },
  {
    id: "minor-not-a-flag",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Do not flag a wording or style deviation that no test or behaviour depends on; list it as accepted instead.",
    trigger: {},
    evidence: "MC 29; bbc95d38b5, bea2229f4a, ded2802194, b270291193, 044f9ef79d: kept rounds to the defects."
  },
  {
    id: "no-contract-gaming",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Quote any string that the diff adds only in a comment, a dead variable or unreachable code where a source-contract test looks for it.",
    trigger: { features: ["test-pins-exact-string"] },
    evidence: "3c3b4dcd7c: GPT-5 nano pasted contract strings into comments and a dead variable 'to satisfy regression tests'."
  },
  {
    id: "check-escapes-in-string",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "In code generated inside a template string, quote every backslash, backtick and dollar-brace the diff adds and ask whether it is escaped as the surrounding code does.",
    trigger: { features: ["generated-code-in-string"] },
    evidence: "Pitfall card; 3fbdf9d3cf (over-escaped nested template), 28abd0fba6 (doubled backslash in a regex)."
  },
  {
    id: "check-arg-order",
    v: 1,
    status: "candidate",
    audience: "checker",
    phase: "diff",
    text: "For each call the diff adds or changes that passes two values of the same type, quote the call and the signature and ask whether the order is right.",
    trigger: { features: ["two-same-type-args"] },
    evidence: "Pitfall card from the pilot; no recurrence recorded in the 45 stage jobs."
  },
  {
    id: "check-order-under-concurrency",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Ask what happens when two of these run at once or finish in the other order, and for the line that guarantees the order the code relies on.",
    trigger: { features: ["concurrent-loop"] },
    evidence: "Pitfall card; fe0e02ccca piece C race (Haiku raised it when asked), 2409c11b6e (DeepSeek's wrong 'pass order wins'), 54d3904b96 (assumed list order)."
  },
  {
    id: "check-seams",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Check each piece's exports and calls against _context/interfaces.md and quote any name, argument or return shape that differs.",
    trigger: { features: ["multi-piece"] },
    evidence: "Pitfall card 'pieces must agree at the seams'; the 5 large jobs were built against interfaces.md in s1 and s2."
  },
  // ---- model traits (workers trigger) ----
  {
    id: "quote-before-claiming",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Before you state how existing code behaves (its order, its default, what a catch contains), quote the line or the command output that shows it; if you have not checked, say so.",
    trigger: { workers: [HAIKU, DEEPSEEK] },
    evidence: "s1 traits: Haiku stated unverified beliefs (vault.list order, marketplaceVersion reads, 'likely line 232', the outer try/catch, 'driven by activeTab'); s2: DeepSeek's confident wrong claims (box-shadow under clip-path b270291193, 'pass order wins' 2409c11b6e)."
  },
  {
    id: "ask-for-the-quote",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "readback",
    text: "This worker states beliefs about code without checking: for every claim about existing behaviour in the read-back, ask for the quoted line or the command output.",
    trigger: { workers: [HAIKU, DEEPSEEK], levels: READBACK },
    evidence: "s1 REVIEW: concrete 'read X and tell me' questions always fixed Haiku's unverified beliefs; s2: DeepSeek's rendering/evaluation-order claims (b270291193, 2409c11b6e) fixed from a question."
  },
  {
    id: "read-before-asking",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Before asking a question, read the background files you were given; ask only what they do not answer, and name what you read.",
    trigger: { workers: [HAIKU] },
    evidence: "s1 traits and MC 20: Haiku asked questions a background file answers (bea2229f4a, 54d3904b96, ded2802194, fe0e02ccca)."
  },
  {
    id: "answer-every-part",
    v: 1,
    status: "candidate",
    audience: "worker",
    text: "Answer every sub-question and every part of a multi-part instruction in its own report line.",
    trigger: { workers: [HAIKU] },
    evidence: "s1 traits: Haiku dropped a sub-question (888c325a1b) and part of an instruction (bea2229f4a); 2 jobs, no code defect."
  },
  {
    id: "check-report-against-diff",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Check each claim in the worker's report and each new comment against the diff; quote any the diff does not bear out.",
    // every worker (4 Oct, seeded suite): the question that caught the planted "contradicts its own comment" defects
    trigger: {},
    evidence: "s2 traits: report prose misstated the diff (bea2229f4a, fixed in a round), an invented date in a comment (481d346de1)."
  },
  {
    id: "real-newlines",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Write real newlines and tabs in source, never the two characters backslash-n or backslash-t; after every edit, read the changed lines back and confirm the file still parses.",
    trigger: { workers: [NANO] },
    evidence: "s3 traits, the dominant failure: literal backslash-n in 3c3b4dcd7c, fe0e02ccca, bbc95d38b5 (also backslash-t), 54d3904b96; doubled backslash in 28abd0fba6."
  },
  {
    id: "literal-escapes",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Search the diff for literal backslash sequences (backslash-n, backslash-t, doubled backslashes) outside string literals that had them before, and for tool-call or diff fragments written into source; quote each.",
    trigger: { workers: [NANO] },
    evidence: "s3: 3c3b4dcd7c, fe0e02ccca, bbc95d38b5, 54d3904b96 (literal escapes); ddb39b77ba (tool-call fragment and '+'/'-' diff lines written into source)."
  },
  {
    id: "exact-old-string",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Copy an edit's old string from the file without the read tool's line-number prefix and with the file's own indentation; if an edit fails twice, re-read those lines instead of retrying.",
    trigger: { workers: [NANO] },
    evidence: "s3: TAB-led or line-prefixed old strings never matched in 3c3b4dcd7c, 481d346de1, 2409c11b6e (25 failures in one step), bbc95d38b5, 54d3904b96."
  },
  {
    id: "no-whole-file-writes",
    v: 1,
    status: "live",
    audience: "worker",
    text: "Never rewrite a whole existing file; change only the lines the task needs.",
    trigger: { workers: [NANO] },
    evidence: "s3: replaced a 583-line file with '<patched>' (481d346de1); whole-file rewrites dropped its own fixes (28abd0fba6) and removed '?' characters (fe0e02ccca)."
  },
  {
    id: "edit-after-go",
    v: 1,
    status: "live",
    audience: "worker",
    text: "After the go, make the edits; do not reply with the plan again.",
    trigger: { workers: [NANO] },
    evidence: "s3: plan-only replies after an explicit go in 3fbdf9d3cf (twice), 481d346de1, b270291193 (twice), 54d3904b96."
  },
  {
    id: "distrust-pass-claims",
    v: 1,
    status: "live",
    audience: "checker",
    phase: "diff",
    text: "Do not take the report's pass counts or 'compiles' on trust; compare them with the grade's own run and quote any mismatch.",
    trigger: { workers: [NANO] },
    evidence: "s3: '9 passed' when 2 failed (28abd0fba6); 'Done' or 'compiles cleanly' with nothing changed or a broken file (ddb39b77ba, bea2229f4a, 54d3904b96)."
  },
  // ---- gates: enforced by the runner, not by words ----
  {
    id: "tests-untouched",
    v: 1,
    status: "live",
    audience: "gate",
    text: "The runner refuses a diff that edits a test file the brief did not name.",
    trigger: {},
    evidence: "No test edited in s1 or s2 (30 jobs); s3 gamed source contracts in 3c3b4dcd7c."
  },
  {
    id: "files-in-brief",
    v: 1,
    status: "live",
    audience: "gate",
    text: "The runner refuses a diff that touches a file outside the brief's list.",
    trigger: {},
    evidence: "s3 481d346de1: an unauthorised helper script outside the brief."
  },
  {
    id: "no-edit-before-go",
    v: 1,
    status: "live",
    audience: "gate",
    text: "The first step is read-only; the runner checks git status after the read-back and refuses any change before the go.",
    trigger: { levels: [1, 2] },
    evidence: "Held in all 45 stage jobs (git status after every read-back step); the pilot's GPT-5 nano edited before the go."
  },
  {
    id: "grade-by-script",
    v: 1,
    status: "live",
    audience: "gate",
    text: "The verdict comes from the grading script's own run, never from the worker's report.",
    trigger: {},
    evidence: "s3: false all-pass reports (28abd0fba6, ddb39b77ba, bea2229f4a, 54d3904b96)."
  }
];

// ../host/src/usage/plan.ts
import os3 from "node:os";
import path7 from "node:path";

// ../host/src/oversight/analytics/plan.ts
import fs5 from "node:fs";
import path5 from "node:path";
var PLAN_SOURCE = "Claude Code local settings (unofficial)";
var PLAN_MONTHLY_USD = {
  "claude pro": 20,
  "claude max": 100,
  // no multiple reported: the smaller plan, so the money is never overstated
  "claude max (5\xD7)": 100,
  "claude max (20\xD7)": 200,
  team: 25
};
var WEEKS_PER_MONTH = 365.25 / 12 / 7;
var ORG_NAMES = {
  claude_max: "Claude Max",
  claude_pro: "Claude Pro",
  claude_free: "Claude Free",
  free: "Claude Free",
  pro: "Claude Pro",
  max: "Claude Max",
  claude_team: "Team",
  team: "Team",
  claude_enterprise: "Enterprise",
  enterprise: "Enterprise"
};
var titleCase = (raw) => raw.split(/[_\s-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
var str = (v) => typeof v === "string" && v.trim() ? v.trim() : void 0;
function planFromSettings(settings, opts = {}) {
  const price = typeof opts.monthlyPriceUsd === "number" && opts.monthlyPriceUsd > 0 ? { monthlyPriceUsd: opts.monthlyPriceUsd } : {};
  const account = settings && typeof settings === "object" ? settings.oauthAccount : void 0;
  const a = account && typeof account === "object" ? account : void 0;
  if (opts.apiKeyInEnv || !a) {
    return { provider: "anthropic", kind: opts.apiKeyInEnv || settings ? "api" : "unknown", name: opts.apiKeyInEnv || settings ? "API key" : "Unknown", extraUsage: false, source: PLAN_SOURCE, ...price };
  }
  const org = str(a.organizationType)?.toLowerCase();
  const tier = str(a.organizationRateLimitTier)?.toLowerCase() ?? "";
  const billing = str(a.billingType)?.toLowerCase() ?? "";
  let name = org ? ORG_NAMES[org] ?? titleCase(org) : "Unknown";
  const multiple = /max_(\d+)x\b/.exec(tier)?.[1];
  if (name === "Claude Max" && multiple) name = `Claude Max (${multiple}\xD7)`;
  const known = !!org && org in ORG_NAMES;
  const kind = billing.includes("subscription") || known && org !== "free" && org !== "claude_free" ? "subscription" : "unknown";
  const listed = kind === "subscription" ? PLAN_MONTHLY_USD[name.trim().toLowerCase()] : void 0;
  const monthly = "monthlyPriceUsd" in price ? price : listed ? { monthlyPriceUsd: listed } : {};
  return { provider: "anthropic", kind, name, extraUsage: a.hasExtraUsageEnabled === true, source: PLAN_SOURCE, ...monthly };
}
function configuredPlanPrice(root) {
  try {
    const raw = JSON.parse(fs5.readFileSync(path5.join(root, "config.json"), "utf8"));
    for (const v of [raw.plan?.monthlyUsd, raw.plans?.monthlyPriceUsd]) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function readPlan(opts) {
  const apiKeyInEnv = !!(opts.env ?? process.env).ANTHROPIC_API_KEY;
  let settings;
  try {
    const parsed = JSON.parse(fs5.readFileSync(path5.join(opts.home, ".claude.json"), "utf8"));
    const a = parsed.oauthAccount;
    settings = a && typeof a === "object" ? { oauthAccount: { organizationType: a.organizationType, organizationRateLimitTier: a.organizationRateLimitTier, billingType: a.billingType, hasExtraUsageEnabled: a.hasExtraUsageEnabled } } : {};
  } catch {
    settings = void 0;
  }
  if (settings === void 0 && !apiKeyInEnv) return void 0;
  const price = configuredPlanPrice(opts.root);
  return planFromSettings(settings, { apiKeyInEnv, ...price ? { monthlyPriceUsd: price } : {} });
}

// ../host/src/usage/tally.ts
import fs6 from "node:fs";
import os2 from "node:os";
import path6 from "node:path";

// ../host/src/memory/rules.ts
var HANDOFF_TOKENS = 15e4;
var COSTLY_TOKENS = 2 * HANDOFF_TOKENS;
var HANDOFF_MAX_CHARS = 3e3;
var HANDOFF_TOO_LONG_CHARS = 2 * HANDOFF_MAX_CHARS;

// ../host/src/usage/tally.ts
var nudgeHome = (env = process.env) => env.NUDGE_HOME || path6.join(os2.homedir(), ".nudge");
var usageDir = (home3 = nudgeHome()) => path6.join(home3, "usage");
function readJson(file) {
  try {
    return JSON.parse(fs6.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
var CHUNK = 8 * 1024 * 1024;
var WEEK_EVERY_MS = 10 * 6e4;
var KEEP_MS = 8 * 864e5;

// ../host/src/usage/plan.ts
var limitsFile = (home3 = nudgeHome()) => path7.join(usageDir(home3), "limits.json");
function windowOf(v, now) {
  const used = typeof v?.used_percentage === "number" && Number.isFinite(v.used_percentage) ? v.used_percentage : void 0;
  const resets = typeof v?.resets_at === "number" && Number.isFinite(v.resets_at) ? v.resets_at : void 0;
  if (used === void 0 || resets === void 0 || used < 0 || resets * 1e3 <= now.getTime()) return void 0;
  return { usedPct: Math.min(100, used), resetsAt: new Date(resets * 1e3).toISOString() };
}
function planTerms(opts = {}) {
  const home3 = opts.home ?? nudgeHome(opts.env);
  const env = opts.env ?? process.env;
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const limits = readJson(limitsFile(home3));
  const week = windowOf(limits?.seven_day, now);
  const five = windowOf(limits?.five_hour, now);
  const settingsHome = env.CLAUDE_CONFIG_DIR || os3.homedir();
  let local;
  try {
    local = readPlan({ home: settingsHome, root: home3, env });
  } catch {
    local = void 0;
  }
  const extraUsage = local?.extraUsage === true;
  const name = local && local.kind === "subscription" ? local.name : void 0;
  if (week || five) return { kind: "subscription", source: "status line", ...name ? { name } : {}, ...week ? { week } : {}, ...five ? { fiveHour: five } : {}, extraUsage };
  if (local && local.kind !== "unknown") return { kind: local.kind, source: "local settings", ...name ? { name } : {}, extraUsage };
  return { kind: "unknown", source: "none", extraUsage };
}

// ../host/src/delegation/gate.ts
import fs11 from "node:fs";
import path11 from "node:path";

// ../host/src/delegation/review/learn.ts
import fs10 from "node:fs";
import path10 from "node:path";

// ../host/src/delegation/review/shape.ts
import fs9 from "node:fs";
import path9 from "node:path";

// ../host/src/delegation/field-runs.ts
import { createHash as createHash2 } from "node:crypto";
import fs7 from "node:fs";
import path8 from "node:path";
var QUIET_MS = 15 * 60 * 1e3;
var MAX_PER_POST = 500;
var MAX_SENT_IDS = 5e3;
function readSpawnLog(home3) {
  let text2;
  try {
    text2 = fs7.readFileSync(path8.join(home3, "spawns.jsonl"), "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text2.split("\n")) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.source === "plan" || e.decision === "deny" || typeof e.session !== "string" || typeof e.agent !== "string") continue;
    const at = Date.parse(String(e.at));
    if (Number.isNaN(at)) continue;
    out.push({ at, session: e.session, agent: e.agent, ...isOperation(e.operation) ? { operation: e.operation } : {} });
  }
  return out;
}
function matchSpawn(spawns, run2, used = /* @__PURE__ */ new Set()) {
  const started = Date.parse(run2.at);
  if (Number.isNaN(started)) return void 0;
  let best;
  for (const s2 of spawns) {
    if (used.has(s2) || s2.session !== run2.sessionId || s2.agent !== run2.agent) continue;
    const lead = started - s2.at;
    if (lead < -5e3 || lead > 12e4) continue;
    if (!best || Math.abs(started - s2.at) < Math.abs(started - best.at)) best = s2;
  }
  if (best) used.add(best);
  return best;
}
var VERDICT = { worked: "pass", failed: "fail", taken_over: "fail" };
function fieldRecord(run2, outcome, spawn4, editedTests2, machine) {
  const rank2 = apiRank(run2.model);
  if (rank2 < 0 || rank2 >= API_MODELS.length) return void 0;
  const started = Date.parse(run2.at);
  if (Number.isNaN(started)) return void 0;
  const ended = run2.endedAt ? Date.parse(run2.endedAt) : NaN;
  const t = run2.tokens;
  return {
    machine,
    source: "field",
    task: createHash2("sha256").update(run2.task || run2.id).digest("hex").slice(0, 16),
    operation: spawn4?.operation ?? "unlabelled",
    ...spawn4?.operation ? { labelBy: "agent" } : {},
    // the API takes a plain label; a helper type with anything else in its name is recorded as "other"
    agent: /^[A-Za-z0-9._:@-]{1,80}$/.test(run2.agent) ? run2.agent : "other",
    model: API_MODELS[rank2],
    real: true,
    verdict: outcome ? VERDICT[outcome] : "unclear",
    sideEffects: editedTests2 ? ["edited-tests"] : [],
    turns: run2.steps,
    tokens: t.input + t.output + t.cacheRead + t.cacheWrite,
    usd: Math.round(run2.usd * 1e6) / 1e6,
    ...ended >= started ? { wallMs: ended - started } : {},
    at: new Date(started).toISOString()
  };
}
function enqueue(outbox, runId, file, record) {
  if (!record || outbox.sent.includes(runId)) return;
  outbox.pending[runId] = { record, file };
}
function quiet(file, now) {
  try {
    return now - fs7.statSync(file).mtimeMs >= QUIET_MS;
  } catch {
    return true;
  }
}
async function flushOutbox(home3, outbox, now = Date.now(), fetchImpl = fetch) {
  const cfg = apiConfig(home3);
  const ready = Object.entries(outbox.pending).filter(([, p]) => quiet(p.file, now));
  const waiting = Object.keys(outbox.pending).length - ready.length;
  if (!cfg) return { sent: 0, dropped: 0, waiting: waiting + ready.length, status: "not_configured" };
  let sent = 0;
  let dropped = 0;
  for (let i = 0; i < ready.length; i += MAX_PER_POST) {
    const batch = ready.slice(i, i + MAX_PER_POST);
    try {
      const r = await fetchImpl(`${cfg.url}/v1/runs`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
        body: JSON.stringify({ runs: batch.map(([, p]) => p.record) }),
        signal: AbortSignal.timeout(1e4)
      });
      if (r.ok) {
        for (const [id] of batch) {
          delete outbox.pending[id];
          outbox.sent.push(id);
        }
        sent += batch.length;
        continue;
      }
      if (r.status === 400) {
        const body = await r.json().catch(() => ({}));
        for (const bad of body.invalid ?? []) {
          const id = batch[bad.index]?.[0];
          if (id && outbox.pending[id]) {
            delete outbox.pending[id];
            dropped++;
          }
        }
      }
      return { sent, dropped, waiting: Object.keys(outbox.pending).length, status: `http ${r.status}` };
    } catch {
      return { sent, dropped, waiting: Object.keys(outbox.pending).length, status: "failed" };
    }
  }
  if (outbox.sent.length > MAX_SENT_IDS) outbox.sent.splice(0, outbox.sent.length - MAX_SENT_IDS);
  return { sent, dropped, waiting, status: "ok" };
}

// ../host/src/delegation/outcomes.ts
import fs8 from "node:fs";
import readline3 from "node:readline";
var TAKEOVER_WINDOW_TURNS = 10;
function endedInFailure(scan) {
  for (let i = scan.events.length - 1; i >= 0; i--) {
    const e = scan.events[i];
    if (e.kind === "fail") return true;
    if (e.kind === "pass") return false;
  }
  return false;
}
function filesTouched(scan) {
  const touched = /* @__PURE__ */ new Set();
  const edited = /* @__PURE__ */ new Set();
  for (const msg of scan.messages.values()) {
    for (const t of msg.tools) {
      if (!t.file) continue;
      touched.add(t.file);
      if (EDIT_TOOLS.has(t.name)) edited.add(t.file);
    }
  }
  return { touched, edited };
}
var turnsInOrder = (scan) => [...scan.messages.values()].filter((m) => m.at).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
function classifyHelper(helper, parent) {
  const { touched } = filesTouched(helper.scan);
  const failed = endedInFailure(helper.scan);
  const base = { agentId: helper.agentId, agent: helper.agent, model: helper.model, outcome: failed ? "failed" : "worked", redid: [] };
  if (!failed || !parent || !helper.scan.ended) return base;
  const after = turnsInOrder(parent).filter((m) => m.at > helper.scan.ended).slice(0, TAKEOVER_WINDOW_TURNS);
  const redid = /* @__PURE__ */ new Set();
  for (const msg of after) {
    for (const t of msg.tools) {
      if (t.file && EDIT_TOOLS.has(t.name) && touched.has(t.file)) redid.add(t.file);
    }
  }
  if (!redid.size) return base;
  return { ...base, outcome: "taken_over", redid: [...redid].sort() };
}
async function scanTranscript(file) {
  const scan = newScan();
  const toolCalls = /* @__PURE__ */ new Map();
  const rl = readline3.createInterface({ input: fs8.createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) scanLine(scan, toolCalls, line);
  return scan;
}
function parentTranscriptFor(helperFile) {
  const m = /^(.*)[/\\]subagents[/\\][^/\\]+$/.exec(helperFile);
  if (!m) return void 0;
  const candidate = `${m[1]}.jsonl`;
  return fs8.existsSync(candidate) ? candidate : void 0;
}

// ../host/src/delegation/tasks.ts
var TASK_KINDS = ["migration", "tests", "build", "config", "docs", "code", "search", "other"];
var PATTERNS = [
  // `schema` matches as a filename too, not only a directory: `prisma/schema.prisma` and `schema.ts` are
  // schema work, which is the same thing a migration is.
  { kind: "migration", re: /(^|[/\\])(migrations?|schema)([/\\]|\.|$)|\.sql$/i },
  { kind: "tests", re: /(^|[/\\])(tests?|__tests__|spec)([/\\]|$)|\.(test|spec)\.[a-z]+$/i },
  { kind: "config", re: /\.(json|ya?ml|toml|ini|env|conf)$|(^|[/\\])(\.env|Dockerfile|Makefile)/i },
  { kind: "docs", re: /\.(md|mdx|txt|rst|adoc)$/i }
];
var BUILD_COMMAND = /\b(build|compile|bundle|tsc|webpack|vite|esbuild|cargo build|go build|make)\b/i;
function taskKind(scan) {
  const files = [];
  const commands = [];
  let edited = false;
  for (const msg of scan.messages.values()) {
    for (const t of msg.tools) {
      if (t.file) files.push(t.file);
      if (t.command) commands.push(t.command);
      if (t.file && EDIT_TOOLS.has(t.name)) edited = true;
    }
  }
  for (const { kind, re } of PATTERNS) {
    if (files.some((f) => re.test(f))) return kind;
  }
  if (commands.some((c) => BUILD_COMMAND.test(c))) return "build";
  if (edited) return "code";
  if (files.length || commands.length) return "search";
  return "other";
}
function editedTests(scan) {
  const tests = PATTERNS.find((p) => p.kind === "tests").re;
  for (const msg of scan.messages.values()) for (const t of msg.tools) if (t.file && EDIT_TOOLS.has(t.name) && tests.test(t.file)) return true;
  return false;
}

// ../host/src/delegation/review/collect.ts
function absolutePaths(text2) {
  const out = /* @__PURE__ */ new Set();
  for (const m of text2.matchAll(/(?<![\w/])(?:[A-Za-z]:[\\/]|\/[a-zA-Z]\/)[^\s`'"<>|*?()[\]{},;]*/g)) {
    let p = m[0].replace(/[.:]+$/, "");
    const bash = /^\/([a-zA-Z])\/(.*)$/.exec(p);
    if (bash) p = `${bash[1].toUpperCase()}:/${bash[2]}`;
    out.add(p);
  }
  return [...out];
}

// ../host/src/delegation/review/shape.ts
var TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)tests?\//;
var BROWSER = /\b(browser|screenshot|\/browse|playwright|localhost:\d+|open the (page|app)|click)\b/i;
var NAMED = /\b(edit|change|touch|create)\s+only\b|\byour files\b|\bfiles (listed )?as yours\b/i;
function spawnShape(brief, repo, size) {
  const named = /* @__PURE__ */ new Set();
  if (repo) {
    const root = path9.resolve(repo);
    for (const raw of absolutePaths(brief)) {
      const rel = path9.relative(root, path9.resolve(raw));
      if (rel && !rel.startsWith("..") && !path9.isAbsolute(rel)) named.add(rel.replace(/\\/g, "/"));
    }
    for (const m of brief.matchAll(/(?<![\w/:\.-])((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|mjs|cjs|jsx|json|md|sql|css|html|py|sh|swift|yaml|yml|toml))\b/g)) named.add(m[1]);
  }
  const sizeOf = size ?? ((rel) => {
    try {
      return fs9.readFileSync(path9.join(repo, rel), "utf8").split("\n").length;
    } catch {
      return null;
    }
  });
  let newFiles = 0;
  let existingLines = 0;
  for (const f of named) {
    const n2 = sizeOf(f);
    if (n2 === null) newFiles++;
    else existingLines += n2;
  }
  return {
    files: named.size,
    newFiles,
    existingLines,
    tested: [...named].some((f) => TEST_FILE.test(f)),
    namedFiles: NAMED.test(brief),
    browser: BROWSER.test(brief),
    turns: 0,
    briefChars: brief.length
  };
}
var QUESTIONS = [
  { key: "all-new", words: "only new files", test: (s2) => s2.files > 0 && s2.newFiles === s2.files },
  { key: "tested", words: "checked by a test it wrote or changed", test: (s2) => s2.tested },
  { key: "named-files", words: "the brief named its files", test: (s2) => s2.namedFiles },
  { key: "small-existing", words: "under 300 lines of existing code to change", test: (s2) => s2.existingLines < 300 },
  { key: "large-existing", words: "over 1,500 lines of existing code to change", test: (s2) => s2.existingLines > 1500 },
  { key: "few-files", words: "at most 3 files", test: (s2) => s2.files <= 3 },
  { key: "short-real-run", words: "the real helper needed at most 60 turns", test: (s2) => s2.turns <= 60 },
  { key: "browser", words: "needs a browser", test: (s2) => s2.browser }
];

// ../host/src/delegation/review/learn.ts
var KINDS_FILE = ["review", "kinds.json"];
function readKinds(home3) {
  try {
    const j = JSON.parse(fs10.readFileSync(path10.join(home3, ...KINDS_FILE), "utf8"));
    return j.version === 1 && Array.isArray(j.kinds) ? j.kinds.filter((k3) => isOperation(k3.operation) && SPLIT_KEYS.includes(k3.key)) : [];
  } catch {
    return [];
  }
}
function kindFor(operation, spawn4, splits) {
  const split = splits.find((k3) => k3.operation === operation);
  const q = split && QUESTIONS.find((x) => x.key === split.key);
  if (!split || !q) return operation;
  return q.test(spawn4) ? `${operation}~${split.key}` : `${operation}~not-${split.key}`;
}

// ../host/src/delegation/gate.ts
var PLAN_WINDOW_MS = 10 * 60 * 1e3;
var OVERRIDE_PREFIX = "override:";
var PASSABLE = /* @__PURE__ */ new Set(["haiku"]);
var safe = (session) => session.replace(/[^A-Za-z0-9._-]/g, "_");
var sessionPlansFile = (home3, session) => path11.join(home3, "turns", `${safe(session)}.plans`);
function tail(file, bytes = 256 * 1024) {
  let fd;
  try {
    fd = fs11.openSync(file, "r");
  } catch (e) {
    if (e.code === "ENOENT") return "";
    throw e;
  }
  try {
    const st = fs11.fstatSync(fd);
    if (!st.isFile()) throw new Error(`${file} is not a file`);
    const size = st.size;
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    fs11.readSync(fd, buf, 0, len, size - len);
    return buf.toString("utf8");
  } finally {
    fs11.closeSync(fd);
  }
}
function toPlan(e) {
  const at = Date.parse(String(e.at));
  if (Number.isNaN(at) || typeof e.agent !== "string") return void 0;
  return {
    at,
    agent: e.agent,
    ...typeof e.model === "string" ? { model: e.model } : {},
    ...isOperation(e.operation) ? { operation: e.operation } : {},
    ...typeof e.reason === "string" ? { reason: e.reason } : {},
    ...typeof e.session === "string" && e.session ? { session: e.session } : {},
    ...typeof e.repo === "string" && e.repo ? { repo: e.repo } : {}
  };
}
function parseLines(text2) {
  const out = [];
  for (const line of text2.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e === "object") out.push(e);
    } catch {
    }
  }
  return out;
}
function findPlan(home3, q) {
  const now = q.now ?? Date.now();
  const want = q.agentType.toLowerCase();
  const candidates = [];
  for (const e of parseLines(tail(path11.join(home3, "spawns.jsonl")))) {
    if (e.source !== "plan") continue;
    const p = toPlan(e);
    if (p) candidates.push(p);
  }
  if (q.session) {
    for (const e of parseLines(tail(sessionPlansFile(home3, q.session)))) {
      const p = toPlan({ ...e, session: q.session });
      if (p) candidates.push(p);
    }
  }
  let best;
  for (const p of candidates) {
    if (p.agent.toLowerCase() !== want) continue;
    if (!(now - p.at <= PLAN_WINDOW_MS && p.at - now <= 6e4)) continue;
    const mine = p.session ? !!q.session && p.session === q.session : !!q.repo && p.repo === q.repo;
    if (!mine) continue;
    if (!best || p.at > best.at) best = p;
  }
  return best;
}
function recordSessionPlan(home3, session, args, now = /* @__PURE__ */ new Date()) {
  if (!session || typeof args.agent_type !== "string") return;
  const entry = {
    at: now.toISOString(),
    agent: args.agent_type,
    ...typeof args.model === "string" ? { model: args.model } : {},
    ...isOperation(args.operation) ? { operation: args.operation } : {},
    ...typeof args.reason === "string" ? { reason: args.reason.slice(0, 200) } : {}
  };
  try {
    fs11.mkdirSync(path11.join(home3, "turns"), { recursive: true });
    fs11.appendFileSync(sessionPlansFile(home3, session), `${JSON.stringify(entry)}
`);
  } catch {
  }
}
var isOverride = (reason) => !!reason && reason.trim().toLowerCase().startsWith(OVERRIDE_PREFIX);
var shortModel = (model) => model.replace(/^claude-/, "").replace(/-\d.*$/, "");
function ladderLine(advice) {
  return advice.ladder.filter((r) => r.runs > 0).map((r) => `${r.model} ${r.passes} of ${r.passes + r.failures} passed${r.proven ? ", proven" : ""}`).join("; ") || "no runs yet";
}
function decideSpawn(q) {
  const inPlay = q.requested ?? q.own;
  const base = { session: q.session ?? null, repo: q.repo ?? null, agent: q.agentType, requested: q.requested ?? null, ...q.own ? { own: q.own } : {} };
  const helper = `this ${q.agentType} helper ${q.requested ? `on ${shortModel(q.requested)}` : `with no model, so it inherits this conversation's${q.own ? ` (${shortModel(q.own)})` : ""}`}`;
  const enforcing = guardOn(q.home);
  let plan;
  try {
    plan = findPlan(q.home, { ...q.session ? { session: q.session } : {}, ...q.repo ? { repo: q.repo } : {}, agentType: q.agentType, ...q.now ? { now: q.now } : {} });
  } catch {
    return { decision: "allow", context: "", log: { ...base, advised: null, decision: "allow", why: "error" } };
  }
  if (!plan) {
    const minutes = PLAN_WINDOW_MS / 6e4;
    const ask = `call ask_delegation with agent_type "${q.agentType}" and the operation the helper will do, then record_plan with the same agent_type and operation, the model you will pass and one line of why, then spawn again passing that model. One plan covers every ${q.agentType} helper you spawn in the next ${minutes} minutes.`;
    if (!enforcing) {
      return { decision: "allow", context: `Nudge, delegation \u2014 ${helper} was not planned. Before the next one: ${ask}`, log: { ...base, advised: null, decision: "allow", why: "no-plan" } };
    }
    return {
      decision: "deny",
      reason: `Nudge, delegation: ${helper} has no plan in this session. To spawn it: ${ask}`,
      context: "",
      log: { ...base, advised: null, decision: "deny", why: "no-plan" }
    };
  }
  const operation = plan.operation;
  const planned = { ...operation ? { operation } : {}, planAt: new Date(plan.at).toISOString() };
  if (!operation) {
    return {
      decision: "allow",
      context: `Nudge, delegation \u2014 ${helper} was planned without an operation, so the delegation API was not asked. Name the operation in ask_delegation and record_plan next time.`,
      log: { ...base, ...planned, advised: null, decision: "allow", why: "no-operation" }
    };
  }
  let kind = operation;
  try {
    const held = readKinds(q.home);
    if (held.some((k3) => k3.operation === operation)) kind = kindFor(operation, spawnShape(q.brief ?? "", q.repo ?? null), held);
  } catch {
    kind = operation;
  }
  if (kind !== operation) planned.kind = kind;
  let cached;
  try {
    cached = cachedAdvice(q.home, kind) ?? (kind !== operation ? cachedAdvice(q.home, operation) : void 0);
  } catch {
    cached = void 0;
  }
  if (!cached) {
    return { decision: "allow", context: "", log: { ...base, ...planned, advised: null, decision: "allow", why: "no-cached-advice" } };
  }
  const advice = cached.advice;
  const advised = advice.model;
  const ladder = ladderLine(advice);
  const log = { ...base, ...planned, advised };
  const aRank = advised ? apiRank(advised) : -1;
  const ownRank = apiRank(q.own);
  const inRank = apiRank(inPlay);
  const enforceable = enforcing && !!advised && PASSABLE.has(advised) && aRank >= 0 && (ownRank < 0 || aRank <= ownRank) && inRank >= 0;
  if (enforceable && inRank > aRank) {
    const rung = advice.ladder.find((r) => r.model === advised);
    const proof = rung ? `${rung.passes} passes, ${rung.failures} failures` : "proven";
    if (isOverride(plan.reason)) {
      return {
        decision: "override",
        context: `Nudge, delegation \u2014 override recorded: ${helper} runs above ${advised}, the model proven on ${operation} (${proof}). Your reason: "${plan.reason.trim().slice(0, 160)}".`,
        log: { ...log, decision: "override", why: "override", override: plan.reason.trim().slice(0, 200) }
      };
    }
    return {
      decision: "deny",
      reason: `Nudge, delegation: ${advised} is proven on ${operation} (${proof}), and ${helper}. Spawn it again with model: "${advised}". If this task needs more, call record_plan again with the same agent_type and operation and a reason starting "${OVERRIDE_PREFIX}" that says why, then spawn.`,
      context: "",
      log: { ...log, decision: "deny", why: "above-proven" }
    };
  }
  const context = advised ? `Nudge, delegation \u2014 ${helper}, for ${operation}. The delegation API: ${advised} is proven on ${operation} (${ladder}).` : `Nudge, delegation \u2014 ${helper}, for ${operation}. The delegation API: no model is proven on ${operation} yet (${ladder}), so nothing is advised and the default is your own model${q.own ? ` (${shortModel(q.own)})` : ""}.`;
  return { decision: "allow", context, log: { ...log, decision: "allow", why: advised ? "follows-advice" : "none-proven" } };
}
function spawnOutput(d) {
  if (d.decision === "deny" && d.reason) {
    return `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: d.reason } })}
`;
  }
  return d.context ? `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: d.context } })}
` : "";
}

// ../host/src/delegation/switch.ts
import fs12 from "node:fs";
import os4 from "node:os";
import path12 from "node:path";
var nudgeHome2 = (env = process.env) => env.NUDGE_HOME || path12.join(os4.homedir(), ".nudge");
var defaultHome = () => path12.join(os4.homedir(), ".nudge");
function samePath(a, b) {
  try {
    return fs12.realpathSync(a) === fs12.realpathSync(b);
  } catch {
    return false;
  }
}
function findRepo(cwd, home3 = nudgeHome2()) {
  let dir = path12.resolve(cwd || process.cwd());
  for (; ; ) {
    const nudge = path12.join(dir, ".nudge");
    if (!samePath(nudge, home3) && !samePath(nudge, defaultHome()) && fs12.existsSync(nudge)) return dir;
    const up = path12.dirname(dir);
    if (up === dir) return void 0;
    dir = up;
  }
}
function sessionRepo(cwd, sessionId, home3 = nudgeHome2()) {
  if (typeof sessionId === "string" && sessionId) {
    try {
      const dir = fs12.readFileSync(path12.join(home3, "turns", `${sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}.repo`), "utf8").trim();
      if (dir && fs12.existsSync(path12.join(dir, ".nudge"))) return dir;
    } catch {
    }
  }
  return findRepo(cwd, home3);
}
function consent(home3) {
  try {
    const word = fs12.readFileSync(path12.join(home3, "consent"), "utf8").trim().split(/\s+/)[0];
    return word === "yes" || word === "no" ? word : void 0;
  } catch {
    return void 0;
  }
}
function delegationOn(repo, home3 = nudgeHome2()) {
  if (!repo) return false;
  if (fs12.existsSync(path12.join(home3, "off-delegation")) || fs12.existsSync(path12.join(repo, ".nudge", "off-delegation"))) return false;
  return fs12.existsSync(path12.join(repo, ".nudge", "delegation")) || consent(home3) === "yes";
}

// ../host/src/delegation/receipt.ts
import fs13 from "node:fs";
import path13 from "node:path";
var MAX_TEST_FILES = 3e3;
var MAX_TEST_BYTES = 256 * 1024;
var MAX_ENTRIES = 6e4;
var CODE_EXT = /\.(?:[cm]?[jt]sx?|py|go|rs|swift|kt|java|rb|php|cs|vue|svelte)$/i;
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", "dist", "build", "out", "coverage", "vendor", "target", "DerivedData", "release"]);
var TEST_DIRS = /* @__PURE__ */ new Set(["tests", "test", "__tests__"]);
var posix = (p) => p.split(path13.sep).join("/").replace(/\\/g, "/");
function stripKey(p) {
  return posix(p).replace(CODE_EXT, "").replace(/\/index$/, "");
}
function isTestFile(p) {
  const parts = posix(p).split("/");
  const base = parts[parts.length - 1] ?? "";
  if (/\.(?:test|spec)\.[^/]+$/i.test(base)) return true;
  return CODE_EXT.test(base) && parts.slice(0, -1).some((d) => TEST_DIRS.has(d));
}
var isCodeFile = (p) => CODE_EXT.test(p) && !isTestFile(p);
function findTestFiles(root, cap = MAX_TEST_FILES) {
  const files = [];
  const stack = [root];
  let entries = 0;
  while (stack.length) {
    const dir = stack.pop();
    let list;
    try {
      list = fs13.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of list) {
      if (++entries > MAX_ENTRIES) return { files, capped: true };
      if (d.name.startsWith(".")) continue;
      const full = path13.join(dir, d.name);
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name)) stack.push(full);
      } else if (d.isFile() && isTestFile(posix(path13.relative(root, full)))) {
        files.push(full);
        if (files.length >= cap) return { files, capped: true };
      }
    }
  }
  return { files, capped: false };
}
function strings(text2) {
  const out = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\\n])*?)\1/g;
  let m;
  while (m = re.exec(text2)) {
    const s2 = m[2];
    if (s2.length > 2 && s2.length < 300 && !s2.includes("${") && /[/.]/.test(s2)) out.push(s2);
  }
  return out;
}
function testIndex(root, opts = {}) {
  const { files, capped } = findTestFiles(root, opts.cap);
  const reached = /* @__PURE__ */ new Set();
  const named = /* @__PURE__ */ new Set();
  for (const file of files) {
    let text2;
    try {
      const fd = fs13.openSync(file, "r");
      try {
        const buf = Buffer.alloc(Math.min(fs13.fstatSync(fd).size, MAX_TEST_BYTES));
        fs13.readSync(fd, buf, 0, buf.length, 0);
        text2 = buf.toString("utf8");
      } finally {
        fs13.closeSync(fd);
      }
    } catch {
      continue;
    }
    const dir = path13.dirname(file);
    for (const s2 of strings(text2)) {
      if (s2.startsWith("./") || s2.startsWith("../")) {
        const rel = posix(path13.relative(root, path13.resolve(dir, s2)));
        if (!rel.startsWith("../")) reached.add(stripKey(rel));
      } else if (s2.includes("/") && !/^[a-z][a-z0-9+.-]*:/i.test(s2) && !s2.startsWith("@") && !s2.startsWith("/")) {
        named.add(stripKey(s2.replace(/^\.?\/+/, "")));
      }
    }
  }
  return { root, reached, named: [...named].filter((n2) => n2.includes("/")), testFiles: files.length, capped };
}
function repoRelative(root, file) {
  const abs = path13.isAbsolute(file) ? file : path13.join(root, file);
  const rel = posix(path13.relative(root, abs));
  return !rel || rel.startsWith("../") || path13.isAbsolute(rel) ? void 0 : rel;
}
function receipt(root, changed, index = testIndex(root)) {
  const files = [...new Set(changed.map((f) => repoRelative(root, f)).filter((f) => !!f && isCodeFile(f)))].sort();
  const tested = [];
  const untested = [];
  for (const f of files) {
    const key2 = stripKey(f);
    const hit = index.reached.has(key2) || index.named.some((n2) => key2 === n2 || key2.endsWith(`/${n2}`));
    (hit ? tested : untested).push(f);
  }
  return { tested, untested };
}
function untestedChoices(untested) {
  if (!untested.length) return [];
  const names = untested.map((f) => path13.posix.basename(f)).join(", ");
  return [
    `Read those lines yourself: open the changes to ${names} and check them before building on them.`,
    `Ask for a test: send the helper back (or a new one) to add a test that imports ${names} and pins what changed.`,
    "Keep that part: if the change is small or risky, redo or finish it yourself in this conversation."
  ];
}

// ../host/src/delegation/handover.ts
var HANDOVERS_FILE = "handovers.jsonl";
var ADVISE_MARKER = "handover-advise";
var SHADOW_MARKER = "handover-shadow";
var QUIET_MS2 = 15 * 60 * 1e3;
function globalHandoverMode(home3, env = process.env) {
  if (/^(on|1|true|yes)$/i.test((env.NUDGE_DELEGATE ?? "").trim())) return "advise";
  try {
    const c = JSON.parse(fs14.readFileSync(path14.join(home3, CONFIG_FILE), "utf8"));
    return c?.handover?.mode === "advise" ? "advise" : "shadow";
  } catch {
    return "shadow";
  }
}
function handoverMode(home3, repo, now = /* @__PURE__ */ new Date()) {
  if (repo) {
    if (fs14.existsSync(path14.join(repo, ".nudge", SHADOW_MARKER))) return "shadow";
    if (fs14.existsSync(path14.join(repo, ".nudge", ADVISE_MARKER))) return "advise";
  }
  if (weekPastThreshold(home3, now)) return "advise";
  return globalHandoverMode(home3);
}
function weekPastThreshold(home3, now = /* @__PURE__ */ new Date()) {
  let pct2;
  try {
    pct2 = JSON.parse(fs14.readFileSync(path14.join(home3, CONFIG_FILE), "utf8"))?.handover?.weeklyPct;
  } catch {
    return false;
  }
  if (typeof pct2 !== "number" || !(pct2 > 0 && pct2 <= 100)) return false;
  const week = planTerms({ home: home3, now }).week;
  return !!week && week.usedPct >= pct2;
}
function modelFromTranscript(transcript) {
  if (typeof transcript !== "string" || !transcript) return void 0;
  try {
    const fd = fs14.openSync(transcript, "r");
    try {
      const size = fs14.fstatSync(fd).size;
      const len = Math.min(size, 256 * 1024);
      const buf = Buffer.alloc(len);
      fs14.readSync(fd, buf, 0, len, size - len);
      const all = [...buf.toString("utf8").matchAll(/"model":"(claude-[a-z0-9.-]+)"/g)];
      return all.length ? all[all.length - 1][1] : void 0;
    } finally {
      fs14.closeSync(fd);
    }
  } catch {
    return void 0;
  }
}
function sessionTranscript(projectsRoot, session) {
  if (!/^[A-Za-z0-9._-]+$/.test(session)) return void 0;
  let dirs;
  try {
    dirs = fs14.readdirSync(projectsRoot);
  } catch {
    return void 0;
  }
  for (const d of dirs) {
    const f = path14.join(projectsRoot, d, `${session}.jsonl`);
    if (fs14.existsSync(f)) return f;
  }
  return void 0;
}
function ownFromSpawnLog(home3, session) {
  let found;
  try {
    for (const line of fs14.readFileSync(path14.join(home3, "spawns.jsonl"), "utf8").split("\n")) {
      if (!line.includes(session)) continue;
      try {
        const e = JSON.parse(line);
        if (e.session === session && typeof e.own === "string") found = e.own;
      } catch {
      }
    }
  } catch {
  }
  return found;
}
function leadModel(home3, session, projectsRoot) {
  if (!session) return void 0;
  return modelFromTranscript(sessionTranscript(projectsRoot, session)) ?? ownFromSpawnLog(home3, session);
}
var FAMILIES = ["fable", "opus", "sonnet", "haiku"];
var family = (model) => {
  const m = (model ?? "").toLowerCase();
  return FAMILIES.find((f) => m.includes(f)) ?? m;
};
function engineModel(model, prices = PRICES2) {
  if (!model) return void 0;
  if (prices[model] !== void 0) return model;
  const f = family(model);
  return Object.keys(prices).find((k3) => k3.startsWith("claude-") && family(k3) === f);
}
function claudeCodeWorkers(lead, prices = PRICES2) {
  const leadRank = apiRank(lead);
  return CANDIDATES.filter((m) => PASSABLE.has(m)).map((m) => engineModel(m, prices)).filter((w) => !!w && (leadRank < 0 || apiRank(w) < leadRank));
}
var TEST_FILE2 = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
var count = (v, max) => {
  const n2 = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n2) && n2 >= 0 && n2 <= max ? n2 : void 0;
};
var flag = (v) => typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : void 0;
function readFacts(args) {
  const lines = count(args.lines, 1e6);
  const hasCheck = flag(args.has_check) ?? (typeof args.check === "string" && args.check.trim() ? true : void 0);
  const slash = (s2) => s2.replace(/\\/g, "/").replace(/^\.\//, "");
  const check = typeof args.check === "string" ? slash(args.check) : "";
  const isFirstTest = (f) => typeof f === "string" && TEST_FILE2.test(slash(f)) && check.includes(slash(f));
  const testsFirst = Array.isArray(args.files) && args.files.some(isFirstTest);
  const code = Array.isArray(args.files) ? args.files.filter((f) => !isFirstTest(f)).length : 0;
  const files = Array.isArray(args.files) ? count(code || args.files.length, 1e5) : count(args.files, 1e5);
  return {
    ...lines !== void 0 ? { lines } : {},
    ...files !== void 0 ? { files } : {},
    ...hasCheck !== void 0 ? { hasCheck } : {},
    ...testsFirst ? { testsFirst } : {}
  };
}
var anyFact = (f) => f.lines !== void 0 || f.files !== void 0 || f.hasCheck !== void 0;
var missingFacts = (f) => [f.lines === void 0 && "lines", f.files === void 0 && "files", f.hasCheck === void 0 && "has_check"].filter((x) => !!x);
function adviseHandover(q) {
  const book = q.book ?? { rules: RULES, policy: POLICY, prices: PRICES2 };
  if (q.facts.testsFirst && !READ_ONLY.has(q.operation)) {
    const request2 = {
      lead: engineModel(q.lead, book.prices) ?? q.lead ?? "unknown",
      workers: claudeCodeWorkers(q.lead, book.prices),
      harness: "claude-code",
      operation: q.operation,
      size: { lines: q.facts.lines ?? 0, files: q.facts.files ?? 1 },
      hasCheck: q.facts.hasCheck ?? false,
      features: ["tests-first"]
    };
    const advice = decide(request2, book.rules, book.policy, book.prices);
    if (advice.decision === "delegate" || !q.gateway?.length) return { request: request2, advice };
  }
  const viaGateway = !!q.gateway?.length && !READ_ONLY.has(q.operation);
  const request = {
    lead: engineModel(q.lead, book.prices) ?? q.lead ?? "unknown",
    workers: viaGateway ? q.gateway : claudeCodeWorkers(q.lead, book.prices),
    harness: viaGateway ? "gateway" : "claude-code",
    operation: q.operation,
    size: { lines: q.facts.lines ?? 0, files: q.facts.files ?? 1 },
    hasCheck: q.facts.hasCheck ?? false,
    // unlabelled work is read the cautious way for a gateway job, as run_worker reads it (worker/start.ts)
    features: viaGateway ? ["untested-part", "refactor-existing"] : []
  };
  return { request, advice: decide(request, book.rules, book.policy, book.prices) };
}
function ruleIds(advice) {
  const p = advice.playbook;
  if (!p) return [];
  return [...p.lead, ...p.worker, ...p.checker, ...p.gates].map((r) => `${r.id}@${r.v}`);
}
function newRecord(q) {
  return {
    v: 1,
    id: `h_${randomBytes(6).toString("hex")}`,
    at: (q.at ?? /* @__PURE__ */ new Date()).toISOString(),
    session: q.session ? q.session.slice(0, 8) : null,
    project: q.project ?? null,
    mode: q.mode,
    lead: q.lead ?? null,
    agent: q.agent.slice(0, 80),
    operation: q.operation,
    lines: q.facts.lines ?? null,
    files: q.facts.files ?? null,
    hasCheck: q.facts.hasCheck ?? null,
    advice: { decision: q.advice.decision, worker: q.advice.worker, level: q.advice.level, ruleIds: ruleIds(q.advice), why: q.advice.why.slice(0, 400) },
    did: null,
    followed: null,
    outcome: null,
    helperUsd: null,
    minutes: null,
    filesChanged: null,
    receipt: null,
    done: false
  };
}
function appendHandover(home3, rec) {
  try {
    fs14.mkdirSync(home3, { recursive: true });
    fs14.appendFileSync(path14.join(home3, HANDOVERS_FILE), `${JSON.stringify(rec)}
`);
    return true;
  } catch {
    return false;
  }
}
function asRecord(raw) {
  const r = raw;
  return r && typeof r === "object" && r.v === 1 && typeof r.id === "string" && typeof r.at === "string" && r.advice && typeof r.advice === "object" ? r : void 0;
}
function readHandovers(home3) {
  let text2;
  try {
    text2 = fs14.readFileSync(path14.join(home3, HANDOVERS_FILE), "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text2.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = asRecord(JSON.parse(line));
      if (r) out.push(r);
    } catch {
    }
  }
  return out;
}
var isGatewayWorker = (worker) => !!worker && !worker.startsWith("claude-");
function recordShadowOutcome(home3, job, outcome) {
  const file = path14.join(home3, HANDOVERS_FILE);
  try {
    const lines = fs14.readFileSync(file, "utf8").split("\n");
    let hit = -1;
    for (let i = lines.length - 1; i >= 0 && hit < 0; i--) {
      if (!lines[i].includes(job)) continue;
      try {
        const r = JSON.parse(lines[i]);
        if (r.job === job && r.shadow) hit = i;
      } catch {
      }
    }
    if (hit < 0) return false;
    lines[hit] = JSON.stringify({ ...JSON.parse(lines[hit]), shadowOutcome: outcome });
    const tmp = `${file}.${process.pid}.tmp`;
    fs14.writeFileSync(tmp, lines.join("\n"));
    fs14.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}
function recordGatewayHandover(home3, rec) {
  const file = path14.join(home3, HANDOVERS_FILE);
  try {
    let text2 = "";
    try {
      text2 = fs14.readFileSync(file, "utf8");
    } catch {
    }
    const lines = text2.split("\n");
    const at = Date.parse(rec.at);
    let hit = -1;
    for (let i = lines.length - 1; i >= 0 && hit < 0; i--) {
      if (!lines[i].trim()) continue;
      try {
        const r = asRecord(JSON.parse(lines[i]));
        const mine = r && !r.job && (!r.done || r.did && !r.did.spawned);
        if (r && mine && rec.session && r.session === rec.session && r.advice.decision === "delegate" && isGatewayWorker(r.advice.worker) && at - Date.parse(r.at) >= -5e3 && at - Date.parse(r.at) <= 30 * 60 * 1e3) hit = i;
      } catch {
      }
    }
    if (hit < 0) {
      fs14.mkdirSync(home3, { recursive: true });
      fs14.appendFileSync(file, `${JSON.stringify(rec)}
`);
      return true;
    }
    const open = JSON.parse(lines[hit]);
    lines[hit] = JSON.stringify({ ...rec, id: open.id, at: open.at, agent: open.agent, mode: open.mode });
    const tmp = `${file}.${process.pid}.tmp`;
    fs14.writeFileSync(tmp, lines.join("\n"));
    fs14.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}
function openSessions(home3) {
  return new Set(readHandovers(home3).filter((r) => !r.done && r.session).map((r) => r.session));
}
var WORST = ["taken_over", "failed", "worked"];
function followedOf(advice, did) {
  if (advice.decision === "keep") return did.spawned ? "delegated-anyway" : "yes";
  if (!did.spawned) return "kept-anyway";
  return did.model && family(did.model) === family(advice.worker) ? "yes" : "other-model";
}
function linkHandovers(records, runs, spawns, now, receiptFor = () => null) {
  const sameThread = (a, b) => a.session === b.session && a.agent.toLowerCase() === b.agent.toLowerCase();
  const sorted = [...records].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return records.map((rec) => {
    if (rec.done) return rec;
    const at = Date.parse(rec.at);
    const next = sorted.find((o) => o !== rec && sameThread(o, rec) && Date.parse(o.at) > at);
    const end = Math.min(at + PLAN_WINDOW_MS, next ? Date.parse(next.at) : Number.POSITIVE_INFINITY);
    const settled = now > end + QUIET_MS2;
    if (!rec.session) return settled ? { ...rec, done: true } : rec;
    const sameType = (agent) => agent === "unknown" || agent.toLowerCase() === rec.agent.toLowerCase();
    const mine = (s2, agent, t) => s2.startsWith(rec.session) && sameType(agent) && t >= at - 5e3 && t <= end;
    const linked = runs.filter((r) => mine(r.session, r.agent, r.start)).sort((a, b) => a.start - b.start);
    if (linked.length) {
      const did2 = { spawned: true, agent: linked[0].agent, model: linked[0].model || null, runs: linked.length };
      const out = { ...rec, did: did2, followed: followedOf(rec.advice, did2) };
      if (!linked.every((r) => r.quiet) || now <= end) return out;
      const outcomes = linked.map((r) => r.outcome).filter((o) => !!o);
      const ends = linked.map((r) => r.end);
      const edited = [...new Set(linked.flatMap((r) => r.edited))];
      return {
        ...out,
        outcome: WORST.find((w) => outcomes.includes(w)) ?? null,
        helperUsd: Math.round(linked.reduce((s2, r) => s2 + r.usd, 0) * 1e4) / 1e4,
        minutes: ends.every((e) => e !== null) ? Math.round((Math.max(...ends) - linked[0].start) / 6e4 * 10) / 10 : null,
        filesChanged: edited.length,
        receipt: edited.length ? receiptFor(rec, edited) : { tested: [], untested: [] },
        done: true
      };
    }
    const spawn4 = spawns.find((s2) => mine(s2.session, s2.agent, s2.at));
    if (spawn4) {
      const did2 = { spawned: true, agent: spawn4.agent, model: spawn4.model, runs: 0 };
      return { ...rec, did: did2, followed: followedOf(rec.advice, did2), ...settled ? { done: true } : {} };
    }
    if (!settled) return rec;
    const did = { spawned: false };
    return { ...rec, did, followed: followedOf(rec.advice, did), done: true };
  });
}
function readSpawnFacts(home3) {
  let text2;
  try {
    text2 = fs14.readFileSync(path14.join(home3, "spawns.jsonl"), "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text2.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.source === "plan" || e.decision === "deny" || typeof e.session !== "string" || typeof e.agent !== "string") continue;
      const at = Date.parse(String(e.at));
      if (Number.isNaN(at)) continue;
      const model = typeof e.requested === "string" ? e.requested : typeof e.own === "string" ? e.own : null;
      out.push({ at, session: e.session, agent: e.agent, model });
    } catch {
    }
  }
  return out;
}
function completeHandovers(home3, runs, now) {
  const file = path14.join(home3, HANDOVERS_FILE);
  let before;
  try {
    before = fs14.readFileSync(file, "utf8");
  } catch {
    return { updated: 0 };
  }
  const lines = before.split("\n");
  const parsed = lines.map((l) => {
    try {
      return l.trim() ? asRecord(JSON.parse(l)) : void 0;
    } catch {
      return void 0;
    }
  });
  const records = parsed.filter((r) => !!r);
  const indexes = /* @__PURE__ */ new Map();
  const receiptFor = (rec, edited) => {
    const root = rec.project && fs14.existsSync(rec.project) ? rec.project : findRepo(path14.dirname(edited[0]), home3);
    if (!root) return null;
    try {
      let idx = indexes.get(root);
      if (!idx) indexes.set(root, idx = testIndex(root));
      return receipt(root, edited, idx);
    } catch {
      return null;
    }
  };
  let linked;
  try {
    linked = linkHandovers(records, runs, readSpawnFacts(home3), now, receiptFor);
  } catch {
    return { updated: 0 };
  }
  const byId = new Map(linked.map((r) => [r.id, r]));
  let updated = 0;
  const out = lines.map((l, i) => {
    const old = parsed[i];
    if (!old) return l;
    const fresh = byId.get(old.id);
    const s2 = JSON.stringify(fresh);
    if (s2 === JSON.stringify(old)) return l;
    updated++;
    return s2;
  });
  if (!updated) return { updated: 0 };
  try {
    const now_ = fs14.readFileSync(file, "utf8");
    const tail3 = now_.startsWith(before) ? now_.slice(before.length) : "";
    const tmp = `${file}.${process.pid}.tmp`;
    fs14.writeFileSync(tmp, out.join("\n") + tail3);
    fs14.renameSync(tmp, file);
  } catch {
    return { updated: 0 };
  }
  return { updated };
}
var agentModel = (worker) => worker ? shortModel(worker) : null;
function adviseAnswer(advice, facts, opts = {}) {
  const missing = missingFacts(facts);
  const ask = missing.length ? `Pass ${missing.join(", ")} to ask_delegation (lines: your estimate of changed lines; files: how many files; has_check: whether a test or other check can grade the work)${advice ? "; without them this advice assumed the cautious reading (0 lines, 1 file, no check)" : ", and it will say whether to hand this down at all"}.` : void 0;
  if (!advice && opts.shadow && !(opts.operation && READ_ONLY.has(opts.operation))) {
    return {
      mode: "advise",
      decision: null,
      shadow: true,
      say: "Shadow mode is on here. If this is code you will change, yourself or through a helper: write the failing test first, then ask again with brief, files and check in this same call; it starts the shadow for you; do not call run_worker. The brief as you would write it for a worker, files as the list of repo-relative paths it may change with your test among them, check as the command that runs that test file (it fails now on an assertion and passes when the work is done; no whole-tree typecheck), and lines. Then do the work yourself and commit it.",
      tool: "ask_delegation"
    };
  }
  if (!advice) return { mode: "advise", decision: null, ...ask ? { ask } : {} };
  if (opts.shadow && !(opts.operation && READ_ONLY.has(opts.operation))) {
    const engine = `The engine would have said: ${advice.decision} (${advice.why}).`;
    const say = opts.started ? `Shadow mode is on in this project, and this call started the shadow: job ${opts.started.job}, ${opts.started.worker} works on your brief in a copy of the repository, never in your files, and nothing comes back to you. Your failing test, as it was at this call, grades the worker: leave it as written. Do the work yourself now, as planned, and commit it with git from this session: your commit is the cross-check. Call nothing else for it: no run_worker, no worker_result. ${engine}` : opts.refused ? `Shadow mode is on in this project, but no shadow was started: ${opts.refused} Ask again with that fixed, in this same call, or do the work yourself. Do not call run_worker for it. ${engine}` : `Shadow mode is on here: write the failing test first, then ask again with brief, files and check in this same call; it starts the shadow for you; do not call run_worker. The brief as you would write it for a worker (situation, the piece, what good looks like, limits), files as the list of repo-relative paths it may change with your test among them, check as the command that runs that test file (it fails now on an assertion and passes when the work is done; no whole-tree typecheck), and lines. The test as it is at the ask grades the worker. Then do the work yourself and commit it. ${engine}`;
    return {
      mode: "advise",
      decision: "keep",
      shadow: true,
      engine: advice.decision,
      say,
      // the generic ask for facts is left out: it asks for files as a count, and the say asks for the list
      ...opts.started ? { job: opts.started.job } : { tool: "ask_delegation" }
    };
  }
  if (advice.decision === "keep") {
    return { mode: "advise", decision: "keep", say: `Do this yourself; do not hand it to a helper. Why: ${advice.why}.`, ...ask ? { ask } : {} };
  }
  const p = advice.playbook;
  if (isGatewayWorker(advice.worker)) {
    return {
      mode: "advise",
      decision: "delegate",
      say: `Hand this to the gateway worker ${advice.worker}: call run_worker with your brief, the files it may change, the check command, and the same operation and lines. Do not spawn an Agent for it. Supervision level ${advice.level}. Why: ${advice.why}.`,
      worker: advice.worker,
      tool: "run_worker",
      level: advice.level,
      lead_rules: (p?.lead ?? []).map((r) => r.text),
      after: "run_worker waits for the job and returns the verdict, the check's result and the receipt in the same call; only if its wait runs out does it return a job id for worker_result. Deal with any untested files before building on the work.",
      ...ask ? { ask } : {}
    };
  }
  const model = agentModel(advice.worker);
  const workerRules = p?.worker ?? [];
  const testsFirst = facts.testsFirst ? ` Spawn an Agent with that model and give it your brief, the files it may change and the check; tell it: make the test pass, run the check before you report, do not change the test.` : "";
  return {
    mode: "advise",
    decision: "delegate",
    say: `Hand this to a helper on ${model ?? advice.worker} (pass model: "${model ?? advice.worker}"), supervision level ${advice.level}.${testsFirst} Why: ${advice.why}.`,
    worker: advice.worker,
    model,
    ...facts.testsFirst ? { tool: "Agent" } : {},
    level: advice.level,
    lead_rules: (p?.lead ?? []).map((r) => r.text),
    ...workerRules.length ? { worker_brief: `Standing instructions (paste into the helper's brief):
${workerRules.map((r) => `- ${r.text}`).join("\n")}` } : {},
    after: "When the helper returns, call handover_receipt and deal with any untested files before building on the work.",
    ...ask ? { ask } : {}
  };
}

// ../host/src/delegation/rulebook-client.ts
import fs15 from "node:fs";
import path15 from "node:path";
var RULEBOOK_FILE = "delegation-rulebook.json";
var LIVE_TIMEOUT_MS2 = 2e3;
var REFRESH_TIMEOUT_MS2 = 1e4;
var FRESH_MS = 60 * 60 * 1e3;
var BUNDLED = { rules: RULES, policy: POLICY, prices: PRICES2, from: "bundled" };
var isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var oneOf = (list, v) => typeof v === "string" && list.includes(v) ? v : void 0;
var strings2 = (v) => Array.isArray(v) && v.every((x) => typeof x === "string") ? v : void 0;
var count2 = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : void 0;
var money = (v) => v === null ? null : typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0;
var SIZES2 = ["small", "medium", "large"];
function readRule(raw) {
  if (!isObject(raw)) return void 0;
  const id = typeof raw.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.id) ? raw.id : void 0;
  const v = count2(raw.v);
  const status = oneOf(["live", "candidate", "retired"], raw.status);
  const audience = oneOf(["lead", "worker", "checker", "gate"], raw.audience);
  if (!id || !v || !status || !audience || typeof raw.text !== "string" || !isObject(raw.trigger)) return void 0;
  const phase = raw.phase === void 0 ? void 0 : oneOf(["readback", "diff"], raw.phase);
  if (raw.phase !== void 0 && !phase) return void 0;
  const t = raw.trigger;
  const trigger = {};
  for (const k3 of ["features", "operations", "workers"]) {
    if (t[k3] === void 0) continue;
    const list = strings2(t[k3]);
    if (!list) return void 0;
    trigger[k3] = list;
  }
  if (t.sizes !== void 0) {
    const list = strings2(t.sizes);
    if (!list || list.some((s2) => !SIZES2.includes(s2))) return void 0;
    trigger.sizes = list;
  }
  if (t.levels !== void 0) {
    if (!Array.isArray(t.levels) || t.levels.some((l) => l !== 1 && l !== 2 && l !== 3 && l !== 4)) return void 0;
    trigger.levels = t.levels;
  }
  return { id, v, status, audience, ...phase ? { phase } : {}, text: raw.text, trigger, evidence: typeof raw.evidence === "string" ? raw.evidence : "" };
}
function readPolicyRow(raw) {
  if (!isObject(raw)) return void 0;
  const harness = oneOf(["gateway", "claude-code", "other"], raw.harness);
  const kind = oneOf(["code-edit", "read-only"], raw.kind);
  const size = oneOf(SIZES2, raw.size);
  const verdict = oneOf(["delegate", "keep", "do-not-delegate", "measured"], raw.verdict);
  const confidence = oneOf(["low", "medium", "high"], raw.confidence);
  const runs = count2(raw.runs);
  const passes = count2(raw.passes);
  const takeovers = count2(raw.takeovers);
  const workerUsd = money(raw.workerUsd);
  const loadedUsd = money(raw.loadedUsd);
  if (typeof raw.lead !== "string" || !(raw.worker === null || typeof raw.worker === "string")) return void 0;
  if (!harness || !kind || !size || !verdict || !confidence || runs === void 0 || passes === void 0 || takeovers === void 0) return void 0;
  if (workerUsd === void 0 || loadedUsd === void 0 || typeof raw.basis !== "string") return void 0;
  return {
    lead: raw.lead,
    worker: raw.worker,
    harness,
    kind,
    size,
    verdict,
    runs,
    passes,
    takeovers,
    workerUsd,
    loadedUsd,
    basis: raw.basis,
    confidence,
    ...typeof raw.note === "string" ? { note: raw.note } : {}
  };
}
function readBook(rules, policy, prices) {
  if (!Array.isArray(rules) || !Array.isArray(policy) || !isObject(prices)) return void 0;
  const r = rules.map(readRule).filter((x) => !!x);
  const p = policy.map(readPolicyRow).filter((x) => !!x);
  const pr = {};
  for (const [m, v] of Object.entries(prices)) if (typeof v === "number" && Number.isFinite(v) && v > 0) pr[m] = v;
  if (!r.length || !p.length || !Object.keys(pr).length) return void 0;
  return { rules: r, policy: p, prices: pr };
}
function readCache2(home3) {
  try {
    const c = JSON.parse(fs15.readFileSync(path15.join(home3, RULEBOOK_FILE), "utf8"));
    if (c.version !== 1 || typeof c.fetchedAt !== "string" || Number.isNaN(Date.parse(c.fetchedAt))) return void 0;
    const book = readBook(c.rules, c.policy, c.prices);
    return book ? { ...book, from: "cache", fetchedAt: c.fetchedAt } : void 0;
  } catch {
    return void 0;
  }
}
function writeCache2(home3, book) {
  try {
    fs15.mkdirSync(home3, { recursive: true });
    const file = path15.join(home3, RULEBOOK_FILE);
    const tmp = `${file}.${process.pid}.tmp`;
    fs15.writeFileSync(tmp, `${JSON.stringify({ version: 1, fetchedAt: book.fetchedAt, rules: book.rules, policy: book.policy, prices: book.prices })}
`);
    fs15.renameSync(tmp, file);
  } catch {
  }
}
async function fetchRulebook(home3, timeoutMs, fetchImpl) {
  const cfg = readConfig(home3);
  if (!cfg) return void 0;
  try {
    const get = async (route) => {
      const r = await fetchImpl(`${cfg.url}${route}`, { headers: readHeaders(cfg), signal: AbortSignal.timeout(timeoutMs) });
      const body = r.ok ? await r.json() : void 0;
      return isObject(body) ? body : void 0;
    };
    const [rules, policy] = await Promise.all([get("/v1/rules"), get("/v1/policy")]);
    const book = rules && policy ? readBook(rules.rules, policy.rows, policy.prices) : void 0;
    if (!book) return void 0;
    const fresh = { ...book, from: "api", fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
    writeCache2(home3, fresh);
    return fresh;
  } catch {
    return void 0;
  }
}
function cachedRulebook(home3) {
  return readCache2(home3) ?? BUNDLED;
}
async function rulebookFor(home3, fetchImpl = fetch, now = Date.now()) {
  const cached = readCache2(home3);
  if (cached && now - Date.parse(cached.fetchedAt) < FRESH_MS) return cached;
  return await fetchRulebook(home3, LIVE_TIMEOUT_MS2, fetchImpl) ?? cached ?? BUNDLED;
}
async function refreshRulebook(home3, fetchImpl = fetch) {
  if (!readConfig(home3)) return "not_configured";
  return await fetchRulebook(home3, REFRESH_TIMEOUT_MS2, fetchImpl) ? "refreshed" : "failed";
}

// ../host/src/delegation/reckoner.ts
var RECKONER_VERSION = 1;
var MIN_RUNS_TO_ADVISE = 5;
var round2 = (n2) => Math.round(n2 * 100) / 100;
var key = (agent, model) => `${agent}\0${model}`;
var noOutcomes = () => ({ worked: 0, failed: 0, takenOver: 0 });
function addOutcome(o, outcome) {
  if (outcome === "taken_over") o.takenOver++;
  else if (outcome === "failed") o.failed++;
  else o.worked++;
}
function reckon(runs) {
  const cells = /* @__PURE__ */ new Map();
  for (const r of runs) {
    const agent = r.agent || "unknown";
    const k3 = key(agent, r.model);
    let c = cells.get(k3);
    if (!c) {
      c = { agent, model: r.model, runs: 0, turns: 0, routineTurns: 0, failedRuns: 0, failures: 0, usd: 0, couldHaveUsd: 0, outcomes: noOutcomes() };
      cells.set(k3, c);
    }
    c.runs++;
    c.turns += r.steps;
    c.routineTurns += r.routineSteps;
    const failures = r.failures ?? 0;
    c.failures += failures;
    if (failures > 0) c.failedRuns++;
    c.usd += r.usd;
    c.couldHaveUsd += r.couldHaveUsd;
    addOutcome(c.outcomes, r.outcome);
  }
  return [...cells.values()].sort((a, b) => b.usd - a.usd || b.runs - a.runs);
}
function reckonTasks(runs) {
  const cells = /* @__PURE__ */ new Map();
  for (const r of runs) {
    const task = r.task ?? "other";
    let c = cells.get(task);
    if (!c) {
      c = { task, runs: 0, outcomes: noOutcomes(), usd: 0, couldHaveUsd: 0 };
      cells.set(task, c);
    }
    c.runs++;
    c.usd += r.usd;
    c.couldHaveUsd += r.couldHaveUsd;
    addOutcome(c.outcomes, r.outcome);
  }
  const bad = (c) => c.runs ? (c.outcomes.takenOver * 2 + c.outcomes.failed) / c.runs : 0;
  return [...cells.values()].sort((a, b) => bad(b) - bad(a) || b.runs - a.runs);
}
function shareable(cells, machines = 1, tasks = []) {
  return {
    version: RECKONER_VERSION,
    machines,
    tasks: tasks.map((t) => ({
      task: t.task,
      runs: t.runs,
      failedShare: t.runs ? round2((t.outcomes.failed + t.outcomes.takenOver) / t.runs) : 0,
      takenOverShare: t.runs ? round2(t.outcomes.takenOver / t.runs) : 0,
      couldHaveRatio: t.usd > 0 ? round2(t.couldHaveUsd / t.usd) : 1
    })),
    cells: cells.map((c) => ({
      agent: c.agent,
      model: c.model,
      runs: c.runs,
      failuresPerRun: c.runs ? round2(c.failures / c.runs) : 0,
      routineShare: c.turns ? round2(c.routineTurns / c.turns) : 0,
      // **Ended in failure, not "ever errored".** `failedRuns` counts runs with any error and for an hour this
      // field was built from it — 66% for general-purpose on Opus — while the task table used outcomes, so the
      // two tables disagreed about the same runs. One definition now: the outcome. `failuresPerRun` above is the
      // iteration count and stays, honestly labelled as errors along the way rather than as failure.
      failedShare: c.runs ? round2((c.outcomes.failed + c.outcomes.takenOver) / c.runs) : 0,
      couldHaveRatio: c.usd > 0 ? round2(c.couldHaveUsd / c.usd) : 1,
      takenOverShare: c.runs ? round2(c.outcomes.takenOver / c.runs) : 0
    }))
  };
}
function readSharedReference(text2) {
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    return void 0;
  }
  if (!parsed || typeof parsed !== "object") return void 0;
  const r = parsed;
  if (r.version !== RECKONER_VERSION || !Array.isArray(r.cells)) return void 0;
  const num3 = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
  const str2 = (v) => typeof v === "string" && v.length > 0 && v.length <= 120 ? v : void 0;
  const cells = [];
  for (const raw of r.cells) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw;
    const agent = str2(c.agent);
    const model = str2(c.model);
    const runs = num3(c.runs);
    if (!agent || !model || runs === void 0 || runs < 0) continue;
    cells.push({
      agent,
      model,
      runs,
      failuresPerRun: num3(c.failuresPerRun) ?? 0,
      routineShare: num3(c.routineShare) ?? 0,
      failedShare: num3(c.failedShare) ?? 0,
      couldHaveRatio: num3(c.couldHaveRatio) ?? 1,
      takenOverShare: num3(c.takenOverShare) ?? 0
    });
  }
  const tasks = [];
  for (const raw of Array.isArray(r.tasks) ? r.tasks : []) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw;
    const label = TASK_KINDS.find((k3) => k3 === t.task);
    const runs = num3(t.runs);
    if (!label || runs === void 0 || runs < 0) continue;
    tasks.push({
      task: label,
      runs,
      failedShare: num3(t.failedShare) ?? 0,
      takenOverShare: num3(t.takenOverShare) ?? 0,
      couldHaveRatio: num3(t.couldHaveRatio) ?? 1
    });
  }
  return { version: RECKONER_VERSION, machines: num3(r.machines) ?? 1, cells, tasks };
}

// ../host/src/delegation/worker/config.ts
import { execFileSync } from "node:child_process";
import fs16 from "node:fs";
import path16 from "node:path";
var GATEWAY_MARKER = "handover-gateway";
var SHADOW_MARKER2 = "worker-shadow";
var DEFAULT_WORKERS = ["poolside/laguna-s-2.1", "deepseek/deepseek-v4.1-flash", "xiaomi/mimo-v2.5", "deepseek/deepseek-v4-flash", "zai/glm-5.3-flash"];
var DEFAULT_CHECKER = "zai/glm-5.3-flash";
var FALLBACK_CHECKER = "openai/gpt-5.1-codex-mini";
var isClaudeModel = (id) => /^anthropic\//i.test(id);
var DEFAULT_MAX_USD = 2;
var modelId = (v) => typeof v === "string" && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(v);
function gatewayConfig(home3) {
  let g = {};
  try {
    const c = JSON.parse(fs16.readFileSync(path16.join(home3, CONFIG_FILE), "utf8"));
    if (c.gateway && typeof c.gateway === "object") g = c.gateway;
  } catch {
  }
  const workers = Array.isArray(g.workers) ? g.workers.filter(modelId).filter((w) => !isClaudeModel(w)) : [];
  const maxUsd = typeof g.maxUsd === "number" && g.maxUsd > 0 && g.maxUsd <= 50 ? g.maxUsd : DEFAULT_MAX_USD;
  return {
    workers: workers.length ? workers : [...DEFAULT_WORKERS],
    checker: modelId(g.checker) && !isClaudeModel(g.checker) ? g.checker : DEFAULT_CHECKER,
    maxUsd,
    ...typeof g.url === "string" && /^https:\/\//.test(g.url) ? { endpoint: g.url } : {}
  };
}
function gatewayOn(repo, env = process.env) {
  if (/^(off|0|false|no)$/i.test((env.NUDGE_WORKERS ?? "").trim())) return false;
  return !!repo && fs16.existsSync(path16.join(repo, ".nudge", GATEWAY_MARKER));
}
function shadowOn(repo) {
  return gatewayOn(repo) && fs16.existsSync(path16.join(repo, ".nudge", SHADOW_MARKER2));
}
var KEY_NAMES = ["NUDGE_GATEWAY_KEY", "AI_GATEWAY_API_KEY", "NUDGE_JEV_KEY"];
function userVariables(names) {
  try {
    const list = names.map((n2) => `'${n2}'`).join(",");
    const script = `foreach ($n in ${list}) { "$n=" + [Environment]::GetEnvironmentVariable($n,'User') }`;
    const out = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 8e3, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const found = {};
    for (const line of out.split(/\r?\n/)) {
      const at = line.indexOf("=");
      if (at > 0) found[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    return found;
  } catch {
    return {};
  }
}
function gatewayKey(env = process.env, platform = process.platform, readUser = userVariables) {
  let user = null;
  for (const n2 of KEY_NAMES) {
    const v = (env[n2] ?? "").trim();
    if (v) return v;
    if (platform !== "win32") continue;
    user ??= readUser(KEY_NAMES);
    const u = (user[n2] ?? "").trim();
    if (u) return u;
  }
  return "";
}

// ../host/src/delegation/worker/start.ts
import { spawn as spawn2 } from "node:child_process";
import { randomBytes as randomBytes2 } from "node:crypto";
import fs25 from "node:fs";
import path25 from "node:path";

// ../host/src/delegation/review/replay.ts
import { spawnSync } from "node:child_process";
import fs17 from "node:fs";
import os5 from "node:os";
import path17 from "node:path";
function inside(parent, child) {
  const rel = path17.relative(path17.resolve(parent), path17.resolve(child));
  return rel === "" || !rel.startsWith("..") && !path17.isAbsolute(rel);
}
var SEP = String.raw`[\\/]`;
var BASE_DENY = [
  "git push",
  "git remote",
  "git fetch",
  "git pull",
  "git clone",
  "git submodule",
  "vercel",
  "npx vercel",
  "pnpm vercel",
  "pnpm dlx",
  "npx supabase",
  "supabase",
  "pnpm supabase",
  "npx wrangler",
  "wrangler",
  "pnpm wrangler",
  "fly",
  "flyctl",
  "psql",
  "mysql",
  "ssh",
  "scp",
  "rsync",
  "curl",
  "wget",
  "gh",
  "npm publish",
  "pnpm publish",
  "npm login",
  "pnpm login",
  "pnpm deploy",
  "pnpm cli release",
  "npx playwright",
  "pnpm exec playwright",
  "npm exec playwright"
];
var OUTBOUND_SCRIPT = /deploy|vercel|supabase|wrangler|\bfly|psql|ssh|scp|curl|wget|migrat|seed|\bdb[:\-]|publish|release|sync|push|canary|eval:online|online|e2e|playwright|backfill|upload/i;
function denyList(copyDir) {
  const deny = new Set(BASE_DENY);
  try {
    const pkg = JSON.parse(fs17.readFileSync(path17.join(copyDir, "package.json"), "utf8"));
    for (const [name, body] of Object.entries(pkg.scripts ?? {})) {
      if (!OUTBOUND_SCRIPT.test(name) && !OUTBOUND_SCRIPT.test(body)) continue;
      for (const runner of ["pnpm", "pnpm run", "npm run", "yarn"]) deny.add(`${runner} ${name}`);
      const direct = /^\s*((?:node|tsx|npx tsx)\s+\S+)/.exec(body);
      if (direct) deny.add(direct[1]);
    }
  } catch {
  }
  return [...deny];
}
function run(cmd, args, cwd, timeout = 6e5, shell = false) {
  const r = spawnSync(cmd, args, { cwd, timeout, shell, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, timedOut: r.error?.code === "ETIMEDOUT" };
}
var GIT_CONFIG = ["-c", "user.name=review", "-c", "user.email=review@localhost", "-c", "core.autocrlf=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false"];
var git = (cwd, ...args) => run("git", [...GIT_CONFIG, ...args], cwd);
var START_GIT_MS = 18e5;
var gitStart = (cwd, ...args) => run("git", [...GIT_CONFIG, ...args], cwd, START_GIT_MS);
var STRIP_NAME = /^(\.env.*|\.npmrc|\.mcp\.json|.*\.pem|.*\.key|credentials.*\.json|\.netrc)$/i;
function toolPath(name) {
  if (process.platform !== "win32") return name;
  for (const dir of [process.env.APPDATA && path17.join(process.env.APPDATA, "npm"), process.env.ProgramFiles && path17.join(process.env.ProgramFiles, "nodejs")]) {
    const f = dir && path17.join(dir, `${name}.cmd`);
    if (f && fs17.existsSync(f)) return `"${f}"`;
  }
  return name;
}
var SAFE_NPMRC = /^\s*(legacy-peer-deps|strict-peer-deps|auto-install-peers|engine-strict|node-linker|shamefully-hoist|public-hoist-pattern\[\])\s*=\s*[\w*@./-]+\s*$/i;
var STRIP_DIR = /* @__PURE__ */ new Set([".claude", ".nudge", ".vercel", ".git", ".supabase", ".wrangler", "node_modules"]);
function stripCopy(dir) {
  const removed = [];
  const walk = (d) => {
    for (const e of fs17.readdirSync(d, { withFileTypes: true })) {
      const f = path17.join(d, e.name);
      if (e.isDirectory() && (STRIP_DIR.has(e.name) || e.name === ".temp" && path17.basename(d) === "supabase")) {
        fs17.rmSync(f, { recursive: true, force: true });
        removed.push(path17.relative(dir, f).replace(/\\/g, "/"));
      } else if (e.isDirectory()) walk(f);
      else if (STRIP_NAME.test(e.name)) {
        fs17.rmSync(f, { force: true });
        removed.push(path17.relative(dir, f).replace(/\\/g, "/"));
      }
    }
  };
  walk(dir);
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    const md = path17.join(dir, name);
    if (!fs17.existsSync(md)) continue;
    const text2 = fs17.readFileSync(md, "utf8");
    fs17.writeFileSync(md, text2.replace(/\n?<!-- nudge:start[\s\S]*?<!-- nudge:end[^>]*-->\n?/, "\n"));
  }
  return removed.sort();
}
function makeSafeCopy(opts) {
  const { dir } = opts;
  if (fs17.existsSync(dir)) throw new Error(`${dir} exists; copies are never reused`);
  if (inside(opts.home ?? os5.homedir(), dir)) throw new Error("copies live outside the home folder");
  if (inside(opts.repo, dir)) throw new Error("a copy may not live inside the real repository");
  fs17.mkdirSync(dir, { recursive: true });
  try {
    return fillCopy(opts);
  } catch (e) {
    removeCopy(dir);
    throw e;
  }
}
function fillCopy(opts) {
  const { dir } = opts;
  const tar = path17.join(path17.dirname(dir), `${path17.basename(dir)}.tar`);
  try {
    const a2 = git(opts.repo, "archive", "--format=tar", "-o", tar, opts.commit);
    if (a2.code !== 0) throw new Error(`git archive: ${a2.out.slice(0, 400)}`);
    const x = run("tar", ["-xf", path17.relative(dir, tar).replace(/\\/g, "/")], dir);
    if (x.code !== 0) throw new Error(`tar: ${x.out.slice(0, 400)}`);
  } finally {
    fs17.rmSync(tar, { force: true });
  }
  if (opts.patch) {
    const p = git(dir, "apply", "--binary", "--whitespace=nowarn", opts.patch);
    if (p.code !== 0) throw new Error(`the spawn's patch does not apply: ${p.out.slice(0, 300)}`);
  }
  const npmrc = path17.join(dir, ".npmrc");
  const keep = fs17.existsSync(npmrc) ? fs17.readFileSync(npmrc, "utf8").split(/\r?\n/).filter((l) => SAFE_NPMRC.test(l)) : [];
  stripCopy(dir);
  if (keep.length) fs17.writeFileSync(npmrc, `${keep.join("\n")}
`);
  for (const c2 of opts.context) {
    fs17.mkdirSync(path17.dirname(path17.join(dir, c2.to)), { recursive: true });
    fs17.copyFileSync(c2.from, path17.join(dir, c2.to));
  }
  let installed = false;
  let installNote = "no offline install for this project (no pnpm or npm lockfile)";
  const installer = fs17.existsSync(path17.join(dir, "pnpm-lock.yaml")) ? { name: "pnpm", args: ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"] } : fs17.existsSync(path17.join(dir, "package-lock.json")) ? { name: "npm", args: ["ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"] } : null;
  if (!opts.install) installNote = "install switched off";
  else if (installer) {
    let i = run(toolPath(installer.name), installer.args, dir, 9e5, process.platform === "win32");
    if (i.code !== 0 && installer.name === "pnpm" && /specifiers in the lockfile/.test(i.out)) {
      i = run(toolPath("pnpm"), ["install", "--offline", "--no-frozen-lockfile", "--ignore-scripts"], dir, 9e5, process.platform === "win32");
    }
    installed = i.code === 0;
    installNote = installed ? `offline ${installer.name} install` : `offline ${installer.name} install failed: ${i.out.trim().split("\n").slice(-2).join(" ").slice(0, 200)}`;
  }
  git(dir, "init", "-q");
  const dropLock = () => {
    try {
      fs17.rmSync(path17.join(dir, ".git", "index.lock"), { force: true });
    } catch {
    }
  };
  let a = gitStart(dir, "add", "-A");
  if (a.code !== 0 && /index\.lock/.test(a.out)) {
    dropLock();
    a = gitStart(dir, "add", "-A");
  }
  if (a.code !== 0) throw new Error(`git add: ${a.timedOut ? `outran its ${START_GIT_MS / 6e4} minutes` : a.out.slice(0, 400)}`);
  let c = gitStart(dir, "commit", "-q", "--no-verify", "-m", "start");
  if (c.code !== 0 && /index\.lock/.test(c.out)) {
    dropLock();
    c = gitStart(dir, "commit", "-q", "--no-verify", "-m", "start");
  }
  if (c.code !== 0 && git(dir, "rev-parse", "--verify", "HEAD").code !== 0) throw new Error(`git commit: ${c.out.slice(0, 400)}`);
  return { dir, base: git(dir, "rev-parse", "HEAD").out.trim(), installed, installNote };
}
function changedFiles(dir, base) {
  git(dir, "add", "-A");
  const r = git(dir, "diff", "--cached", "--name-only", "--no-renames", base);
  return r.out.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("_context/"));
}
function removeCopy(dir) {
  try {
    fs17.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 1e3 });
    return true;
  } catch {
    return false;
  }
}
function tsc(dir) {
  if (!fs17.existsSync(path17.join(dir, "tsconfig.json")) || !fs17.existsSync(path17.join(dir, "node_modules/typescript/bin/tsc"))) return null;
  return { ok: run("node", ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "."], dir, 6e5).code === 0 };
}
function tscErrorLines(copy, timeoutMs = 6e5) {
  if (!copy.installed) return null;
  if (!fs17.existsSync(path17.join(copy.dir, "tsconfig.json")) || !fs17.existsSync(path17.join(copy.dir, "node_modules/typescript/bin/tsc"))) return null;
  const r = run("node", ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "."], copy.dir, timeoutMs);
  if (r.timedOut) return null;
  const lines = r.out.replace(/\r/g, "").split("\n").filter((l) => /\(\d+,\d+\): error TS\d+/.test(l)).map((l) => l.trim());
  if (r.code !== 0 && !lines.length) return null;
  return lines;
}
function perFileTests(dir, files, timeoutMs = 9e5) {
  const results = {};
  if (!files.length) return { results, tests: {}, out: "" };
  if (!fs17.existsSync(path17.join(dir, "node_modules/vitest/vitest.mjs"))) {
    for (const f of files) results[f] = "not run";
    return { results, tests: {}, out: "no vitest in the copy" };
  }
  const json = path17.join(dir, `.nudge-vitest-${process.pid}-${Date.now()}.json`);
  const r = run("node", ["node_modules/vitest/vitest.mjs", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${path17.basename(json)}`, ...files], dir, timeoutMs);
  let tests = {};
  if (r.timedOut) {
    for (const f of files) results[f] = "timeout";
  } else {
    let report2 = {};
    try {
      report2 = JSON.parse(fs17.readFileSync(json, "utf8"));
    } catch {
    }
    const read = readVitestReport(report2, files);
    Object.assign(results, read.results);
    tests = read.tests;
  }
  fs17.rmSync(json, { force: true });
  return { results, tests, out: r.out };
}
function readVitestReport(report2, files) {
  const results = {};
  const tests = {};
  const rows2 = (report2.testResults ?? []).map((t) => ({ ...t, name: String(t.name ?? "").replace(/\\/g, "/") }));
  for (const f of files) {
    const row2 = rows2.find((t) => t.name.endsWith(`/${f}`) || t.name === f);
    results[f] = !row2 ? "not run" : row2.status === "passed" ? "pass" : "fail";
    if (!row2) continue;
    const own = {};
    for (const a of row2.assertionResults ?? []) {
      if (a.status === "passed") own[String(a.fullName)] = "pass";
      else if (a.status === "failed") own[String(a.fullName)] = "fail";
    }
    tests[f] = own;
  }
  return { results, tests };
}
function controlledCommitTests(copy, repo, sha, o) {
  const show = (f) => spawnSync("git", ["show", `${sha}:${f}`], { cwd: repo, encoding: "buffer", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const runnable = [];
  for (const f of [...o.tests, ...o.fixtures]) {
    const r = show(f);
    if (r.status !== 0) continue;
    fs17.mkdirSync(path17.dirname(path17.join(copy.dir, f)), { recursive: true });
    fs17.writeFileSync(path17.join(copy.dir, f), r.stdout);
    if (o.tests.includes(f)) runnable.push(f);
  }
  const worker = perFileTests(copy.dir, runnable);
  fs17.writeFileSync(path17.join(o.outDir, "secondary-worker.txt"), worker.out);
  for (const f of o.named) {
    if (o.tests.includes(f)) continue;
    const r = show(f);
    if (r.status === 0) {
      fs17.mkdirSync(path17.dirname(path17.join(copy.dir, f)), { recursive: true });
      fs17.writeFileSync(path17.join(copy.dir, f), r.stdout);
    } else fs17.rmSync(path17.join(copy.dir, f), { force: true });
  }
  const control = perFileTests(copy.dir, runnable);
  fs17.writeFileSync(path17.join(o.outDir, "secondary-control.txt"), control.out);
  return { worker: worker.results, control: control.results };
}
function baselineTsc(copy) {
  if (!copy.installed) return null;
  return tsc(copy.dir)?.ok ?? null;
}

// ../host/src/delegation/snapshot.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import crypto from "node:crypto";
import fs18 from "node:fs";
import path18 from "node:path";
var TREES_DIR = ["review", "trees"];
var MAX_PATCH_BYTES = 20 * 1024 * 1024;
var KEEP_MS2 = 14 * 24 * 60 * 60 * 1e3;
var git2 = (repo, args, timeout) => spawnSync2("git", args, { cwd: repo, encoding: "buffer", timeout, maxBuffer: MAX_PATCH_BYTES + 1, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, windowsHide: true });
function snapshotTree(repo, home3, timeoutMs = 3e3) {
  try {
    const h = git2(repo, ["rev-parse", "HEAD"], timeoutMs);
    const head = h.status === 0 ? h.stdout.toString("utf8").trim() : "";
    if (!/^[0-9a-f]{40}$/.test(head)) return null;
    const d = git2(repo, ["diff", "HEAD", "--binary", "--no-color", "--no-ext-diff"], timeoutMs);
    if (d.status !== 0 || d.error || d.stdout.length > MAX_PATCH_BYTES) return { head };
    if (!d.stdout.length) return { head };
    const name = `${crypto.createHash("sha256").update(d.stdout).digest("hex").slice(0, 24)}.patch`;
    const dir = path18.join(home3, ...TREES_DIR);
    fs18.mkdirSync(dir, { recursive: true });
    const file = path18.join(dir, name);
    if (!fs18.existsSync(file)) fs18.writeFileSync(file, d.stdout);
    return { head, patch: name };
  } catch {
    return null;
  }
}

// ../host/src/delegation/worker/agent.ts
import { spawn } from "node:child_process";
import fs19 from "node:fs";
import path19 from "node:path";
var DEFAULT_ENDPOINT = "https://ai-gateway.vercel.sh/v1/chat/completions";
var ALLOW = /* @__PURE__ */ new Set(["pnpm", "npm", "npx", "node", "git", "ls", "cat", "grep", "rg", "find", "head", "tail", "wc", "sort", "diff", "echo", "cd", "true"]);
var GIT_READ = /* @__PURE__ */ new Set(["status", "diff", "log", "show", "grep", "ls-files", "blame", "rev-parse"]);
var NETWORK = /\b(curl|wget|ssh|scp|nc|telnet)\b|https?:\/\/|\bpnpm\s+(add|dlx|update|up|publish|install|i)\b|\bnpm\s+(install|i|publish|update|exec)\b|\bnpx\s+(-y|--yes)\b/;
var SECRET_PATH = /(^|[\\/])\.env(\.[^\\/]*)?$|\.(pem|key|p12|pfx)$|(^|[\\/])id_(rsa|ed25519|ecdsa)(\.pub)?$|(^|[\\/])\.(npmrc|netrc)$/i;
var SECRET_ENV = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL/i;
var MAX_OUT = 3e4;
var COPY_ALLOW = /* @__PURE__ */ new Set(["sed", "mkdir", "cp", "mv", "rm", "touch"]);
function refuse(command, deny = [], o = {}) {
  if (o.read) {
    const why = refuse(command, deny, { copy: false });
    return why && "refused: this is the read-back step: change no files, not from the shell either. Write your read-back now: the task, your plan, what the check showed, your questions; the go comes after.";
  }
  if (NETWORK.test(command)) return "refused: network and install commands are not allowed";
  if (/(^|[\s'"=(])(\/(?!dev\/null\b)|[a-zA-Z]:[\\/]|~)/.test(command) || /(^|[\s'"=/])\.\.([\\/]|$|\s)/.test(command)) return "refused: stay inside this folder (no absolute paths, ~ or ..)";
  if (/[`]|\$\(/.test(command)) return "refused: command substitution is not allowed";
  const noJoin = command.replace(/\d?>&\d/g, "").replace(/\d?>>?\s*\/dev\/null/g, "");
  if (!o.copy && /[<>]/.test(noJoin)) return "refused: no redirection; change files with write_file or edit_file";
  if (/(^|[\s'"/])\.env\b/.test(command)) return "refused: .env files are not readable";
  const scan = o.copy ? command.replace(/'[^']*'|"[^"]*"/g, "''") : command;
  for (const seg of scan.split(/&&|\|\||[;|\n]/)) {
    const words = seg.trim().replace(/^(\w+=\S*\s+)+/, "").split(/\s+/);
    const first = words[0];
    if (!first) continue;
    if (o.copy && COPY_ALLOW.has(first)) continue;
    if (!ALLOW.has(first)) return `refused: '${first}' is not an allowed command (allowed: ${[...ALLOW, ...o.copy ? COPY_ALLOW : []].join(", ")}); change files with write_file or edit_file`;
    if (first === "git") {
      const sub = words.slice(1).find((w) => !w.startsWith("-"));
      if (words.slice(1).some((w) => w === "-c" || /^--(output|exec-path|ext-diff)/.test(w))) return "refused: git options -c and --output are not allowed";
      if (!sub || !GIT_READ.has(sub)) return `refused: git ${sub ?? ""} is not allowed (allowed: ${[...GIT_READ].join(", ")})`;
    }
    if (!o.copy && first === "node" && words.some((w) => /^(-e|--eval|-p|--print|-)$/.test(w))) return "refused: node may run a file, not inline code";
    if (first === "find" && words.some((w) => /^-(delete|exec|execdir|ok|okdir|fprint.*)$/.test(w))) return "refused: find may only list";
    const line = words.join(" ");
    const hit = deny.find((d) => line === d || line.startsWith(`${d} `));
    if (hit) return `refused: '${hit}' reaches outside this folder`;
  }
  return null;
}
var normal = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");
function inside2(dir, p) {
  const full = path19.resolve(dir, typeof p === "string" && p ? p : ".");
  const rel = path19.relative(dir, full);
  if (rel.startsWith("..") || path19.isAbsolute(rel)) throw new Error(`path ${String(p)} is outside this folder`);
  if (SECRET_PATH.test(full)) throw new Error(`path ${String(p)} is not readable (a secrets file)`);
  return full;
}
var clip = (s2) => s2.length > MAX_OUT ? `${s2.slice(0, MAX_OUT)}
[... ${s2.length - MAX_OUT} more characters cut]` : s2;
var BASH = process.platform === "win32" ? ["C:/Program Files/Git/bin/bash.exe", "C:/Program Files/Git/usr/bin/bash.exe"].find((p) => fs19.existsSync(p)) ?? "bash" : "bash";
function scrubbedEnv(env = process.env) {
  const out = {};
  for (const [k3, v] of Object.entries(env)) if (!SECRET_ENV.test(k3)) out[k3] = v;
  return { ...out, CI: "1", NO_COLOR: "1" };
}
function runShell(dir, command, timeoutMs, env, signal) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(BASH, ["-c", command], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      return resolve({ out: `[spawn error] ${e.message}`, exit: null });
    }
    let out = "";
    let done = false;
    const finish2 = (r) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      signal?.removeEventListener("abort", onAbort);
      resolve(r);
    };
    child.stdout?.on("data", (d) => out += d);
    child.stderr?.on("data", (d) => out += d);
    const kill = () => {
      try {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
        else child.kill("SIGKILL");
      } catch {
      }
      try {
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
      } catch {
      }
    };
    const t = setTimeout(() => {
      kill();
      finish2({ out: clip(`${out}
[timed out after ${timeoutMs / 1e3}s, command killed]`), exit: null });
    }, timeoutMs);
    const onAbort = () => {
      kill();
      finish2({ out: clip(`${out}
[aborted]`), exit: null });
    };
    signal?.addEventListener("abort", onAbort);
    child.on("close", (code) => finish2({ out: clip(out), exit: code }));
    child.on("error", (e) => finish2({ out: `[spawn error] ${e.message}`, exit: null }));
  });
}
var fn = (name, description, properties, required) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
var READ_TOOLS2 = [
  fn("read_file", "Read a text file (path relative to the repository root). Returns lines prefixed with line numbers. Use offset/limit (1-based line, count) for long files.", { path: { type: "string" }, offset: { type: "integer" }, limit: { type: "integer" } }, ["path"]),
  fn("list_files", "List files under a folder (recursive, skips node_modules and .git), optionally filtered by a substring or a pattern such as *.test.ts.", { path: { type: "string" }, pattern: { type: "string" } }, []),
  fn("grep", "Search file contents with an extended regular expression (grep -E syntax). Returns matching lines as path:line:text.", { pattern: { type: "string" }, path: { type: "string" }, glob: { type: "string" } }, ["pattern"]),
  fn("bash", `Run a shell command (bash) in the repository root, to read and to run checks. Timeout in milliseconds: default 120000, max 600000; a command that runs tests or a typecheck always gets 600000. Allowed commands: ${[...ALLOW].join(", ")}. No network, no redirection into files, stay inside this folder.`, { command: { type: "string" }, timeout: { type: "integer" } }, ["command"])
];
var WRITE_TOOLS = [
  fn("write_file", "Create or overwrite a file with the given content. Only the files this job allows.", { path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
  fn("edit_file", "Replace an exact string in a file. old_string must occur exactly once unless replace_all is true. Only the files this job allows.", { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, ["path", "old_string", "new_string"])
];
var SYSTEM = "You are a coding agent working in a repository through the tools you are given. Use them to read, change and check files; do not describe changes without making them. When the task is complete, reply with your final message and no tool call.";
function listFiles(dir, sub, pattern) {
  const root = inside2(dir, sub);
  const pat = typeof pattern === "string" && pattern ? pattern : null;
  const re = pat ? new RegExp(pat.includes("*") ? `^${pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$` : pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : null;
  const out = [];
  const walk = (d) => {
    for (const e of fs19.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const f = path19.join(d, e.name);
      const rel = normal(path19.relative(dir, f));
      if (e.isDirectory()) walk(f);
      else if (!SECRET_PATH.test(f) && (!re || re.test(e.name) || re.test(rel))) out.push(rel);
      if (out.length > 2e3) return;
    }
  };
  walk(root);
  return out.length ? clip(out.join("\n")) : "(no files)";
}
function writable(o, p) {
  if (o.mode !== "write") return { refusal: "refused: this step is read-only; wait for the go" };
  const full = inside2(o.dir, p);
  const rel = normal(path19.relative(o.dir, full));
  const allowed = o.allowed.map(normal);
  const same = process.platform === "win32" ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b;
  if (!allowed.some((a) => same(a, rel))) return { refusal: `refused: ${rel} is not one of the files this job may change (${allowed.join(", ") || "none"}). If the work needs it, stop and say so in your report.` };
  return { full };
}
var RUNS_TESTS = /\b(vitest|jest|mocha|tsc|tsx|playwright)\b|\b(pnpm|npm|yarn)\s+(run\s+)?(test|typecheck|check)\b|\bnode\s+--test\b/;
function bashTimeout(command, asked, floorMs = 0) {
  const t = Math.min(Math.max(Number(asked) || 12e4, 1e3), 6e5);
  return floorMs && RUNS_TESTS.test(command) ? Math.max(t, Math.min(floorMs, 6e5)) : t;
}
async function callTool(o, name, args, signal) {
  const num3 = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
  switch (name) {
    case "read_file": {
      const lines = fs19.readFileSync(inside2(o.dir, args.path), "utf8").split("\n");
      const from = Math.max(1, num3(args.offset) ?? num3(args.line_start) ?? num3(args.start_line) ?? 1);
      const end = num3(args.line_end) ?? num3(args.end_line);
      const n2 = num3(args.limit) ?? (end ? end - from + 1 : 2e3);
      return clip(lines.slice(from - 1, from - 1 + n2).map((l, i) => `${from + i}	${l}`).join("\n")) + (from - 1 + n2 < lines.length ? `
[${lines.length - (from - 1 + n2)} more lines]` : "");
    }
    case "write_file": {
      const w = writable(o, args.path);
      if ("refusal" in w) return w.refusal;
      fs19.mkdirSync(path19.dirname(w.full), { recursive: true });
      fs19.writeFileSync(w.full, typeof args.content === "string" ? args.content : "");
      return `wrote ${String(args.path)}`;
    }
    case "edit_file": {
      const w = writable(o, args.path);
      if ("refusal" in w) return w.refusal;
      const oldS = typeof args.old_string === "string" ? args.old_string : "";
      const newS = typeof args.new_string === "string" ? args.new_string : "";
      const text2 = fs19.readFileSync(w.full, "utf8");
      const count4 = oldS ? text2.split(oldS).length - 1 : 0;
      if (count4 === 0) return "error: old_string not found";
      if (count4 > 1 && !args.replace_all) return `error: old_string occurs ${count4} times; give more context or set replace_all`;
      fs19.writeFileSync(w.full, args.replace_all ? text2.split(oldS).join(newS) : text2.replace(oldS, () => newS));
      return `edited ${String(args.path)} (${args.replace_all ? count4 : 1} replacement${count4 > 1 && args.replace_all ? "s" : ""})`;
    }
    case "list_files":
      return listFiles(o.dir, args.path, args.pattern);
    case "grep": {
      inside2(o.dir, args.path);
      const q = (s2) => `'${String(s2).replace(/'/g, "'\\''")}'`;
      const r = await runShell(o.dir, `grep -rnE --exclude-dir=node_modules --exclude-dir=.git --exclude='.env*' ${args.glob ? `--include=${q(args.glob)} ` : ""}-e ${q(args.pattern)} ${q(args.path || ".")} | head -500`, 6e4, scrubbedEnv(), signal);
      return `${r.out}
[exit ${r.exit}]`;
    }
    case "bash": {
      const command = typeof args.command === "string" ? args.command : "";
      const why = refuse(command, o.deny, { copy: o.copy, read: o.mode === "read" });
      if (why) return why;
      const r = await runShell(o.dir, command, bashTimeout(command, args.timeout, o.testFloorMs), scrubbedEnv(), signal);
      return `${r.out}
[exit ${r.exit}]`;
    }
    default:
      return `error: unknown tool ${name}${name === "write_file" || name === "edit_file" ? " in this step" : ""}`;
  }
}
async function chat(o, body, signal, onBadCall) {
  const f = o.fetchImpl ?? fetch;
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await f(o.endpoint ?? DEFAULT_ENDPOINT, { method: "POST", signal, headers: { authorization: `Bearer ${o.key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      if (signal.aborted || attempt >= 8) throw e;
      await new Promise((res) => setTimeout(res, Math.min(2e3 * 2 ** attempt, 2e4)));
      continue;
    }
    const j = await r.json().catch(() => ({ error: { message: `non-JSON response, status ${r.status}` } }));
    if (r.ok && j.choices?.[0]) return j;
    const badCall = r.status === 400 && /tool call|tool_use_failed|parse tool/i.test(JSON.stringify(j.error ?? ""));
    if (badCall && onBadCall() <= 3) continue;
    if (attempt < 8 && (r.status === 429 || r.status === 498 || r.status >= 500)) {
      await new Promise((res) => setTimeout(res, Math.min(2e3 * 2 ** attempt, 2e4)));
      continue;
    }
    throw new Error(`HTTP ${r.status}: ${JSON.stringify(j.error ?? j).slice(0, 500)}`);
  }
}
async function runAgent(o) {
  const started = Date.now();
  fs19.mkdirSync(path19.dirname(o.streamFile), { recursive: true });
  const out = fs19.createWriteStream(o.streamFile);
  const emit = (e) => out.write(`${JSON.stringify(e)}
`);
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, o.minutes * 6e4);
  const tools = [...READ_TOOLS2, ...o.mode === "write" ? WRITE_TOOLS : []];
  const messages = o.history?.length ? [...o.history, { role: "user", content: o.prompt }] : [{ role: "system", content: SYSTEM }, { role: "user", content: o.prompt }];
  let usd4 = 0;
  let n2 = 0;
  let answer = "";
  let subtype = "success";
  let error = null;
  emit({ type: "init", model: o.model, mode: o.mode, allowed: o.allowed, tools: tools.map((t) => t.function.name), prompt: o.prompt });
  try {
    if (!o.key) throw new Error("no gateway key");
    for (; ; ) {
      if (n2 >= o.turns) {
        subtype = "error_max_turns";
        break;
      }
      if (o.maxUsd !== void 0 && usd4 > o.maxUsd) {
        subtype = "error_budget";
        error = `stopped at the step's budget ($${o.maxUsd.toFixed(2)})`;
        break;
      }
      const body = { model: o.model, messages, tools, tool_choice: "auto" };
      let bad = 0;
      const onBadCall = () => {
        emit({ type: "bad_tool_call_retry", turn: n2 + 1, count: ++bad });
        return bad;
      };
      let j = await chat(o, body, ac.signal, onBadCall);
      for (let k3 = 0; k3 < 2 && !j.choices[0].message.content && !j.choices[0].message.tool_calls?.length; k3++) {
        emit({ type: "empty_retry", turn: n2 + 1 });
        usd4 += Number(j.usage?.cost ?? 0);
        j = await chat(o, k3 === 0 ? body : { ...body, messages: [...messages, { role: "user", content: "Continue: finish the task, or give your final answer." }] }, ac.signal, onBadCall);
      }
      n2++;
      const msg = j.choices[0].message;
      usd4 += Number(j.usage?.cost ?? 0);
      emit({ type: "response", turn: n2, finish: j.choices[0].finish_reason, content: msg.content, tool_calls: msg.tool_calls, usage: j.usage });
      if (!msg.content && !msg.tool_calls?.length) {
        subtype = "error_api";
        error = "empty answer: the model returned neither text nor a tool call, three times";
        break;
      }
      const calls = msg.tool_calls ?? [];
      messages.push({ role: "assistant", content: msg.content ?? "", ...calls.length ? { tool_calls: calls } : {} });
      if (msg.content) answer = msg.content;
      if (!calls.length) break;
      for (const c of calls) {
        let result;
        try {
          result = await callTool(o, c.function.name, JSON.parse(c.function.arguments || "{}"), ac.signal);
        } catch (err) {
          result = `error: ${err instanceof Error ? err.message : String(err)}`;
        }
        emit({ type: "tool_result", turn: n2, id: c.id, name: c.function.name, args: c.function.arguments, result });
        messages.push({ role: "tool", tool_call_id: c.id, content: result });
      }
      if (timedOut) {
        subtype = "error_wall";
        error = `stopped at the step's time limit (${o.minutes} min)`;
        break;
      }
    }
  } catch (err) {
    subtype = timedOut ? "error_wall" : "error_api";
    error = err instanceof Error ? err.message : String(err);
  }
  clearTimeout(timer);
  const ms = Date.now() - started;
  emit({ type: "result", subtype, turns: n2, result: answer, usd: usd4, ms, error });
  await new Promise((res) => out.end(() => res()));
  return { subtype, answer, turns: n2, usd: usd4, ms, messages, error };
}

// ../host/src/delegation/worker/checker.ts
var CHECKER_SYSTEM = `You are the checker in a delegated coding job. A lead handed a brief to a worker model; you check the worker's output against the brief using ONLY the checker questions you are given. You never write code and never give the answer.

Answer with one JSON object and nothing else (no prose, no code fences):
{"ok": true|false, "flags": [{"rule": "<the id of the question that applies, without brackets, e.g. review-untested-diff@1>", "quote": "<the exact text you object to, copied character for character from the worker's read-back or from the diff>", "ask": "<one question to the worker that makes it look again>", "severity": "blocker"|"note"}]}

Rules:
- Flag only what one of the questions covers and what the input actually shows. If unsure, do not flag.
- "quote" must be copied exactly from the input, short (one line or a few), so it can be found by search.
- "ask" is a question, never a fix: no code, no corrected value, no "change X to Y".
- "severity": "blocker" only when, as shown, the plan or the change would be wrong, break the brief, or cannot be judged without the answer; "note" for anything else worth a second look (a request to quote a line, a case to think about). Most flags are notes.
- At most 4 flags; keep the most important.
- "ok" is true exactly when no flag is a blocker.`;
var NO_RULES = "- [brief] Does the worker's output do what the brief asks, within its limits? (no playbook questions were served for this phase)";
function checkerPrompt(q) {
  const rules = q.rules.filter((r) => !r.phase || r.phase === q.phase);
  const questions = rules.length ? rules.map((r) => `- [${r.id}${r.v ? `@${r.v}` : ""}] ${r.text}`).join("\n") : NO_RULES;
  return [
    `Phase: ${q.phase === "readback" ? "the worker's read-back, before any edit" : "the worker's diff, after the work"}.`,
    `## CHECKER QUESTIONS (flag only against these)
${questions}`,
    `## THE BRIEF THE WORKER RECEIVED
${q.brief}`,
    q.input,
    "Answer with the JSON object only."
  ].join("\n\n");
}
function parseChecker(text2, input = "") {
  const s2 = text2.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
  const j = JSON.parse(s2.slice(s2.indexOf("{"), s2.lastIndexOf("}") + 1));
  const list = Array.isArray(j.flags) ? j.flags : [];
  return list.slice(0, 4).map((f) => {
    const quote = String(f.quote ?? "");
    return {
      rule: String(f.rule ?? "").trim().replace(/^\[|\]$/g, ""),
      quote,
      ask: String(f.ask ?? ""),
      // an unlabelled flag is read the cautious way
      severity: f.severity === "note" ? "note" : "blocker",
      quoteFound: quote.length > 0 && input.includes(quote)
    };
  });
}
var blockers = (flags) => flags.filter((f) => f.severity !== "note");
async function runChecker(q) {
  const f = q.fetchImpl ?? fetch;
  let usd4 = 0;
  try {
    const r = await f(q.endpoint ?? DEFAULT_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${q.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: q.model, messages: [{ role: "system", content: CHECKER_SYSTEM }, { role: "user", content: checkerPrompt(q) }], max_tokens: 2e4 })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, flags: [], usd: usd4, error: `the checker call failed: HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}` };
    usd4 = Number(j.usage?.cost ?? 0);
    const text2 = j.choices?.[0]?.message?.content ?? "";
    try {
      const flags = parseChecker(text2, q.input);
      return { ok: blockers(flags).length === 0, flags, usd: usd4, error: null };
    } catch (e) {
      return { ok: false, flags: [], usd: usd4, error: `the checker's answer is not JSON: ${e.message}` };
    }
  } catch (e) {
    return { ok: false, flags: [], usd: usd4, error: `the checker call failed: ${e.message}` };
  }
}

// ../host/src/delegation/worker/coverage.ts
import fs20 from "node:fs";
import path20 from "node:path";

// ../host/src/delegation/worker/lines.ts
function changedLines(before, after) {
  const afterLines = splitLines(after);
  if (before === null) {
    return afterLines.map((l, idx) => ({ line: l, idx })).filter(({ line }) => line.trim() !== "").map(({ idx }) => idx + 1);
  }
  const matched = commonAfterIndices(splitLines(before), afterLines);
  const result = [];
  afterLines.forEach((l, idx) => {
    if (!matched.has(idx) && l.trim() !== "") result.push(idx + 1);
  });
  return result;
}
function unexecutedLines(changed, coverage) {
  if (!coverage) {
    return { lines: [...changed].sort((a, b) => a - b), unknown: [] };
  }
  const lines = [];
  const unknown = [];
  for (const line of changed) {
    let spanned = false;
    let reached = false;
    for (const [id, st] of Object.entries(coverage.statementMap)) {
      if (st.start.line <= line && line <= st.end.line) {
        spanned = true;
        const count4 = coverage.s[id];
        if (count4 !== void 0 && count4 > 0) reached = true;
      }
    }
    if (!spanned) unknown.push(line);
    else if (!reached) lines.push(line);
  }
  return {
    lines: lines.sort((a, b) => a - b),
    unknown: unknown.sort((a, b) => a - b)
  };
}
function coverageFor(report2, root, file) {
  const target = canonicalJoin(root, file);
  for (const [key2, entry] of Object.entries(report2)) {
    if (canonicalPath(key2) === target) return entry;
  }
  return void 0;
}
function ranges(lines) {
  if (lines.length === 0) return "";
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const groups = [];
  for (const n2 of sorted) {
    const last = groups[groups.length - 1];
    if (last !== void 0 && n2 === last[last.length - 1] + 1) {
      last.push(n2);
    } else {
      groups.push([n2]);
    }
  }
  return groups.map((g) => g.length === 1 ? String(g[0]) : g[0] + "-" + g[g.length - 1]).join(", ");
}
function splitLines(text2) {
  const parts = [];
  let cur = "";
  for (let i = 0; i < text2.length; i++) {
    const ch = text2[i];
    if (ch === "\n") {
      if (cur.endsWith("\r")) cur = cur.slice(0, -1);
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  const last = parts[parts.length - 1];
  if (last === "") parts.pop();
  return parts;
}
function commonAfterIndices(before, after) {
  const m = before.length;
  const n2 = after.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n2 + 1).fill(0));
  for (let i2 = m - 1; i2 >= 0; i2--) {
    for (let j2 = n2 - 1; j2 >= 0; j2--) {
      dp[i2][j2] = before[i2] === after[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
    }
  }
  const matched = /* @__PURE__ */ new Set();
  let i = 0;
  let j = 0;
  while (i < m && j < n2) {
    if (before[i] === after[j]) {
      matched.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matched;
}
function canonicalPath(p) {
  let out = "";
  for (let i = 0; i < p.length; i++) {
    out += p[i] === "\\" ? "/" : p[i];
  }
  return out.toLowerCase();
}
function trimSlashes(s2) {
  let end = s2.length;
  while (end > 0 && s2[end - 1] === "/") end--;
  return s2.slice(0, end);
}
function canonicalJoin(root, file) {
  const r = trimSlashes(canonicalPath(root));
  const f = canonicalPath(file);
  return r + "/" + f;
}

// ../host/src/delegation/worker/coverage.ts
var PROVIDERS = ["@vitest/coverage-v8", "@vitest/coverage-istanbul"];
function hasCoverageProvider(root) {
  return PROVIDERS.some((p) => fs20.existsSync(path20.join(root, "node_modules", ...p.split("/"), "package.json")));
}
var sh = (s2) => `'${s2.replace(/'/g, `'\\''`)}'`;
function coverageCommands(check, files, outDir) {
  const out = [];
  for (const part of check.split("&&").map((p) => p.trim())) {
    if (!/(^|\s|\/)vitest(\s|$)/.test(part) || /[|;<>]/.test(part)) continue;
    const reportDir = path20.join(outDir, String(out.length + 1)).replace(/\\/g, "/");
    const include = files.map((f) => `--coverage.include=${sh(f.replace(/\\/g, "/"))}`).join(" ");
    out.push({
      command: `${part} --coverage.enabled --coverage.reporter=json --coverage.reportsDirectory=${sh(reportDir)} ${include}`,
      reportDir
    });
  }
  return out;
}
function mergeReports(reports) {
  const merged = {};
  for (const r of reports) {
    for (const [key2, entry] of Object.entries(r)) {
      const at = merged[key2];
      if (!at) {
        merged[key2] = { path: entry.path, statementMap: entry.statementMap, s: { ...entry.s } };
        continue;
      }
      for (const [id, n2] of Object.entries(entry.s)) at.s[id] = (at.s[id] ?? 0) + n2;
    }
  }
  return merged;
}
async function runCoverage(root, check, files, outDir, run2) {
  const code = files.filter(isCodeFile);
  if (!code.length) return { none: "no code file changed" };
  if (!hasCoverageProvider(root)) return { none: "this project has no Vitest coverage provider installed (@vitest/coverage-v8)" };
  const commands = coverageCommands(check, code, outDir);
  if (!commands.length) return { none: "the check runs no Vitest command that coverage can be added to" };
  const reports = [];
  for (const c of commands) {
    try {
      await run2(root, c.command);
      reports.push(JSON.parse(fs20.readFileSync(path20.join(c.reportDir, "coverage-final.json"), "utf8")));
    } catch {
      return { none: "the coverage run wrote no report" };
    }
  }
  return { report: mergeReports(reports) };
}
function lineRows(root, files, report2, before) {
  const rows2 = [];
  for (const file of files.filter(isCodeFile)) {
    let after;
    try {
      after = fs20.readFileSync(path20.join(root, file), "utf8");
    } catch {
      continue;
    }
    const changed = changedLines(before(file), after);
    const r = unexecutedLines(changed, coverageFor(report2, root, file));
    rows2.push({ file, changed: changed.length, unexecuted: ranges(r.lines), unknown: r.unknown.length });
  }
  return rows2;
}

// ../host/src/delegation/worker/job.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import fs21 from "node:fs";
import path21 from "node:path";

// ../host/src/delegation/worker/start-check.ts
var NOT_MEASURABLE = "not measurable: ";
var ASSERTION = /AssertionError|\bexpected\b[^\n]{0,200}\bto\b|^\s*-\s*Expected\b|^\s*Expected:\s|Received:|toBe\(|toEqual\(|toMatch|toThrow|is not a function|is not defined|is not a constructor|Cannot read propert|does not provide an export named|has no exported member|^not ok\b|Unable to find (?:an? )?(?:accessible )?element|TestingLibraryElementError/im;
var TESTS_FAILED = /^\s*(Tests\s+)?\d+ failed\b/m;
var TIMED_OUT = /Test timed out|Hook timed out|\[timed out after/;
var norm = (f) => f.replace(/\\/g, "/").replace(/^\.\//, "");
var stem = (f) => norm(f).replace(/\.[cm]?[jt]sx?$/, "");
function willExist(spec, files) {
  const s2 = stem(spec).replace(/^(\.\.?\/)+/, "");
  if (!s2) return false;
  return files.some((f) => {
    const t = stem(f);
    return t === s2 || t.endsWith(`/${s2}`) || s2.endsWith(`/${t}`);
  });
}
function startBlocker(out, exit, files, named = []) {
  const text2 = out.replace(/\r/g, "").replace(/\x1b\[[0-9;]*m/g, "");
  if (exit === 0) return "the check already passes before any work: it does not describe the work (a tests-first check fails now on an assertion and passes when the work is done)";
  if (exit === null) return /\[spawn error\]/.test(text2) ? "the check could not be started in the copy" : "the check outran its time in the copy before any work was done";
  if (/No test files found|No tests found|no tests? to run/i.test(text2)) return "the check found no test file in the copy";
  if (/command not found|is not recognized as an internal or external command/.test(text2)) return "the check cannot start in the copy: a command it runs is not there";
  const all = [...files, ...named].map(norm);
  const nameSet = new Set(all);
  const runnerText = text2.split("\n").filter((l) => !/error TS\d+/.test(l)).join("\n");
  const modules = [...runnerText.matchAll(/Cannot find module '([^']+)'|Failed to (?:resolve|load) (?:import|url) (?:"([^"]+)"|([^\s"]+))|Could not resolve "([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
  const missing = modules.filter((m) => !willExist(m, all));
  if (missing.length) return `the check cannot start in the copy: cannot find ${[...new Set(missing)].slice(0, 3).join(", ")}`;
  const toCome = modules.some((m) => willExist(m, all));
  const tsInJob = [...text2.matchAll(/^(\S[^(\n]*)\(\d+,\d+\): error TS\d+/gm)].some((m) => nameSet.has(norm(m[1].trim())));
  const assertion = ASSERTION.test(runnerText);
  if (TIMED_OUT.test(text2) && !assertion) return "a test timed out in the copy before any work, with no assertion failing: a slow copy or a hang, not the work to come";
  if (!assertion && !TESTS_FAILED.test(runnerText) && !tsInJob && !toCome) return "the check fails, but no test failed on an assertion: the failure is not the work to come";
  return null;
}

// ../host/src/delegation/worker/signals.ts
var normal2 = (f) => f.replace(/\\/g, "/").replace(/^\.\//, "");
var argPath = (e) => {
  try {
    return normal2(String(JSON.parse(e.args ?? "{}").path ?? ""));
  } catch {
    return "";
  }
};
var crLines = (text2) => text2.split("\n").filter((l) => l.endsWith("\r")).length;
function endingsRewritten(before, after) {
  const flipped = Math.abs(crLines(before) - crLines(after));
  const lines = Math.min(before.split("\n").length, after.split("\n").length);
  return flipped >= 20 && flipped * 4 >= lines ? flipped : 0;
}
function jobSignals(i) {
  const changed = new Set(i.changed.map(normal2));
  const out = [];
  for (const f of i.listed.map(normal2)) if (!changed.has(f)) out.push({ rule: "named file untouched", detail: f });
  const failedOn = new Set(
    i.events.filter((e) => e.type === "tool_result" && (e.name === "edit_file" || e.name === "write_file") && /^(error|refused)/i.test(String(e.result ?? ""))).map(argPath).filter(Boolean)
  );
  for (const f of [...failedOn].sort()) if (!changed.has(f) && i.listed.map(normal2).includes(f)) out.push({ rule: "edit failed, file unchanged", detail: f });
  for (const f of i.changed.map(normal2)) {
    const b = i.before(f);
    if (b === null) {
      out.push({ rule: "file created", detail: f });
      continue;
    }
    const a = i.after(f);
    if (a === null) continue;
    const flipped = endingsRewritten(b, a);
    if (flipped) out.push({ rule: "line endings rewritten", detail: `${f}: ${flipped} line endings changed` });
  }
  return out;
}
function probeQuestions(signals) {
  const q = [];
  for (const s2 of signals) if (s2.rule === "named file untouched") q.push(`The brief lists ${s2.detail} and you did not change it. Why?`);
  if (signals.length) q.push("Which values, names or shapes in your change did you guess or work out yourself rather than find in the code or the brief? Name each with its file and line. If none, say none.");
  q.push("Is there any part of the brief you did not finish or could not verify here? If so, which, and what stopped you.");
  return q;
}
var probePrompt = (questions) => `${questions.length > 1 ? "Short questions" : "A short question"} about the change you made, from the person who will review it. Answer in plain words, by number. You may read files to check; change nothing.

${questions.map((q, n2) => `${n2 + 1}. ${q}`).join("\n")}`;

// ../host/src/delegation/worker/job.ts
var WORKERS_DIR = "workers";
var jobDir = (home3, id) => path21.join(home3, WORKERS_DIR, id);
var validJobId = (id) => typeof id === "string" && /^w_[a-f0-9]{6,32}$/.test(id);
function readSpec(dir) {
  return JSON.parse(fs21.readFileSync(path21.join(dir, "job.json"), "utf8"));
}
function setStatus(dir, state, phase, error) {
  try {
    fs21.writeFileSync(path21.join(dir, "status.json"), JSON.stringify({ state, phase, at: (/* @__PURE__ */ new Date()).toISOString(), pid: process.pid, ...error ? { error } : {} }));
  } catch {
  }
}
function readStatus(dir) {
  try {
    return JSON.parse(fs21.readFileSync(path21.join(dir, "status.json"), "utf8"));
  } catch {
    return void 0;
  }
}
function readResult(dir) {
  try {
    return JSON.parse(fs21.readFileSync(path21.join(dir, "result.json"), "utf8"));
  } catch {
    return void 0;
  }
}
var manifestFile = (dir) => path21.join(dir, "snapshot", "manifest.json");
function putBackAsCommitted(repo, head, root, files) {
  const back = [];
  for (const f of files) {
    const rel = f.replace(/\\/g, "/");
    const to = path21.join(root, rel);
    let has = true;
    try {
      execFileSync2("git", ["cat-file", "-e", `${head}:${rel}`], { cwd: repo, timeout: 2e4, windowsHide: true, stdio: "ignore" });
    } catch {
      has = false;
    }
    try {
      if (has) {
        const text2 = execFileSync2("git", ["-c", "core.autocrlf=false", "show", `${head}:${rel}`], { cwd: repo, timeout: 2e4, windowsHide: true, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
        fs21.mkdirSync(path21.dirname(to), { recursive: true });
        fs21.writeFileSync(to, text2);
      } else fs21.rmSync(to, { force: true });
      back.push(rel);
    } catch {
    }
  }
  return back;
}
function snapshot(dir, root, files) {
  if (fs21.existsSync(manifestFile(dir))) return;
  fs21.mkdirSync(path21.join(dir, "snapshot"), { recursive: true });
  const entries = files.map(normal).map((file, i) => {
    const src = path21.join(root, file);
    const blob = `${i}.bin`;
    const existed = fs21.existsSync(src) && fs21.statSync(src).isFile();
    if (existed) fs21.copyFileSync(src, path21.join(dir, "snapshot", blob));
    return { file, existed, blob };
  });
  fs21.writeFileSync(manifestFile(dir), JSON.stringify(entries));
}
function manifest(dir) {
  try {
    return JSON.parse(fs21.readFileSync(manifestFile(dir), "utf8"));
  } catch {
    return [];
  }
}
function beforeText(dir, file) {
  const e = manifest(dir).find((m) => m.file === normal(file));
  if (!e?.existed) return null;
  try {
    return fs21.readFileSync(path21.join(dir, "snapshot", e.blob), "utf8");
  } catch {
    return null;
  }
}
function streamEvents(dir) {
  const files = fs21.readdirSync(dir).filter((f) => /^step-\d+\.jsonl$/.test(f)).sort((a, b) => Number(/\d+/.exec(a)[0]) - Number(/\d+/.exec(b)[0]));
  return files.flatMap(
    (f) => fs21.readFileSync(path21.join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return {};
      }
    })
  );
}
function changedFiles2(dir, root) {
  return manifest(dir).filter((e) => {
    const cur = path21.join(root, e.file);
    const exists = fs21.existsSync(cur);
    if (!e.existed) return exists;
    if (!exists) return true;
    return !fs21.readFileSync(cur).equals(fs21.readFileSync(path21.join(dir, "snapshot", e.blob)));
  }).map((e) => e.file);
}
function revertJob(dir, root) {
  const restored = [];
  for (const e of manifest(dir)) {
    const cur = path21.join(root, e.file);
    const exists = fs21.existsSync(cur);
    if (e.existed) {
      const before = fs21.readFileSync(path21.join(dir, "snapshot", e.blob));
      if (exists && fs21.readFileSync(cur).equals(before)) continue;
      fs21.mkdirSync(path21.dirname(cur), { recursive: true });
      fs21.writeFileSync(cur, before);
      restored.push(e.file);
    } else if (exists) {
      fs21.rmSync(cur, { force: true });
      restored.push(e.file);
    }
  }
  return restored;
}
var CAP = 4e4;
function diffText(dir, root, changed) {
  const byFile = new Map(manifest(dir).map((e) => [e.file, e]));
  const parts = [];
  const full = [];
  for (const file of changed) {
    const e = byFile.get(file);
    const cur = path21.join(root, file);
    if (!fs21.existsSync(cur)) {
      parts.push(`--- a/${file}
+++ /dev/null
(deleted)`);
      continue;
    }
    const text2 = fs21.readFileSync(cur, "utf8");
    full.push(`## FILE ${file} (after the change${text2.length > CAP ? `, first ${CAP} of ${text2.length} characters` : ""})
${text2.slice(0, CAP)}`);
    if (!e?.existed) {
      parts.push(`--- /dev/null
+++ b/${file}
(new file: its whole text is below)`);
      continue;
    }
    const before = path21.join(dir, "snapshot", e.blob);
    let d = "";
    try {
      d = execFileSync2("git", ["-c", "core.autocrlf=false", "diff", "--no-index", "--no-color", "--", before, cur], { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch (err) {
      d = String(err.stdout ?? "");
    }
    const hunks = d.slice(Math.max(0, d.indexOf("\n@@")));
    parts.push(hunks ? `--- a/${file}
+++ b/${file}${hunks.trimEnd()}` : `--- a/${file}
+++ b/${file}
(changed; no line diff could be made: the whole text is below)`);
  }
  return [`## THE DIFF (against the start)
${parts.join("\n") || "(no change)"}`, ...full].join("\n\n");
}
function dirtyPaths(root) {
  try {
    const out = execFileSync2("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8", timeout: 2e4, windowsHide: true, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    const set = /* @__PURE__ */ new Set();
    for (const line of out.split("\n")) {
      if (line.length < 4) continue;
      let p = line.slice(3).trim();
      if (p.includes(" -> ")) p = p.split(" -> ").pop();
      set.add(p.replace(/^"(.*)"$/, "$1"));
    }
    return set;
  } catch {
    return null;
  }
}
var REPORT = "End with your report: Done; Evidence (each command and its pass/fail counts); Not done, unsure, deviations.";
var READBACK2 = [
  "## Step 1: read back, then stop",
  "Before any edit, reply with:",
  "1. The task in your own words.",
  "2. Your plan: each file you will change, each function, what it will do, in order.",
  "3. Run the check now. Say which parts fail and why, and for each failing assertion which line of your plan satisfies it. Pay attention to how the tests' fakes and fixtures behave.",
  "4. Anything in the brief that looks wrong against the code or the tests, and your questions.",
  "Then stop and wait for my go. This step is read-only: the edit tools are not available until the go."
].join("\n");
function checkNamedPaths(check) {
  const out = [];
  for (const m of check.matchAll(/[A-Za-z0-9_./@-]+\.[A-Za-z0-9]+/g)) {
    const rel = m[0].replace(/^\.\//, "");
    if (!rel.includes("/") || rel.startsWith("/") || /^[A-Za-z]:/.test(rel) || rel.split("/").includes("..")) continue;
    out.push(rel);
  }
  return out;
}
function checkNamesPresent(repo, check) {
  return checkNamedPaths(check).filter((rel) => {
    try {
      return fs21.statSync(path21.join(repo, rel)).isFile();
    } catch {
      return false;
    }
  });
}
function checkNamesMissing(repo, copy, check, present) {
  const universe = present ?? checkNamesPresent(repo, check);
  return universe.filter((rel) => !fs21.existsSync(path21.join(copy, rel)));
}
var MIN_READBACK_CHARS = 200;
function writtenReadBack(messages, from) {
  const longest = messages.slice(from).filter((m) => m.role === "assistant").map((m) => m.content.trim()).reduce((a, b) => b.length > a.length ? b : a, "");
  return longest.length >= MIN_READBACK_CHARS ? longest : null;
}
var READBACK_NOW = "Your turns or your time ran out while you were reading. Write the read-back now, in this one message and without any tool call, from what you have seen: the task in your own words; your plan, each file and function in order; what the check showed if you ran it, and which line of your plan answers each failing assertion; what in the brief looks wrong, and your questions. Then stop.";
function firstMessage(spec) {
  return [
    spec.brief.trimEnd(),
    `## Files you may change
${spec.files.map((f) => `- ${normal(f)}`).join("\n")}
Everything else is read-only: the edit tools refuse any other path. If the work needs another file, stop and say so in your report.`,
    `## The check
\`${spec.check}\`
This exact command is run when you finish and decides whether the work is done. Never call a failing test wrong, and never weaken a test to pass it.`,
    spec.workerRules.length ? `## Standing rules for this job
${spec.workerRules.map((r) => `- ${r}`).join("\n")}` : "",
    spec.level <= 2 ? READBACK2 : `## Now
Do the work now; no read-back is needed. Run the check after each change. ${REPORT}`
  ].filter(Boolean).join("\n\n");
}
var flagLines = (flags) => flags.map((f) => `- [${f.rule}] "${f.quote.slice(0, 300)}" -> ${f.ask}`).join("\n");
var askLines = (flags) => flags.map((f, i) => `${i + 1}. ${f.ask}${f.quote ? `
   (about: "${f.quote.slice(0, 300)}")` : ""}`).join("\n");
var tail2 = (s2, n2 = 4e3) => s2.length > n2 ? `[... ${s2.length - n2} earlier characters cut]
${s2.slice(-n2)}` : s2;
var TEST_FLOOR_MS = 6e5;
function failingAssertions(out, max = 8e3) {
  const lines = out.replace(/\r/g, "").replace(/\x1b\[[0-9;]*m/g, "").split("\n");
  const keep = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/^\s*(FAIL\b|×|✗|AssertionError|Error:|TypeError|ReferenceError|- Expected|\+ Received|Expected:|Received:|❯ .*:\d+:\d+)/.test(l) && !/\bexpected\b.*\bto\b/i.test(l)) continue;
    let j = i;
    while (j < lines.length && j - i < 12 && (j === i || lines[j].trim())) keep.push(lines[j++]);
    i = j - 1;
    if (keep.join("\n").length > max) break;
  }
  if (!keep.length) return null;
  const text2 = keep.join("\n");
  return text2.length > max ? `${text2.slice(0, max)}
[... more in the check's output]` : text2;
}
function reworkOutput(out) {
  const a = failingAssertions(out);
  return a ? `These are its failing tests and assertions:

${a}` : `This is its output:

${tail2(out)}`;
}
async function runJob(dir, deps) {
  const spec = readSpec(dir);
  const now = deps.now ?? Date.now;
  const started = now();
  const usd4 = { worker: 0, checker: 0 };
  let steps = 0;
  let reworks = 0;
  let history = null;
  let checkerN = 0;
  setStatus(dir, "running", "start");
  snapshot(dir, spec.root, spec.files);
  const dirtyBefore = dirtyPaths(spec.root);
  const step = async (prompt, mode, phase, turns = 60) => {
    setStatus(dir, "running", phase);
    steps++;
    fs21.writeFileSync(path21.join(dir, `step-${steps}-to.md`), prompt);
    const left = spec.wallMinutes ? spec.wallMinutes - (now() - started) / 6e4 : Infinity;
    if (left <= 0) {
      const r3 = { subtype: "error_wall", answer: "", turns: 0, usd: 0, ms: 0, messages: history ?? [], error: `stopped at the job's wall cap (${spec.wallMinutes} min)` };
      fs21.writeFileSync(path21.join(dir, `step-${steps}-from.md`), `(no step: ${r3.error})`);
      return r3;
    }
    const r2 = await deps.agent({
      dir: spec.root,
      prompt,
      model: spec.model,
      key: deps.key,
      mode,
      allowed: spec.files,
      turns,
      minutes: Math.max(1, Math.min(spec.stepMinutes, left)),
      streamFile: path21.join(dir, `step-${steps}.jsonl`),
      deny: spec.deny,
      // a shadow works in a throwaway copy: the lab's bash (agent.ts refuse); every job's test runs get 600 s (M4)
      ...spec.shadow ? { copy: true } : {},
      testFloorMs: TEST_FLOOR_MS,
      history,
      maxUsd: Math.max(0, spec.maxUsd - usd4.worker - usd4.checker),
      ...spec.endpoint ? { endpoint: spec.endpoint } : {}
    });
    usd4.worker += r2.usd;
    history = r2.messages;
    fs21.writeFileSync(path21.join(dir, `step-${steps}-from.md`), r2.answer || `(no final text; ${r2.subtype}${r2.error ? `: ${r2.error}` : ""})`);
    return r2;
  };
  const broke = (r2) => r2.subtype === "error_api" || r2.subtype === "error_wall" || r2.subtype === "error_budget";
  const check = async (phase, input) => {
    setStatus(dir, "running", `checker on the ${phase}`);
    const c = await deps.checker({ model: spec.checkerModel, key: deps.key, phase, rules: spec.checkerRules, brief: spec.brief, input, ...spec.endpoint ? { endpoint: spec.endpoint } : {} });
    usd4.checker += c.usd;
    fs21.writeFileSync(path21.join(dir, `checker-${phase}-${++checkerN}.json`), JSON.stringify({ ...c, model: spec.checkerModel, at: (/* @__PURE__ */ new Date()).toISOString() }, null, 2));
    return c;
  };
  let lastOut = "";
  const grade = async () => {
    setStatus(dir, "running", "the check");
    const r2 = await deps.runCheck(spec.root, spec.check);
    lastOut = r2.out;
    return { command: spec.check, passed: r2.exit === 0, exit: r2.exit, tail: tail2(r2.out) };
  };
  let rewound;
  const finish2 = async (verdict, why, report3, checkRow, flags2) => {
    const changed = changedFiles2(dir, spec.root);
    let signals = [];
    try {
      signals = jobSignals({ listed: spec.files, changed, before: (f) => beforeText(dir, f), after: (f) => {
        try {
          return fs21.readFileSync(path21.join(spec.root, f), "utf8");
        } catch {
          return null;
        }
      }, events: streamEvents(dir) });
    } catch {
    }
    let probe;
    if (deps.probe && history && verdict !== "failed") {
      const questions = probeQuestions(signals);
      const before = usd4.worker;
      try {
        const p = await step(probePrompt(questions), "read", "the closing questions");
        probe = { questions, answer: p.answer || `(no answer; ${p.subtype})`, usd: Math.round((usd4.worker - before) * 1e4) / 1e4 };
      } catch (e) {
        probe = { questions, answer: `(the probe step broke: ${e.message.slice(0, 200)})`, usd: Math.round((usd4.worker - before) * 1e4) / 1e4 };
      }
    }
    const allowed = new Set(spec.files.map(normal));
    const dirtyAfter = dirtyPaths(spec.root);
    const alsoChanged = dirtyBefore && dirtyAfter ? [...dirtyAfter].filter((p) => !dirtyBefore.has(p) && !allowed.has(normal(p))).sort() : [];
    let rec = { tested: [], untested: [] };
    try {
      rec = deps.receipt(spec.root, changed);
    } catch {
      rec = { tested: [], untested: changed };
    }
    let lines = null;
    let linesNote;
    if (verdict === "pass" && deps.coverage && changed.length) {
      setStatus(dir, "running", "the per-line receipt");
      try {
        const c = await deps.coverage(spec.root, spec.check, changed, path21.join(dir, "coverage"));
        if ("report" in c) lines = lineRows(spec.root, changed, c.report, (f) => beforeText(dir, f));
        else linesNote = c.none;
      } catch (e) {
        linesNote = `the coverage run broke: ${e.message.slice(0, 200)}`;
      }
    }
    const unrun = (lines ?? []).some((l) => l.unexecuted);
    const empty = changed.filter((f) => {
      try {
        return fs21.statSync(path21.join(spec.root, f)).size === 0;
      } catch {
        return false;
      }
    });
    if (empty.length && (verdict === "pass" || verdict === "pass (tested part)")) {
      verdict = "lead needed";
      why = `the worker left ${empty.length} empty file(s): ${empty.join(", ")}`;
    } else if (empty.length && why) why = `${why}; ${empty.length} empty file(s) left: ${empty.join(", ")}`;
    const v = verdict === "pass" && (rec.untested.length || unrun) ? "pass (tested part)" : verdict;
    const result = {
      id: spec.id,
      verdict: v,
      why,
      model: spec.model,
      level: spec.level,
      report: report3,
      check: checkRow,
      flags: flags2,
      changed,
      alsoChanged,
      receipt: rec,
      ...verdict === "pass" && deps.coverage ? { lines, ...linesNote ? { linesNote } : {} } : {},
      signals,
      ...probe ? { probe } : {},
      ...rewound ? { rewound } : {},
      usd: { worker: Math.round(usd4.worker * 1e4) / 1e4, checker: Math.round(usd4.checker * 1e4) / 1e4 },
      minutes: Math.round((now() - started) / 6e3) / 10,
      reworks,
      steps
    };
    fs21.writeFileSync(path21.join(dir, "result.json"), JSON.stringify(result, null, 2));
    setStatus(dir, "done", v);
    return result;
  };
  const notRun = { command: spec.check, passed: false, exit: null, tail: "(the check was not run)" };
  if (spec.shadow) {
    const missing = checkNamesMissing(spec.shadow.repo, spec.root, spec.check, spec.shadow.present);
    if (missing.length) return finish2("failed", `${NOT_MEASURABLE}the check cannot run in the copy: it names ${missing.join(", ")}, which the copy lacks (untracked and not copied in)`, "", notRun, []);
    setStatus(dir, "running", "the check, at the start");
    const pre = await deps.runCheck(spec.root, spec.check);
    try {
      fs21.writeFileSync(path21.join(dir, "start-check.txt"), `$ ${spec.check}
[exit ${pre.exit}]
${pre.out}`);
    } catch {
    }
    const named = [...checkNamedPaths(spec.check), ...spec.shadow.tests ?? []];
    let blocked = startBlocker(pre.out, pre.exit, spec.files, named);
    let last = pre;
    const head = spec.shadow.headStart ?? [];
    if (pre.exit === 0 && head.length) {
      setStatus(dir, "running", "the check, with the head start put back");
      const back = putBackAsCommitted(spec.shadow.repo, spec.shadow.head, spec.root, head);
      fs21.rmSync(path21.join(dir, "snapshot"), { recursive: true, force: true });
      snapshot(dir, spec.root, spec.files);
      last = await deps.runCheck(spec.root, spec.check);
      try {
        fs21.appendFileSync(path21.join(dir, "start-check.txt"), `

# with ${back.join(", ")} put back as committed
$ ${spec.check}
[exit ${last.exit}]
${last.out}`);
      } catch {
      }
      blocked = startBlocker(last.out, last.exit, spec.files, named);
      if (!blocked) rewound = back;
      else if (last.exit === 0) blocked = `${blocked}; also with ${back.join(", ")} put back as committed`;
    }
    if (blocked) return finish2("failed", `${NOT_MEASURABLE}${blocked}`, "", { command: spec.check, passed: false, exit: last.exit, tail: tail2(last.out) }, []);
  }
  let r;
  if (spec.level <= 2) {
    let rb = await step(firstMessage(spec), "read", "read-back");
    const ranOut = (r2) => r2.subtype === "error_max_turns" || r2.subtype === "error_wall";
    if (!ranOut(rb) && broke(rb)) return finish2("failed", `the worker's read-back step broke: ${rb.error ?? rb.subtype}`, rb.answer, notRun, []);
    if (ranOut(rb)) {
      const from = history?.length ?? 0;
      rb = await step(READBACK_NOW, "read", "read-back, written from what was read", 2);
      if (!ranOut(rb) && broke(rb)) return finish2("failed", `the worker's read-back step broke: ${rb.error ?? rb.subtype}`, rb.answer, notRun, []);
      const written = ranOut(rb) ? writtenReadBack(rb.messages, from) : null;
      if (written) rb = { ...rb, answer: written, subtype: "success" };
      if (ranOut(rb) || !rb.answer.trim()) return finish2("failed", "no read-back: the worker ran out of turns or time reading and did not write its plan when asked", rb.answer, notRun, []);
    }
    const c = await check("readback", `## THE WORKER'S READ-BACK
${rb.answer}`);
    const open = c.error ? [] : c.flags;
    r = await step(`${open.length ? `Open points from the review of your plan; settle each as you work and say how in your report:
${flagLines(open)}

` : ""}Go. Do the work now; no new read-back is needed. Stay in the files allowed and run the check after each change. ${REPORT}`, "write", "the work");
  } else r = await step(firstMessage(spec), "write", "the work");
  if (broke(r)) return finish2("failed", `the worker's step broke: ${r.error ?? r.subtype}`, r.answer, notRun, []);
  let report2 = r.answer;
  let g = await grade();
  if (!g.passed) {
    reworks++;
    r = await step(`The check does not pass. ${reworkOutput(lastOut)}

Fix it once, in the files allowed, and run the check again. Do not change a test to make it pass. ${REPORT}`, "write", "rework after the check");
    if (broke(r)) return finish2("failed", `the worker's rework step broke: ${r.error ?? r.subtype}`, r.answer || report2, g, []);
    report2 = r.answer || report2;
    g = await grade();
  }
  if (!g.passed) return finish2("lead needed", "the check still fails after one rework", report2, g, []);
  if (!changedFiles2(dir, spec.root).length) return finish2("lead needed", "the check passes but the worker changed none of the files: the brief or the check may not describe the work", report2, g, []);
  let flags = [];
  if (spec.level <= 3) {
    const input = () => `${diffText(dir, spec.root, changedFiles2(dir, spec.root))}

## THE WORKER'S REPORT
${report2}`;
    let c = await check("diff", input());
    if (c.error) return finish2("lead needed", `nothing reviewed the diff: ${c.error}`, report2, g, []);
    flags = c.flags;
    if (blockers(flags).length) {
      reworks++;
      r = await step(`Questions from the review of your change. Answer each one. Change code only where your answer shows a defect, stay in the files allowed, run the check again, and end with your report.

${askLines(blockers(flags))}`, "write", "rework after the review");
      if (broke(r)) return finish2("failed", `the worker's rework step broke: ${r.error ?? r.subtype}`, r.answer || report2, g, flags);
      report2 = r.answer || report2;
      g = await grade();
      if (!g.passed) return finish2("lead needed", "the check fails after the rework the review asked for", report2, g, flags);
      c = await check("diff", input());
      if (c.error) return finish2("lead needed", `nothing reviewed the reworked diff: ${c.error}`, report2, g, flags);
      flags = c.flags;
      if (blockers(flags).length) return finish2("lead needed", "the checker's blockers stand after one rework", report2, g, flags);
    }
  }
  return finish2("pass", null, report2, g, flags);
}

// ../host/src/delegation/worker/shadow.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import fs23 from "node:fs";
import os6 from "node:os";
import path23 from "node:path";

// ../host/src/delegation/worker/lead-cost.ts
var ASK = "ask_delegation";
var RUN = "run_worker";
var RESULT = "worker_result";
var is = (name, tool) => name === tool || name.endsWith(`__${tool}`);
function parseLine(line, sidechain = false) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return void 0;
  }
  if (typeof obj !== "object" || obj === null) return { type: "other" };
  const rec = obj;
  if (rec.isSidechain === true && !sidechain) return { type: "other" };
  const type = typeof rec.type === "string" ? rec.type : void 0;
  const message = rec.message;
  if (type === "assistant" && typeof message === "object" && message !== null) {
    const m = message;
    if (typeof m.id !== "string" || typeof m.model !== "string") return { type: "other" };
    const usage = typeof m.usage === "object" && m.usage !== null ? m.usage : null;
    if (!usage) return { type: "other" };
    const content = Array.isArray(m.content) ? m.content : [];
    const tool_calls = [];
    for (const block of content) {
      if (typeof block === "object" && block !== null && block.type === "tool_use") {
        const b = block;
        if (typeof b.id === "string" && typeof b.name === "string") tool_calls.push({ id: b.id, name: b.name, input: b.input });
      }
    }
    const ts = typeof m.timestamp === "string" ? m.timestamp : typeof rec.timestamp === "string" ? rec.timestamp : void 0;
    const msg = { id: m.id, model: m.model, usage, tool_calls, timestamp: ts };
    return { type: "assistant", msg, timestamp: ts };
  }
  if (type === "user" && typeof message === "object" && message !== null) {
    const m = message;
    const content = m.content;
    const ts = typeof m.timestamp === "string" ? m.timestamp : typeof rec.timestamp === "string" ? rec.timestamp : void 0;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (first && typeof first === "object" && first.type === "tool_result") {
        const toolUseId = typeof first.tool_use_id === "string" ? first.tool_use_id : void 0;
        return { type: "tool-result", toolUseId, content: first.content, timestamp: ts };
      }
    }
    return { type: "prompt", timestamp: ts };
  }
  return { type: "other" };
}
function toolCallsOf(msg) {
  return msg.tool_calls ?? [];
}
function asObject(content) {
  if (content === null || content === void 0) return void 0;
  if (Array.isArray(content)) {
    return asObject(content.map((b) => b && typeof b === "object" && typeof b.text === "string" ? b.text : "").join(""));
  }
  if (typeof content === "object") return content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return typeof parsed === "object" && parsed !== null ? parsed : void 0;
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function jobWindow(parsed, job) {
  const results = /* @__PURE__ */ new Map();
  for (const p of parsed) if (p.type === "tool-result" && p.toolUseId) results.set(p.toolUseId, p.content);
  const calls = (i) => parsed[i]?.type === "assistant" ? toolCallsOf(parsed[i].msg) : [];
  const startsAJob = (i) => calls(i).some((tc) => is(tc.name, ASK) || is(tc.name, RUN));
  const forThisJob = (tc) => is(tc.name, RESULT) && typeof tc.input === "object" && tc.input !== null && tc.input.job === job;
  let runIdx = -1;
  for (let i = 0; i < parsed.length && runIdx === -1; i++) {
    if (calls(i).some((tc) => startedJob(tc.name, results.get(tc.id)) === job)) runIdx = i;
  }
  if (runIdx === -1) return void 0;
  let fromIdx = runIdx;
  for (let i = runIdx - 1; i >= 0; i--) {
    const p = parsed[i];
    if (p.type === "prompt" || calls(i).some((tc) => is(tc.name, RUN))) break;
    if (calls(i).some((tc) => is(tc.name, ASK))) {
      fromIdx = i;
      break;
    }
  }
  let last = runIdx;
  for (let i = runIdx + 1; i < parsed.length; i++) if (calls(i).some(forThisJob)) last = i;
  let toIdx = last;
  for (let i = last + 1; i < parsed.length; i++) {
    const p = parsed[i];
    if (p.type === "prompt" || startsAJob(i)) break;
    if (p.type === "assistant") toIdx = i;
  }
  return { fromIdx, toIdx };
}
function summarize(parsed, startIdx, toIdx, priceFor) {
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  let usd4 = 0;
  let from, to;
  const seen = /* @__PURE__ */ new Set();
  const perModel = /* @__PURE__ */ new Map();
  let order = 0;
  let messages = 0;
  for (let i = startIdx; i <= toIdx; i++) {
    const p = parsed[i];
    if (!p || p.type !== "assistant" || !p.msg) continue;
    const id = p.msg.id;
    if (seen.has(id)) continue;
    seen.add(id);
    messages++;
    const u = p.msg.usage;
    const in_tok = u.input_tokens ?? 0;
    const out_tok = u.output_tokens ?? 0;
    const read_tok = u.cache_read_input_tokens ?? 0;
    let write1h = 0, write5m = 0;
    if (u.cache_creation) {
      write1h = u.cache_creation.ephemeral_1h_input_tokens ?? 0;
      write5m = u.cache_creation.ephemeral_5m_input_tokens ?? 0;
    } else if (u.cache_creation_input_tokens) {
      write5m = u.cache_creation_input_tokens;
    }
    input += in_tok;
    output += out_tok;
    cacheRead += read_tok;
    cacheWrite += write1h + write5m;
    const price = priceFor(p.msg.model);
    const readPrice = price.cacheRead ?? price.input * CACHE_READ;
    usd4 += (in_tok * price.input + out_tok * price.output + read_tok * readPrice + write5m * (price.cacheWrite5m ?? price.input * CACHE_WRITE_5M) + write1h * (price.cacheWrite1h ?? price.input * CACHE_WRITE_1H)) / 1e6;
    if (p.msg.timestamp) {
      from ??= p.msg.timestamp;
      to = p.msg.timestamp;
    }
    let entry = perModel.get(p.msg.model);
    if (!entry) {
      entry = { output: 0, input: 0, order };
      perModel.set(p.msg.model, entry);
      order++;
    }
    entry.output += out_tok;
    entry.input += in_tok;
  }
  let model = "";
  if (perModel.size > 0) {
    let bestOut = -1;
    let bestIn = -1;
    let bestOrder = Number.POSITIVE_INFINITY;
    for (const [m, v] of perModel) {
      if (v.output > bestOut || v.output === bestOut && (v.input > bestIn || v.input === bestIn && v.order < bestOrder)) {
        bestOut = v.output;
        bestIn = v.input;
        bestOrder = v.order;
        model = m;
      }
    }
  }
  let minutes;
  if (from && to) {
    const ms = new Date(to).getTime() - new Date(from).getTime();
    if (!Number.isNaN(ms)) minutes = ms / 6e4;
  }
  return { job: "", model, messages, input, output, cacheRead, cacheWrite, usd: usd4, from, to, minutes };
}
function leadCost(lines, job, priceFor) {
  const parsed = parseAll(lines);
  const window = jobWindow(parsed, job);
  if (!window) return void 0;
  const c = summarize(parsed, window.fromIdx, window.toIdx, priceFor);
  c.job = job;
  return c;
}
function parseAll(lines, sidechain = false) {
  const parsed = [];
  for (const line of lines) {
    const p = parseLine(line, sidechain);
    if (p) parsed.push(p);
  }
  return parsed;
}
function leadWindowCost(lines, fromMs, toMs, priceFor, others = []) {
  const inWindow = parseAll(lines).filter((p) => {
    if (p.type !== "assistant" || !p.msg?.timestamp) return false;
    const t = Date.parse(p.msg.timestamp);
    return !Number.isNaN(t) && t >= fromMs && t <= toMs;
  });
  const whole = summarize(inWindow, 0, inWindow.length - 1, priceFor);
  if (!others.length) return { ...whole, shared: 0 };
  const groups = /* @__PURE__ */ new Map();
  let shared = 0;
  for (const p of inWindow) {
    const t = Date.parse(p.msg.timestamp);
    const k3 = others.filter((w) => t >= w.from && t <= w.to).length;
    if (k3) shared++;
    groups.set(k3, [...groups.get(k3) ?? [], p]);
  }
  let usd4 = 0;
  for (const [k3, g] of groups) usd4 += summarize(g, 0, g.length - 1, priceFor).usd / (k3 + 1);
  return { ...whole, usd: usd4, shared };
}
function contextAtCall(lines, job) {
  const parsed = parseAll(lines);
  const results = /* @__PURE__ */ new Map();
  for (const p of parsed) if (p.type === "tool-result" && p.toolUseId) results.set(p.toolUseId, p.content);
  for (const p of parsed) {
    if (p.type !== "assistant" || !p.msg) continue;
    if (!toolCallsOf(p.msg).some((tc) => startedJob(tc.name, results.get(tc.id)) === job)) continue;
    const u = p.msg.usage;
    const write = u.cache_creation ? (u.cache_creation.ephemeral_1h_input_tokens ?? 0) + (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : u.cache_creation_input_tokens ?? 0;
    return { tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + write, model: p.msg.model, ...p.msg.timestamp ? { at: p.msg.timestamp } : {} };
  }
  return void 0;
}
function startedJob(name, result) {
  const o = asObject(result);
  if (!o) return void 0;
  if (is(name, RUN) && typeof o.job === "string") return o.job;
  if (is(name, ASK)) {
    const h = o.handover;
    if (typeof h?.job === "string") return h.job;
    if (typeof h?.started?.job === "string") return h.started.job;
  }
  return void 0;
}
function holdsJob(lines, job) {
  const parsed = parseAll(lines);
  const calls = /* @__PURE__ */ new Map();
  for (const p of parsed) if (p.type === "assistant" && p.msg) for (const tc of toolCallsOf(p.msg)) calls.set(tc.id, tc.name);
  return parsed.some((p) => p.type === "tool-result" && !!p.toolUseId && calls.has(p.toolUseId) && startedJob(calls.get(p.toolUseId), p.content) === job);
}
function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => b && typeof b === "object" && typeof b.text === "string" ? b.text : "").join("\n");
  return "";
}
function commitShasAfter(lines, fromMs) {
  const out = [];
  const parsed = parseAll(lines);
  const commands = /* @__PURE__ */ new Map();
  for (const p of parsed) if (p.type === "assistant" && p.msg) for (const tc of toolCallsOf(p.msg)) commands.set(tc.id, JSON.stringify(tc.input ?? ""));
  const add = (sha, via) => {
    const had = out.find((o) => o.sha === sha);
    if (!had) out.push({ sha, via });
    else if (via === "commit") had.via = "commit";
  };
  for (const p of parsed) {
    if (p.type !== "tool-result" || !p.timestamp || Date.parse(p.timestamp) < fromMs) continue;
    const text2 = textOf(p.content);
    const command = p.toolUseId ? commands.get(p.toolUseId) ?? "" : "";
    const commits = /\bgit\s+(?:-[Cc]\s+\S+\s+)*commit\b/.test(command);
    if (commits) for (const m of text2.matchAll(/^\[[^\]\s]+(?: \(root-commit\))? ([0-9a-f]{7,40})\] /gm)) add(m[1], "commit");
    if (commits || /\bgit\s+(?:-[Cc]\s+\S+\s+)*log\b[^|;&"]*(\s-1\b|\s-n\s?1\b|--max-count=1\b)/.test(command)) {
      const first = /^([0-9a-f]{7,40}) \S/m.exec(text2);
      if (first) add(first[1], "log");
    }
  }
  return out;
}
function ownInputs(lines) {
  const parts = [];
  for (const p of parseAll(lines)) if (p.type === "assistant" && p.msg) for (const tc of toolCallsOf(p.msg)) parts.push(typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input ?? ""));
  return parts.join("\n");
}
function namesAFile(input, files) {
  if (!files.length || input === void 0) return false;
  const s2 = JSON.stringify(input).replace(/\\\\/g, "/");
  return files.some((f) => s2.includes(f.replace(/\\/g, "/")));
}
function attributedCost(lines, fromMs, toMs, files, priceFor) {
  const hits = parseAll(lines).filter((p) => {
    if (p.type !== "assistant" || !p.msg?.timestamp) return false;
    const t = Date.parse(p.msg.timestamp);
    return t >= fromMs && t <= toMs && toolCallsOf(p.msg).some((tc) => namesAFile(tc.input, files));
  });
  return summarize(hits, 0, hits.length - 1, priceFor);
}
function helperSpend(lines, fromMs, toMs, files, priceFor) {
  const parsed = parseAll(lines, true);
  const first = parsed.find((p) => p.type === "prompt" || p.type === "assistant");
  const at = first?.timestamp ? Date.parse(first.timestamp) : NaN;
  if (Number.isNaN(at) || at < fromMs || at > toMs) return 0;
  let prompt = "";
  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      if (o.type === "user") {
        prompt = typeof o.message?.content === "string" ? o.message.content : textOf(o.message?.content);
        break;
      }
    } catch {
    }
  }
  if (!namesAFile(prompt, files)) return 0;
  return summarize(parsed, 0, parsed.length - 1, priceFor).usd;
}

// ../host/src/delegation/worker/lead-record.ts
import fs22 from "node:fs";
import path22 from "node:path";
var GIVE_UP_MS = 24 * 60 * 60 * 1e3;
function transcriptByShortId(projectsRoot, short) {
  if (!/^[A-Za-z0-9._-]{8}$/.test(short)) return void 0;
  let dirs;
  try {
    dirs = fs22.readdirSync(projectsRoot);
  } catch {
    return void 0;
  }
  for (const d of dirs) {
    try {
      const f = fs22.readdirSync(path22.join(projectsRoot, d)).find((n2) => n2.startsWith(short) && n2.endsWith(".jsonl"));
      if (f) return path22.join(projectsRoot, d, f);
    } catch {
    }
  }
  return void 0;
}
function transcriptForJob(projectsRoot, job, session, sinceMs, holds) {
  const known = FOUND.get(job);
  if (known && fs22.existsSync(known)) return known;
  const tried = /* @__PURE__ */ new Set();
  const check = (file) => {
    if (tried.has(file)) return false;
    tried.add(file);
    try {
      const st = fs22.statSync(file);
      if (st.mtimeMs < sinceMs || st.birthtimeMs > 0 && st.birthtimeMs > sinceMs + BORN_AFTER_MS) return false;
      const text2 = fs22.readFileSync(file, "utf8");
      return text2.includes(job) && holds(text2.split("\n"), job);
    } catch {
      return false;
    }
  };
  const found = (file) => (FOUND.set(job, file), file);
  const own = session ? transcriptByShortId(projectsRoot, session) : void 0;
  if (own && check(own)) return found(own);
  let dirs;
  try {
    dirs = fs22.readdirSync(projectsRoot);
  } catch {
    return void 0;
  }
  if (own) dirs = [path22.basename(path22.dirname(own)), ...dirs.filter((d) => d !== path22.basename(path22.dirname(own)))];
  for (const d of dirs) {
    let files;
    try {
      files = fs22.readdirSync(path22.join(projectsRoot, d)).filter((n2) => n2.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) if (check(path22.join(projectsRoot, d, f))) return found(path22.join(projectsRoot, d, f));
  }
  return void 0;
}
var FOUND = /* @__PURE__ */ new Map();
var BORN_AFTER_MS = 10 * 60 * 1e3;
function helperTranscripts(transcript) {
  const dir = path22.join(transcript.replace(/\.jsonl$/, ""), "subagents");
  try {
    return fs22.readdirSync(dir).filter((n2) => n2.endsWith(".jsonl")).map((n2) => path22.join(dir, n2));
  } catch {
    return [];
  }
}
function leadUsdFor(rec, lines, priceFor, now) {
  const old = now - Date.parse(rec.at) >= GIVE_UP_MS;
  if (!rec.job || !lines) return old ? null : void 0;
  const c = leadCost(lines, rec.job, priceFor);
  if (!c || !c.to) return old ? null : void 0;
  if (now - Date.parse(c.to) < QUIET_MS2) return void 0;
  return Math.round(c.usd * 1e4) / 1e4;
}
function fillLeadCosts(home3, projectsRoot, priceFor, now) {
  const file = path22.join(home3, HANDOVERS_FILE);
  let filled = 0;
  try {
    const lines = fs22.readFileSync(file, "utf8").split("\n");
    const transcripts = /* @__PURE__ */ new Map();
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('"harness":"gateway"')) continue;
      let rec;
      try {
        rec = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (rec.harness !== "gateway" || !rec.done || !rec.job || rec.leadUsd !== void 0) continue;
      const short = rec.session ?? "";
      if (!transcripts.has(short)) {
        const t = transcriptByShortId(projectsRoot, short);
        let text2;
        try {
          text2 = t ? fs22.readFileSync(t, "utf8").split("\n") : void 0;
        } catch {
        }
        transcripts.set(short, text2);
      }
      const usd4 = leadUsdFor(rec, transcripts.get(short), priceFor, now);
      if (usd4 === void 0) continue;
      lines[i] = JSON.stringify({ ...rec, leadUsd: usd4 });
      filled++;
    }
    if (filled) {
      const tmp = `${file}.${process.pid}.tmp`;
      fs22.writeFileSync(tmp, lines.join("\n"));
      fs22.renameSync(tmp, file);
    }
  } catch {
  }
  return { filled };
}

// ../host/src/delegation/worker/shadow.ts
var SHADOW_LEDGER = "shadow-ledger.jsonl";
var SHADOW_REPORT = "shadow-report.md";
var GIVE_UP_MS2 = 3 * 24 * 60 * 60 * 1e3;
var PRIMARY_WAIT_MS = 12 * 60 * 60 * 1e3;
var TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;
var CODE = /\.[cm]?[jt]sx?$/;
function shadowRoot() {
  return process.platform === "win32" ? "C:/nudge-review/shadow" : path23.join(os6.tmpdir(), "nudge-review", "shadow");
}
var copyFile = (dir) => path23.join(dir, "copy.json");
var PATH_TOKEN = /[A-Za-z0-9_./@-]+\.[A-Za-z0-9]+/g;
var NEVER_COPIED = /node_modules|(^|\/)\.env|secret|credential|\.pem$|\.key$/i;
var MAX_NAMED_BYTES = 2 * 1024 * 1024;
function untrackedNamed(repo, files, check) {
  const names = new Set(files);
  for (const m of check.matchAll(PATH_TOKEN)) names.add(m[0]);
  const out = [];
  for (const n2 of names) {
    const rel = n2.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!rel.includes("/") && !rel.includes(".")) continue;
    if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel) || rel.split("/").includes("..") || NEVER_COPIED.test(rel)) continue;
    const abs = path23.join(repo, rel);
    let st;
    try {
      st = fs23.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > MAX_NAMED_BYTES) continue;
    const r = spawnSync3("git", ["ls-files", "--error-unmatch", "--", rel], { cwd: repo, encoding: "utf8", timeout: 5e3, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
    if (r.status === 0) continue;
    out.push({ from: abs, to: rel });
  }
  return out;
}
var UNTRACKED_CODE = /\.[cm]?[jt]sx?$/;
var NOT_SOURCE = /(^|\/)\.|(^|\/)(scratch|scratchpad|tmp|out|dist|build|coverage)\//;
var MAX_UNTRACKED_CODE = 400;
function untrackedCode(repo) {
  const r = spawnSync3("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repo, encoding: "utf8", timeout: 3e4, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (r.status !== 0) return [];
  const out = [];
  for (const rel of r.stdout.split("\0")) {
    if (!rel || !rel.includes("/") || !UNTRACKED_CODE.test(rel) || NOT_SOURCE.test(rel) || NEVER_COPIED.test(rel)) continue;
    const abs = path23.join(repo, rel);
    try {
      const st = fs23.statSync(abs);
      if (!st.isFile() || st.size > MAX_NAMED_BYTES) continue;
    } catch {
      continue;
    }
    out.push({ from: abs, to: rel });
    if (out.length > MAX_UNTRACKED_CODE) return [];
  }
  return out;
}
var SHADOW_MAX_LINES = 250;
var SHADOW_MAX_LINES_TESTS_FIRST = 400;
var SHADOW_MAX_FILES = 6;
function shadowTooBig(lines, files, testsFirst = false) {
  const max = testsFirst ? SHADOW_MAX_LINES_TESTS_FIRST : SHADOW_MAX_LINES;
  if (lines <= max && files <= SHADOW_MAX_FILES) return null;
  return `Not shadowed: ${lines} lines over ${files} files is past one piece (at most ${max} lines and ${SHADOW_MAX_FILES} code files${testsFirst ? " with the test written first" : ""}). The worker is measured on one piece at a time: split the work and give each piece its own ask_delegation with its own failing test, files and check, or do it yourself with no shadow.`;
}
var norm2 = (f) => f.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
var SEGMENT = /(\s*&&\s*|\s*\|\|\s*|\s*;\s*)/;
var TYPECHECK = /(^|[\s/\\])(vue-)?tsc(\.cmd)?(\s|$)|check-tsc|\btype-?check\b/;
function withoutTypecheck(check) {
  const parts = check.split(SEGMENT);
  const kept = [];
  const dropped = [];
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i].trim();
    if (!seg) continue;
    if (TYPECHECK.test(seg)) {
      dropped.push(seg);
      continue;
    }
    if (kept.length) kept.push((parts[i - 1] ?? " && ").trim() === ";" ? "; " : ` ${(parts[i - 1] ?? "&&").trim()} `);
    kept.push(seg);
  }
  return dropped.length ? { check: kept.join(""), dropped } : { check, dropped };
}
var VALUE_FLAGS = /* @__PURE__ */ new Set(["--dir", "--root", "-r", "-c", "--config", "--project", "--reporter", "--outputFile", "-t", "--testNamePattern", "--environment", "--pool", "--shard", "--mode", "--workspace"]);
function narrowCheck(repo, check, files) {
  const tests = files.map(norm2).filter((f) => TEST.test(f));
  if (!tests.length) return check;
  let changed = false;
  const parts = check.split(SEGMENT).map((seg, i) => {
    if (i % 2) return seg;
    const tokens = seg.split(/\s+/);
    const at = tokens.findIndex((t) => /(^|[\\/])vitest(\.mjs)?$/.test(t));
    if (at < 0) return seg;
    const out = tokens.slice(0, at + 1);
    let value = false;
    for (const t of tokens.slice(at + 1)) {
      if (value || !t || t === "run" || t.startsWith("-")) {
        out.push(t);
        value = !value && VALUE_FLAGS.has(t);
        continue;
      }
      let kind = "filter";
      try {
        kind = fs23.statSync(path23.join(repo, t)).isDirectory() ? "dir" : "file";
      } catch {
      }
      const under = kind === "dir" ? tests.filter((f) => f.startsWith(`${norm2(t)}/`)) : kind === "filter" ? tests.filter((f) => f.includes(norm2(t))) : [];
      if (under.length && !(under.length === 1 && under[0] === norm2(t))) {
        out.push(...under);
        changed = true;
      } else out.push(t);
    }
    return out.join(" ");
  });
  return changed ? parts.join("") : check;
}
function trackedFiles(repo) {
  const r = spawnSync3("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8", timeout: 3e4, maxBuffer: 256 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  return r.status === 0 ? new Set(r.stdout.split("\0").filter(Boolean)) : null;
}
var IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+|\bvi\.mock\s*\(\s*)["'`](\.{1,2}\/[^"'`]+)["'`]/gm;
var RESOLVE_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js"];
function untrackedReachable(repo, roots, tracked, maxVisit = 3e3) {
  const seen = /* @__PURE__ */ new Set();
  const found = [];
  const queue = roots.map(norm2).filter(Boolean);
  const isFile2 = (rel) => {
    try {
      return fs23.statSync(path23.join(repo, rel)).isFile();
    } catch {
      return false;
    }
  };
  while (queue.length && seen.size < maxVisit) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!tracked.has(rel) && isFile2(rel) && !NEVER_COPIED.test(rel)) found.push(rel);
    if (!/\.[cm]?[jt]sx?$/.test(rel)) continue;
    let text2;
    try {
      const st = fs23.statSync(path23.join(repo, rel));
      if (st.size > MAX_NAMED_BYTES) continue;
      text2 = fs23.readFileSync(path23.join(repo, rel), "utf8");
    } catch {
      continue;
    }
    for (const m of text2.matchAll(IMPORT)) {
      const spec = m[1];
      const base = path23.posix.normalize(path23.posix.join(path23.posix.dirname(rel), spec));
      if (base.startsWith("..")) continue;
      const bare = base.replace(/\.[cm]?jsx?$/, "");
      const hit = [base, ...RESOLVE_EXT.map((e) => `${bare}${e}`)].find((c) => !seen.has(c) && (tracked.has(c) || isFile2(c)));
      if (hit) queue.push(hit);
    }
  }
  return [...new Set(found)];
}
function runnerConfigs(tracked) {
  return [...tracked].filter((f) => /^(vitest|vite)\.(config|workspace)\.[cm]?[jt]s$/.test(f));
}
function askTests(repo, check) {
  return [...new Set(checkNamedPaths(check).filter((f) => TEST.test(f)))].filter((f) => {
    try {
      return fs23.statSync(path23.join(repo, f)).isFile();
    } catch {
      return false;
    }
  });
}
var NO_TEST_FIRST = "Not shadowed: the check names no test file that exists now. Shadow measures the worker against a test written before the work, as delegation will run it. Write the failing test first (it must fail now on an assertion and pass when the work is done), name it in files and in check, and ask again; or do the work yourself with no shadow.";
function takeAtAsk(repo, dir, files, check) {
  const named = checkNamedPaths(check);
  const tests = askTests(repo, check);
  if (!tests.length) {
    return { error: NO_TEST_FIRST };
  }
  const workerFiles = files.map(norm2).filter((f) => !tests.includes(f));
  if (!workerFiles.length) return { error: "Not shadowed: the files name only the test. Name the code files the worker may create or change as well; the test itself stays the lead's." };
  const { check: noTsc, dropped } = withoutTypecheck(check);
  if (!noTsc.trim()) return { error: "Not shadowed: the check is only a typecheck. Name the failing test file in the check (the harness compares typecheck errors itself)." };
  const tracked = trackedFiles(repo) ?? /* @__PURE__ */ new Set();
  const copyIn = (rel, into) => {
    const to = path23.join(dir, into, rel);
    fs23.mkdirSync(path23.dirname(to), { recursive: true });
    fs23.copyFileSync(path23.join(repo, rel), to);
  };
  for (const t of tests) copyIn(t, "asked");
  const roots = [...workerFiles, ...tests, ...named, ...runnerConfigs(tracked)];
  const context = [.../* @__PURE__ */ new Set([...untrackedNamed(repo, workerFiles, check).map((c) => c.to), ...untrackedReachable(repo, roots, tracked)])].filter((rel) => !tests.includes(rel)).slice(0, MAX_UNTRACKED_CODE);
  for (const rel of context) {
    try {
      if (fs23.statSync(path23.join(repo, rel)).size <= MAX_NAMED_BYTES) copyIn(rel, "context");
    } catch {
    }
  }
  const diff = spawnSync3("git", ["diff", "--name-only", "HEAD", "--", ...workerFiles], { cwd: repo, encoding: "utf8", timeout: 2e4, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  const changed = diff.status === 0 ? diff.stdout.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const headStart = workerFiles.filter((f) => changed.includes(f) || !tracked.has(f) && fs23.existsSync(path23.join(repo, f)));
  return { tests, workerFiles, context: context.filter((rel) => fs23.existsSync(path23.join(dir, "context", rel))), headStart, check: narrowCheck(repo, noTsc, [...tests, ...workerFiles]), dropped };
}
function prepareShadowCopy(dir, spec, home3, tscLines = (c) => tscErrorLines(c)) {
  if (!spec.shadow) throw new Error("not a shadow job");
  const patch = spec.shadow.patch ? path23.join(home3, ...TREES_DIR, spec.shadow.patch) : null;
  let context;
  if (spec.shadow.method === 2) {
    context = [
      ...(spec.shadow.context ?? []).map((rel) => ({ from: path23.join(dir, "context", rel), to: rel })),
      ...(spec.shadow.tests ?? []).map((rel) => ({ from: path23.join(dir, "asked", rel), to: rel }))
    ].filter((c2) => fs23.existsSync(c2.from));
  } else {
    const named = untrackedNamed(spec.shadow.repo, spec.files, spec.check);
    context = [...named, ...untrackedCode(spec.shadow.repo).filter((c2) => !named.some((n2) => n2.to === c2.to))];
  }
  const t0 = Date.now();
  const c = makeSafeCopy({ repo: spec.shadow.repo, commit: spec.shadow.head, patch, dir: spec.root, context, install: true, home: home3 });
  const t1 = Date.now();
  let copy;
  if (spec.shadow.method === 2) {
    const base = tscLines(c);
    copy = { ...c, tscAtBase: base === null ? null : base.length === 0, tscBase: base, timings: { copySec: Math.round((t1 - t0) / 1e3), tscSec: Math.round((Date.now() - t1) / 1e3) } };
  } else copy = { ...c, tscAtBase: baselineTsc(c) };
  fs23.writeFileSync(copyFile(dir), JSON.stringify(copy, null, 2));
  return copy;
}
function newTscErrors(base, end, named) {
  const key2 = (l) => l.replace(/\r/g, "").trim().replace(/\(\d+,\d+\)/, "").replace(/\\/g, "/");
  const fileOf = (l) => norm2(/^(\S[^(\n]*)\(\d+,\d+\)/.exec(l.trim())?.[1]?.trim() ?? "");
  const left = /* @__PURE__ */ new Map();
  for (const l of base) left.set(key2(l), (left.get(key2(l)) ?? 0) + 1);
  const files = new Set(named.map(norm2));
  const out = [];
  for (const l of end) {
    const k3 = key2(l);
    const n2 = left.get(k3) ?? 0;
    if (n2 > 0) {
      left.set(k3, n2 - 1);
      continue;
    }
    if (files.has(fileOf(l))) out.push(l.trim());
  }
  return out;
}
var SHADOW_RUN_LOCK = "shadow-run.lock";
var RUN_LOCK_STALE_MS = 4 * 60 * 60 * 1e3;
function readLock(file) {
  try {
    const text2 = fs23.readFileSync(file, "utf8").trim();
    if (/^\d+$/.test(text2)) return { pid: Number(text2), at: "" };
    const o = JSON.parse(text2);
    return typeof o.pid === "number" ? o : null;
  } catch {
    return null;
  }
}
function lockFree(b, staleMs, now) {
  if (!b) return true;
  if (b.at && now - Date.parse(b.at) > staleMs) return true;
  return !(Number.isInteger(b.pid) && b.pid > 0 && pidAlive(b.pid));
}
function takeLock(file, owner, staleMs, now = Date.now()) {
  for (let i = 0; i < 2; i++) {
    try {
      fs23.mkdirSync(path23.dirname(file), { recursive: true });
      fs23.writeFileSync(file, JSON.stringify({ pid: process.pid, at: new Date(now).toISOString(), owner }), { flag: "wx" });
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") return false;
      if (!lockFree(readLock(file), staleMs, now)) return false;
      fs23.rmSync(file, { force: true });
    }
  }
  return false;
}
function releaseLock(file) {
  try {
    if (readLock(file)?.pid === process.pid) fs23.rmSync(file, { force: true });
  } catch {
  }
}
function runLockHolder(home3, now = Date.now()) {
  const b = readLock(path23.join(home3, SHADOW_RUN_LOCK));
  return lockFree(b, RUN_LOCK_STALE_MS, now) ? null : b?.owner ?? `pid ${b?.pid}`;
}
var takeRunLock = (home3, owner, now = Date.now()) => takeLock(path23.join(home3, SHADOW_RUN_LOCK), owner, RUN_LOCK_STALE_MS, now);
var releaseRunLock = (home3) => releaseLock(path23.join(home3, SHADOW_RUN_LOCK));
async function waitForRunLock(home3, dir, owner, o = {}) {
  const now = o.now ?? Date.now;
  const sleep2 = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const until = now() + (o.maxWaitMs ?? 6 * 60 * 60 * 1e3);
  for (; ; ) {
    if (takeRunLock(home3, owner, now())) return true;
    if (now() >= until) return false;
    try {
      fs23.writeFileSync(path23.join(dir, "status.json"), JSON.stringify({ state: "running", phase: `queued behind ${runLockHolder(home3, now()) ?? "another shadow"}`, at: new Date(now()).toISOString(), pid: process.pid }));
    } catch {
    }
    await sleep2(o.pollMs ?? 3e4);
  }
}
function putBackOutside(copy, allowed) {
  const ok = new Set(allowed.map(norm2));
  const g = (...a) => spawnSync3("git", ["-c", "core.autocrlf=false", "-c", "gc.auto=0", ...a], { cwd: copy.dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 6e5, windowsHide: true });
  g("add", "-A");
  const r = g("diff", "--cached", "--name-status", "--no-renames", copy.base);
  if (r.status !== 0) return [];
  const back = [];
  for (const line of r.stdout.split("\n")) {
    const [st, file] = line.split("	");
    if (!st || !file || ok.has(norm2(file))) continue;
    if (st === "A") fs23.rmSync(path23.join(copy.dir, file), { force: true });
    else g("checkout", copy.base, "--", file);
    back.push(norm2(file));
  }
  g("add", "-A");
  return back;
}
async function primaryGrade(dir, spec, copy, deps) {
  const tests = spec.shadow?.tests ?? [];
  if (!tests.length) return null;
  const putBack = deps.putBack(copy, spec.files);
  for (const t of tests) {
    const from = path23.join(dir, "asked", t);
    if (!fs23.existsSync(from)) continue;
    fs23.mkdirSync(path23.dirname(path23.join(copy.dir, t)), { recursive: true });
    fs23.copyFileSync(from, path23.join(copy.dir, t));
  }
  const r = await deps.run(copy.dir, spec.check);
  try {
    fs23.writeFileSync(path23.join(dir, "primary-run.txt"), `$ ${spec.check}
[exit ${r.exit}]
${r.out}`);
  } catch {
  }
  let typecheck = { status: "not counted", errors: [] };
  const base = copy.tscBase ?? null;
  if (base !== null) {
    const end = deps.tscLines(copy);
    if (end !== null) {
      const errors = newTscErrors(base, end, [...spec.files, ...tests, ...checkNamedPaths(spec.check)]);
      typecheck = { status: errors.length ? "new errors" : "clean", errors: errors.slice(0, 20) };
    }
  }
  const changed = deps.changed(copy).filter((f) => !tests.includes(f));
  let verdict;
  let note;
  if (r.exit === null) {
    verdict = "not counted";
    note = "the tests-first check did not finish in its time in the copy: harness-limited, not counted";
  } else if (r.exit !== 0) {
    verdict = "fail";
    note = `the lead's ${tests.length} tests-first file(s) fail over the worker's copy (exit ${r.exit})`;
  } else if (typecheck.status === "new errors") {
    verdict = "fail";
    note = `the tests pass, but the typecheck has ${typecheck.errors.length} new error(s) in the job's files`;
  } else {
    const unverified = unverifiedFiles(copy.dir, tests, changed);
    verdict = unverified.length ? "pass (tested part)" : "pass";
    note = `the lead's ${tests.length} tests-first file(s) pass over the worker's copy${typecheck.status === "clean" ? "; no new typecheck error" : "; typecheck not counted"}`;
    return { verdict, note, tests, exit: r.exit, typecheck, unverified, putBack, at: (/* @__PURE__ */ new Date()).toISOString() };
  }
  return { verdict, note, tests, exit: r.exit, typecheck, unverified: [], putBack, at: (/* @__PURE__ */ new Date()).toISOString() };
}
var PRIMARY_FILE = "primary.json";
function readPrimary(dir) {
  try {
    return JSON.parse(fs23.readFileSync(path23.join(dir, PRIMARY_FILE), "utf8"));
  } catch {
    return void 0;
  }
}
function readShadowCopy(dir) {
  try {
    return JSON.parse(fs23.readFileSync(copyFile(dir), "utf8"));
  } catch {
    return void 0;
  }
}
function saveShadowDiff(dir, copy) {
  const changed = changedFiles(copy.dir, copy.base);
  const r = spawnSync3("git", ["-c", "core.autocrlf=false", "diff", "--binary", "--no-color", "--cached", copy.base], { cwd: copy.dir, encoding: "buffer", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status === 0) fs23.writeFileSync(path23.join(dir, "diff.patch"), r.stdout);
  return changed;
}
function unverifiedFiles(dir, tests, changed) {
  const noExt = (f) => f.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "");
  const code = changed.filter((f) => CODE.test(f) && !TEST.test(f));
  const reached = /* @__PURE__ */ new Set();
  for (const t of tests) {
    let text2;
    try {
      text2 = fs23.readFileSync(path23.join(dir, t), "utf8");
    } catch {
      continue;
    }
    const specs = [...text2.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["'`]([^"'`]+)["'`]/gm)].map((m) => m[1]);
    for (const f of code) {
      const target = noExt(f);
      for (const s2 of specs) {
        const resolved = s2.startsWith(".") ? noExt(path23.posix.normalize(path23.posix.join(path23.posix.dirname(t), s2))) : noExt(s2.replace(/^[@~#]\//, ""));
        if (resolved === target || !s2.startsWith(".") && (target.endsWith(`/${resolved}`) || resolved.endsWith(`/${target}`))) reached.add(f);
      }
      if (text2.includes(f) || text2.includes(f.replace(/\//g, "\\\\"))) reached.add(f);
    }
  }
  return code.filter((f) => !reached.has(f));
}
function git3(cwd, args) {
  const r = spawnSync3("git", ["-c", "gc.auto=0", ...args], { cwd, encoding: "utf8", timeout: 6e4, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  return r.status === 0 ? r.stdout : null;
}
var codeFiles = (files) => files.map(norm2).filter((f) => CODE.test(f) && !TEST.test(f));
var FIXTURE_NOT = /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|tsconfig[^/]*\.json)$|\.md$/;
function realGradeDeps(projectsRoot, priceFor, now = Date.now) {
  return {
    leadCommit(repo, shas, files, sinceMs = 0, authored = () => false) {
      const named = new Set(codeFiles(files));
      for (const { sha: short, via } of shas) {
        const full = git3(repo, ["rev-parse", "--verify", "--quiet", `${short}^{commit}`])?.trim();
        if (!full || !/^[0-9a-f]{40}$/.test(full)) continue;
        const [at = "", subject = ""] = (git3(repo, ["show", "-s", "--format=%cI%x1f%s", full]) ?? "").trim().split("");
        if (Date.parse(at) < sinceMs) continue;
        if (via === "log" && !authored(subject)) continue;
        const touched = (git3(repo, ["diff", "--name-only", "--no-renames", `${full}^`, full]) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
        const mine = touched.filter((f) => named.has(f));
        if (!mine.length) continue;
        const stat = git3(repo, ["diff", "--numstat", `${full}^`, full, "--", ...mine]) ?? "";
        let lines = 0;
        for (const l of stat.split("\n")) {
          const [a, d] = l.split("	");
          if (/^\d+$/.test(a ?? "") && /^\d+$/.test(d ?? "")) lines += Number(a) + Number(d);
        }
        return { sha: full, at, subject: subject.slice(0, 120), lines };
      }
      return null;
    },
    commitFiles(repo, sha) {
      return (git3(repo, ["diff", "--name-only", "--no-renames", `${sha}^`, sha]) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    },
    secondary: (copy, repo, sha, o) => controlledCommitTests(copy, repo, sha, o),
    commitText: (repo, sha, file) => git3(repo, ["show", `${sha}:${file}`]) ?? void 0,
    unverified: unverifiedFiles,
    transcript(job, session, sinceMs) {
      const file = transcriptForJob(projectsRoot, job, session, sinceMs, holdsJob);
      try {
        return file ? { lines: fs23.readFileSync(file, "utf8").split("\n"), file } : void 0;
      } catch {
        return void 0;
      }
    },
    helpers(file) {
      return helperTranscripts(file).flatMap((h) => {
        try {
          return [fs23.readFileSync(h, "utf8").split("\n")];
        } catch {
          return [];
        }
      });
    },
    priceFor,
    removeCopy,
    now
  };
}
function workerSide(spec, r, st) {
  if (r) {
    return { model: r.model, level: r.level, verdict: r.verdict, why: r.why, usd: Math.round((r.usd.worker + r.usd.checker) * 1e4) / 1e4, minutes: r.minutes, changed: r.changed, signals: (r.signals ?? []).map((s2) => s2.rule) };
  }
  return { model: spec.model, level: spec.level, verdict: "did not run", why: st?.error ?? `the job's process ended in phase "${st?.phase ?? "starting"}" with no result`, usd: 0, minutes: null, changed: [], signals: [] };
}
var ROUND_TRIP_TURNS = 5;
function oneCallEstimate(contextTokens, price, workerUsd, outputTokensPerTurn = 1500, turns = 2) {
  const read = price.cacheRead ?? price.input * CACHE_READ;
  return Math.round((turns * (contextTokens * read + outputTokensPerTurn * price.output) / 1e6 + workerUsd) * 1e4) / 1e4;
}
function jobTests(tests, files, textOf2) {
  const named = new Set(files.map(norm2));
  const noExt = (f) => norm2(f).replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "");
  const code = files.filter((f) => CODE.test(f) && !TEST.test(f)).map(noExt);
  const esc2 = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tests.filter((t) => {
    if (named.has(norm2(t))) return true;
    const text2 = textOf2(t);
    if (!text2) return false;
    return code.some((stem2) => {
      const base = stem2.split("/").pop() ?? stem2;
      return text2.includes(stem2) || new RegExp(`['"\`][^'"\`]*\\/${esc2(base)}(\\.[cm]?[jt]sx?)?['"\`]`).test(text2);
    });
  });
}
function siblingWindows(dir, spec, now) {
  const out = [];
  if (!spec.session) return out;
  let ids;
  try {
    ids = fs23.readdirSync(path23.dirname(dir));
  } catch {
    return out;
  }
  for (const id of ids) {
    if (id === spec.id) continue;
    const other = path23.join(path23.dirname(dir), id);
    try {
      const o = readSpec(other);
      if (!o.shadow || o.session !== spec.session) continue;
      let to = now;
      try {
        const g = JSON.parse(fs23.readFileSync(path23.join(other, "grade.json"), "utf8"));
        if (g.commit?.at) to = Date.parse(g.commit.at);
      } catch {
      }
      out.push({ from: Date.parse(o.at) - 5e3, to });
    } catch {
    }
  }
  return out;
}
var DEFECT_WORDS = /does not exist|doesn't exist|no such file|not found in the repo|cannot find (the )?file/i;
function briefDefect(dir, spec, result) {
  const texts = [result?.report ?? "", result?.probe?.answer ?? ""];
  try {
    texts.push(fs23.readFileSync(path23.join(dir, "step-1-from.md"), "utf8"));
  } catch {
  }
  const all = texts.join("\n");
  for (const f of spec.files) {
    for (const name of [f, f.split("/").pop()]) {
      let at = all.indexOf(name);
      while (at >= 0) {
        if (DEFECT_WORDS.test(all.slice(Math.max(0, at - 200), at + name.length + 200))) return `the worker said ${f} does not exist`;
        at = all.indexOf(name, at + 1);
      }
    }
  }
  let events = [];
  try {
    events = streamEvents(dir);
  } catch {
  }
  const tests = spec.shadow?.tests ?? [];
  for (const e of events) {
    const m = typeof e.result === "string" ? /^refused: (\S+) is not one of the files this job may change/.exec(e.result) : null;
    const p = m?.[1];
    if (p && CODE.test(p) && !TEST.test(p) && !tests.includes(p) && all.includes(p)) return `the worker needed ${p}, which the job's files leave out`;
  }
  return null;
}
var quickWhy = (why) => !!why && (why.startsWith(NOT_MEASURABLE) || why.startsWith("the check cannot run in the copy"));
var wallStop = (why) => !!why && /time limit|wall cap|ran out of turns or time/.test(why);
function gradeShadowJob(dir, deps, o = {}) {
  const spec = readSpec(dir);
  if (!spec.shadow) return void 0;
  const st = readStatus(dir);
  const result = readResult(dir);
  const now = deps.now();
  const ended = !!result || st?.state === "error" || st?.state === "running" && !alive(st.pid);
  if (!ended) return void 0;
  const repo = spec.shadow.repo;
  const atMs = Date.parse(spec.at);
  const method2 = spec.shadow.method === 2;
  const copy = readShadowCopy(dir);
  const worker = workerSide(spec, result, st);
  const notMeasurable = !result ? `the worker did not run: ${worker.why ?? "no result"}` : quickWhy(result.why) ? result.why : null;
  const t = deps.transcript(spec.id, spec.session, atMs - 6e4);
  const shas = t ? commitShasAfter(t.lines, atMs - 5e3) : [];
  const inputs = t && shas.some((s2) => s2.via === "log") ? ownInputs(t.lines) : "";
  const authored = (subject) => {
    const s2 = subject.slice(0, 50).trim();
    return s2.length >= 12 && (inputs.includes(s2) || inputs.includes(JSON.stringify(s2).slice(1, -1)));
  };
  const commit = shas.length ? deps.leadCommit(repo, shas, spec.files, atMs - 5e3, authored) : null;
  const waitFor = method2 && readPrimary(dir) ? PRIMARY_WAIT_MS : GIVE_UP_MS2;
  if (!notMeasurable && !commit && now - atMs < waitFor) return void 0;
  const copyThere = !!copy?.installed && fs23.existsSync(copy.dir);
  const needsRun = !notMeasurable && !!commit && copyThere;
  if (needsRun && o.canRun === false) return void 0;
  const primary = readPrimary(dir);
  let grade;
  let harnessLimited = false;
  let defect = null;
  if (notMeasurable) grade = { verdict: "ungraded", note: notMeasurable, unverified: [] };
  else if (!method2) grade = { verdict: "ungraded", note: "started under the first method: no test written first, so no primary grade; see the secondary", unverified: [] };
  else if (!primary) grade = { verdict: "ungraded", note: "no primary grade was written: the job's process ended before it", unverified: [] };
  else if (primary.verdict === "not counted") {
    harnessLimited = true;
    grade = { verdict: "ungraded", note: primary.note, unverified: [] };
  } else grade = { verdict: primary.verdict, note: primary.note, unverified: primary.unverified };
  if (grade.verdict === "fail" && wallStop(result?.why)) {
    harnessLimited = true;
    grade = { verdict: "ungraded", note: `harness-limited: ${result.why}; ${grade.note}`, unverified: [] };
  }
  if (grade.verdict === "fail") {
    defect = briefDefect(dir, spec, result);
    if (defect) grade = { verdict: "ungraded", note: `brief defect: ${defect}; ${grade.note}`, unverified: [] };
  }
  let commitRow = null;
  let secondary = null;
  const named = [...spec.files, ...spec.shadow.tests ?? []];
  if (commit) {
    const files = deps.commitFiles(repo, commit.sha);
    const all = files.filter((f) => TEST.test(f));
    const tests = jobTests(all, named, (f) => deps.commitText(repo, commit.sha, f));
    const fixtures = files.filter((f) => !CODE.test(f) && !FIXTURE_NOT.test(f));
    commitRow = { sha: commit.sha, at: commit.at, subject: commit.subject, files, tests, commitTests: all.length, lines: commit.lines, fixtures };
    const none = (note) => ({ verdict: "ungraded", note, tests, worker: {}, control: {} });
    if (notMeasurable) secondary = none("not measurable: nothing of the worker's to grade");
    else if (!copy || !copyThere) secondary = none(!copy ? "no copy record" : !copy.installed ? `the copy had no install (${copy.installNote})` : "the copy's folder is gone: nothing to run the commit's tests in");
    else if (!tests.length) secondary = none(all.length ? `the lead's commit carries ${all.length} test file(s), none for this job's files` : "the lead's commit carries no test file");
    else {
      const s2 = deps.secondary(copy, repo, commit.sha, { tests, fixtures, named: codeFiles(spec.files), outDir: dir });
      const valid = tests.filter((x) => s2.control[x] === "pass");
      const w = valid.map((x) => s2.worker[x]);
      if (!valid.length) secondary = { ...none(`the lead's tests need files outside the job: none passes with the lead's own versions of the job's files (${tests.map((x) => `${x}: ${s2.control[x] ?? "not run"}`).join(", ")})`), worker: s2.worker, control: s2.control };
      else if (w.some((x) => x === "timeout")) secondary = { verdict: "ungraded", note: "harness-limited: the commit's tests outran their time over the worker's copy", tests: valid, worker: s2.worker, control: s2.control };
      else if (w.every((x) => x === "pass")) {
        const unverified = deps.unverified(copy.dir, valid, result?.changed ?? []);
        secondary = { verdict: unverified.length ? "pass (tested part)" : "pass", note: `${valid.length} of the commit's ${tests.length} job test file(s) pass the control and pass over the worker's copy`, tests: valid, worker: s2.worker, control: s2.control };
      } else secondary = { verdict: "fail", note: `${w.filter((x) => x !== "pass").length} of ${valid.length} controlled test file(s) fail over the worker's copy`, tests: valid, worker: s2.worker, control: s2.control };
    }
  } else if (!notMeasurable) secondary = { verdict: "ungraded", note: t ? "no commit from the asking session changed a named code file" : "no transcript holds the job, so no commit can be tied to the asking session", tests: [], worker: {}, control: {} };
  if (!method2 && !notMeasurable && secondary) grade = { verdict: secondary.verdict, note: `secondary (the lead's commit): ${secondary.note}`, unverified: [] };
  let lead = null;
  let oneCallUsd = null;
  if (t) {
    const ctx = contextAtCall(t.lines, spec.id);
    const from = atMs - 5e3;
    const to = commit?.at ? Date.parse(commit.at) : Math.min(now, atMs + 24 * 60 * 60 * 1e3);
    const w = leadWindowCost(t.lines, from, to, deps.priceFor, siblingWindows(dir, spec, now));
    const a = attributedCost(t.lines, from, to, named, deps.priceFor);
    const helperUsd = deps.helpers(t.file).reduce((s2, h) => s2 + helperSpend(h, from, to, named, deps.priceFor), 0);
    const model = w.model || ctx?.model || spec.lead || "unknown";
    lead = {
      model,
      usd: Math.round(w.usd * 1e4) / 1e4,
      turns: w.messages,
      minutes: w.minutes === void 0 ? null : Math.round(w.minutes * 10) / 10,
      contextAtCall: ctx?.tokens ?? null,
      shared: w.shared ?? 0,
      transcript: path23.basename(t.file),
      attributedUsd: Math.round((a.usd + helperUsd) * 1e4) / 1e4,
      attributedTurns: a.messages,
      helperUsd: Math.round(helperUsd * 1e4) / 1e4
    };
    if (ctx) oneCallUsd = oneCallEstimate(ctx.tokens, deps.priceFor(model), worker.usd, 1500, ROUND_TRIP_TURNS);
  }
  if (copy) deps.removeCopy(copy.dir);
  return {
    v: 2,
    ...method2 ? { method: 2 } : {},
    job: spec.id,
    at: spec.at,
    repo,
    session: spec.session,
    operation: spec.operation,
    lines: spec.lines,
    files: spec.files,
    advice: spec.shadow.advice,
    worker,
    commit: commitRow,
    grade,
    measurable: !notMeasurable,
    harnessLimited,
    headStart: (spec.shadow.headStart ?? []).filter((f) => !(result?.rewound ?? []).includes(f)),
    ...result?.rewound?.length ? { rewound: result.rewound } : {},
    briefDefect: defect,
    typecheck: primary?.typecheck ?? null,
    secondary,
    lead,
    oneCallUsd,
    version: spec.shadow.version ?? null,
    timings: copy?.timings ?? null,
    gradedAt: new Date(now).toISOString()
  };
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readLedger(home3) {
  let text2;
  try {
    text2 = fs23.readFileSync(path23.join(home3, SHADOW_LEDGER), "utf8");
  } catch {
    return [];
  }
  const rows2 = [];
  for (const line of text2.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && (r.v === 1 || r.v === 2) && typeof r.job === "string") rows2.push(r);
    } catch {
    }
  }
  return rows2;
}
var SHADOW_PASS_LOCK = "shadow-pass.lock";
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
var PASS_LOCK_STALE_MS = 2 * 60 * 60 * 1e3;
function takePassLock(home3, now = Date.now()) {
  return takeLock(path23.join(home3, SHADOW_PASS_LOCK), "grade pass", PASS_LOCK_STALE_MS, now);
}
function releasePassLock(home3) {
  releaseLock(path23.join(home3, SHADOW_PASS_LOCK));
}
function gradeShadowJobs(home3, deps) {
  let lock = false;
  try {
    lock = takePassLock(home3, deps.now());
  } catch {
    lock = false;
  }
  if (!lock) return { graded: 0, waiting: 0, busy: true };
  let run2 = false;
  try {
    run2 = takeRunLock(home3, "the grade pass", deps.now());
  } catch {
    run2 = false;
  }
  try {
    return gradeUnlocked(home3, deps, run2);
  } finally {
    if (run2) releaseRunLock(home3);
    releasePassLock(home3);
  }
}
function gradeUnlocked(home3, deps, canRun) {
  let graded = 0;
  let waiting = 0;
  let ids = [];
  try {
    ids = fs23.readdirSync(path23.join(home3, WORKERS_DIR));
  } catch {
    return { graded, waiting };
  }
  for (const id of ids) {
    const dir = jobDir(home3, id);
    if (fs23.existsSync(path23.join(dir, "grade.json"))) continue;
    try {
      const spec = readSpec(dir);
      if (!spec.shadow) continue;
      const row2 = gradeShadowJob(dir, deps, { canRun });
      if (!row2) {
        waiting++;
        continue;
      }
      fs23.writeFileSync(path23.join(dir, "grade.json"), JSON.stringify(row2, null, 2));
      fs23.appendFileSync(path23.join(home3, SHADOW_LEDGER), `${JSON.stringify(row2)}
`);
      recordShadowOutcome(home3, row2.job, { primary: row2.grade.verdict, secondary: row2.secondary?.verdict ?? null, measurable: row2.measurable ?? true, headStart: (row2.headStart ?? []).length > 0, harnessLimited: !!row2.harnessLimited, method: row2.method ?? 1 });
      graded++;
    } catch {
    }
  }
  if (graded || !fs23.existsSync(path23.join(home3, SHADOW_REPORT))) {
    try {
      fs23.writeFileSync(path23.join(home3, SHADOW_REPORT), shadowReport(readLedger(home3), waiting, deps.now(), readShadowAsks(home3)));
    } catch {
    }
  }
  return { graded, waiting };
}
function readShadowAsks(home3) {
  const out = { rows: [], older: 0 };
  for (const r of readHandovers(home3)) {
    if (!r.shadow) continue;
    if (r.shadowMethod !== 2 || !r.shadowStart) {
      out.older++;
      continue;
    }
    out.rows.push({ at: r.at, session: r.session, lines: r.lines, start: r.shadowStart, why: r.shadowWhy ?? null });
  }
  return out;
}
var usd2 = (n2) => n2 === null || n2 === void 0 ? "\u2013" : `$${n2.toFixed(2)}`;
var avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
var sum = (xs) => xs.reduce((a, b) => a + b, 0);
var k = (n2) => n2 === null ? "\u2013" : `${Math.round(n2 / 1e3)}K`;
var day = (iso) => iso.slice(5, 16).replace("T", " ");
var isPass = (v) => v === "pass" || v === "pass (tested part)";
var count3 = (xs) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), /* @__PURE__ */ new Map())].sort((a, b) => b[1] - a[1]);
var reasonOf = (note) => note.replace(/^not measurable: /, "").replace(/:.*$/, "").slice(0, 100);
function shadowReport(rows2, waiting, now, asks = null) {
  const sorted = [...rows2].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const m2 = sorted.filter((r) => r.v === 2 && r.method === 2);
  const old = sorted.filter((r) => !(r.v === 2 && r.method === 2));
  const measurable = m2.filter((r) => r.measurable !== false);
  const notMeasurable = m2.filter((r) => r.measurable === false);
  const ran = m2.filter((r) => r.worker.verdict !== "did not run");
  const primary = measurable.filter((r) => r.grade.verdict !== "ungraded");
  const head = primary.filter((r) => (r.headStart ?? []).length);
  const counted = primary.filter((r) => !(r.headStart ?? []).length);
  const passes = counted.filter((r) => isPass(r.grade.verdict));
  const plain = counted.filter((r) => r.grade.verdict === "pass").length;
  const harness = m2.filter((r) => r.harnessLimited);
  const defects = m2.filter((r) => r.briefDefect);
  const second = m2.filter((r) => r.secondary && r.secondary.verdict !== "ungraded");
  const secondPass = second.filter((r) => isPass(r.secondary.verdict)).length;
  const noCommit = m2.filter((r) => r.measurable !== false && !r.commit).length;
  const controlFailed = m2.filter((r) => r.secondary?.note.startsWith("the lead's tests need files outside the job")).length;
  const rate = counted.length ? passes.length / counted.length : null;
  const askRows = asks?.rows ?? [];
  const refused = askRows.filter((a) => a.start === "refused");
  const tooBig = refused.filter((a) => /past one piece/.test(a.why ?? ""));
  const noTest = refused.filter((a) => /names no test file|only a typecheck|name only the test/.test(a.why ?? ""));
  const otherRefused = refused.length - tooBig.length - noTest.length;
  const bySession = count3(tooBig.map((a) => a.session ?? "unknown"));
  const didNotSplit = bySession.filter(([, n2]) => n2 >= 3).length;
  const withLead = m2.filter((r) => r.lead);
  const workerUsd = m2.map((r) => r.worker.usd);
  const windowUsd = withLead.map((r) => r.lead.usd);
  const attributed = withLead.map((r) => r.lead.attributedUsd ?? 0);
  const expected2 = withLead.filter((r) => r.oneCallUsd !== null).map((r) => r.oneCallUsd + (1 - (rate ?? 0)) * (r.lead.attributedUsd ?? 0));
  const ctx = m2.map((r) => r.lead?.contextAtCall ?? null).filter((n2) => n2 !== null);
  const lines = [
    `# Shadow delegation \u2014 ${new Date(now).toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    "The lead does each job itself; the same brief goes to the cheap worker in a copy of the repository. Method 2 (since 7 Oct): the lead writes the failing test first; that test, as it was at the ask, grades the worker (the primary grade). The lead's own commit, when the asking session made one, is a cross-check, counted only on the tests the lead's own code passes in the copy (the secondary). Nothing here changed what the lead did.",
    "",
    "## The funnel (method 2)",
    `1. Asks: ${askRows.length}${asks?.older ? ` (and ${asks.older} earlier asks under the first method)` : ""}.`,
    `2. Refused: ${refused.length} \u2014 too big ${tooBig.length}${tooBig.length ? ` (claimed ${tooBig.map((a) => a.lines ?? "?").join(", ")} lines)` : ""}; no test written first ${noTest.length}; other ${otherRefused}.${didNotSplit ? ` The lead did not split in ${didNotSplit} session(s) (three or more too-big refusals).` : ""} Asked without brief, files or check: ${askRows.filter((a) => a.start === "missing").length}.`,
    `3. Started: ${Math.max(askRows.filter((a) => a.start === "started").length, m2.length)}. Not measurable: ${notMeasurable.length}${notMeasurable.length ? ` (${count3(notMeasurable.map((r) => reasonOf(r.grade.note))).map(([w, n2]) => `${n2} \xD7 ${w}`).join("; ")})` : ""}.`,
    `4. Ran: ${ran.length}.`,
    `5. Primary grade (the tests written first): ${primary.length} graded \u2014 ${passes.length} passed of ${counted.length} counted (${plain} plain, ${passes.length - plain} on the tested part), ${counted.length - passes.length} failed; ${head.length} with a head start, kept out.`,
    `6. Secondary (the asking session's own commit, controlled): ${second.length} graded, ${secondPass} passed; no commit from the session ${noCommit}; the lead's tests needed files outside the job ${controlFailed}.`,
    `7. Harness-limited (a time limit, not the worker): ${harness.length}. Brief defects the worker named: ${defects.length}.`,
    `8. Waiting for the lead's commit or the worker's end (jobs of any method): ${waiting}.`,
    "",
    `**Pass rate (primary, no head start): ${counted.length ? `${passes.length} of ${counted.length}` : "nothing measured yet"}.**${counted.length && counted.length < 10 ? " Too few to decide on: with under ten jobs the 95% interval spans most of the range." : ""}`,
    "",
    "## Cost (method 2)",
    `- Worker: ${usd2(avg(workerUsd))} a job on average, ${usd2(sum(workerUsd))} in all (worker, checker and the closing questions).`,
    `- Lead conversation in the window (upper bound, other work included): ${usd2(avg(windowUsd))} a job over ${withLead.length} with a transcript${m2.length - withLead.length ? `; ${m2.length - withLead.length} with no transcript found, left out (never counted as $0)` : ""}.`,
    `- Attributed lead cost (turns naming the job's files, plus helpers given the job): ${usd2(avg(attributed))} a job.`,
    `- Expected delegated cost: ${usd2(avg(expected2))} a job \u2014 the round trip (${ROUND_TRIP_TURNS} lead turns at the context it had) + the worker + (1 \u2212 ${rate === null ? "the pass rate, unknown so taken as 0" : `the pass rate ${Math.round(rate * 100)}%`}) \xD7 the attributed lead cost, for the takeover when the worker fails.`,
    `- Context at the call: ${ctx.length ? `${k(avg(ctx))} tokens on average, ${k(Math.min(...ctx))} to ${k(Math.max(...ctx))}` : "not measured"}.`,
    "",
    "## Ready to take over?",
    "Per kind of job: ten graded, nine in ten pass, and cheaper delegated than the lead doing it, its own overhead included.",
    ...readiness(m2),
    "",
    "## Each job (method 2)",
    "| when | op | claimed lines | commit lines | files | worker verdict | primary | secondary | head start | worker $ | window $ | attributed $ | ctx | commit |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"
  ];
  for (const r of m2) {
    lines.push(
      `| ${day(r.at)} | ${r.operation} | ${r.lines ?? "\u2013"} | ${r.commit?.lines ?? "\u2013"} | ${r.files.length} | ${r.worker.verdict} | ${r.measurable === false ? "not measurable" : r.harnessLimited ? "harness-limited" : r.grade.verdict} | ${r.secondary?.verdict ?? "\u2013"} | ${(r.headStart ?? []).length ? "yes" : "no"} | ${usd2(r.worker.usd)} | ${usd2(r.lead?.usd ?? null)} | ${usd2(r.lead?.attributedUsd ?? null)} | ${k(r.lead?.contextAtCall ?? null)} | ${r.commit ? `${r.commit.sha.slice(0, 8)} ${r.commit.subject.slice(0, 40)}` : "none"} |`
    );
  }
  const notes = m2.filter((r) => r.grade.verdict !== "pass").map((r) => `- ${r.job} (${day(r.at)}): ${r.grade.verdict}, ${r.grade.note}${r.grade.unverified.length ? `; untested by the tests: ${r.grade.unverified.join(", ")}` : ""}${r.secondary ? `; secondary: ${r.secondary.verdict}, ${r.secondary.note}` : ""}${(r.headStart ?? []).length ? `; head start: ${r.headStart.join(", ")}` : ""}${(r.rewound ?? []).length ? `; put back as committed before the work: ${r.rewound.join(", ")}` : ""}${r.typecheck?.errors.length ? `; new type errors: ${r.typecheck.errors.slice(0, 3).join(" | ")}` : ""}${r.worker.why ? `; worker: ${r.worker.why}` : ""}${r.worker.signals.length ? `; signals: ${r.worker.signals.join(", ")}` : ""}`);
  if (notes.length) lines.push("", "## What to read", ...notes);
  if (old.length) {
    const g = old.filter((r) => r.grade.verdict !== "ungraded");
    const p = g.filter((r) => isPass(r.grade.verdict)).length;
    lines.push(
      "",
      "## Graded under the old method (not comparable)",
      `${old.length} job(s) started before 7 Oct's method 2, with no test written first. Rows graded before 7 Oct used the first commit after the start that touched a named file, tests written after the brief and no control; rows graded since use the asking session's own commit with the control, and are ungraded where the copy is gone. ${g.length} graded (${p} pass, ${g.length - p} fail), ${old.length - g.length} ungraded. The audit of 7 Oct found that none of the first nine could have been passed (nudge-shadow-audit-2026-10-07.md \xA70); these numbers say nothing about the worker.`,
      "",
      "| when | op | lines | worker verdict | grade | note |",
      "|---|---|---|---|---|---|",
      ...old.map((r) => `| ${day(r.at)} | ${r.operation} | ${r.lines ?? "\u2013"} | ${r.worker.verdict} | ${r.grade.verdict} | ${r.grade.note.replace(/\|/g, "/").slice(0, 140)} |`)
    );
  }
  lines.push(
    "",
    "## How it is measured",
    `- Primary grade: the test files the lead wrote before the ask and named in the check, copied at the ask, written back over the worker's copy at the end, and run with the job's check (the whole-tree typecheck taken out). Whatever the worker changed outside its files is put back first. The typecheck counts only new errors in the job's files against the copy's start. A time-limit stop is harness-limited, never a fail. "Pass (tested part)": the tests pass but some changed code file is imported by none of them.`,
    "- Secondary grade: the first commit the asking session itself made after the ask (its sha in the session's own git output) that changes a named code file. Its tests that belong to the job, and its fixtures, are run over the worker's copy; then the named files are set to the lead's versions and the same tests run again. Only tests that pass with the lead's versions grade the worker.",
    "- Head start: named files the lead had already changed or created at the ask. Such jobs are graded but kept out of the pass rate.",
    "- Worker $: what the gateway billed for the worker, the checker and the closing questions, from the job's record.",
    "- Lead window $: the transcript that started the job (found by the job id, not the session id), every message from the ask to the commit at list prices: the whole conversation, an upper bound. Attributed $: the messages whose tool calls name a job file, plus Claude helpers whose prompt names one: a lower bound.",
    `- Expected delegated cost: ${ROUND_TRIP_TURNS} lead turns at the context of the ask (1,500 output tokens each) + the worker + (1 \u2212 pass rate) \xD7 attributed lead cost. An estimate, not a measurement.`,
    ""
  );
  return lines.join("\n");
}
var READY_MIN_JOBS = 10;
var READY_MIN_RATE = 0.9;
function readiness(rows2) {
  const counted = rows2.filter((r) => r.v === 2 && r.method === 2 && r.measurable !== false && r.grade.verdict !== "ungraded" && !(r.headStart ?? []).length);
  const ops = [...new Set(counted.map((r) => r.operation))].sort();
  if (!ops.length) return ["- Nothing graded yet."];
  return ops.map((op) => {
    const g = counted.filter((r) => r.operation === op);
    const p = g.filter((r) => isPass(r.grade.verdict)).length;
    const rate = p / g.length;
    const lead = avg(g.map((r) => r.lead?.attributedUsd ?? 0)) ?? 0;
    const delegated = (avg(g.map((r) => r.oneCallUsd ?? 0)) ?? 0) + (1 - rate) * lead;
    const state = g.length < READY_MIN_JOBS ? `too few: ${READY_MIN_JOBS - g.length} more graded jobs needed` : rate < READY_MIN_RATE ? "not yet: under nine in ten pass" : delegated >= lead ? "not yet: no cheaper than the lead" : "**ready to take over**";
    return `- ${op}: ${p} of ${g.length} passed (${Math.round(rate * 100)}%); delegated $${delegated.toFixed(2)} a job vs the lead $${lead.toFixed(2)} \u2014 ${state}`;
  });
}
function writeShadowReport(home3, waiting, now = Date.now()) {
  const text2 = shadowReport(readLedger(home3), waiting, now, readShadowAsks(home3));
  fs23.writeFileSync(path23.join(home3, SHADOW_REPORT), text2);
  return text2;
}

// ../host/src/delegation/worker/worktree.ts
import { spawnSync as spawnSync4 } from "node:child_process";
import fs24 from "node:fs";
import path24 from "node:path";
var TEST2 = /\.(test|spec)\.[cm]?[jt]sx?$/;
function linkedWorktrees(repo) {
  const r = spawnSync4("git", ["worktree", "list", "--porcelain"], { cwd: repo, encoding: "utf8", timeout: 1e4, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (r.status !== 0) return [];
  const trees = r.stdout.split("\n").filter((l) => l.startsWith("worktree ")).map((l) => path24.resolve(l.slice("worktree ".length).trim()));
  return trees.filter((t) => !samePath2(t, repo) && fs24.existsSync(t));
}
function samePath2(a, b) {
  const real = (p) => {
    try {
      return fs24.realpathSync.native(p);
    } catch {
      return path24.resolve(p);
    }
  };
  const x = real(a);
  const y = real(b);
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}
function inside3(dir, file) {
  const rel = path24.relative(dir, file);
  return !!rel && !rel.startsWith("..") && !path24.isAbsolute(rel);
}
var isFile = (p) => {
  try {
    return fs24.statSync(p).isFile();
  } catch {
    return false;
  }
};
function changedAt(dir, files) {
  const r = spawnSync4("git", ["status", "--porcelain", "--", ...files], { cwd: dir, encoding: "utf8", timeout: 1e4, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (r.status !== 0) return -1;
  const dirty = r.stdout.split("\n").filter((l) => l.length > 3).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  let at = -1;
  for (const f of dirty) {
    try {
      at = Math.max(at, fs24.statSync(path24.join(dir, f)).mtimeMs);
    } catch {
    }
  }
  return at;
}
function leadTree(repo, files, check) {
  const tests = [...new Set(checkNamedPaths(check).filter((f) => TEST2.test(f)))];
  const lacks = (dir) => tests.filter((t) => !isFile(path24.join(dir, t)));
  const absolute = files.filter((f) => path24.isAbsolute(f)).map((f) => path24.resolve(f));
  const here = lacks(repo);
  if (!tests.length && !absolute.length) return { tree: repo, missing: [] };
  const linked = linkedWorktrees(repo);
  if (!linked.length) return { tree: repo, missing: here };
  const byPath = linked.find((t) => absolute.some((f) => inside3(t, f)));
  if (byPath) return { tree: byPath, missing: lacks(byPath) };
  if (!here.length) {
    let tree = repo;
    let at = changedAt(repo, tests);
    for (const w of linked) {
      const t = lacks(w).length ? -1 : changedAt(w, tests);
      if (t > at) [tree, at] = [w, t];
    }
    return { tree, missing: [] };
  }
  const nowhere = here.filter((t) => linked.every((w) => !isFile(path24.join(w, t))));
  const elsewhere = here.filter((t) => !nowhere.includes(t));
  if (!elsewhere.length) return { tree: repo, missing: nowhere };
  const found = tests.filter((t) => !nowhere.includes(t));
  const holders = linked.filter((w) => found.every((t) => isFile(path24.join(w, t))));
  return holders.length === 1 ? { tree: holders[0], missing: nowhere } : { tree: repo, missing: here };
}

// ../host/src/delegation/worker/start.ts
var UNLABELLED = ["untested-part", "refactor-existing"];
var SECRET_FILE = /(^|\/)\.env(\.[^/]*)?$|\.(pem|key|p12|pfx)$/i;
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function launchDetached(dir) {
  const child = spawn2(process.execPath, [...process.execArgv, process.argv[1], "worker", dir], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}
function alive2(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function heldFiles(home3, root) {
  const held = /* @__PURE__ */ new Map();
  let ids = [];
  try {
    ids = fs25.readdirSync(path25.join(home3, WORKERS_DIR));
  } catch {
    return held;
  }
  for (const id of ids) {
    const dir = jobDir(home3, id);
    const st = readStatus(dir);
    if (!st || st.state !== "running" || !alive2(st.pid)) continue;
    try {
      const spec = readSpec(dir);
      if (path25.resolve(spec.root) === path25.resolve(root)) for (const f of spec.files) held.set(normal(f).toLowerCase(), id);
    } catch {
    }
  }
  return held;
}
function asInt(v) {
  const n2 = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n2) && n2 >= 0 ? n2 : void 0;
}
function resultAnswer(r) {
  const unrun = (r.lines ?? []).filter((l) => l.unexecuted).map((l) => ({ file: l.file, lines: l.unexecuted, of_changed: l.changed }));
  const everyLineRan = !!r.lines && !unrun.length;
  const next = r.verdict === "pass" ? `The check passes and a test reaches every changed code file${everyLineRan ? ", and every changed line ran under the tests" : ""}. A line that ran is not a line that was checked: read the diff as you would a colleague's, then build on it.` : r.verdict === "pass (tested part)" ? [
    "The check passes, but there are parts of the change no test ran, and nobody has reviewed them: the checker's silence is not a review.",
    r.receipt.untested.length ? "No test reaches the untested files below." : "",
    unrun.length ? "The lines in unexecuted_lines sit in tested files but no test ran them: read exactly those lines, or ask for a test that runs them." : ""
  ].filter(Boolean).join(" ") : r.verdict === "lead needed" ? "Take this over. The worker's change is still in the files: finish it yourself, or call worker_result with revert: true to put the files back as they were." : "The worker's step broke before the work was done. Call worker_result with revert: true if the files should go back as they were, then do this yourself or run it again.";
  const choices = untestedChoices(r.receipt.untested);
  return {
    job: r.id,
    state: "done",
    verdict: r.verdict,
    ...r.why ? { why: r.why } : {},
    next,
    worker: r.model,
    level: r.level,
    check: r.check,
    changed: r.changed,
    tested: r.receipt.tested,
    untested: r.receipt.untested,
    ...choices.length ? { choices } : {},
    ...unrun.length ? { unexecuted_lines: unrun } : {},
    ...r.lines ? { lines_checked: r.lines.map((l) => ({ file: l.file, changed: l.changed, not_statements: l.unknown })) } : {},
    ...r.linesNote ? { lines_note: `No per-line receipt: ${r.linesNote}. Only the per-file receipt above stands.` } : {},
    ...r.alsoChanged.length ? { also_changed: r.alsoChanged, also_changed_note: "These paths became dirty in git during the job, outside its list: the worker's commands, or your own work." } : {},
    flags: r.flags.map((f) => ({ rule: f.rule, severity: f.severity, quote: f.quote.slice(0, 300), ask: f.ask })),
    // the signals and the worker's own closing answer are facts from the record for the lead to read (owner, 5 Oct:
    // a record, not a gate); a wrong value inside a correct-looking edit shows in neither, so the diff is still read
    ...r.signals?.length ? { signals: r.signals, signals_note: "What the job's own record says, by rule; no verdict rests on these. Read the diff with them in hand." } : {},
    ...r.probe ? { asked_the_worker: { questions: r.probe.questions, answer: r.probe.answer.length > 3e3 ? `${r.probe.answer.slice(0, 3e3)}
[... more in the job folder]` : r.probe.answer }, asked_note: 'What the worker says it could not verify is reliable; its "none" to what it guessed means nothing.' } : {},
    // a note is the checker pointing at a line without stopping the job: two of the seeded defects that passed the
    // tests were raised only as notes (4 Oct), so they are the lead's reading list, not noise
    ...r.flags.length && (r.verdict === "pass" || r.verdict === "pass (tested part)") ? { look_here: "The checker pointed at the lines in flags without blocking. Read each one before building on the work: a test can run a line without checking what it does." } : {},
    usd: r.usd,
    minutes: r.minutes,
    reworks: r.reworks,
    report: r.report.length > 6e3 ? `${r.report.slice(0, 6e3)}
[... ${r.report.length - 6e3} more characters in the job folder]` : r.report
  };
}
async function startWorker(args, ctx) {
  const repo = sessionRepo(ctx.cwd, ctx.session, ctx.home);
  if (!repo) return { error: "No Nudge project here: run_worker works inside a project that has a .nudge folder." };
  if (!gatewayOn(repo)) {
    return { error: `Gateway workers are off in this project. They send its code to another model vendor through the user's own gateway key, so the user turns them on: an empty file ${path25.join(".nudge", GATEWAY_MARKER)} in the project. Until then hand work to the helpers you can spawn, or keep it.` };
  }
  const key2 = ctx.key ?? gatewayKey();
  if (!key2) return { error: "No gateway key: set NUDGE_GATEWAY_KEY (or AI_GATEWAY_API_KEY) in the environment Claude Code starts from." };
  const brief = typeof args.brief === "string" ? args.brief.trim() : "";
  const check = typeof args.check === "string" ? args.check.trim() : "";
  const named = (Array.isArray(args.files) ? args.files : []).filter((f) => typeof f === "string" && !!f.trim()).map((f) => f.trim());
  const { tree: work, missing } = leadTree(repo, named, check);
  const files = named.map((f) => normal(path25.isAbsolute(f) ? path25.relative(work, f) : f));
  if (brief.length < 80) return { error: "The brief is too short to hand over: say the situation, the piece of work, what good looks like, and the limits." };
  if (!check) return { error: "No check, no delegation: name the command that grades the work (a test command that fails now and passes when the work is done)." };
  if (!files.length) return { error: "Name the files the worker may create or change (repo-relative). It can read everything else and change nothing else." };
  const bad = files.find((f) => f.startsWith("../") || path25.isAbsolute(f) || SECRET_FILE.test(f));
  if (bad) return { error: `${bad} cannot be handed to a worker: it is outside the project or a secrets file.` };
  const present = files.filter((f) => fs25.existsSync(path25.join(work, f)) || fs25.existsSync(path25.join(work, path25.dirname(f))));
  if (!present.length) return { error: `None of the files you named, nor any of their folders, exists in ${work}: ${files.join(", ")}. run_worker works in this session's project; if the work is in another repository, start it from a session open there.` };
  const lines = asInt(args.lines);
  if (lines === void 0) return { error: "Pass lines: your estimate of the lines the worker will change. The decision to hand over depends on the size." };
  const operation = isOperation(args.operation) ? args.operation : "implement-from-spec";
  if (READ_ONLY.has(operation)) return { error: `${operation} is read-only work: hand it to a helper you spawn (ask_delegation names the model). run_worker is for work that changes files and has a check.` };
  const shadow = args.shadow === true || args.shadow === "true";
  if (shadow) {
    if (missing.length && askTests(work, check).length) return { error: `Not shadowed: the check names ${missing.join(", ")}, which does not exist in ${work} or any other checkout of this repository. Write each test before the ask, or take it out of the check; if you work in a git worktree, name the files by their full path there.` };
    const tests = askTests(work, check);
    if (!tests.length) return { error: NO_TEST_FIRST };
    const big = shadowTooBig(lines, files.filter((f) => !tests.includes(f)).length, true);
    if (big) return { error: big };
  }
  if (!shadow) {
    const held = heldFiles(ctx.home, work);
    const clash = files.find((f) => held.has(f.toLowerCase()));
    if (clash) return { error: `${clash} is held by the running job ${held.get(clash.toLowerCase())}: wait for it (worker_result) or leave that file out.` };
  }
  const cfg = gatewayConfig(ctx.home);
  const lead = leadModel(ctx.home, ctx.session, ctx.projectsRoot);
  const asked = typeof args.model === "string" && args.model.trim() ? args.model.trim() : void 0;
  if (asked && isClaudeModel(asked)) return { error: `${asked} is a Claude model: run it as a Claude Code helper on your own plan, not as a gateway worker. Name a non-Claude worker, or spawn the helper.` };
  const book = await rulebookFor(ctx.home);
  const advice = decide({ lead: engineModel(lead, book.prices) ?? lead ?? "unknown", workers: asked ? [asked] : cfg.workers, harness: "gateway", operation, size: { lines, files: files.length }, hasCheck: true, features: UNLABELLED }, book.rules, book.policy, book.prices);
  const base = { session: ctx.session, project: repo, mode: "advise", lead, agent: "gateway-worker", operation, facts: { lines, files: files.length, hasCheck: true }, advice };
  if (!shadow && (advice.decision === "keep" || !advice.worker)) {
    appendHandover(ctx.home, { ...newRecord(base), harness: "gateway", did: { spawned: false }, followed: "yes", done: true });
    return { decision: "keep", say: `Do this yourself; no worker was started. Why: ${advice.why}.` };
  }
  const worker = advice.worker ?? asked ?? cfg.workers[0];
  let tree = null;
  if (shadow) {
    tree = snapshotTree(work, ctx.home, 1e4);
    if (!tree) return { error: `No shadow: ${work} is not a git repository, or git did not answer in 10 seconds. Do the work yourself.` };
  }
  const id = `w_${randomBytes2(6).toString("hex")}`;
  const dir = jobDir(ctx.home, id);
  let ask;
  if (shadow) {
    const a = takeAtAsk(work, dir, files, check);
    if ("error" in a) {
      fs25.rmSync(dir, { recursive: true, force: true });
      return { error: a.error };
    }
    ask = a;
  }
  const p = advice.playbook;
  const spec = {
    id,
    at: (/* @__PURE__ */ new Date()).toISOString(),
    root: shadow ? path25.join(ctx.shadowRoot ?? shadowRoot(), id) : work,
    session: ctx.session ? ctx.session.slice(0, 8) : null,
    lead: lead ?? null,
    model: worker,
    checkerModel: cfg.checker === worker ? FALLBACK_CHECKER : cfg.checker,
    operation,
    lines,
    brief,
    // a shadow's worker never changes the lead's tests-first files: they grade it
    files: ask ? ask.workerFiles : files,
    // a shadow's check runs the job's own test files, not a whole folder, and no whole-tree typecheck (shadow.ts)
    check: ask ? ask.check : check,
    // level 1 (stage check-ins by the lead) is not built: its jobs run as level 2
    level: advice.level === 4 ? 4 : advice.level === 3 ? 3 : 2,
    workerRules: (p?.worker ?? []).map((r2) => r2.text),
    checkerRules: p?.checker ?? [],
    ruleIds: ruleIds(advice),
    why: advice.why,
    maxUsd: cfg.maxUsd,
    // 7 Oct (audit §2b, M4): 15 of about 30 shadow steps ended at the 20-minute wall, mostly waiting on creatos test
    // runs of 120-300 s a file; a shadow gets 50-minute steps inside a two-hour job
    stepMinutes: shadow ? SHADOW_STEP_MINUTES : 20,
    ...shadow ? { wallMinutes: SHADOW_WALL_MINUTES } : {},
    deny: denyList(work),
    ...cfg.endpoint ? { endpoint: cfg.endpoint } : {},
    // `present`: the files the check names as they are now, with the snapshot; the copy is made minutes later, and by
    // then the lead may have created the very test the check runs (7 Oct)
    ...tree && ask ? {
      shadow: {
        repo: work,
        head: tree.head,
        patch: tree.patch ?? null,
        advice: advice.decision,
        present: checkNamesPresent(work, ask.check),
        method: 2,
        tests: ask.tests,
        context: ask.context,
        headStart: ask.headStart,
        dropped: ask.dropped,
        ...pluginVersion() ? { version: pluginVersion() } : {}
      }
    } : {}
  };
  fs25.mkdirSync(dir, { recursive: true });
  fs25.writeFileSync(path25.join(dir, "job.json"), JSON.stringify(spec, null, 2));
  fs25.writeFileSync(path25.join(dir, "status.json"), JSON.stringify({ state: "running", phase: "starting", at: spec.at, pid: process.pid }));
  (ctx.launch ?? launchDetached)(dir);
  if (shadow) {
    return {
      decision: "shadow",
      job: id,
      state: "running",
      worker: spec.model,
      advice: advice.decision,
      say: `Shadow started: ${spec.model} works on the same brief in a copy of the repository, never in your files, and nothing comes back to you. Your failing test${ask.tests.length > 1 ? "s" : ""} as ${ask.tests.length > 1 ? "they are" : "it is"} now (${ask.tests.join(", ")}) grade${ask.tests.length > 1 ? "" : "s"} the worker; leave ${ask.tests.length > 1 ? "them" : "it"} as written. Do the work yourself now, as planned, and commit it with git from this session: your commit is the cross-check. Do not call worker_result for this job.${ask.headStart.length ? ` Note: ${ask.headStart.join(", ")} already had your changes at the ask, so this job is reported apart (a head start).` : ""}`
    };
  }
  const waitMs = ctx.startWaitMs ?? Math.min(asInt(args.wait_seconds) ?? MAX_WAIT_SECONDS, MAX_WAIT_SECONDS) * 1e3;
  const r = await awaitJob(dir, Date.now() + waitMs);
  if (r) return { decision: "delegate", ...r };
  return {
    decision: "delegate",
    job: id,
    state: "running",
    worker: spec.model,
    level: spec.level,
    checker: spec.checkerModel,
    why: advice.why,
    lead_rules: (p?.lead ?? []).map((r2) => r2.text),
    say: `Started ${spec.model} on this, supervision level ${spec.level}${spec.level <= 2 ? " (it reads back first, then works)" : ""}, and it has not ended in the ${Math.round(waitMs / 6e4)} minutes waited. Leave ${files.join(", ")} alone until it ends. Call worker_result once, with job "${id}" and wait_seconds ${MAX_WAIT_SECONDS}: it answers when the job ends. Do not look in between: each look costs the lead a whole re-read of the conversation.`
  };
}
var MAX_WAIT_SECONDS = 1800;
async function awaitJob(dir, untilMs) {
  const id = path25.basename(dir);
  for (; ; ) {
    const r = readResult(dir);
    if (r) return resultAnswer(r);
    const st = readStatus(dir);
    if (st?.state === "error") return { job: id, state: "error", error: st.error ?? "the worker process failed", say: "Call worker_result with revert: true if the files should go back as they were." };
    if (st && st.state === "running" && !alive2(st.pid) && !readResult(dir)) return { job: id, state: "error", error: `the worker process ended without a result (last phase: ${st.phase})`, say: "Call worker_result with revert: true if the files should go back as they were." };
    if (Date.now() >= untilMs) return void 0;
    await sleep(500);
  }
}
async function workerResult(args, ctx) {
  if (!validJobId(args.job)) return { error: "Pass job: the id run_worker returned (w_...)." };
  const dir = jobDir(ctx.home, args.job);
  if (!fs25.existsSync(path25.join(dir, "job.json"))) return { error: `No job ${args.job} on this machine.` };
  const running = () => {
    const st = readStatus(dir);
    return !readResult(dir) && st?.state === "running" && alive2(st.pid);
  };
  if (args.revert === true || args.revert === "true") {
    if (running()) return { error: "The job is still running: wait for it to end before putting the files back." };
    const spec = readSpec(dir);
    const restored = revertJob(dir, spec.root);
    return { job: args.job, reverted: restored, say: restored.length ? `Put back as they were at the job's start: ${restored.join(", ")}.` : "Nothing to put back: the job's files are as they were at its start." };
  }
  const wait = Math.min(Math.max(asInt(args.wait_seconds) ?? 45, 0), MAX_WAIT_SECONDS) * 1e3;
  const r = await awaitJob(dir, Date.now() + wait);
  if (r) return r;
  return { job: args.job, state: "running", phase: readStatus(dir)?.phase ?? "starting", say: `Still working. Call worker_result once more with wait_seconds ${MAX_WAIT_SECONDS}: it answers when the job ends. Each short look costs the lead a whole re-read of the conversation.` };
}
function handoverOf(spec, r) {
  const passed = r.verdict === "pass" || r.verdict === "pass (tested part)";
  return {
    v: 1,
    id: `h_${randomBytes2(6).toString("hex")}`,
    at: spec.at,
    session: spec.session,
    project: spec.root,
    mode: "advise",
    lead: spec.lead,
    agent: "gateway-worker",
    operation: spec.operation,
    lines: spec.lines,
    files: spec.files.length,
    hasCheck: true,
    advice: { decision: "delegate", worker: spec.model, level: spec.level, ruleIds: spec.ruleIds, why: spec.why.slice(0, 400) },
    did: { spawned: true, agent: "gateway-worker", model: spec.model, runs: 1 },
    followed: "yes",
    // "failed" is the step itself breaking (the endpoint, the budget, the wall clock): no answer, so no outcome to
    // count for or against the model (4 Oct: the first real run stopped on the key's spend limit)
    outcome: passed ? "worked" : r.verdict === "failed" ? null : "failed",
    helperUsd: r.usd.worker,
    minutes: r.minutes,
    filesChanged: r.changed.length,
    receipt: r.receipt,
    done: true,
    harness: "gateway",
    job: spec.id,
    verdict: r.verdict,
    checkerUsd: r.usd.checker,
    ...r.signals?.length ? { signals: r.signals.map((s2) => s2.rule) } : {}
  };
}
async function workerMain(dir, home3) {
  if (!dir || !fs25.existsSync(path25.join(dir, "job.json"))) return;
  const fail = (error) => {
    try {
      fs25.writeFileSync(path25.join(dir, "status.json"), JSON.stringify({ state: "error", phase: "error", at: (/* @__PURE__ */ new Date()).toISOString(), pid: process.pid, error }));
    } catch {
    }
  };
  try {
    const spec = readSpec(dir);
    const key2 = gatewayKey();
    if (!key2) return fail("no gateway key in this process's environment");
    let copy;
    let locked = false;
    try {
      if (spec.shadow) {
        locked = await waitForRunLock(home3, dir, spec.id);
        if (!locked) return fail("harness-limited: waited six hours behind other shadow jobs on this machine");
        try {
          fs25.writeFileSync(path25.join(dir, "status.json"), JSON.stringify({ state: "running", phase: "making the copy", at: (/* @__PURE__ */ new Date()).toISOString(), pid: process.pid }));
        } catch {
        }
        copy = prepareShadowCopy(dir, spec, home3);
      }
      const result = await runJob(dir, {
        agent: runAgent,
        checker: runChecker,
        runCheck: (root, command) => runShell(root, command, 6e5, { ...process.env, CI: "1", NO_COLOR: "1" }),
        receipt: (root, files) => receipt(root, files),
        coverage: (root, check, files, outDir) => runCoverage(root, check, files, outDir, (r, c) => runShell(r, c, 6e5, { ...process.env, CI: "1", NO_COLOR: "1" })),
        key: key2,
        probe: true
      });
      if (copy) {
        saveShadowDiff(dir, copy);
        if (!result.why?.startsWith(NOT_MEASURABLE)) {
          const statusFile = path25.join(dir, "status.json");
          let finalStatus = null;
          try {
            finalStatus = fs25.readFileSync(statusFile, "utf8");
            fs25.writeFileSync(statusFile, JSON.stringify({ state: "running", phase: "the primary grade", at: (/* @__PURE__ */ new Date()).toISOString(), pid: process.pid }));
          } catch {
          }
          const g = await primaryGrade(dir, spec, copy, {
            run: (root, command) => runShell(root, command, 9e5, { ...process.env, CI: "1", NO_COLOR: "1" }),
            tscLines: (c) => tscErrorLines(c),
            putBack: putBackOutside,
            changed: (c) => changedFiles(c.dir, c.base)
          });
          if (g) fs25.writeFileSync(path25.join(dir, PRIMARY_FILE), JSON.stringify(g, null, 2));
          if (finalStatus) fs25.writeFileSync(statusFile, finalStatus);
        }
      } else recordGatewayHandover(home3, handoverOf(spec, result));
    } finally {
      if (locked) releaseRunLock(home3);
    }
  } catch (e) {
    fail(e.message.slice(0, 600));
  }
}
function pluginVersion(script = process.argv[1] ?? "") {
  return /[\\/](\d+\.\d+\.\d+)[\\/]/.exec(script)?.[1] ?? null;
}
var SHADOW_STEP_MINUTES = 50;
var SHADOW_WALL_MINUTES = 120;

// ../host/src/delegation/mcp.ts
var home = () => process.env.NUDGE_HOME || path26.join(os7.homedir(), ".nudge");
var DELEGATION_TOOLS = [
  {
    name: "ask_delegation",
    title: "What the record says about handing this work down",
    description: "Call before spawning a helper agent, then record_plan, then spawn: where the guard is on, a spawn with no plan is refused. Where shadow mode is on, write the failing test first, then give it brief, files (the list) and check as well: this one call then starts the shadow, and you do the work yourself. Name the operation the helper will do, and the delegation API returns the cheapest model proven on it (at least 5 passes, 0 failures) with the ladder behind it. With no model proven it advises nothing and the helper stays on your own model; advice is never above your own model. Also returns this machine's record for the helper type, as data only: the advice is the API's.",
    inputSchema: {
      type: "object",
      properties: {
        agent_type: { type: "string", description: 'The helper type you would spawn: "general-purpose", "Explore", "Plan"\u2026' },
        operation: {
          type: "string",
          enum: [...OPERATIONS],
          description: "What the helper will do, at the level a model does well with a normal brief. The answer is on the page: transform-by-rule, locate-definition, list-from-registry, answer-code-question, explain-named-code, test-named-branches, implement-from-spec, change-one-function, add-config-entry, fix-compiler-listed, copy-existing-pattern, rename-in-one-file, research-note, fact-check-doc, place-given-content, fix-many-sites. The answer must be worked out: diagnose-from-symptoms, trace-across-files, pin-algorithm-behaviour, debug-unknown-causes, change-protected-behaviour. Else other."
        },
        task: { type: "string", description: `Optional coarse kind of work: one of ${[...TASK_KINDS].join(", ")}` },
        lines: { type: "integer", description: "Optional: your estimate of the lines the helper will change." },
        files: {
          type: ["integer", "array"],
          items: { type: "string" },
          description: "Optional: how many files the helper will change, or the list of repo-relative files itself. Where shadow mode is on, give the list, with brief and check: this call then starts the shadow. Include your failing test file in the list; the worker may not change it. A list holding a test file that check runs counts as the test written first, which can send the job to a Haiku helper on the user's own plan."
        },
        has_check: { type: "boolean", description: "Optional: true when a test or other check exists that can grade the work." },
        brief: { type: "string", description: "Where shadow mode is on: the brief as you would write it for a worker (situation, the piece, what good looks like, limits). With files (the list) and check, this call starts the shadow; no run_worker call. Tests first: before this call, write the test that fails now on an assertion and passes when the work is done, and name it in files and in check; it is taken as it is at this call and grades the worker. One piece per ask: at most 400 lines and 6 code files; split bigger work, one ask and one test per piece." },
        check: { type: "string", description: "Where shadow mode is on: the command that runs your failing test file(s), from the project root, e.g. `npx vitest run tests/x.test.ts`. Name the test files, not a folder. Leave the whole-tree typecheck out: the harness compares typecheck errors before and after in the job's files itself." }
      },
      required: ["agent_type"],
      additionalProperties: false
    }
  },
  {
    name: "record_plan",
    title: "Say what you are about to delegate, and why",
    description: 'Call after ask_delegation and before spawning: the helper type, the model you will pass, the operation, and one line of why. Where the guard is on, a spawn with no plan for its helper type in the last 10 minutes of this session is refused; one plan covers a batch of that helper type in those 10 minutes. When the API has a proven model for the operation, a spawn on a dearer model is refused unless the reason starts "override:" and says why; the override is recorded.',
    inputSchema: {
      type: "object",
      properties: {
        agent_type: { type: "string" },
        model: { type: "string", description: '"haiku", "sonnet", "opus" or "fable"' },
        operation: { type: "string", enum: [...OPERATIONS], description: "The operation you named to ask_delegation." },
        reason: { type: "string", description: 'One line. Not the task itself \u2014 why this model for it. Start it with "override:" to run above the proven model, and say why.' }
      },
      required: ["agent_type", "model"],
      additionalProperties: false
    }
  },
  {
    name: "handover_receipt",
    title: "Which files a helper changed that no test reaches",
    description: "Call when a helper returns, before building on its work. Give the files it changed (or nothing: then the project's uncommitted changes are used). Returns which changed code files a test in the repo imports or names (tested) and which none does (untested), and for untested files the three choices: read those lines yourself, ask for a test, or keep that part.",
    inputSchema: {
      type: "object",
      properties: {
        files: { type: "array", items: { type: "string" }, description: "The files the helper changed, repo-relative or absolute. Omit to use git status." }
      },
      additionalProperties: false
    }
  },
  {
    name: "run_worker",
    title: "Hand a piece of work with a check to a gateway worker",
    description: "Runs a model from another vendor as a worker in this project, through the user's own gateway key, when ask_delegation's handover names a gateway worker. Only in projects where the user has turned gateway workers on. Give the brief (situation, the piece, what good looks like, limits), the files it may create or change (it can read the rest and change nothing else), and the check: a command that fails now and passes when the work is done. Nudge decides first: on keep it starts nothing and says why. On delegate it runs the job and waits for it, up to wait_seconds (default and most 1800; jobs took 5 to 30 minutes), then returns the verdict, the check's result, the files changed and the receipt in this same call: one call, no looking. Carry on only if it returns a job id (the wait ran out): then call worker_result once with wait_seconds 1800. run_worker is for real handovers: where shadow mode is on, write the failing test first and give ask_delegation the brief, files and check, and it starts the shadow itself. shadow: true still works here: it returns at once and the worker runs in a copy of the repository while you do the work yourself; nothing comes back. A shadow needs a test written first: the check must name a test file that exists and fails now; that test, as it is at the call, grades the worker, and your commit is the cross-check.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "The whole brief the worker gets. It has no other context: name the files to read, the behaviour wanted, and the limits. State behaviour, never the implementation." },
        files: { type: "array", items: { type: "string" }, description: "Repo-relative files the worker may create or change." },
        check: { type: "string", description: "The command that grades the work, run from the project root: the typecheck and the named test files joined with &&. Include the typecheck: tests alone caught 2 of 12 planted defects, and a typecheck refuses what a test never runs. In shadow mode, the test files only: the harness compares the typecheck itself." },
        lines: { type: "integer", description: "Your estimate of the lines the worker will change." },
        operation: { type: "string", enum: [...OPERATIONS], description: "The operation, as you named it to ask_delegation. Default implement-from-spec." },
        model: { type: "string", description: "Optional: a gateway model id to use instead of the cheapest configured worker." },
        wait_seconds: { type: "integer", description: "How long this call waits for the job to end before returning a job id instead: 0 to 1800, default 1800. Leave it at the default." },
        shadow: { type: "boolean", description: "true: shadow mode. The call returns at once; the worker runs on the same brief in a copy of the repository, never in your files, and nothing comes back. You do the work yourself as planned and commit it. Only when ask_delegation's handover says shadow mode is on." }
      },
      required: ["brief", "check"],
      additionalProperties: false
    }
  },
  {
    name: "worker_result",
    title: "The verdict of a gateway worker's job",
    description: "Only when run_worker returned a job id instead of a result (its wait ran out). Call with that job id. Waits up to wait_seconds (default 45, at most 1800) for the job to end: call it once with a long wait instead of looking several times, since each look re-reads your whole conversation, then returns the verdict (pass, pass (tested part), lead needed, failed), the check's result, the files changed, which of them no test reaches, the changed lines no test ran (where the check runs Vitest and the project has a coverage provider), the checker's flags, what the job's own record says by rule (signals: a listed file left untouched, a failed edit, a file created, line endings rewritten), the worker's own answer to what it could not verify and what it guessed, the cost and the worker's report. If the wait runs out it says the job is still running. With revert: true it puts the job's files back as they were at its start.",
    inputSchema: {
      type: "object",
      properties: {
        job: { type: "string", description: "The job id (w_...)." },
        wait_seconds: { type: "integer", description: "How long to wait for the job to end: 0 to 1800, default 45. Pass 1800 and carry on with other work." },
        revert: { type: "boolean", description: "true: put the job's files back as they were at its start (only once the job has ended)." }
      },
      required: ["job"],
      additionalProperties: false
    }
  }
];
function porcelainFiles(out) {
  const files = [];
  for (const line of out.split("\n")) {
    if (line.length < 4) continue;
    let p = line.slice(3).trim();
    if (p.includes(" -> ")) p = p.split(" -> ").pop();
    p = p.replace(/^"(.*)"$/, "$1");
    if (p) files.push(p);
    if (files.length >= 500) break;
  }
  return files;
}
function git4(cwd, args) {
  try {
    return execFileSync3("git", args, { cwd, encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  } catch {
    return void 0;
  }
}
function readLocal() {
  try {
    const o = JSON.parse(fs26.readFileSync(path26.join(home(), "delegation.json"), "utf8"));
    return { cells: Array.isArray(o?.cells) ? o.cells : [], tasks: Array.isArray(o?.tasks) ? o.tasks : [] };
  } catch {
    return { cells: [], tasks: [] };
  }
}
function readShared() {
  try {
    const r = readSharedReference(fs26.readFileSync(path26.join(home(), "shared-reference.json"), "utf8"));
    return r ? { cells: r.cells, tasks: r.tasks, machines: r.machines } : { cells: [], tasks: [], machines: 0 };
  } catch {
    return { cells: [], tasks: [], machines: 0 };
  }
}
function delegationHandlers(opts = {}) {
  const projectsRoot = opts.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  const cwd = opts.cwd ?? (() => process.cwd());
  return {
    async ask_delegation(args) {
      const answer = await askDelegation(args);
      try {
        const raw = args;
        const facts = readFacts(raw);
        const session = process.env.CLAUDE_CODE_SESSION_ID || void 0;
        const repo = sessionRepo(cwd(), session, home());
        const mode = handoverMode(home(), repo);
        const shadow = mode === "advise" && shadowOn(repo) && !!gatewayKey();
        let advice;
        let started;
        let refused;
        if (anyFact(facts)) {
          const operation = isOperation(args.operation) ? args.operation : "other";
          const lead = leadModel(home(), session, projectsRoot);
          const gateway = mode === "advise" && gatewayOn(repo) && gatewayKey() ? gatewayConfig(home()).workers : void 0;
          const book = await rulebookFor(home());
          advice = adviseHandover({ lead, operation, facts, book, ...gateway ? { gateway } : {} }).advice;
          const rec = newRecord({ session, project: repo, mode, lead, agent: String(args.agent_type), operation, facts, advice });
          if (shadow && !READ_ONLY.has(operation)) {
            const material = typeof raw.brief === "string" && !!raw.brief.trim() && typeof raw.check === "string" && !!raw.check.trim() && Array.isArray(raw.files) && raw.files.length > 0;
            if (material) {
              const r = await startWorker(
                { brief: raw.brief, files: raw.files, check: raw.check, lines: raw.lines, operation: isOperation(args.operation) ? args.operation : void 0, shadow: true },
                { home: home(), cwd: cwd(), session, projectsRoot, ...opts.worker }
              );
              if (typeof r.job === "string") started = { job: r.job, worker: String(r.worker) };
              else refused = String(r.error ?? "run_worker's checks refused it.");
            }
            appendHandover(home(), { ...rec, shadow: true, done: true, shadowMethod: 2, shadowStart: started ? "started" : refused ? "refused" : "missing", ...started ? { job: started.job } : {}, ...refused ? { shadowWhy: refused.slice(0, 400) } : {} });
          } else appendHandover(home(), shadow ? { ...rec, shadow: true, done: true } : rec);
        }
        if (mode === "advise") return { ...answer, handover: adviseAnswer(advice, facts, { shadow, ...isOperation(args.operation) ? { operation: args.operation } : {}, ...started ? { started } : {}, ...refused ? { refused } : {} }) };
      } catch {
      }
      return answer;
    },
    async handover_receipt(args) {
      const raw = args.files;
      const given = Array.isArray(raw) ? raw.filter((f) => typeof f === "string" && !!f.trim()) : [];
      const session = process.env.CLAUDE_CODE_SESSION_ID || void 0;
      const here = cwd();
      const top = git4(here, ["rev-parse", "--show-toplevel"])?.trim();
      const root = top && path26.resolve(top) || sessionRepo(here, session, home()) || here;
      let files = given;
      let from = "the files you gave";
      if (!given.length) {
        const status = top ? git4(root, ["status", "--porcelain=v1", "-uall"]) : void 0;
        if (status === void 0) return { error: "No files given, and git status could not be read here: pass the files the helper changed." };
        files = porcelainFiles(status);
        from = "git status (uncommitted changes)";
      }
      const r = receipt(root, files);
      const choices = untestedChoices(r.untested);
      return {
        project: path26.basename(root),
        from,
        tested: r.tested,
        untested: r.untested,
        ...choices.length ? { choices } : {},
        note: r.tested.length + r.untested.length ? "Tested means a test file in the repo imports the file by a relative path or names its path; it does not mean the test covers the lines that changed." : "No changed code files (tests, docs and config are not counted)."
      };
    },
    async record_plan(args) {
      return recordPlan(args, cwd());
    },
    async run_worker(args) {
      return startWorker(args, { home: home(), cwd: cwd(), session: process.env.CLAUDE_CODE_SESSION_ID || void 0, projectsRoot });
    },
    async worker_result(args) {
      return workerResult(args, { home: home() });
    }
  };
}
async function askDelegation(args) {
  const agentType = args.agent_type;
  const local = readLocal();
  const shared = readShared();
  const known = byTier(
    local.cells.filter((c) => c.agent === agentType),
    shared.cells.filter((c) => c.agent === agentType)
  );
  const task = args.task && TASK_KINDS.includes(args.task) ? args.task : void 0;
  const taskRow = task ? [...local.tasks, ...shared.tasks].find((t) => t.task === task && t.runs >= MIN_RUNS_TO_ADVISE) : void 0;
  const operation = isOperation(args.operation) ? args.operation : void 0;
  const api = operation ? await adviceFor(home(), operation) : void 0;
  const learned = operation ? readKinds(home()).filter((k3) => k3.operation === operation) : [];
  const sides = learned.flatMap((k3) => [`${k3.operation}~${k3.key}`, `${k3.operation}~not-${k3.key}`]);
  const kinds = await Promise.all(sides.map(async (kind) => ({ kind, api: await adviceFor(home(), kind) })));
  return {
    agent_type: agentType,
    ...operation && api ? {
      operation: {
        name: operation,
        advised_model: api.advice?.model ?? null,
        why: !api.advice ? "no advice: the delegation API is not configured or not reachable, and nothing is cached" : api.advice.model ? `${api.advice.model} is the cheapest model proven on ${operation}` : `no model is proven on ${operation} yet: keep the helper on the model you are running (pass no model, and it inherits yours)`,
        ladder: (api.advice?.ladder ?? []).map((r) => ({ model: r.model, runs: r.runs, passes: r.passes, failures: r.failures, proven: r.proven, median_usd: r.medianUsd })),
        from: api.from,
        ...api.from === "cache" ? { cached_at: api.fetchedAt } : {},
        ...kinds.length ? {
          learned_kinds: kinds.map((k3) => ({ kind: k3.kind, advised_model: k3.api.advice?.model ?? null })),
          learned_note: "This operation has split by shape (learned from nightly replays). The spawn gate reads your brief and applies the advice for the side it falls on."
        } : {}
      }
    } : {},
    record: known.map((k3) => ({ model: k3.tier, runs: k3.runs, ended_in_failure: Math.round(k3.failedShare * 100) / 100, taken_back_over: Math.round(k3.takenOverShare * 100) / 100, source: k3.source })),
    ...taskRow ? { task: { kind: taskRow.task, runs: taskRow.runs, ended_in_failure: taskRow.failedShare, taken_back_over: taskRow.takenOverShare } } : {},
    team_machines: shared.machines,
    note: known.length ? "The record is data, not advice: the only advice is operation.advised_model, from the delegation API. Rates are shares of runs, 0\u20131, on at least five runs each. Your own record is listed before the team's." : "No record with five or more runs for this helper type yet. Choose, and say why in your report."
  };
}
function recordPlan(args, cwd) {
  const session = process.env.CLAUDE_CODE_SESSION_ID || void 0;
  const repo = sessionRepo(cwd, session, home());
  const entry = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    source: "plan",
    ...session ? { session } : {},
    agent: args.agent_type,
    model: args.model,
    ...isOperation(args.operation) ? { operation: args.operation } : {},
    ...repo ? { repo } : {},
    ...args.reason ? { reason: args.reason.slice(0, 200) } : {}
  };
  try {
    fs26.mkdirSync(home(), { recursive: true });
    fs26.appendFileSync(path26.join(home(), "spawns.jsonl"), `${JSON.stringify(entry)}
`);
  } catch {
    return "Could not record the plan; go ahead anyway.";
  }
  return `Recorded: ${args.agent_type} on ${args.model}. Spawn now: this plan covers ${args.agent_type} helpers for the next 10 minutes. Nudge will compare it with the spawn and with your report.`;
}
function runDelegationMcp(version) {
  createStdioMcp(DELEGATION_TOOLS, delegationHandlers(), { stdin: process.stdin, stdout: process.stdout }, {
    name: "nudge-delegation",
    ...version ? { version } : {},
    instructions: `Before spawning a helper agent, call ask_delegation with the helper type and the operation the helper will do, and read the advised model. Then call record_plan with the model you will pass, the same operation, and one line of why. Then spawn, passing model explicitly. Where the guard is on, a spawn with no plan is refused, and so is one above a proven model unless the plan's reason starts "override:". When ask_delegation's handover names a gateway worker (tool: run_worker), do not spawn an Agent for it: call run_worker once with the brief, the files and the check; it waits for the job and returns the result in the same call, and only if it returns a job id do you call worker_result, once, with wait_seconds 1800. Where shadow mode is on, write the failing test first (it fails now on an assertion and passes when the work is done), then give ask_delegation the brief, the files (the list, with the test in it) and the check (the command that runs that test file, no whole-tree typecheck) in the same call: it starts the shadow itself, and that test as it is at the call grades the worker; then do the work yourself, leave the test as written, commit with git from this session, and call nothing else for it (no run_worker, no worker_result). run_worker is for real handovers.`
  });
}

// ../host/src/delegation/observe.ts
import { randomBytes as randomBytes3 } from "node:crypto";
import fs28 from "node:fs";
import os8 from "node:os";
import path28 from "node:path";

// ../host/src/delegation/claims.ts
var WINDOW_SLACK_MS = 5 * 60 * 1e3;
var UNKNOWN = /^(unknown|n\/?a|tbd|-{1,2})$/i;
function parseDelegationClaim(raw) {
  const text2 = (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (!text2 || UNKNOWN.test(text2)) return { kind: "unclear" };
  if (/^(none|no|zero|0)\b/i.test(text2)) return { kind: "none" };
  const m = /^(\d{1,3})\b/.exec(text2);
  if (!m) return { kind: "unclear" };
  const n2 = Number(m[1]);
  const byModel = {};
  const paren = /\(([^)]*)\)/.exec(text2);
  if (paren) {
    for (const part of paren[1].split(",")) {
      const pm = /(\d{1,3})\s+([a-z][a-z0-9-]*)/i.exec(part.trim());
      if (pm) byModel[pm[2].toLowerCase()] = (byModel[pm[2].toLowerCase()] ?? 0) + Number(pm[1]);
    }
  }
  const kept = /(\d{1,3})\s+kept\b/i.exec(text2);
  return { kind: "count", n: n2, ...Object.keys(byModel).length ? { byModel } : {}, ...kept ? { kept: Number(kept[1]) } : {} };
}
function readSpawns(text2) {
  const out = [];
  for (const line of text2.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (typeof e.at === "string" && typeof e.agent === "string" && e.decision !== "deny") out.push(e);
    } catch {
    }
  }
  return out;
}
var shortModel2 = (m) => (m ?? "").toLowerCase().replace(/^claude-/, "").replace(/-\d.*$/, "");
function planCheck(spawns, claim) {
  const calls = spawns.filter((s2) => s2.source !== "plan");
  const declared = spawns.filter((s2) => s2.source === "plan").length;
  const advisedButKept = calls.filter((s2) => s2.advised && (!s2.requested || shortModel2(s2.requested) !== shortModel2(s2.advised))).length;
  let reportVsSpawns = "not_compared";
  if (claim?.kind === "count" && claim.byModel && calls.length) {
    const seen = {};
    for (const c of calls) {
      const m = shortModel2(c.requested) || "inherited";
      seen[m] = (seen[m] ?? 0) + 1;
    }
    reportVsSpawns = Object.entries(claim.byModel).every(([m, n2]) => (seen[m] ?? 0) >= n2) ? "agrees" : "differs";
  }
  return { spawns: calls.length, declared, advisedButKept, reportVsSpawns };
}
var RANK = ["haiku", "sonnet", "opus", "fable"];
var rank = (m) => RANK.findIndex((t) => m.includes(t));
function loopMeasure(spawns, notes) {
  const calls = spawns.filter((s2) => s2.source !== "plan" && typeof s2.session === "string" && s2.session);
  if (!calls.length) return void 0;
  const since = calls.map((c) => c.at).sort()[0];
  const advisedCalls = calls.filter((c) => c.advised);
  const followed = advisedCalls.filter((c) => {
    const want = rank(shortModel2(c.advised));
    const got = rank(shortModel2(c.requested));
    return got >= 0 && got <= want;
  }).length;
  const sessions = [...new Set(calls.map((c) => c.session))];
  let acknowledged = 0;
  let agrees = 0;
  let differs = 0;
  for (const s2 of sessions) {
    const lines = notes.get(s2) ?? [];
    if (!lines.length) continue;
    acknowledged++;
    let n2 = 0;
    const byModel = {};
    for (const line of lines) {
      const c = parseDelegationClaim(line);
      if (c.kind !== "count") continue;
      n2 += c.n;
      for (const [m, k3] of Object.entries(c.byModel ?? {})) byModel[m] = (byModel[m] ?? 0) + k3;
    }
    const verdict = planCheck(calls.filter((c) => c.session === s2), n2 ? { kind: "count", n: n2, ...Object.keys(byModel).length ? { byModel } : {} } : void 0).reportVsSpawns;
    if (verdict === "agrees") agrees++;
    else if (verdict === "differs") differs++;
  }
  const declared = spawns.filter((s2) => s2.source === "plan" && s2.at >= since).length;
  return { since, spawns: calls.length, sessions: sessions.length, advised: advisedCalls.length, followed, declared, acknowledged, agrees, differs };
}

// ../host/src/delegation/direction.ts
var MAX_CHARS = 700;
var MAX_CELLS = 2;
var MAX_TASKS = 2;
var TASK_FAILED_SHARE = 0.5;
function notable(c) {
  return c.runs >= MIN_RUNS_TO_ADVISE && (c.failedShare >= 0.15 || c.failuresPerRun >= 1 || c.routineShare >= 0.3);
}
var severity = (c) => c.failedShare * 100 + c.failuresPerRun * 10 + c.routineShare;
function worstTasks(tasks) {
  return tasks.filter((t) => t.runs >= MIN_RUNS_TO_ADVISE && t.failedShare >= TASK_FAILED_SHARE && t.task !== "other").sort((a, b) => b.failedShare - a.failedShare || b.runs - a.runs).slice(0, MAX_TASKS).map((t) => `${t.task} (${t.runs} runs, ${Math.round(t.failedShare * 100)}% went wrong)`);
}
function directionFor(cells, tasks = []) {
  const worth = cells.filter(notable).sort((a, b) => severity(b) - severity(a)).slice(0, MAX_CELLS);
  const risky = worstTasks(tasks);
  if (!worth.length && !risky.length) return "";
  const facts = worth.map((c) => {
    const bits = [];
    if (c.failedShare > 0) bits.push(`${Math.round(c.failedShare * 100)}% ended in failure`);
    if (c.failuresPerRun >= 1) bits.push(`${c.failuresPerRun} errors along the way per run`);
    if (c.routineShare >= 0.3) bits.push(`${Math.round(c.routineShare * 100)}% of its turns were reads or searches`);
    return `${c.agent} on ${c.model.replace(/^claude-/, "")} (${c.runs} runs: ${bits.join(", ")})`;
  });
  const required = [
    `Nudge, delegation: hand reading, searching and read-only shell to a helper agent on the cheapest model that can do it, and keep edits and judgement in this conversation. Before each helper, ask Nudge which model: call ask_delegation with the operation the helper will do, then record_plan, then spawn with the model it advises. Where the guard is on, a spawn with no plan is refused, and so is one above a proven model unless the plan's reason starts "override:".`,
    // 1 Oct, measured on this machine (docs/MEASURE-determinism-timebox-2026-10-01.md): Haiku went from 13% to 36% of
    // past commits passing when the brief named what the check would call; nothing else moved it
    "A brief for a cheap helper names the files to change and the exact symbols its check will call, and says how it will be checked; a helper told only what to do, not what the check expects, fails most of the time.",
    "Say in your report what you delegated and what you kept \u2014 Nudge compares it with the transcripts, so a plain count is worth more than a summary."
  ];
  const optional = [];
  if (risky.length) optional.push(`Handed-down work that went wrong most often here: ${risky.join("; ")} \u2014 check a helper's result on these before building on it, and do it yourself if it comes back thin.`);
  if (facts.length) optional.push(`This machine's record by helper: ${facts.join("; ")}.`);
  const kept = [...required];
  for (const part of optional) {
    if ([...kept, part].join(" ").length <= MAX_CHARS) kept.push(part);
  }
  return [kept[0], ...kept.slice(2), kept[1]].join(" ");
}

// ../host/src/delegation/report.ts
import fs27 from "node:fs";
import path27 from "node:path";
var SENT_FILE = "handovers-sent.json";
var MAX_PER_PASS = 40;
var MAX_SENT_KEPT = 5e3;
var TIMEOUT_MS = 1e4;
var MODEL = /^[A-Za-z0-9._:@/-]{1,80}$/;
function reportOf(rec, prices) {
  if (!rec.done || !rec.did?.spawned || !rec.outcome || rec.lines === null || !isOperation(rec.operation)) return void 0;
  const lead = engineModel(rec.lead, prices) ?? rec.lead;
  const gateway = rec.harness === "gateway";
  const worker = gateway ? rec.did.model : engineModel(rec.did.model, prices) ?? rec.did.model;
  if (!lead || !worker || !MODEL.test(lead) || !MODEL.test(worker)) return void 0;
  const untested = (rec.receipt?.untested.length ?? 0) > 0;
  const verdict = rec.outcome !== "worked" ? "fail" : gateway ? rec.verdict === "pass" ? "pass" : "unverified-part" : untested ? "unverified-part" : "pass";
  const followed = rec.followed === "yes";
  const adviceWorker = rec.advice.worker && MODEL.test(rec.advice.worker) ? rec.advice.worker : null;
  const level = rec.advice.level === 1 || rec.advice.level === 2 || rec.advice.level === 3 || rec.advice.level === 4 ? rec.advice.level : null;
  return {
    id: rec.id,
    handover: {
      lead,
      workers: [worker],
      harness: gateway ? "gateway" : "claude-code",
      operation: rec.operation,
      size: { lines: rec.lines, files: rec.files ?? 1 },
      hasCheck: rec.hasCheck ?? false,
      features: gateway ? ["refactor-existing", "untested-part"] : [],
      decision: rec.advice.decision,
      worker: adviceWorker,
      level
    },
    outcome: {
      followed,
      worker,
      verdict,
      level: followed ? level : null,
      // the lead took the work back: a helper it redid, or a gateway job that ended "lead needed"
      takeover: rec.outcome === "taken_over" || gateway && rec.outcome === "failed",
      usd: { worker: rec.helperUsd, checker: rec.checkerUsd ?? null, ...typeof rec.leadUsd === "number" ? { lead: rec.leadUsd } : {} },
      minutes: rec.minutes,
      // the rules count for or against themselves only where the advice was followed
      rules: followed && rec.advice.decision === "delegate" ? rec.advice.ruleIds : []
    }
  };
}
function readSent(home3) {
  try {
    const v = JSON.parse(fs27.readFileSync(path27.join(home3, SENT_FILE), "utf8"));
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeSent(home3, ids) {
  try {
    const file = path27.join(home3, SENT_FILE);
    const tmp = `${file}.${process.pid}.tmp`;
    fs27.writeFileSync(tmp, JSON.stringify(ids.slice(-MAX_SENT_KEPT)));
    fs27.renameSync(tmp, file);
  } catch {
  }
}
async function sendReports(home3, fetchImpl = fetch, prices) {
  const cfg = apiConfig(home3);
  if (!cfg) return "not_configured";
  const tally = { sent: 0, refused: 0, failed: 0 };
  try {
    const sent = readSent(home3);
    const done = new Set(sent);
    const waiting = readHandovers(home3).filter((r) => !done.has(r.id) && !(r.harness === "gateway" && r.leadUsd === void 0)).map((r) => ({ id: r.id, body: reportOf(r, prices) })).filter((r) => r.body).slice(0, MAX_PER_PASS);
    for (const w of waiting) {
      try {
        const r = await fetchImpl(`${cfg.url}/v1/reports`, {
          method: "POST",
          headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
          body: JSON.stringify(w.body),
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        if (r.ok) tally.sent++;
        else if (r.status === 400) tally.refused++;
        else {
          tally.failed++;
          break;
        }
        sent.push(w.id);
      } catch {
        tally.failed++;
        break;
      }
    }
    if (tally.sent || tally.refused) writeSent(home3, sent);
  } catch {
  }
  return tally;
}

// ../host/src/delegation/observe.ts
var DELEGATION_FILE = "delegation.json";
var STATE_FILE = "delegation-state.json";
var MIN_RUNS2 = 5;
var MIN_SAVING_USD = 1;
var round22 = (n2) => Math.round(n2 * 100) / 100;
function readState(home3) {
  try {
    const parsed = JSON.parse(fs28.readFileSync(path28.join(home3, STATE_FILE), "utf8"));
    if (parsed.version === 3 && parsed.seen && typeof parsed.seen === "object") return parsed;
  } catch {
  }
  return { version: 3, seen: {} };
}
function writeAtomic(at, body) {
  const tmp = `${at}.tmp`;
  fs28.writeFileSync(tmp, body);
  fs28.renameSync(tmp, at);
}
function observationLine(o) {
  if (o.runs < MIN_RUNS2 || o.savingUsd < MIN_SAVING_USD) return "";
  const share = o.usd > 0 ? Math.round(o.savingUsd / o.usd * 100) : 0;
  return `Delegation: ${o.runs.toLocaleString("en-US")} runs handed to helper agents across every project on this machine. ${o.routineSteps.toLocaleString("en-US")} of their ${o.steps.toLocaleString("en-US")} turns were reads, searches and read-only shell; at one model tier down those would have used about ${share}% less.`;
}
async function observeDelegation(opts = {}) {
  const home3 = opts.home ?? process.env.NUDGE_HOME ?? path28.join(os8.homedir(), ".nudge");
  const projectsRoot = opts.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  const prices = opts.prices ?? createPriceTable(loadPrices(home3));
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const state = readState(home3);
  const parents = /* @__PURE__ */ new Map();
  let newFiles = 0;
  let skipped = 0;
  const outbox = state.outbox ?? { pending: {}, sent: [] };
  state.outbox = outbox;
  const recording = !opts.skipApi && !!apiConfig(home3);
  const spawnLog = recording ? readSpawnLog(home3) : [];
  const usedSpawns = /* @__PURE__ */ new Set();
  const machine = recording ? machineId(home3) : void 0;
  let handoverSessions = /* @__PURE__ */ new Set();
  try {
    handoverSessions = openSessions(home3);
  } catch {
  }
  for (const file of findHelperFiles(projectsRoot)) {
    let bytes;
    try {
      bytes = fs28.statSync(file).size;
    } catch {
      continue;
    }
    if (state.seen[file]?.bytes === bytes) {
      skipped++;
      continue;
    }
    try {
      const run2 = await helperRunFromFile(file, prices);
      if (!run2) {
        state.seen[file] = { bytes, usd: 0, couldHaveUsd: 0, steps: 0, routineSteps: 0, model: "", agent: "", failures: 0 };
        newFiles++;
        continue;
      }
      const scan = await scanTranscript(file);
      const parentFile = parentTranscriptFor(file);
      let parent = parentFile ? parents.get(parentFile) : void 0;
      if (parentFile && !parent) {
        parent = await scanTranscript(parentFile);
        parents.set(parentFile, parent);
      }
      const result = classifyHelper({ agentId: run2.id, agent: run2.agent, model: run2.model, scan }, parent);
      state.seen[file] = {
        bytes,
        usd: run2.usd,
        couldHaveUsd: run2.couldHaveUsd,
        steps: run2.steps,
        routineSteps: run2.routineSteps,
        model: run2.model,
        agent: run2.agent || "unknown",
        failures: run2.failures ?? 0,
        outcome: result.outcome,
        task: taskKind(scan),
        ...handoverSessions.has(run2.sessionId.slice(0, 8)) ? { link: { session: run2.sessionId, start: run2.at, end: run2.endedAt ?? null, edited: [...scan.edits.keys()] } } : {}
      };
      if (recording && machine) enqueue(outbox, run2.id, file, fieldRecord(run2, result.outcome, matchSpawn(spawnLog, run2, usedSpawns), editedTests(scan), machine));
      newFiles++;
    } catch {
      continue;
    }
  }
  let usd4 = 0;
  let couldHaveUsd = 0;
  let steps = 0;
  let routineSteps = 0;
  let runs = 0;
  const counts = /* @__PURE__ */ new Map();
  for (const seen of Object.values(state.seen)) {
    if (!seen.model) continue;
    runs++;
    usd4 += seen.usd;
    couldHaveUsd += seen.couldHaveUsd;
    steps += seen.steps;
    routineSteps += seen.routineSteps;
    counts.set(seen.model, (counts.get(seen.model) ?? 0) + 1);
  }
  const totals = {
    at: now().toISOString(),
    runs,
    usd: round22(usd4),
    couldHaveUsd: round22(couldHaveUsd),
    savingUsd: round22(Math.max(0, usd4 - couldHaveUsd)),
    steps,
    routineSteps,
    byModel: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]))
  };
  const reckonable = Object.values(state.seen).filter((x) => x.model).map((x) => ({
    agent: x.agent || "unknown",
    model: x.model,
    steps: x.steps,
    routineSteps: x.routineSteps,
    usd: x.usd,
    couldHaveUsd: x.couldHaveUsd,
    failures: x.failures,
    ...x.outcome ? { outcome: x.outcome } : {},
    ...x.task ? { task: x.task } : {}
  }));
  const local = reckon(reckonable);
  const shared = shareable(local, 1, reckonTasks(reckonable));
  const outcomes = local.reduce(
    (acc, c) => ({ worked: acc.worked + c.outcomes.worked, failed: acc.failed + c.outcomes.failed, takenOver: acc.takenOver + c.outcomes.takenOver }),
    { worked: 0, failed: 0, takenOver: 0 }
  );
  const observation = {
    version: 1,
    ...totals,
    scope: "machine",
    line: observationLine(totals),
    direction: directionFor(shared.cells, shared.tasks),
    cells: shared.cells,
    tasks: shared.tasks,
    outcomes
  };
  const loop = measureLoop(home3);
  if (loop) observation.loop = loop;
  if (handoverSessions.size) linkHandoversFromState(home3, state, now().getTime());
  if (recording) await flushOutbox(home3, outbox, now().getTime());
  try {
    fs28.mkdirSync(home3, { recursive: true });
    writeAtomic(path28.join(home3, STATE_FILE), JSON.stringify(state));
    writeAtomic(path28.join(home3, DELEGATION_FILE), `${JSON.stringify(observation, null, 2)}
`);
  } catch {
  }
  fillLeadCosts(home3, projectsRoot, (m) => prices.priceFor(m), now().getTime());
  gradeShadowJobs(home3, realGradeDeps(projectsRoot, (m) => prices.priceFor(m), () => now().getTime()));
  if (!opts.skipApi) {
    await syncWithApi(home3, shared);
    await refreshAdvice(home3);
    await refreshRulebook(home3);
    await sendReports(home3, fetch, cachedRulebook(home3).prices);
  }
  return { ...observation, newFiles, skipped };
}
async function syncWithApi(home3, reference) {
  let cfg;
  try {
    cfg = JSON.parse(fs28.readFileSync(path28.join(home3, "api.json"), "utf8"));
  } catch {
    return "not_configured";
  }
  if (typeof cfg.url !== "string" || typeof cfg.key !== "string") return "not_configured";
  const machine = machineId(home3);
  if (!machine) return "failed";
  const base = cfg.url.replace(/\/+$/, "");
  const headers = { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" };
  try {
    const up = await fetch(`${base}/v1/reference`, { method: "POST", headers, body: JSON.stringify({ machine, reference }), signal: AbortSignal.timeout(5e3) });
    if (!up.ok) return "failed";
    const down = await fetch(`${base}/v1/reference`, { headers, signal: AbortSignal.timeout(5e3) });
    if (!down.ok) return "failed";
    const merged = readSharedReference(await down.text());
    if (!merged) return "failed";
    writeAtomic(path28.join(home3, "shared-reference.json"), `${JSON.stringify(merged, null, 2)}
`);
    return "synced";
  } catch {
    return "failed";
  }
}
function machineId(home3) {
  const idFile = path28.join(home3, "machine-id");
  try {
    const id2 = fs28.readFileSync(idFile, "utf8").trim();
    if (/^[a-f0-9]{16,64}$/.test(id2)) return id2;
  } catch {
  }
  const id = randomBytes3(16).toString("hex");
  try {
    fs28.mkdirSync(home3, { recursive: true });
    fs28.writeFileSync(idFile, id);
    return id;
  } catch {
    return void 0;
  }
}
function linkHandoversFromState(home3, state, now) {
  try {
    const runs = [];
    for (const [file, s2] of Object.entries(state.seen)) {
      if (!s2.link || !s2.model) continue;
      const start = Date.parse(s2.link.start);
      if (Number.isNaN(start)) continue;
      const end = s2.link.end ? Date.parse(s2.link.end) : NaN;
      let quiet2 = true;
      try {
        quiet2 = now - fs28.statSync(file).mtimeMs >= QUIET_MS2;
      } catch {
      }
      runs.push({ id: file, session: s2.link.session, agent: s2.agent, model: s2.model, start, end: Number.isNaN(end) ? null : end, usd: s2.usd, ...s2.outcome ? { outcome: s2.outcome } : {}, edited: s2.link.edited, quiet: quiet2 });
    }
    completeHandovers(home3, runs, now);
    const open = openSessions(home3);
    for (const s2 of Object.values(state.seen)) if (s2.link && !open.has(s2.link.session.slice(0, 8))) delete s2.link;
  } catch {
  }
}
function measureLoop(home3) {
  let spawns;
  try {
    spawns = readSpawns(fs28.readFileSync(path28.join(home3, "spawns.jsonl"), "utf8"));
  } catch {
    return void 0;
  }
  const notes = /* @__PURE__ */ new Map();
  const listed = /* @__PURE__ */ new Map();
  for (const s2 of spawns) {
    if (s2.source === "plan" || !s2.session || !s2.repo || notes.has(s2.session)) continue;
    const dir = path28.join(s2.repo, ".nudge", "log");
    let names = listed.get(dir);
    if (!names) {
      try {
        names = fs28.readdirSync(dir);
      } catch {
        names = [];
      }
      listed.set(dir, names);
    }
    const lines = [];
    for (const name of names.filter((n2) => n2.endsWith(`-${s2.session.slice(0, 8)}.md`))) {
      try {
        for (const line of fs28.readFileSync(path28.join(dir, name), "utf8").split(/\r?\n/)) {
          const m = /^\s*[-*] delegated:\s*(.+?)\s*$/i.exec(line);
          if (m) lines.push(m[1]);
        }
      } catch {
      }
    }
    notes.set(s2.session, lines);
  }
  return loopMeasure(spawns, notes);
}

// ../host/src/delegation/worker/dashboard.ts
import { spawn as spawn3 } from "node:child_process";
import fs29 from "node:fs";
import http from "node:http";
import path29 from "node:path";
var DASHBOARD_PORT = 47730;
var DASHBOARD_FILE = "dashboard.json";
var GRADE_EVERY_MS = 15 * 60 * 1e3;
function alive3(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function liveJobs(home3) {
  let ids = [];
  try {
    ids = fs29.readdirSync(path29.join(home3, WORKERS_DIR));
  } catch {
    return [];
  }
  const out = [];
  for (const id of ids) {
    const dir = jobDir(home3, id);
    if (fs29.existsSync(path29.join(dir, "grade.json"))) continue;
    try {
      const spec = readSpec(dir);
      if (!spec.shadow) continue;
      const st = readStatus(dir);
      const r = readResult(dir);
      const state = r ? "ended" : st?.state === "error" || st?.state === "running" && !alive3(st.pid) ? "error" : "running";
      out.push({ job: id, at: spec.at, operation: spec.operation, files: spec.files.length, worker: spec.model, state, phase: r ? r.verdict : st?.error ?? st?.phase ?? "starting", ...r ? { verdict: r.verdict, usd: Math.round((r.usd.worker + r.usd.checker) * 1e4) / 1e4 } : {} });
    } catch {
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
var sum2 = (xs) => xs.reduce((a, b) => a + b, 0);
var avg2 = (xs) => xs.length ? sum2(xs) / xs.length : null;
function stats(rows2) {
  const graded = rows2.filter((r) => r.grade.verdict !== "ungraded");
  const passes = graded.filter((r) => r.grade.verdict === "pass" || r.grade.verdict === "pass (tested part)");
  const measured = rows2.filter((r) => r.lead && r.oneCallUsd !== null && r.commit);
  const passesMeasured = measured.filter((r) => r.grade.verdict === "pass" || r.grade.verdict === "pass (tested part)");
  const leadTotal = sum2(measured.map((r) => r.lead.usd));
  const oneCallTotal = sum2(measured.map((r) => r.oneCallUsd));
  const ctx = rows2.map((r) => r.lead?.contextAtCall ?? null).filter((n2) => n2 !== null);
  const r4 = (n2) => Math.round(n2 * 1e4) / 1e4;
  return {
    jobs: rows2.length,
    graded: graded.length,
    passes: passes.length,
    plainPasses: graded.filter((r) => r.grade.verdict === "pass").length,
    fails: graded.length - passes.length,
    ungraded: rows2.length - graded.length,
    ownCheckPassed: rows2.filter((r) => r.worker.verdict === "pass" || r.worker.verdict === "pass (tested part)").length,
    workerRan: rows2.filter((r) => r.worker.verdict !== "did not run").length,
    measured: measured.length,
    workerAvg: avg2(measured.map((r) => r.worker.usd)),
    leadAvg: avg2(measured.map((r) => r.lead.usd)),
    oneCallAvg: avg2(measured.map((r) => r.oneCallUsd)),
    workerTotal: r4(sum2(rows2.map((r) => r.worker.usd))),
    leadTotal: r4(leadTotal),
    oneCallTotal: r4(oneCallTotal),
    savedUsd: r4(leadTotal - oneCallTotal),
    savedPct: leadTotal > 0 ? Math.round((leadTotal - oneCallTotal) / leadTotal * 100) : null,
    savedOnPassesUsd: r4(sum2(passesMeasured.map((r) => r.lead.usd - r.oneCallUsd))),
    passesMeasured: passesMeasured.length,
    workerMinutesAvg: avg2(rows2.map((r) => r.worker.minutes).filter((n2) => n2 !== null)),
    leadMinutesAvg: avg2(measured.map((r) => r.lead.minutes).filter((n2) => n2 !== null)),
    contextAvg: avg2(ctx),
    contextMin: ctx.length ? Math.min(...ctx) : null,
    contextMax: ctx.length ? Math.max(...ctx) : null
  };
}
var esc = (s2) => s2.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var usd3 = (n2, d = 2) => n2 === null || n2 === void 0 ? "\u2013" : `$${n2.toFixed(d)}`;
var k2 = (n2) => n2 === null || n2 === void 0 ? "\u2013" : `${Math.round(n2 / 1e3)}K`;
var min = (n2) => n2 === null || n2 === void 0 ? "\u2013" : `${Math.round(n2)} min`;
var when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString(void 0, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" })}`;
};
var pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : "\u2013";
var CSS = `
:root{--bg:#0f1115;--card:#171a21;--line:#262a33;--fg:#e6e8ee;--dim:#8b92a5;--good:#4cc38a;--bad:#f0616d;--warn:#e5b454;--acc:#7aa2f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;color:var(--dim);margin:28px 0 10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.sub{color:var(--dim);font-size:13px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.card .n{font-size:26px;font-weight:700;letter-spacing:-.01em}
.card .l{color:var(--dim);font-size:12px;margin-top:2px}.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}.acc{color:var(--acc)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--dim);font-weight:600}td.wrap{white-space:normal}.tbl{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;background:#222736}.pill.good{background:#163b2b}.pill.bad{background:#4a1f25}.pill.warn{background:#4a3a16}
.note{color:var(--dim);font-size:12px;margin-top:10px}a{color:var(--acc)}
`;
var pill = (v) => {
  const cls = v === "pass" ? "good" : v === "pass (tested part)" ? "warn" : v === "fail" || v === "lead needed" || v === "failed" || v === "did not run" ? "bad" : "";
  return `<span class="pill ${cls}">${esc(v)}</span>`;
};
function dashboardHtml(rows2, live, now, opts = {}) {
  const s2 = stats(rows2);
  const sorted = [...rows2].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const running = live.filter((l) => l.state === "running").length;
  const waiting = live.filter((l) => l.state !== "running").length;
  const cards = [
    { n: s2.measured ? `${usd3(s2.savedUsd)}` : "\u2013", l: `saved so far, one-call against the lead doing it (${s2.measured} measured)`, cls: s2.savedUsd > 0 ? "good" : "" },
    { n: s2.savedPct === null ? "\u2013" : `${s2.savedPct}%`, l: "of the lead's spend, had it delegated in one call", cls: "acc" },
    { n: `${s2.passes} / ${s2.graded}`, l: `worker passes against the lead's commits (${pct(s2.passes, s2.graded)})`, cls: s2.graded && s2.passes === s2.graded ? "good" : s2.fails ? "warn" : "" },
    { n: usd3(s2.workerAvg), l: "worker, a job on average", cls: "" },
    { n: usd3(s2.leadAvg), l: "lead doing it itself, a job on average", cls: "" },
    { n: usd3(s2.oneCallAvg), l: "one-call delegation, a job (estimate)", cls: "" },
    { n: k2(s2.contextAvg), l: `lead's context at the call (${k2(s2.contextMin)} to ${k2(s2.contextMax)})`, cls: "" },
    { n: `${s2.jobs}`, l: `jobs shadowed \xB7 ${running} running \xB7 ${waiting} waiting for a commit`, cls: "" }
  ];
  const liveRows = live.map((l) => `<tr><td>${when(l.at)}</td><td>${esc(l.job)}</td><td>${esc(l.operation)}</td><td>${l.files}</td><td>${esc(l.worker)}</td><td>${l.state === "running" ? `<span class="pill">running \xB7 ${esc(l.phase)}</span>` : l.state === "error" ? pill("did not run") : `${pill(l.verdict ?? "ended")} <span class="sub">waiting for the lead's commit</span>`}</td><td>${usd3(l.usd)}</td></tr>`).join("");
  const gradedRows = sorted.map(
    (r) => `<tr><td>${when(r.at)}</td><td>${esc(r.operation)}</td><td>${r.lines ?? "\u2013"}</td><td>${r.files.length}</td><td>${esc(r.advice)}</td><td>${pill(r.worker.verdict)}</td><td>${pill(r.grade.verdict)}</td><td>${usd3(r.worker.usd, 3)}</td><td>${usd3(r.lead?.usd ?? null)}</td><td>${r.lead?.turns ?? "\u2013"}</td><td>${k2(r.lead?.contextAtCall ?? null)}</td><td>${usd3(r.oneCallUsd)}</td><td>${min(r.worker.minutes)} / ${min(r.lead?.minutes ?? null)}</td><td class="wrap">${r.commit ? `<code>${r.commit.sha.slice(0, 8)}</code> ${esc(r.commit.subject.slice(0, 60))}` : "none"}</td></tr>`
  ).join("");
  const toRead = sorted.filter((r) => r.grade.verdict !== "pass").map((r) => `<li><code>${esc(r.job)}</code> (${when(r.at)}): ${pill(r.grade.verdict)} ${esc(r.grade.note)}${r.grade.unverified.length ? `; untested by the commit's tests: ${esc(r.grade.unverified.join(", "))}` : ""}${r.worker.why ? `; worker: ${esc(r.worker.why)}` : ""}${r.worker.signals.length ? `; signals: ${esc(r.worker.signals.join(", "))}` : ""}</li>`).join("");
  const stamp = (t) => t ? when(new Date(t).toISOString()) : "\u2013";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>Shadow delegation</title><style>${CSS}</style></head><body>
<h1>Shadow delegation</h1>
<div class="sub">Rendered ${when(new Date(now).toISOString())} \xB7 refreshes every minute \xB7 grade pass: last ${stamp(opts.lastGrade)}, next ${stamp(opts.nextGrade)} \xB7 <a href="/report.md">report.md</a> \xB7 <a href="/api/state">json</a></div>
<h2>Savings</h2>
<div class="grid">${cards.slice(0, 3).map((c) => `<div class="card"><div class="n ${c.cls}">${c.n}</div><div class="l">${esc(c.l)}</div></div>`).join("")}</div>
<div class="note">Saved = the lead's measured spend on each job (its transcript from the shadow call to its commit) minus the one-call estimate (two lead turns at the context it had, plus the worker). On the ${s2.passesMeasured} measured job(s) the worker passed, the saving is ${usd3(s2.savedOnPassesUsd)}; a fail would have cost the lead the one-call turns and then the work.</div>
<h2>Statistics</h2>
<div class="grid">${cards.slice(3).map((c) => `<div class="card"><div class="n ${c.cls}">${c.n}</div><div class="l">${esc(c.l)}</div></div>`).join("")}</div>
<div class="note">Worker's own check passed on ${s2.ownCheckPassed} of ${s2.jobs}; the worker ran on ${s2.workerRan} of ${s2.jobs}. Graded: ${s2.plainPasses} plain pass, ${s2.passes - s2.plainPasses} pass on the tested part, ${s2.fails} fail, ${s2.ungraded} ungraded. Time a job: worker ${min(s2.workerMinutesAvg)}, lead ${min(s2.leadMinutesAvg)}. Totals: worker ${usd3(s2.workerTotal)}, lead ${usd3(s2.leadTotal)}, one-call ${usd3(s2.oneCallTotal)}.</div>
<h2>Live</h2>
<div class="tbl"><table><thead><tr><th>started</th><th>job</th><th>op</th><th>files</th><th>worker</th><th>state</th><th>worker $</th></tr></thead><tbody>${liveRows || `<tr><td colspan="7" class="sub">no shadow job running or waiting</td></tr>`}</tbody></table></div>
<h2>Graded jobs</h2>
<div class="tbl"><table><thead><tr><th>started</th><th>op</th><th>lines</th><th>files</th><th>engine</th><th>worker</th><th>grade</th><th>worker $</th><th>lead $</th><th>turns</th><th>ctx</th><th>one-call</th><th>worker / lead time</th><th>lead's commit</th></tr></thead><tbody>${gradedRows || `<tr><td colspan="14" class="sub">nothing graded yet: a job is graded once its lead has committed and the grade pass has run</td></tr>`}</tbody></table></div>
${toRead ? `<h2>What to read</h2><ul>${toRead}</ul>` : ""}
<h2>How it is measured</h2>
<div class="note">Grade: the lead's commit is the first commit after the job's start that touched a file the job named. Its test files are written fresh over the worker's copy and run; a typecheck clean at the start that broke fails. "Pass (tested part)": the tests pass but some changed code file is imported by none of them. "Ungraded": no commit within three days, no test file in the commit, or the worker did not run.<br>Worker $: what the gateway billed for the worker, the checker and the closing questions. Lead $: the lead's transcript between the shadow call and the commit, each message at its model's list price, cache reads included; the whole conversation in that window. One-call: two lead turns at the input size at the call, 1,500 output tokens each, plus the worker $ \u2014 an estimate.</div>
</body></html>`;
}
async function startDashboard(home3, deps, opts = {}) {
  const port = opts.port ?? DASHBOARD_PORT;
  let lastGrade = null;
  let nextGrade = null;
  let waiting = 0;
  let passing = false;
  const everyMs = opts.everyMs ?? GRADE_EVERY_MS;
  const runPass = opts.pass ?? (() => passInChild(home3));
  const pass = async () => {
    if (passing) return;
    passing = true;
    try {
      waiting = await runPass();
    } catch {
    } finally {
      passing = false;
      lastGrade = deps.now();
      nextGrade = lastGrade + everyMs;
    }
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const host = (req.headers.host ?? "").split(":")[0];
    const send = (status, type, body) => {
      res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body), "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(body);
    };
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host ?? "")) return send(421, "text/plain", "localhost only");
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") return send(200, "text/html; charset=utf-8", dashboardHtml(readLedger(home3), liveJobs(home3), deps.now(), { lastGrade, nextGrade }));
      if (url.pathname === "/api/state") return send(200, "application/json", JSON.stringify({ stats: stats(readLedger(home3)), live: liveJobs(home3), waiting, lastGrade, nextGrade }));
      if (url.pathname === "/report.md") {
        let text2 = "(no report yet)";
        try {
          text2 = fs29.readFileSync(path29.join(home3, SHADOW_REPORT), "utf8");
        } catch {
        }
        return send(200, "text/plain; charset=utf-8", text2);
      }
      return send(404, "text/plain", "not found");
    } catch (e) {
      return send(500, "text/plain", e.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const actual = server.address().port;
  try {
    fs29.mkdirSync(home3, { recursive: true });
    fs29.writeFileSync(path29.join(home3, DASHBOARD_FILE), JSON.stringify({ port: actual, pid: process.pid, at: new Date(deps.now()).toISOString() }));
  } catch {
  }
  let timer;
  if (opts.grade !== false) {
    void pass();
    timer = setInterval(() => void pass(), everyMs);
  }
  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    close: () => new Promise((resolve) => {
      if (timer) clearInterval(timer);
      server.close(() => resolve());
    })
  };
}
function passInChild(home3, script = process.argv[1]) {
  return new Promise((resolve, reject) => {
    if (!script) return reject(new Error("no script to run the pass with"));
    const child = spawn3(process.execPath, [...process.execArgv, script, "shadow"], { env: { ...process.env, NUDGE_HOME: home3 }, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString("utf8");
      if (out.length > 1e6) out = out.slice(-2e5);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const m = /\((\d+) graded this pass, (\d+) waiting/.exec(out);
      if (code !== 0 || !m) return reject(new Error(`the grade pass ended with code ${code}`));
      resolve(Number(m[2]));
    });
  });
}

// ../host/src/spend/daily.ts
import fs31 from "node:fs";
import path31 from "node:path";

// ../host/src/spend/log.ts
import fs30 from "node:fs";
import os9 from "node:os";
import path30 from "node:path";
var SPEND_LOG = path30.join(os9.homedir(), ".creatos-build-ai", "spend.jsonl");
var ONLINE_LINE_USD = 0.5;
var num2 = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
var text = (v) => typeof v === "string" && v ? v : void 0;
function parseSpendLog(raw) {
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try {
      const j = JSON.parse(line);
      if (!j || typeof j !== "object") continue;
      o = j;
    } catch {
      continue;
    }
    const at = text(o.at);
    const job = text(o.job);
    const kind = o.kind === "online" || o.kind === "batch" ? o.kind : void 0;
    const usd4 = num2(o.usd);
    const calls = num2(o.calls);
    if (!at || !job || !kind || usd4 === void 0 || calls === void 0 || Number.isNaN(Date.parse(at))) continue;
    const usage = o.usage && typeof o.usage === "object" ? o.usage : void 0;
    const e = {
      at,
      run: text(o.run) ?? at,
      job,
      kind,
      model: text(o.model) ?? "unknown",
      calls,
      usd: usd4,
      runTotal: num2(o.runTotal) ?? usd4,
      cap: num2(o.cap) ?? 5
    };
    const feature = text(o.feature);
    if (feature) e.feature = feature;
    if (usage) {
      e.cacheRead = num2(usage.cache_read_input_tokens) ?? 0;
      e.cacheWrite = num2(usage.cache_creation_input_tokens) ?? 0;
    }
    out.push(e);
  }
  return out;
}
function readSpendLog(file = SPEND_LOG) {
  try {
    return parseSpendLog(fs30.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}
function onDay(entries, day2) {
  return entries.filter((e) => e.at.slice(0, 10) === day2);
}
function capHits(entries) {
  const runs = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const k3 = `${e.job}\0${e.run}`;
    const list = runs.get(k3);
    if (list) list.push(e);
    else runs.set(k3, [e]);
  }
  const out = [];
  for (const list of runs.values()) {
    const last = list.reduce((a, b) => Date.parse(b.at) >= Date.parse(a.at) ? b : a);
    const biggest = Math.max(...list.map((e) => e.usd));
    if (last.cap > 0 && last.cap - last.runTotal <= Math.max(0.05 * last.cap, biggest)) {
      out.push({ job: last.job, why: "cap", usd: last.runTotal, cap: last.cap });
      continue;
    }
    const online = list.filter((e) => e.kind === "online").reduce((s2, e) => s2 + e.usd, 0);
    if (online >= ONLINE_LINE_USD) out.push({ job: last.job, why: "online", usd: online, cap: ONLINE_LINE_USD });
  }
  return out;
}
function uncachedBuildFeatures(entries, minCalls = 20) {
  const by = /* @__PURE__ */ new Map();
  for (const e of entries) {
    if (e.kind !== "online" || e.cacheRead === void 0) continue;
    const name = e.feature && e.feature !== "unknown" ? e.feature : e.job;
    const s2 = by.get(name) ?? { calls: 0, cached: 0 };
    s2.calls += e.calls;
    s2.cached += (e.cacheRead ?? 0) + (e.cacheWrite ?? 0);
    by.set(name, s2);
  }
  return [...by.entries()].filter(([, s2]) => s2.calls > minCalls && s2.cached === 0).map(([n2]) => n2);
}

// ../host/src/spend/daily.ts
var SPEND_WATCH_FILE = "spend-watch.json";
var REPORT_URL = "https://ai-gateway.vercel.sh/v1/report";
var REPORT_TIMEOUT_MS = 5e3;
var USAGE_KEY = "creatos-usage";
var WORKERS_KEY = "nudge-workers";
var MAX_CLAUDE_MODELS = 4;
var NO_CACHE_MIN_CALLS = 20;
var BUILD_ON_GATEWAY_OK_USD = 1;
var n = (v) => typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0;
var s = (v) => typeof v === "string" ? v : "";
var isClaude = (model) => /(^|\/)claude|^anthropic\//i.test(model);
async function report(fetchFn, key2, day2, groupBy, extra = {}) {
  const q = new URLSearchParams({ start_date: day2, end_date: day2, group_by: groupBy, ...extra });
  const r = await fetchFn(`${REPORT_URL}?${q}`, { headers: { Authorization: `Bearer ${key2}` }, signal: AbortSignal.timeout(REPORT_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`report ${groupBy}: HTTP ${r.status}`);
  const j = await r.json();
  if (!j || !Array.isArray(j.results)) throw new Error(`report ${groupBy}: no results`);
  return j.results.filter((x) => !!x && typeof x === "object");
}
async function readGatewayDay(env, day2, fetchFn) {
  const key2 = (env.AI_GATEWAY_API_KEY || env.NUDGE_GATEWAY_KEY || "").trim();
  if (!key2) return void 0;
  try {
    const [keys, tags, models] = await Promise.all([report(fetchFn, key2, day2, "api_key_name"), report(fetchFn, key2, day2, "tag"), report(fetchFn, key2, day2, "model")]);
    const claude = models.filter((m) => isClaude(s(m.model)) && n(m.request_count) > 0).sort((a, b) => n(b.request_count) - n(a.request_count)).slice(0, MAX_CLAUDE_MODELS);
    const claudeTags = (await Promise.all(claude.map((m) => report(fetchFn, key2, day2, "tag", { model: s(m.model) })))).flat();
    const workersKey = (env.NUDGE_GATEWAY_KEY || "").trim();
    let workerClaude;
    if (workersKey && workersKey !== key2) {
      try {
        const own = await report(fetchFn, workersKey, day2, "model", { api_key_id: "self" });
        workerClaude = own.filter((m) => isClaude(s(m.model)) && n(m.request_count) > 0).map((m) => s(m.model));
      } catch {
        workerClaude = void 0;
      }
    }
    return { keys, tags, claudeTags, workerClaude };
  } catch {
    return void 0;
  }
}
var money2 = (v) => `$${v.toFixed(2)}`;
function composeLine(day2, log, gw, gatewayFailed = false) {
  const parts = [];
  const build = log.reduce((sum3, e) => sum3 + e.usd, 0);
  const keys = (gw?.keys ?? []).map((k3) => ({ name: s(k3.api_key_name) || "(unnamed)", usd: n(k3.total_cost) })).filter((k3) => k3.usd >= 5e-3).sort((a, b) => b.usd - a.usd);
  const byKey = [...keys.map((k3) => `${k3.name} ${money2(k3.usd)}`), ...build >= 5e-3 ? [`build on the Anthropic API ${money2(build)}`] : []];
  const total = keys.reduce((sum3, k3) => sum3 + k3.usd, 0) + build;
  if (byKey.length) parts.push(`${money2(total)} \u2014 ${byKey.join(", ")}${gatewayFailed ? " (gateway report not reached; build log only)" : ""}`);
  const features = (gw?.tags ?? []).filter((t) => s(t.tag).startsWith("feature:") && n(t.total_cost) >= 5e-3).sort((a, b) => n(b.total_cost) - n(a.total_cost)).slice(0, 3).map((t) => `${s(t.tag).slice("feature:".length)} ${money2(n(t.total_cost))}`);
  if (features.length) parts.push(`top features: ${features.join(", ")}`);
  const hits = capHits(log);
  if (hits.length) {
    parts.push(
      `hit a cap: ${hits.map((h) => h.why === "cap" ? `${h.job} (${money2(h.usd)} of its ${money2(h.cap)} cap)` : `${h.job} (${money2(h.usd)} one call at a time, past the $0.50 online line)`).join(", ")}`
    );
  }
  const wrong = [];
  const buildRows = (rows2) => (rows2 ?? []).filter((t) => s(t.tag) === "env:build" && n(t.request_count) > 0);
  const claudeBuild = buildRows(gw?.claudeTags).reduce((a, t) => ({ calls: a.calls + n(t.request_count), usd: a.usd + n(t.total_cost) }), { calls: 0, usd: 0 });
  const allBuild = buildRows(gw?.tags).reduce((a, t) => ({ calls: a.calls + n(t.request_count), usd: a.usd + n(t.total_cost) }), { calls: 0, usd: 0 });
  if (claudeBuild.calls > 0) wrong.push(`${claudeBuild.calls} Claude calls tagged env:build went through the gateway (${money2(claudeBuild.usd)}); Claude build work belongs on the Anthropic API via scripts/lib/build-ai`);
  const otherBuildUsd = allBuild.usd - claudeBuild.usd;
  if (otherBuildUsd > BUILD_ON_GATEWAY_OK_USD) wrong.push(`build work on the gateway cost ${money2(otherBuildUsd)} (more than the ${money2(BUILD_ON_GATEWAY_OK_USD)} a day expected for build embeddings); a bulk job belongs on the BUILD_ keys via scripts/lib/build-ai`);
  if (gw?.workerClaude?.length) wrong.push(`the ${WORKERS_KEY} key ran Claude (${gw.workerClaude.join(", ")}); it is for non-Claude models only`);
  const usage = (gw?.keys ?? []).find((k3) => s(k3.api_key_name) === USAGE_KEY);
  if (usage && gw) {
    const labelled = gw.tags.filter((t) => s(t.tag).startsWith("feature:")).reduce((sum3, t) => sum3 + n(t.request_count), 0);
    const missing = n(usage.request_count) - labelled;
    if (missing > 0) wrong.push(`${missing} site calls on ${USAGE_KEY} carry no feature: label`);
  }
  if (wrong.length) parts.push(`wrong account: ${wrong.join("; ")}`);
  const byFeature = /* @__PURE__ */ new Map();
  for (const t of gw?.claudeTags ?? []) {
    const tag = s(t.tag);
    if (!tag.startsWith("feature:")) continue;
    const f = byFeature.get(tag) ?? { calls: 0, cached: 0 };
    f.calls += n(t.request_count);
    f.cached += n(t.cached_input_tokens);
    byFeature.set(tag, f);
  }
  const uncached = [
    ...[...byFeature.entries()].filter(([, f]) => f.calls > NO_CACHE_MIN_CALLS && f.cached === 0).map(([tag]) => tag.slice("feature:".length)),
    ...uncachedBuildFeatures(log, NO_CACHE_MIN_CALLS).map((f) => `${f} (build)`)
  ];
  for (const f of uncached) parts.push(`${f} is paying full price for its instructions; mark them for caching (cachedSystem)`);
  if (!parts.length) return "";
  return `Nudge, AI spend watch for ${day2} (UTC): ${parts.join(". ")}.`;
}
var utcDay = (t) => new Date(t).toISOString().slice(0, 10);
function readSpendWatch(home3, now = Date.now()) {
  try {
    const c = JSON.parse(fs31.readFileSync(path31.join(home3, SPEND_WATCH_FILE), "utf8"));
    return c && c.version === 1 && c.day === utcDay(now) && typeof c.line === "string" ? c : void 0;
  } catch {
    return void 0;
  }
}
async function runSpendWatch(opts) {
  try {
    const now = opts.now ?? Date.now();
    const cached = readSpendWatch(opts.home, now);
    if (cached && (cached.complete || now - Date.parse(cached.at) < 60 * 60 * 1e3)) return cached;
    const env = opts.env ?? process.env;
    const about = utcDay(now - 864e5);
    const log = onDay(readSpendLog(opts.logFile), about);
    const hasKey = !!(env.AI_GATEWAY_API_KEY || env.NUDGE_GATEWAY_KEY || "").trim();
    const gw = hasKey ? await readGatewayDay(env, about, opts.fetchFn ?? fetch) : void 0;
    const c = { version: 1, day: utcDay(now), about, line: composeLine(about, log, gw, hasKey && !gw), complete: !hasKey || !!gw, at: new Date(now).toISOString() };
    fs31.mkdirSync(opts.home, { recursive: true });
    fs31.writeFileSync(path31.join(opts.home, SPEND_WATCH_FILE), `${JSON.stringify(c)}
`);
    return c;
  } catch {
    return void 0;
  }
}

// ../host/src/delegation/main.ts
var EVENT = process.argv[2];
var home2 = () => nudgeHome2();
function logSpawn(entry) {
  try {
    fs32.mkdirSync(home2(), { recursive: true });
    fs32.appendFileSync(path32.join(home2(), "spawns.jsonl"), `${JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), ...entry })}
`);
  } catch {
  }
}
var RECORD_PLAN = /nudge-delegation__record_plan$/;
var OWN_ADVICE_TOOLS = /nudge-delegation__(ask_delegation|record_plan|handover_receipt)$/;
var allowOwnTool = () => `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "Nudge's own advice tool: it reads the advice and writes only Nudge's own files." } })}
`;
function preToolUse(input) {
  const tool = typeof input.tool_name === "string" ? input.tool_name : "";
  const session = typeof input.session_id === "string" && input.session_id ? input.session_id : void 0;
  if (RECORD_PLAN.test(tool) && session) recordSessionPlan(home2(), session, input.tool_input ?? {});
  if (OWN_ADVICE_TOOLS.test(tool)) {
    process.stdout.write(allowOwnTool());
    return;
  }
  if (tool !== "Agent" && tool !== "Task") return;
  const repo = sessionRepo(typeof input.cwd === "string" ? input.cwd : "", input.session_id);
  if (!delegationOn(repo)) return;
  const ti = input.tool_input ?? {};
  const agentType = typeof ti.subagent_type === "string" && ti.subagent_type ? ti.subagent_type : "general-purpose";
  const requested = typeof ti.model === "string" && ti.model ? ti.model : void 0;
  const own = modelFromTranscript(input.transcript_path);
  let d;
  try {
    const brief = typeof ti.prompt === "string" ? ti.prompt : "";
    d = decideSpawn({ home: home2(), ...session ? { session } : {}, ...repo ? { repo } : {}, agentType, ...requested ? { requested } : {}, ...own ? { own } : {}, ...brief ? { brief } : {} });
  } catch {
    return;
  }
  const tree = repo && d.log.decision !== "deny" ? snapshotTree(repo, home2()) : null;
  logSpawn(tree ? { ...d.log, head: tree.head, ...tree.patch ? { patch: tree.patch } : {} } : d.log);
  process.stdout.write(spawnOutput(d));
}
function subagentStart(input) {
  const repo = sessionRepo(typeof input.cwd === "string" ? input.cwd : "", input.session_id);
  if (!delegationOn(repo)) return;
  const context = "Nudge, helper briefing: come back with the answer, not the transcript. Do not re-read what you were handed. If the same command fails twice the same way, stop and report it rather than trying a third time. Read and search freely; edit only what the task names.";
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: context } })}
`);
}
async function main() {
  if (EVENT === "mcp") {
    runDelegationMcp();
    return;
  }
  if (EVENT === "worker") {
    await workerMain(process.argv[3], home2());
    return;
  }
  if (EVENT === "observe") {
    const o = await observeDelegation();
    process.stdout.write(`${o.runs} run(s) \xB7 ${o.newFiles} read, ${o.skipped} unchanged
${o.line || "(nothing worth saying yet)"}
`);
    return;
  }
  if (EVENT === "dashboard") {
    const prices = createPriceTable(loadPrices(home2()));
    try {
      const d = await startDashboard(home2(), realGradeDeps(DEFAULT_PROJECTS_ROOT, (m) => prices.priceFor(m)));
      process.stdout.write(`shadow dashboard: ${d.url}
`);
      return;
    } catch (e) {
      process.stdout.write(`shadow dashboard not started: ${e.message}
`);
      return;
    }
  }
  if (EVENT === "shadow") {
    const prices = createPriceTable(loadPrices(home2()));
    const g = gradeShadowJobs(home2(), realGradeDeps(DEFAULT_PROJECTS_ROOT, (m) => prices.priceFor(m)));
    process.stdout.write(`${writeShadowReport(home2(), g.waiting)}
(${g.busy ? "another grade pass is running: nothing graded by this one" : `${g.graded} graded this pass, ${g.waiting} waiting`}; page: ${path32.join(home2(), SHADOW_REPORT)})
`);
    return;
  }
  if (EVENT === "spend") {
    const c = await runSpendWatch({ home: home2() });
    process.stdout.write(`${c ? c.line || "(nothing to say about yesterday's AI spend)" : "spend watch: nothing written"}
`);
    return;
  }
  if (EVENT === "PreToolUse" || EVENT === "SubagentStart") {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    let input = {};
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return;
    }
    if (EVENT === "PreToolUse") preToolUse(input);
    else subagentStart(input);
    return;
  }
  process.stdout.write(`delegation: nothing to do for "${EVENT ?? ""}"
`);
}
main().catch(() => {
  process.exit(0);
});
