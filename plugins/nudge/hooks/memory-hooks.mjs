#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const EVENT = process.argv[2];
const SELF = fileURLToPath(import.meta.url);
const HOME = process.env.NUDGE_HOME || path.join(os.homedir(), ".nudge");
const MAX_ENTRIES = 12;
const MAX_CHARS = 12e3;
const LIMIT = 15e4;
const REMIND_FROM = 4e4;
const REMIND_STEP = 2e4;
const HANDOFF_MAX = 3e3;
const HANDOFF_TOO_LONG = 6e3;
const HISTORY_KEPT = 50;
const NAG_AFTER = 3;
const WHY = new RegExp("\\b(?:why (?:did|do|does|are|is|was|were|have|has|had|didn't|don't|doesn't|isn't|aren't|not)\\b|what led (?:us )?to\\b|how did we (?:end up|get|come|decide|arrive|land)\\b|where did .{1,60} come from\\b|what was the reason)", "i");
const LENGTH = new RegExp("\\b(?:turn(?:ing)? on|switch on|resume|bring back|re-?enable)\\b[^.?!\\n]{0,40}\\b(?:length|wrap(?:ping)?[ -]?up|context)\\s+(?:reminders?|warnings?)\\b|\\b(?:length|wrap(?:ping)?[ -]?up|context)\\s+(?:reminders?|warnings?)\\s+(?:back\\s+)?on\\b|\\b(?:turn(?:ing)? off|switch off|stop|mute|silence|disable|no more|don'?t (?:show|need|want))\\b[^.?!\\n]{0,40}\\b(?:length|wrap(?:ping)?[ -]?up|context)\\s+(?:reminders?|warnings?)\\b|\\bno (?:length|wrap(?:ping)?[ -]?up|context)\\s+(?:reminders?|warnings?)\\b|\\b(?:length|wrap(?:ping)?[ -]?up|context)\\s+(?:reminders?|warnings?)\\s+off\\b|^\\W*(?:nudge[,:\\s]+)?(?:please\\s+)?extend(?:\\s+(?:it|this|that|the session|the conversation))?(?:\\s+(?:by\\s+)?(?:another\\s+)?\\d{2,4}\\s*k)?(?:\\s+please)?\\W*$|\\bextend\\b[^.?!\\n]{0,20}\\b(?:length|context|wrap(?:ping)?[ -]?up)\\s+(?:reminders?|warnings?|limit|budget)\\b", "i");
const DELEGATE = /^\W*(?:nudge[,:\s]+)?delegate((?:\s+(?:on|now|always|auto|off|strict|workers|status|help|\d{1,3}))*)\W*$/i;
const QUIET_CATCHUP = 10;
const NOTICE_EVERY = 864e5;
const LOOK_EVERY = 36e5;
const QUESTION = "Nudge keeps notes and a hand-off in every project you work in, so each session picks up where the last one stopped. Yes?";
const BRIDGE = `// Nudge plan-limits status line. Put here by the Nudge plugin's "handover on"; "handover off" removes it and restores your own.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("error", () => process.exit(0));
process.stdin.on("end", () => {
  const input = Buffer.concat(chunks);
  let data = {};
  try {
    data = JSON.parse(input.toString("utf8")) || {};
  } catch {
    // a body we don't recognise: no limits, the bare name below
  }
  try {
    const rl = data.rate_limits;
    if (rl && typeof rl === "object") {
      const file = path.join(DIR, "usage", "limits.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + "." + process.pid;
      fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), ...rl }));
      fs.renameSync(tmp, file);
    }
  } catch {
    // no limits this render
  }
  let original;
  try {
    const o = JSON.parse(fs.readFileSync(path.join(DIR, "statusline-original.json"), "utf8"));
    if (o && o.statusLine && typeof o.statusLine.command === "string") original = o.statusLine.command;
  } catch {
    // none saved: Nudge's own line
  }
  if (original !== undefined) {
    const child = spawn(original, { shell: true, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
    child.on("error", () => {});
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    child.on("exit", (code) => { process.exitCode = code ?? 0; });
    return;
  }
  const pct = (w) => (w && typeof w.used_percentage === "number" ? Math.trunc(w.used_percentage) : undefined);
  const five = pct(data.rate_limits && data.rate_limits.five_hour);
  const week = pct(data.rate_limits && data.rate_limits.seven_day);
  let line = "Nudge";
  if (five !== undefined) line += " \\u00b7 5h " + five + "%";
  if (week !== undefined) line += " \\u00b7 week " + week + "%";
  const name = data.model && typeof data.model.display_name === "string" ? data.model.display_name : "";
  process.stdout.write((line === "Nudge" ? name || "Nudge" : line) + "\\n");
});
`;
const BRIDGE_MARKER = "// Nudge plan-limits status line";
const STATUSLINE_ORIGINAL = "statusline-original.json";
const LISTENER_RETRY = 6e5;
const RULES = "### Journal and hand-off\n- Journal `.nudge/journal.md`: at the end of every turn append one dated entry (`## <local ISO time with its offset, like 2026-09-26T12:08:01-04:00> \xB7 session <first 8 chars of your session id>`) \u2014 what was asked, what you did, what you learned or decided. One line is enough for a small turn. Never rewrite an entry. Nudge asks for it on every prompt and sends you back once at stop if none was written.\n- .nudge/handoff.md \u2014 Goal, Done (each with the command and its result), Left (as instructions, in order), Facts, Traps \u2014 is written only at session start (fresh, resume, clear, compaction), when Nudge hands you the journal entries written after it last changed. Read it from disk right then, fold them in, write it once, then answer. Update it in place; never rebuild it from scratch. After that, write only the journal: other sessions may be open in this project, and the next one to open folds your entries in.\n- The hand-off is a synthesis, not a log: it absorbs what is new and comes back to the same size, under 3,000 characters. Delete what is finished or overtaken rather than striking it through \u2014 the journal keeps it and every version of the hand-off is archived, so nothing is lost by cutting. Keep Left in the order you would actually do it. Run `/nudge:handoff` for how.\n- If a marked Nudge block sits at the bottom of the hand-off, it is Nudge's own and is rewritten; never edit it, answer it by fixing your text.";
const RULES_HEADING = "### Journal and hand-off";
const NOTES_RULES = "### Notes (Nudge memory)\n- Notes `.nudge/log/<YYYY-MM-DD>-<first 8 chars of your session id>.md`: this session's own file, no other session writes it. At the end of every turn append a heading `## <local ISO time with its offset, like 2026-09-26T12:08:01-04:00>` and one line per piece of what happened: `- <kind>: <text>`. Kinds: asked, did, decided, fact, todo, done, trap, question, idea, delegated (helpers handed work, in counts: \"3 handed off (2 sonnet, 1 opus), 1 kept; why\"). End a line with the user's own words in double quotes when they said something worth keeping.\n- One piece per line, in plain words a reader of just that line understands. A side idea said mid-task is its own `- idea:` line. A question only the user can answer is `- question:`.\n- Never edit an earlier line; a correction is a new line. Do not write links or names: Nudge adds them.\n- `.nudge/journal.md` and `.nudge/handoff.md` are history: read them when useful, never write them.";
const NOTES_RULES_HEADING = "### Notes (Nudge memory)";
const MODULES = ["  continuity  Keeps notes of what each session did, so the next one starts where the last stopped, and says when a conversation has grown long enough to /clear.", "  delegation  Names the cheapest model proven on each helper's job, and once you type delegate, has Claude hand those jobs to Haiku.", "  phone       Off until you ask for it: turn on phone sessions to keep each project ready in the Claude app on your phone."];
const HEADING = /^## (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))(?:\s+·\s+session\s+([A-Za-z0-9-]+))?\s*$/;
if (["check", "quiet", "notices", "updates", "refresh", "cleanup", "consent", "switch", "handover", "delegate", "notes"].includes(EVENT)) {
  try {
    if (EVENT === "consent") answerConsent(process.argv[3]);
    else if (EVENT === "handover") handoverSwitch(process.argv[3], process.argv[4]);
    else if (EVENT === "delegate") process.stdout.write(delegateSwitch(process.argv.slice(3), process.cwd()) + "\n");
    else if (EVENT === "notes") process.stdout.write(shareNotes(process.argv[3] === "shared" ? "on" : "off", process.cwd()) + "\n");
    else if (EVENT === "switch") flip(process.argv[3], process.argv[4], process.argv[5]);
    else if (EVENT === "refresh") refreshOffered();
    else if (EVENT === "check") check();
    else if (EVENT === "cleanup") cleanup(process.argv[3] === "apply");
    else if (EVENT === "quiet") setQuiet(process.argv[3] !== "off");
    else if (EVENT === "updates") setUpdates(process.argv[3] !== "off");
    else setNotices(process.argv[3] !== "off");
  } catch {
  }
  process.exit(0);
}
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("error", () => process.exit(0));
process.stdin.on("end", () => {
  try {
    run(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
  } catch {
  }
  process.exit(0);
});
function defaultHome() {
  return path.join(os.homedir(), ".nudge");
}
function samePath(a, b) {
  if (a === b) return true;
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}
function findRepo(cwd) {
  let dir = path.resolve(cwd || process.cwd());
  for (; ; ) {
    const nudge = path.join(dir, ".nudge");
    if (!samePath(nudge, HOME) && !samePath(nudge, defaultHome()) && fs.existsSync(nudge)) return dir;
    const up = path.dirname(dir);
    if (up === dir) return void 0;
    dir = up;
  }
}
const LAST_PROJECT = path.join(HOME, "last-project");
function rememberProject(repo) {
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(LAST_PROJECT, repo);
  } catch {
  }
}
function lastProject() {
  try {
    const dir = fs.readFileSync(LAST_PROJECT, "utf8").trim();
    return dir && fs.existsSync(path.join(dir, ".nudge")) && !memoryOffFor(dir) ? dir : void 0;
  } catch {
    return void 0;
  }
}
function knownProjects(repo) {
  const seen = /* @__PURE__ */ new Map();
  const add = (dir) => {
    if (typeof dir !== "string" || !dir.trim()) return;
    const d = path.resolve(dir.trim());
    const key = process.platform === "win32" ? d.toLowerCase() : d;
    if (seen.has(key)) return;
    const nudge = path.join(d, ".nudge");
    if (samePath(nudge, HOME) || samePath(nudge, defaultHome()) || !fs.existsSync(nudge)) return;
    seen.set(key, d);
  };
  const each = (dir, suffix, read) => {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(suffix)) continue;
        try {
          add(read(fs.readFileSync(path.join(dir, name), "utf8")));
        } catch {
        }
      }
    } catch {
    }
  };
  try {
    add(fs.readFileSync(LAST_PROJECT, "utf8"));
  } catch {
  }
  each(turnsDir(), ".repo", (t) => t);
  each(path.join(HOME, "remote"), ".json", (t) => JSON.parse(t).repo);
  if (repo) {
    const up = path.dirname(repo);
    try {
      for (const e of fs.readdirSync(up, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith(".")) add(path.join(up, e.name));
    } catch {
    }
  }
  return [...seen.values()];
}
const EVIDENCE_CHUNK = 16 * 1024 * 1024;
const EVIDENCE_MIN = 3;
function pathsInto(text, dir) {
  const win = process.platform === "win32";
  const norm = (s) => {
    let t = s.replace(/\\+/g, "/");
    if (win) t = t.replace(/\/([a-zA-Z])\//g, "$1:/").toLowerCase();
    return t;
  };
  const root = norm(dir).replace(/\/+$/, "");
  const hay = norm(text);
  let n = 0;
  let at = hay.indexOf(root);
  while (at !== -1) {
    const after = hay.slice(at + root.length, at + root.length + 9);
    if (after.startsWith("/")) {
      const rest = after.slice(1);
      if (/^[a-z0-9_@-]/i.test(rest) || rest.startsWith(".") && !rest.startsWith(".nudge")) n++;
    } else if (!/^[a-z0-9_.@-]/i.test(after) && hay.slice(Math.max(0, at - 3), at) === "cd ") n++;
    at = hay.indexOf(root, at + root.length);
  }
  return n;
}
function readAdopted(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return { offset: Number(raw.offset) || 0, counts: raw.counts && typeof raw.counts === "object" ? raw.counts : {} };
  } catch {
    return { offset: 0, counts: {} };
  }
}
function repinFromEvidence(mark, pinned, transcriptPath) {
  const adoptedMark = mark + ".adopted";
  if (!fs.existsSync(adoptedMark) || typeof transcriptPath !== "string" || !transcriptPath) return void 0;
  const state = readAdopted(adoptedMark);
  let text;
  try {
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const size = fs.fstatSync(fd).size;
      if (size < state.offset) state.offset = 0;
      const len = Math.min(EVIDENCE_CHUNK, size - state.offset);
      if (len <= 0) return void 0;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, state.offset);
      text = buf.toString("utf8");
      state.offset += len;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return void 0;
  }
  let own = 0;
  let best;
  for (const dir of knownProjects(pinned)) {
    const n = (state.counts[dir] || 0) + pathsInto(text, dir);
    state.counts[dir] = n;
    if (samePath(dir, pinned)) own = n;
    else if (!best || n > best.n) best = { dir, n };
  }
  try {
    fs.writeFileSync(adoptedMark, JSON.stringify(state));
  } catch {
  }
  if (!best || best.n < EVIDENCE_MIN || best.n < 2 * own) return void 0;
  try {
    fs.writeFileSync(mark + ".repo", best.dir);
    fs.rmSync(adoptedMark, { force: true });
  } catch {
    return void 0;
  }
  return best.dir;
}
function moveNotes(from, to, sessionId) {
  const short = sessionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
  if (!short || !notesMode(from) || !notesMode(to)) return false;
  let moved = false;
  try {
    for (const name of fs.readdirSync(path.join(from, ".nudge", "log"))) {
      if (!name.endsWith("-" + short + ".md")) continue;
      const src = path.join(from, ".nudge", "log", name);
      const dst = path.join(to, ".nudge", "log", name);
      if (fs.existsSync(dst)) {
        fs.appendFileSync(dst, fs.readFileSync(src, "utf8"));
        fs.rmSync(src, { force: true });
      } else fs.renameSync(src, dst);
      moved = true;
    }
  } catch {
  }
  return moved;
}
function namePattern(dir) {
  const parts = path.basename(dir).toLowerCase().split(/[-_. ]+/).filter(Boolean);
  if (!parts.length || parts.join("").length < 4) return void 0;
  const esc = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("(?<![A-Za-z0-9])" + esc.join("[-_. ]?") + "(?![A-Za-z0-9])", "gi");
}
function namedProject(prompt, repo) {
  let text = String(prompt);
  const own = repo ? namePattern(repo) : void 0;
  if (own) text = text.replace(own, " ");
  let best;
  for (const dir of knownProjects(repo)) {
    if (repo && samePath(dir, repo)) continue;
    const re = namePattern(dir);
    if (re && re.test(text) && (!best || path.basename(dir).length > path.basename(best).length)) best = dir;
  }
  return best;
}
function shortTime(ms) {
  const d = new Date(ms);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d.getDate() + " " + MON[d.getMonth()] + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function oneLine(s, max) {
  const t = String(s).replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "\u2026" : t;
}
function whereItStands(dir) {
  try {
    const lines = fs.readFileSync(path.join(dir, ".nudge", "handoff.md"), "utf8").split(/\r?\n/);
    const start = lines.findIndex((l) => /^##\s+Left\b/i.test(l));
    if (start >= 0) {
      for (const l of lines.slice(start + 1)) {
        if (/^##\s/.test(l)) break;
        const m = /^\s*(?:\d+[.)]|[-*])\s+(.*\S)/.exec(l);
        if (m) return "next: " + oneLine(m[1], 140);
      }
    }
  } catch {
  }
  try {
    let last;
    let inEntry = false;
    for (const l of fs.readFileSync(path.join(dir, ".nudge", "journal.md"), "utf8").split(/\r?\n/)) {
      if (HEADING.test(l)) {
        inEntry = true;
        last = void 0;
        continue;
      }
      if (inEntry && last === void 0 && l.trim()) last = l.replace(/^\s*[-*]\s+/, "");
    }
    if (last) return "latest: " + oneLine(last, 140);
  } catch {
  }
  return void 0;
}
function routeLine(dir) {
  const files = ["handoff.md", "journal.md", "log"].map((f) => path.join(dir, ".nudge", f));
  let at = 0;
  for (const f of files) {
    try {
      at = Math.max(at, fs.statSync(f).mtimeMs);
    } catch {
    }
  }
  const home = os.homedir();
  const rel = path.relative(home, dir);
  const name = rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? "~/" + rel.split(path.sep).join("/") : path.basename(dir);
  const read = files.slice(0, 2).find((f) => fs.existsSync(f)) || path.join(dir, ".nudge");
  const state = whereItStands(dir);
  return `This is about ${name} (${dir})${at ? ", last there " + shortTime(at) : ""}${state ? ", " + state : ""}. Read ${read} before answering.`;
}
function stamp(d) {
  const off = -d.getTimezoneOffset();
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const local = new Date(d.getTime() + off * 6e4).toISOString().slice(0, 19);
  return local + (off === 0 ? "Z" : (off > 0 ? "+" : "-") + pad(Math.trunc(off / 60)) + ":" + pad(off % 60));
}
function utc(s) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 19) + "Z";
}
function ownEntries(journal, sessionId) {
  if (!sessionId || sessionId === "unknown") return void 0;
  const short = sessionId.slice(0, 8);
  try {
    let n = 0;
    for (const line of fs.readFileSync(journal, "utf8").split(/\r?\n/)) {
      const m = HEADING.exec(line);
      if (m && m[2] && m[2].slice(0, 8) === short) n++;
    }
    return n;
  } catch {
    return void 0;
  }
}
function historyDir(repo) {
  return path.join(repo, ".nudge", "handoff-history");
}
function historyFiles(repo) {
  try {
    return fs.readdirSync(historyDir(repo)).filter((n) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z(-[A-Za-z0-9]+)?\.md$/.test(n)).sort();
  } catch {
    return [];
  }
}
function agentHalf(text) {
  const at = text.indexOf("<!-- nudge:start");
  return (at < 0 ? text : text.slice(0, at)).trimEnd();
}
function archiveHandoff(repo, sessionId) {
  try {
    const file = path.join(repo, ".nudge", "handoff.md");
    const text = agentHalf(fs.readFileSync(file, "utf8"));
    if (!text) return;
    const kept = historyFiles(repo);
    const newest = kept[kept.length - 1];
    if (newest) {
      try {
        if (agentHalf(fs.readFileSync(path.join(historyDir(repo), newest), "utf8")) === text) return;
      } catch {
      }
    }
    const short = String(sessionId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
    const at = utc(stamp(/* @__PURE__ */ new Date())).replace(/:/g, "-");
    let name = at + (short ? "-" + short : "") + ".md";
    for (let i = 2; fs.existsSync(path.join(historyDir(repo), name)) && i < 100; i++) name = at + "-" + (short || "") + i + ".md";
    fs.mkdirSync(historyDir(repo), { recursive: true });
    fs.writeFileSync(path.join(historyDir(repo), name), text + "\n");
    for (const old of historyFiles(repo).slice(0, -HISTORY_KEPT)) {
      try {
        fs.rmSync(path.join(historyDir(repo), old));
      } catch {
      }
    }
  } catch {
  }
}
function fattestSection(text) {
  const sizes = /* @__PURE__ */ new Map();
  let current;
  for (const line of text.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = h[1];
      sizes.set(current, 0);
      continue;
    }
    if (current) sizes.set(current, sizes.get(current) + line.length + 1);
  }
  let best;
  for (const [heading, chars] of sizes) if (!best || chars > best.chars) best = { heading, chars };
  return best;
}
const k = (n) => Math.round(n / 1e3) + "K";
function contextTokens(transcriptPath) {
  if (typeof transcriptPath !== "string" || !transcriptPath) return void 0;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, "r");
    const size = fs.fstatSync(fd).size;
    for (const span of [256 * 1024, 4 * 1024 * 1024]) {
      const len = Math.min(span, size);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString("utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('"assistant"')) continue;
        try {
          const row = JSON.parse(lines[i]);
          if (row.type !== "assistant" || row.isSidechain === true) continue;
          const u = row.message && row.message.usage;
          if (!u) continue;
          const n = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          if (n > 0) return n;
        } catch {
        }
      }
      if (len >= size) break;
    }
  } catch {
    return void 0;
  } finally {
    if (fd !== void 0) fs.closeSync(fd);
  }
  return void 0;
}
function cliPath() {
  const names = process.platform === "win32" ? ["nudge.cmd", "nudge.exe", "nudge"] : ["nudge"];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
      }
    }
  }
  return void 0;
}
function newer(a, b) {
  const part = (v) => String(v).split("-")[0].split(".").map((n) => Number.parseInt(n, 10));
  const [x, y] = [part(a), part(b)];
  if (x.some(Number.isNaN) || y.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}
function settingsPathFor() {
  return path.join(claudeDir(), "settings.json");
}
function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPathFor(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function autoUpdateState() {
  const entry = readSettings()?.extraKnownMarketplaces?.nudge;
  if (!entry) return "unknown";
  return entry.autoUpdate === void 0 ? "unset" : entry.autoUpdate ? "on" : "off";
}
function writeAutoUpdate(value) {
  const settings = readSettings();
  if (!settings) return false;
  const entry = settings.extraKnownMarketplaces && settings.extraKnownMarketplaces.nudge;
  if (!entry) return false;
  entry.autoUpdate = value;
  try {
    const at = settingsPathFor();
    const tmp = at + ".nudge-tmp";
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
    fs.renameSync(tmp, at);
    return true;
  } catch {
    return false;
  }
}
function ensureAutoUpdate() {
  return autoUpdateState() === "unset" && writeAutoUpdate(true);
}
function setUpdates(on) {
  if (writeAutoUpdate(on)) {
    process.stdout.write(
      on ? "Nudge updates itself: every hour it looks for a new version, installs it, and tells you at your next session start. It also asks Claude Code to do the same in the background, but that path is unreliable today (anthropics/claude-code issue #95175), so Nudge's own is the one to rely on.\n" : 'Nudge will not update itself on this machine any more. To get a new version, run `claude plugin update nudge`. Say "turn Nudge updates back on" to undo this.\n'
    );
    return;
  }
  process.stdout.write("Nudge could not change that setting: it could not find its marketplace in " + settingsPathFor() + ". Nothing was written.\n");
}
function marketplaceVersion() {
  try {
    const dir = claudeDir();
    const known = JSON.parse(fs.readFileSync(path.join(dir, "plugins", "known_marketplaces.json"), "utf8"));
    for (const entry of Object.values(known)) {
      const at = entry && entry.installLocation;
      if (typeof at !== "string") continue;
      const manifest = JSON.parse(fs.readFileSync(path.join(at, ".claude-plugin", "marketplace.json"), "utf8"));
      for (const plugin of manifest.plugins || []) if (plugin && plugin.name === "nudge" && plugin.version) return String(plugin.version);
    }
  } catch {
  }
  return void 0;
}
function offeredPath() {
  return path.join(HOME, "offered");
}
function marketplaceClone() {
  try {
    const known = JSON.parse(fs.readFileSync(path.join(claudeDir(), "plugins", "known_marketplaces.json"), "utf8"));
    for (const [name, entry] of Object.entries(known)) {
      if (name !== "nudge") continue;
      const at = entry && entry.installLocation;
      if (typeof at === "string" && fs.existsSync(path.join(at, ".git"))) return at;
    }
  } catch {
  }
  return void 0;
}
function offeredVersion() {
  try {
    const { version, at } = JSON.parse(fs.readFileSync(offeredPath(), "utf8"));
    if (typeof version !== "string" || Date.now() - (Number(at) || 0) > 7 * NOTICE_EVERY) return void 0;
    return version;
  } catch {
    return void 0;
  }
}
function claudePath() {
  const names = process.platform === "win32" ? ["claude.cmd", "claude.exe", "claude"] : ["claude"];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
      }
    }
  }
  return void 0;
}
function recordUpdate(result) {
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(path.join(HOME, "updated"), JSON.stringify({ ...result, at: Date.now() }));
  } catch {
  }
}
function lastUpdate() {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(HOME, "updated"), "utf8"));
    return Date.now() - (Number(r.at) || 0) > NOTICE_EVERY ? void 0 : r;
  } catch {
    return void 0;
  }
}
function installUpdate(to) {
  if (autoUpdateState() === "off") return recordUpdate({ to, ok: false, why: "you have turned Nudge's updates off" });
  const claude = claudePath();
  if (!claude) return recordUpdate({ to, ok: false, why: "the claude command is not on PATH here" });
  const run2 = (...args) => execFileSync(claude, args, { encoding: "utf8", timeout: 12e4, stdio: ["ignore", "pipe", "pipe"], shell: /\.cmd$/i.test(claude) });
  try {
    run2("plugin", "marketplace", "update", "nudge");
    run2("plugin", "update", "nudge");
    recordUpdate({ to, ok: true });
  } catch (e) {
    recordUpdate({ to, ok: false, why: String(e && e.message || e).split("\n")[0].slice(0, 200) });
  }
}
function refreshOffered() {
  const clone = marketplaceClone();
  if (!clone) return;
  const git = (args) => execFileSync("git", ["-C", clone, ...args], {
    encoding: "utf8",
    timeout: 2e4,
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new" }
  });
  try {
    git(["fetch", "--quiet", "origin"]);
    const manifest = JSON.parse(git(["show", "FETCH_HEAD:.claude-plugin/marketplace.json"]));
    for (const plugin of manifest.plugins || []) {
      if (plugin && plugin.name === "nudge" && plugin.version) {
        const offered = String(plugin.version);
        fs.mkdirSync(HOME, { recursive: true });
        fs.writeFileSync(offeredPath(), JSON.stringify({ version: offered, at: Date.now() }));
        const mine = pluginVersion();
        if (mine && newer(offered, mine)) installUpdate(offered);
        return;
      }
    }
  } catch {
  }
}
function delegationOn(repo) {
  if (!repo || offOnMachine("delegation") || offHere(repo, "delegation")) return false;
  return fs.existsSync(path.join(repo, ".nudge", "delegation")) || consent() === "yes";
}
function observeDelegation(repo) {
  if (!delegationOn(repo)) return;
  try {
    const script = path.join(path.dirname(SELF), "delegation.mjs");
    if (!fs.existsSync(script)) return;
    const at = path.join(HOME, "delegation-looked");
    try {
      if (Date.now() - (Number(fs.readFileSync(at, "utf8")) || 0) < LOOK_EVERY) return;
    } catch {
    }
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(at, String(Date.now()));
    spawn(process.execPath, [script, "observe"], { detached: true, stdio: "ignore" }).unref();
  } catch {
  }
}
function startShadowDashboard(repo) {
  if (!delegationOn(repo)) return;
  try {
    const script = path.join(path.dirname(SELF), "delegation.mjs");
    if (!fs.existsSync(script)) return;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(HOME, "dashboard.json"), "utf8"));
      process.kill(d.pid, 0);
      return;
    } catch {
    }
    spawn(process.execPath, [script, "dashboard"], { detached: true, stdio: "ignore" }).unref();
  } catch {
  }
}
function spendWatchOn(repo) {
  if (!repo || offOnMachine("spend") || offHere(repo, "spend")) return false;
  return fs.existsSync(path.join(repo, "scripts", "lib", "build-ai.ts"));
}
const SPEND_BATCH_RULE = "Nudge, AI spend watch: this project runs AI build jobs (scripts that import scripts/lib/build-ai). Before starting one, estimate its online cost: the items it will do \xD7 that job's per-item cost in ~/.creatos-build-ai/spend.jsonl (about $0.006 an item for Haiku tagging and $0.01 for a Sonnet check where the log has none). Over $0.50, run it through runClaudeBatch (the script's --batch flag where it has one; half price), started in the background (run_in_background), and keep working with the owner while it runs; do not ask the owner whether to batch. Run online as it stands, build-ai stops it at $0.50 with BuildCapReached.";
function spendRead() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(HOME, "spend-watch.json"), "utf8"));
    return c && c.version === 1 && c.day === (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) && typeof c.line === "string" ? c : void 0;
  } catch {
    return void 0;
  }
}
function startSpendWatch(repo) {
  if (!spendWatchOn(repo)) return;
  try {
    const script = path.join(path.dirname(SELF), "delegation.mjs");
    if (!fs.existsSync(script)) return;
    const c = spendRead();
    if (c && c.complete) return;
    const at = path.join(HOME, "spend-looked");
    try {
      if (Date.now() - (Number(fs.readFileSync(at, "utf8")) || 0) < LOOK_EVERY) return;
    } catch {
    }
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(at, String(Date.now()));
    spawn(process.execPath, [script, "spend"], { detached: true, stdio: "ignore" }).unref();
  } catch {
  }
}
function spawnsOf(sessionId) {
  const out = [];
  try {
    for (const line of fs.readFileSync(path.join(HOME, "spawns.jsonl"), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.session === sessionId && e.source !== "plan" && e.decision !== "deny") out.push({ requested: e.requested || null, advised: e.advised || null });
      } catch {
      }
    }
  } catch {
  }
  return out;
}
function delegationRead() {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(HOME, "delegation.json"), "utf8"));
    if (!o || o.version !== 1) return { line: "", direction: "", tasks: [], outcomes: void 0 };
    return {
      line: typeof o.line === "string" ? o.line : "",
      direction: typeof o.direction === "string" ? o.direction : "",
      // Read defensively: this file is written by a separate script that may be a version ahead or behind.
      tasks: Array.isArray(o.tasks) ? o.tasks.filter((t) => t && typeof t.task === "string" && typeof t.runs === "number") : [],
      outcomes: o.outcomes && typeof o.outcomes.worked === "number" ? o.outcomes : void 0,
      loop: o.loop && typeof o.loop.spawns === "number" && typeof o.loop.since === "string" ? o.loop : void 0
    };
  } catch {
    return { line: "", direction: "", tasks: [], outcomes: void 0 };
  }
}
function consent() {
  const admin = (process.env.NUDGE_CONSENT || "").trim().toLowerCase();
  if (admin === "yes" || admin === "no") return admin;
  try {
    const word = fs.readFileSync(path.join(HOME, "consent"), "utf8").trim().split(/\s+/)[0];
    return word === "yes" || word === "no" ? word : void 0;
  } catch {
    return void 0;
  }
}
function offOnMachine(module) {
  return fs.existsSync(path.join(HOME, "off-" + module));
}
function offHere(repo, module) {
  return !!repo && fs.existsSync(path.join(repo, ".nudge", "off-" + module));
}
const RECEIPT_DIRECTION = "Nudge, handover: after a helper returns, call handover_receipt and deal with the untested files it lists (read them, ask for a test, or keep that part) before building on the work.";
const SHADOW_DIRECTION = "Nudge, shadow mode is on in this project: for each piece of code you change, first write a test that fails now on an assertion and passes when the piece is done, then call ask_delegation with the operation, brief (as you would write it for a worker), files (the list of repo-relative paths, your test among them), check (the command that runs that test file; no whole-tree typecheck) and lines. That call starts a cheap worker on the same piece in a copy; nothing comes back to you. Then do the work yourself and commit it.";
const SHADOW_PROMPT = "Nudge shadow: before changing code, write its failing test, then ask_delegation with brief, files (list), check (that test's command) and lines; then do the work and commit.";
function shadowHere(repo) {
  return !!repo && delegationOn(repo) && handoverAdvise(repo) && fs.existsSync(path.join(repo, ".nudge", "handover-gateway")) && fs.existsSync(path.join(repo, ".nudge", "worker-shadow"));
}
function shadowPassedFirst(sessionId) {
  const short = String(sessionId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
  if (!short) return void 0;
  const dir = path.join(HOME, "workers");
  const since = Date.now() - 3 * 864e5;
  const found = [];
  try {
    for (const id of fs.readdirSync(dir)) {
      const d = path.join(dir, id);
      try {
        if (fs.statSync(path.join(d, "result.json")).mtimeMs < since || fs.existsSync(path.join(d, "told"))) continue;
        const r = JSON.parse(fs.readFileSync(path.join(d, "result.json"), "utf8"));
        if (!String(r && r.why || "").startsWith("not measurable: the check already passes before any work")) continue;
        const j = JSON.parse(fs.readFileSync(path.join(d, "job.json"), "utf8"));
        if (String(j && j.session || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) !== short) continue;
        found.push({ d, check: String(j.check || "") });
      } catch {
      }
    }
  } catch {
    return void 0;
  }
  if (!found.length) return void 0;
  for (const f of found) {
    try {
      fs.writeFileSync(path.join(f.d, "told"), String(Date.now()));
    } catch {
    }
  }
  return "Nudge shadow: " + found.length + " of your shadow jobs " + (found.length === 1 ? "was" : "were") + " not measured because its test already passed before the work (check: " + found[0].check + "). Before ask_delegation, run your test and see it fail on an assertion; a test that passes now does not describe the work.";
}
function handoverAdvise(repo) {
  if (repo && fs.existsSync(path.join(repo, ".nudge", "handover-shadow"))) return false;
  if (repo && fs.existsSync(path.join(repo, ".nudge", "handover-advise"))) return true;
  try {
    const c = JSON.parse(fs.readFileSync(path.join(HOME, "delegation-api.json"), "utf8"));
    const pct = c && c.handover && c.handover.weeklyPct;
    if (typeof pct === "number" && pct > 0 && pct <= 100) {
      try {
        const w = JSON.parse(fs.readFileSync(path.join(HOME, "usage", "limits.json"), "utf8")).seven_day;
        if (w && typeof w.used_percentage === "number" && typeof w.resets_at === "number" && w.resets_at * 1e3 > Date.now() && w.used_percentage >= pct) return true;
      } catch {
      }
    }
    return !!c && !!c.handover && c.handover.mode === "advise";
  } catch {
    return false;
  }
}
function handoverSwitch(state, pctArg) {
  const words = state === "on" ? ["auto", ...pctArg === void 0 ? [] : [pctArg]] : state === "off" ? ["off"] : ["help"];
  process.stdout.write(delegateSwitch(words, process.cwd()) + "\n");
}
function delegateSwitch(words, cwd) {
  const w = words.map((x) => String(x).toLowerCase()).filter(Boolean);
  const cfgFile = path.join(HOME, "delegation-api.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8")) || {};
  } catch {
  }
  const handover = cfg.handover && typeof cfg.handover === "object" ? cfg.handover : {};
  const save = () => {
    if (Object.keys(handover).length) cfg.handover = handover;
    else delete cfg.handover;
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(cfgFile + ".tmp", JSON.stringify(cfg, null, 2) + "\n");
    fs.renameSync(cfgFile + ".tmp", cfgFile);
  };
  const a = w[0] ?? "on";
  const b = w[1];
  if (a === "on" || a === "always" || a === "now") {
    handover.mode = "advise";
    delete handover.weeklyPct;
    save();
    return 'Delegation is on for this machine: Nudge now tells Claude to hand suitable jobs to Haiku helpers on your plan. Say "delegate off" to stop it, or "delegate auto" to wait until the week is 70% used.';
  }
  if (a === "auto") {
    if (apiSignIn()) return 'You sign in with an API key, so there is no weekly limit for "delegate auto" to wait for. Say "delegate" to switch delegation on now: Haiku costs a fraction as much per token.';
    const pct = b === void 0 ? 70 : Number(b);
    if (!(Number.isInteger(pct) && pct > 0 && pct <= 100)) return "The percent is a whole number from 1 to 100.";
    delete handover.mode;
    handover.weeklyPct = pct;
    save();
    return "Delegation switches itself on once your weekly Claude limit passes " + pct + "%: from then Nudge tells Claude to hand suitable jobs to Haiku helpers on your plan; until then it only advises. " + statusLineOn() + ' Say "delegate off" to undo it.';
  }
  if (a === "off") {
    delete handover.mode;
    delete handover.weeklyPct;
    save();
    return ("Delegation is off for this machine: Nudge still names the model a helper should use, and Claude decides. " + statusLineOff()).trim();
  }
  if (a === "strict") {
    if (b === "off") {
      delete cfg.guard;
      save();
      return "The guard is off: Nudge reminds Claude to plan its helpers and names the advised model, and blocks nothing.";
    }
    cfg.guard = true;
    save();
    return 'The guard is on: a helper started with no plan, or on a dearer model than the proven one without a stated reason, is blocked and Claude is told why. Say "delegate strict off" to undo it.';
  }
  const repo = findRepo(cwd) || gitRoot(cwd);
  if (a === "workers") {
    if (envOff("NUDGE_WORKERS")) return "Outside models are turned off on this machine by your administrator (NUDGE_WORKERS=off).";
    if (!repo) return "Outside models are switched on per project: say it inside a project.";
    const marker = path.join(repo, ".nudge", "handover-gateway");
    if (b === "off") {
      fs.rmSync(marker, { force: true });
      return "Outside models are off for " + path.basename(repo) + ".";
    }
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "");
    const key = ["NUDGE_GATEWAY_KEY", "AI_GATEWAY_API_KEY"].some((n) => (process.env[n] || "").trim());
    return "Outside models are on for " + path.basename(repo) + ": while delegation is on, Nudge can hand a job to a cheaper non-Claude model through your own AI gateway. The job's files go to that model's company, it is billed by the gateway rather than your Claude plan, and Nudge checks the work before it reaches you." + (key ? "" : " No gateway key is set yet: create one at https://vercel.com/ai-gateway, set it as AI_GATEWAY_API_KEY, and restart Claude Code.");
  }
  if (a === "status") {
    const on = handover.mode === "advise" ? "on" : handover.weeklyPct ? "on once the week passes " + handover.weeklyPct + "%" : "off (advice only)";
    const workers = repo && fs.existsSync(path.join(repo, ".nudge", "handover-gateway")) ? "on here" : "off here";
    return "Delegation " + on + " \xB7 guard " + (cfg.guard === true ? "on" : "off") + " \xB7 outside models " + workers + ".";
  }
  return 'Say "delegate" (on now), "delegate auto" (on once the week passes 70%), "delegate off", "delegate strict" (block unplanned helpers), "delegate workers" (outside models in this project) or "delegate status".';
}
function bridgePath() {
  return path.join(HOME, "statusline.mjs");
}
function slash(p) {
  return p.split(path.sep).join("/");
}
function nudgeStatusLine(v) {
  return !!v && typeof v === "object" && typeof v.command === "string" && slash(v.command).toLowerCase().includes(slash(HOME).toLowerCase() + "/statusline.");
}
function writeSettingsFile(settingsPath, raw, settings) {
  if (raw) fs.writeFileSync(settingsPath + ".nudge-backup-" + (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-"), raw);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath + ".nudge-tmp", JSON.stringify(settings, null, 2) + "\n");
  fs.renameSync(settingsPath + ".nudge-tmp", settingsPath);
}
function readSettingsFile(settingsPath) {
  let raw = "";
  try {
    raw = fs.readFileSync(settingsPath, "utf8");
  } catch {
    return { raw: "", settings: {} };
  }
  try {
    const s = raw.trim() ? JSON.parse(raw) : {};
    return s && typeof s === "object" && !Array.isArray(s) ? { raw, settings: s } : void 0;
  } catch {
    return void 0;
  }
}
function statusLineOn() {
  const settingsPath = settingsPathFor();
  const read = readSettingsFile(settingsPath);
  if (!read) return "Your Claude Code settings file is not plain JSON, so the status line was left alone and Nudge cannot see the weekly figure yet.";
  const current = read.settings.statusLine;
  if (nudgeStatusLine(current)) {
    if (fs.existsSync(bridgePath()) && fs.readFileSync(bridgePath(), "utf8").startsWith(BRIDGE_MARKER)) fs.writeFileSync(bridgePath(), BRIDGE);
    return "Your status line already passes Nudge the weekly figure.";
  }
  if (current !== void 0 && current !== null && (typeof current !== "object" || current.type !== "command" || typeof current.command !== "string"))
    return "Your status line is not a command Nudge can run, so it was left alone and Nudge cannot see the weekly figure yet.";
  fs.writeFileSync(
    path.join(HOME, STATUSLINE_ORIGINAL),
    JSON.stringify({ version: 1, savedAt: (/* @__PURE__ */ new Date()).toISOString(), settingsPath, statusLine: current || null }, null, 2) + "\n"
  );
  fs.writeFileSync(bridgePath(), BRIDGE);
  read.settings.statusLine = { ...current || { type: "command" }, command: 'node "' + slash(bridgePath()) + '"' };
  writeSettingsFile(settingsPath, read.raw, read.settings);
  return current ? "Your own status line still shows as it did; a small Nudge script now runs it and keeps the weekly figure, nothing else, in " + path.join(HOME, "usage") + "." : "The status line now shows your plan usage (5-hour and week), and Nudge keeps that figure, nothing else, in " + path.join(HOME, "usage") + ".";
}
function statusLineOff() {
  let script = "";
  try {
    script = fs.readFileSync(bridgePath(), "utf8");
  } catch {
  }
  if (!script.startsWith(BRIDGE_MARKER)) return "";
  const settingsPath = settingsPathFor();
  const read = readSettingsFile(settingsPath);
  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(path.join(HOME, STATUSLINE_ORIGINAL), "utf8"));
  } catch {
  }
  let said = "";
  if (read && nudgeStatusLine(read.settings.statusLine)) {
    if (stored && stored.statusLine) read.settings.statusLine = stored.statusLine;
    else delete read.settings.statusLine;
    writeSettingsFile(settingsPath, read.raw, read.settings);
    said = stored && stored.statusLine ? "Your own status line is back exactly as it was." : "Nudge's status line is removed.";
  }
  fs.rmSync(bridgePath(), { force: true });
  fs.rmSync(path.join(HOME, STATUSLINE_ORIGINAL), { force: true });
  return said;
}
function memoryOffFor(repo) {
  return offOnMachine("memory") || offHere(repo, "memory");
}
function memoryOn(repo) {
  return !!repo && !memoryOffFor(repo) && hasMemory(repo);
}
function hasMemory(repo) {
  return !!repo && (fs.existsSync(path.join(repo, ".nudge", "journal.md")) || notesMode(repo));
}
function notesMode(repo) {
  return !!repo && fs.existsSync(path.join(repo, ".nudge", "log"));
}
function notesFile(repo, sessionId) {
  const short = sessionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "unknown";
  return path.join(repo, ".nudge", "log", (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + "-" + short + ".md");
}
const NOTE_LINE = /^\s*[-*] (asked|did|decided|fact|todo|done|trap|question|idea):/i;
function ownNotes(repo, sessionId) {
  const short = sessionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
  if (!short) return void 0;
  const dir = path.join(repo, ".nudge", "log");
  let n = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith("-" + short + ".md")) continue;
      for (const line of fs.readFileSync(path.join(dir, name), "utf8").split(/\r?\n/)) if (NOTE_LINE.test(line)) n++;
    }
  } catch {
    return 0;
  }
  return n;
}
function coreScript() {
  return path.join(path.dirname(SELF), "memory-core.mjs");
}
function core(job, repo, sessionId, stdin) {
  if (!fs.existsSync(coreScript())) return void 0;
  try {
    const out = execFileSync(process.execPath, [coreScript(), job, repo, sessionId], { input: stdin || "", encoding: "utf8", timeout: 16e3, windowsHide: true });
    const last = out.trim().split(/\r?\n/).pop();
    const parsed = last ? JSON.parse(last) : void 0;
    return parsed && Array.isArray(parsed.visible) && Array.isArray(parsed.context) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function coreDetached(job, repo, sessionId, arg) {
  if (!fs.existsSync(coreScript())) return;
  try {
    spawn(process.execPath, [coreScript(), job, repo, sessionId, ...arg ? [arg] : []], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
  }
}
function gitRoot(cwd) {
  const home = os.homedir();
  let dir = path.resolve(cwd || process.cwd());
  for (; ; ) {
    if (samePath(dir, home)) return void 0;
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return void 0;
    dir = up;
  }
}
function startMemory(root) {
  const fresh = !fs.existsSync(path.join(root, ".nudge"));
  fs.mkdirSync(path.join(root, ".nudge", "log"), { recursive: true });
  if (fresh) keepNotesLocal(root, true);
}
function keepNotesLocal(root, on) {
  const EXCLUDE_LINE = "/.nudge/";
  try {
    const r = spawnSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8", timeout: 3e3, windowsHide: true });
    const rel = (r.stdout || "").trim();
    if (r.status !== 0 || !rel) return false;
    const file = path.isAbsolute(rel) ? rel : path.join(root, rel);
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
    }
    const lines = text.split(/\r?\n/);
    const has = lines.includes(EXCLUDE_LINE);
    if (on && !has) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, (text && !text.endsWith("\n") ? text + "\n" : text) + `# Nudge's session notes stay on this machine (say "share notes" to commit them)
` + EXCLUDE_LINE + "\n");
    } else if (!on && has) {
      fs.writeFileSync(file, lines.filter((l) => l !== EXCLUDE_LINE && !l.startsWith("# Nudge's session notes")).join("\n"));
    }
    return true;
  } catch {
    return false;
  }
}
function shareNotes(state, cwd) {
  const repo = findRepo(cwd) || gitRoot(cwd);
  if (!repo) return "Say it inside a project.";
  if (!keepNotesLocal(repo, state !== "on")) return "Could not reach this project's git settings, so nothing changed.";
  return state === "on" ? "Notes are shared in " + path.basename(repo) + ': .nudge/ shows in git now, so your session notes can be committed with the code. Say "keep notes local" to undo it.' : "Notes stay on this machine in " + path.basename(repo) + ": .nudge/ is kept out of git (in .git/info/exclude, no tracked file changed).";
}
function autoOn(cwd) {
  if (consent() !== "yes" || offOnMachine("memory")) return void 0;
  const root = gitRoot(cwd);
  if (!root || samePath(path.join(root, ".nudge"), HOME)) return void 0;
  if (offHere(root, "memory") || hasMemory(root)) return void 0;
  try {
    startMemory(root);
    return root;
  } catch {
    return void 0;
  }
}
function agentFileHasRules(repo, heading) {
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    try {
      if (fs.readFileSync(path.join(repo, name), "utf8").includes(heading || RULES_HEADING)) return true;
    } catch {
    }
  }
  return false;
}
function askConsent() {
  say.visible.push(
    [
      QUESTION,
      "Under the same yes it also names the cheapest proven model for each helper agent. Nothing is written into your CLAUDE.md, and nothing starts in the background. Each part can be turned off in one sentence, per project or for the whole machine.",
      "Answer yes or no \u2014 you are asked once."
    ].join("\n")
  );
  say.context.push(
    `Nudge has asked the user, once for this machine: "${QUESTION}" (plus: delegation advice under the same yes; phone sessions are not part of it). Make sure they have seen the question. A yes or no typed as the whole message is recorded by Nudge itself; only when they answer in other words, record it by running exactly: node "${SELF}" consent yes \u2014 or: node "${SELF}" consent no. Never answer for them and never run it before they reply. A no is final and is never asked again.`
  );
}
function answerConsent(word, cwd = process.cwd()) {
  process.stdout.write(consentReply(word, cwd) + "\n");
}
function consentReply(word, cwd) {
  if (word !== "yes" && word !== "no") return "Say consent yes or consent no.";
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(path.join(HOME, "consent"), word + " " + (/* @__PURE__ */ new Date()).toISOString() + "\n");
  if (word === "no") {
    return 'Recorded: no. Nudge will not ask again. Nothing turns on by itself; in a project, "turn on continuity here" switches it on there.';
  }
  const on = autoOn(cwd);
  const where = on || findRepo(cwd);
  const lines = ['Recorded: yes. From now on continuity and delegation advice switch on by themselves in every project you open. Phone sessions stay off until you say "turn on phone sessions".'];
  if (on) lines.push(`Continuity is now on in ${path.basename(on)}: its notes go in ${path.join(on, ".nudge", notesMode(on) ? "log" : "")} \xB7 say "turn off continuity here" if you don't want it.`);
  else if (where && memoryOn(where)) lines.push(`Continuity was already on in ${path.basename(where)}.`);
  else lines.push("This folder is not inside a project (no git repository), so nothing was created here.");
  const onNotes = notesMode(on || where);
  if ((on || where && memoryOn(where)) && !agentFileHasRules(on || where, onNotes ? NOTES_RULES_HEADING : RULES_HEADING))
    lines.push("", "The rules for this session, which Nudge will hand every new session here:", onNotes ? NOTES_RULES : RULES);
  return lines.join("\n");
}
function flip(module, state, scope) {
  const say1 = (s) => process.stdout.write(s + "\n");
  if (module === "continuity") module = "memory";
  if (!["memory", "delegation", "remote"].includes(module) || state !== "on" && state !== "off") {
    say1("Say switch <continuity|delegation|remote> <on|off> [here|machine].");
    return;
  }
  const label = module === "remote" ? "phone sessions" : module === "memory" ? "continuity" : module;
  if (scope === "machine") {
    const marker2 = path.join(HOME, "off-" + module);
    fs.mkdirSync(HOME, { recursive: true });
    if (state === "off") {
      fs.writeFileSync(marker2, (/* @__PURE__ */ new Date()).toISOString() + "\n");
      if (module === "remote") {
        fs.rmSync(path.join(HOME, "on-remote"), { force: true });
        stopListeners();
      }
      say1(`${label} is off on this machine, in every project. Nothing was deleted. Say "turn ${label} back on on this machine" to undo it.`);
    } else {
      fs.rmSync(marker2, { force: true });
      if (module === "remote") {
        if (apiSignIn()) return say1("Phone sessions need Claude Code signed in with a claude.ai account; this machine signs in with an API key, so they cannot run here.");
        fs.writeFileSync(path.join(HOME, "on-remote"), (/* @__PURE__ */ new Date()).toISOString() + "\n");
        return say1("Phone sessions are on on this machine: every project with continuity on is kept ready in the Claude app, by a claude remote-control that Nudge runs in the background for it.");
      }
      say1(`${label} is back on on this machine, in every project that has it.`);
    }
    return;
  }
  const repo = findRepo(process.cwd()) || gitRoot(process.cwd());
  if (!repo) {
    say1('This folder is not inside a project (no git repository), so there is nothing to switch here. Add "on this machine" to switch it everywhere.');
    return;
  }
  const dir = path.join(repo, ".nudge");
  const marker = path.join(dir, "off-" + module);
  const name = path.basename(repo);
  if (state === "off") {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(marker, (/* @__PURE__ */ new Date()).toISOString() + "\n");
    if (module === "delegation") fs.rmSync(path.join(dir, "delegation"), { force: true });
    if (module === "remote") stopListeners(repo);
    const keep = module === "memory" ? " The journal and the hand-off stay where they are." : "";
    const block = module === "memory" && agentFileHasRules(repo) ? " This project's CLAUDE.md or AGENTS.md still carries Nudge's memory block between the nudge:memory markers \u2014 remove it too if the rules should go." : "";
    say1(`${label} is off in ${name}. Nothing was deleted.${keep}${block} Say "turn ${label} back on here" to undo it.`);
    return;
  }
  fs.rmSync(marker, { force: true });
  if (module === "memory") startMemory(repo);
  if (module === "delegation" && consent() !== "yes") fs.writeFileSync(path.join(dir, "delegation"), "");
  if (module === "remote") {
    if (apiSignIn()) return say1("Phone sessions need Claude Code signed in with a claude.ai account; this machine signs in with an API key, so they cannot run here.");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "remote"), "");
    ensureListener(repo);
  }
  const off = offOnMachine(module) ? ` It is still off for the whole machine \u2014 say "turn ${label} back on on this machine" as well.` : "";
  say1(`${label} is on in ${name}.${off}`);
}
function remoteOn(repo) {
  if (apiSignIn() || envOff("NUDGE_PHONE")) return false;
  return memoryOn(repo) && !offOnMachine("remote") && !offHere(repo, "remote") && (fs.existsSync(path.join(HOME, "on-remote")) || fs.existsSync(path.join(repo, ".nudge", "remote")));
}
function apiSignIn() {
  const e = process.env;
  return !!((e.ANTHROPIC_API_KEY || "").trim() || (e.ANTHROPIC_AUTH_TOKEN || "").trim() || e.CLAUDE_CODE_USE_BEDROCK === "1" || e.CLAUDE_CODE_USE_VERTEX === "1" || e.CLAUDE_CODE_USE_FOUNDRY === "1");
}
function envOff(name) {
  return /^(off|0|false|no)$/i.test((process.env[name] || "").trim());
}
function listenerFile(repo) {
  let p = repo;
  try {
    p = fs.realpathSync(repo);
  } catch {
  }
  if (process.platform === "win32") p = p.toLowerCase();
  return path.join(HOME, "remote", crypto.createHash("sha1").update(p).digest("hex").slice(0, 12) + ".json");
}
function readListener(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return !!e && e.code === "EPERM";
  }
}
function sinceBoot(at) {
  return Number(at) > Date.now() - os.uptime() * 1e3;
}
function listenerRunning(rec) {
  return !!rec && Number(rec.pid) > 0 && sinceBoot(rec.startedAt) && pidAlive(Number(rec.pid));
}
function listenerBlocked(rec) {
  if (!rec || !rec.log || listenerRunning(rec)) return false;
  try {
    return /already served by a terminal/.test(fs.readFileSync(rec.log, "utf8").slice(0, 65536));
  } catch {
    return false;
  }
}
function blocked() {
  return "another `claude remote-control` started by hand is already serving this folder, so Nudge cannot keep its own or offer its link. Stop that one (Ctrl-C in its terminal); the next session start here starts Nudge's.";
}
function cleanEnv() {
  const env = { ...process.env };
  for (const k2 of Object.keys(env)) {
    if (k2 === "CLAUDECODE" || k2.startsWith("CLAUDE_CODE_") || k2.startsWith("CLAUDE_PLUGIN_") || k2 === "CLAUDE_PROJECT_DIR" || k2 === "CLAUDE_ENV_FILE") delete env[k2];
  }
  return env;
}
function resolveCmdShimEntry(cmdPath) {
  try {
    const text = fs.readFileSync(cmdPath, "utf8");
    const dir = path.dirname(cmdPath);
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes("%*")) continue;
      const quoted = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const entry = quoted.find((q) => /\.(mjs|cjs|js)$/i.test(q));
      if (entry) return entry.replace(/%dp0%/gi, dir);
    }
  } catch {
  }
  return void 0;
}
function ensureListener(repo) {
  if (!repo || !remoteOn(repo)) return;
  try {
    const file = listenerFile(repo);
    const rec = readListener(file);
    if (listenerRunning(rec)) return;
    if (rec && !listenerBlocked(rec) && sinceBoot(rec.startedAt) && Date.now() - Number(rec.startedAt) < LISTENER_RETRY) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const claude = claudePath();
    if (!claude) {
      fs.writeFileSync(file, JSON.stringify({ repo, startedAt: Date.now(), error: "the claude command is not on PATH here" }));
      return;
    }
    const log = file.replace(/\.json$/, ".log");
    const fd = fs.openSync(log, "w");
    const name = path.basename(repo);
    const args = ["remote-control", "--name", name, "--spawn=same-dir", "--no-create-session-in-dir"];
    const opts = { cwd: repo, detached: true, stdio: ["ignore", fd, fd], windowsHide: true, env: cleanEnv() };
    const isCmdShim = /\.cmd$/i.test(claude);
    const shimEntry = isCmdShim ? resolveCmdShimEntry(claude) : void 0;
    const child = shimEntry ? spawn(process.execPath, [shimEntry, ...args], opts) : isCmdShim ? spawn('"' + claude + '" ' + args.map((a) => '"' + a.replace(/"/g, "") + '"').join(" "), { ...opts, shell: true }) : spawn(claude, args, opts);
    child.on("error", () => {
    });
    child.unref();
    fs.closeSync(fd);
    fs.writeFileSync(file, JSON.stringify({ pid: child.pid, repo, name, startedAt: Date.now(), log }));
  } catch {
  }
}
function listenerLink(repo) {
  const rec = readListener(listenerFile(repo));
  if (!listenerRunning(rec) || !rec.log) return void 0;
  try {
    const fd = fs.openSync(rec.log, "r");
    const buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const m = /environment=(env_[A-Za-z0-9]+)/.exec(buf.subarray(0, n).toString("utf8"));
    return m ? "https://claude.ai/code?environment=" + m[1] : void 0;
  } catch {
    return void 0;
  }
}
function stopListeners(repo) {
  const dir = path.join(HOME, "remote");
  let files = [];
  try {
    files = repo ? [listenerFile(repo)] : fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  } catch {
    return;
  }
  for (const file of files) {
    const rec = readListener(file);
    if (listenerRunning(rec)) {
      try {
        if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(rec.pid), "/T", "/F"], { stdio: "ignore", timeout: 1e4 });
        else {
          try {
            process.kill(-Number(rec.pid));
          } catch {
            process.kill(Number(rec.pid));
          }
        }
      } catch {
      }
    }
    fs.rmSync(file, { force: true });
  }
}
function freshOffer(repo) {
  if (!remoteOn(repo)) return "";
  if (listenerBlocked(readListener(listenerFile(repo)))) return `No fresh-session link to offer: ${blocked()}`;
  const link = listenerLink(repo);
  return link ? `A fresh session for ${path.basename(repo)} is one tap away: ${link} \u2014 open it in the Claude app on your phone or in a browser; it starts from the hand-off.` : "";
}
function lookEvery() {
  try {
    const minutes = Number(fs.readFileSync(path.join(HOME, "look-every-minutes"), "utf8").trim());
    if (Number.isFinite(minutes) && minutes >= 1) return minutes * 60 * 1e3;
  } catch {
  }
  return LOOK_EVERY;
}
function lookForUpdate() {
  if (envOff("NUDGE_UPDATES")) return;
  try {
    const at = path.join(HOME, "looked");
    try {
      if (Date.now() - (Number(fs.readFileSync(at, "utf8")) || 0) < lookEvery()) return;
    } catch {
    }
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(at, String(Date.now()));
    spawn(process.execPath, [SELF, "refresh"], { detached: true, stdio: "ignore" }).unref();
  } catch {
  }
}
function turnsDir() {
  return path.join(HOME, "turns");
}
function currentSession() {
  try {
    let best;
    for (const name of fs.readdirSync(turnsDir())) {
      if (name.includes(".")) continue;
      const at = fs.statSync(path.join(turnsDir(), name)).mtimeMs;
      if (!best || at > best.at) best = { name, at };
    }
    return best && best.name;
  } catch {
    return void 0;
  }
}
function setQuiet(on) {
  const session = currentSession();
  if (!session) {
    process.stdout.write("Nudge has nothing to quiet here: no turn has been recorded in this session yet, which means continuity is not on in this project. /nudge:check says what is on.\n");
    return;
  }
  const flag = path.join(turnsDir(), session + ".quiet");
  if (on) {
    fs.writeFileSync(flag, String(Date.now()));
    process.stdout.write('Nudge is quiet for the rest of this session: no journal reminder each turn and no stop check. It still keeps the record \u2014 write an entry whenever you like, and Nudge will ask once if this runs long. Say "nudge quiet off" to bring it back.\n');
  } else {
    fs.rmSync(flag, { force: true });
    process.stdout.write("Nudge is back to normal for this session.\n");
  }
}
function setNotices(on) {
  const off = path.join(HOME, "notices-off");
  try {
    fs.mkdirSync(HOME, { recursive: true });
    if (on) fs.rmSync(off, { force: true });
    else fs.writeFileSync(off, String(Date.now()));
  } catch {
  }
  process.stdout.write(on ? "Nudge's daily line is back on.\n" : 'Nudge will not show its daily line again. Ask "what is Nudge doing?" whenever you want to see what is on.\n');
}
function cleanup(apply) {
  const settingsPath = path.join(claudeDir(), "settings.json");
  const out = [];
  let raw;
  try {
    raw = fs.readFileSync(settingsPath, "utf8");
  } catch {
    process.stdout.write(`No ${settingsPath} on this machine, so there is no daemon wiring to remove.
`);
    return;
  }
  let settings;
  try {
    settings = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    process.stdout.write(`${settingsPath} is not valid JSON, so Nudge will not touch it. Fix or restore it first.
`);
    return;
  }
  const marker = ":47711/hooks/";
  const dead = (h) => {
    if (!h || typeof h !== "object") return false;
    if (h.type === "http") return typeof h.url === "string" && h.url.includes(marker);
    if (h.type === "command") return typeof h.command === "string" && h.command.includes(marker);
    return false;
  };
  const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : void 0;
  const found = [];
  if (hooks) {
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue;
      const keptGroups = [];
      for (const group of groups) {
        const handlers = group && typeof group === "object" ? group.hooks : void 0;
        if (!Array.isArray(handlers)) {
          keptGroups.push(group);
          continue;
        }
        const keep = handlers.filter((h) => !dead(h));
        if (keep.length === handlers.length) {
          keptGroups.push(group);
          continue;
        }
        for (let i = 0; i < handlers.length - keep.length; i++) found.push(event);
        if (keep.length) keptGroups.push({ ...group, hooks: keep });
      }
      if (keptGroups.length) hooks[event] = keptGroups;
      else delete hooks[event];
    }
  }
  const slCommand = settings.statusLine && typeof settings.statusLine === "object" ? settings.statusLine.command : void 0;
  let slNote;
  if (typeof slCommand === "string") {
    const script = /['"]([^'"]*statusline[^'"]*)['"]|(\S*statusline\S*)/i.exec(slCommand);
    const file = script && (script[1] || script[2]);
    if (file) {
      try {
        if (fs.readFileSync(file, "utf8").includes(marker)) slNote = file;
      } catch {
      }
    }
  }
  if (!found.length) {
    process.stdout.write("No daemon wiring left in your Claude Code settings \u2014 nothing to remove.\n");
  } else if (!apply) {
    process.stdout.write(`${found.length} dead hook(s) point at a Nudge daemon that is switched off for good, in ${settingsPath}:
`);
    for (const event of found) process.stdout.write(`  ${event}
`);
    process.stdout.write("\nThey fail at every session end, which is why an agent here keeps offering to restart a service you turned off.\n");
    process.stdout.write("Nothing else is touched: the plugin, your continuity hooks, your status line and every other setting stay exactly as they are.\n");
    out.push("removed nothing yet");
  } else {
    if (!Object.keys(hooks ?? {}).length) delete settings.hooks;
    const backup = `${settingsPath}.nudge-backup-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`;
    try {
      fs.writeFileSync(backup, raw);
    } catch {
      process.stdout.write("Could not write a backup beside your settings, so nothing was changed.\n");
      return;
    }
    const tmp = `${settingsPath}.nudge-tmp`;
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}
`);
      fs.renameSync(tmp, settingsPath);
    } catch {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
      }
      process.stdout.write(`Could not write ${settingsPath}; it is unchanged, and your backup is at ${backup}.
`);
      return;
    }
    process.stdout.write(`Removed ${found.length} dead daemon hook(s) from ${settingsPath}. Backup: ${backup}
`);
    process.stdout.write("Your plugin, memory hooks, status line and other settings are unchanged. Hooks are read at session start, so this takes effect in your next session.\n");
  }
  if (slNote) {
    process.stdout.write(`
Your status line script also posts to the dead port: ${slNote}
`);
    process.stdout.write(`It still works \u2014 everything it shows comes from what Claude Code pipes it \u2014 so Nudge has not edited it. Delete the one line containing ${marker} to stop the wasted call.
`);
  }
}
function check() {
  const project = findRepo(process.cwd());
  const here = project && memoryOn(project) ? project : void 0;
  const out = [];
  out.push("Nudge is installed on this machine, and this answer came from Nudge itself, not from searching the machine.");
  out.push("");
  const here_dir = path.dirname(SELF);
  let version;
  try {
    version = JSON.parse(fs.readFileSync(path.join(here_dir, "..", ".claude-plugin", "plugin.json"), "utf8")).version;
  } catch {
  }
  out.push(
    version ? `- Claude Code plugin: installed and loaded, version ${version}. This answer is its own bundled script, at ${here_dir}.` : `- Continuity hooks: installed and loaded, from ${here_dir}. No plugin manifest beside them, so these came from \`nudge setup\` rather than the plugin.`
  );
  if (here && notesMode(here)) {
    let files = 0;
    try {
      files = fs.readdirSync(path.join(here, ".nudge", "log")).filter((n) => n.endsWith(".md")).length;
    } catch {
    }
    out.push(`- Continuity for this project: ON, keeping notes. ${here}/.nudge/log \u2014 ${files} session${files === 1 ? "" : "s"} recorded${fs.existsSync(coreScript()) ? "" : "; the memory core is not beside this script, so there is no start screen, linking or routing"}.`);
    out.push("  Every turn here is asked for this session's notes; each new session opens on what is in play, and related work is brought back on the first request.");
  } else if (here) {
    const journal = path.join(here, ".nudge", "journal.md");
    const handoff = path.join(here, ".nudge", "handoff.md");
    let entries = 0;
    try {
      for (const line of fs.readFileSync(journal, "utf8").split(/\r?\n/)) if (HEADING.test(line)) entries++;
    } catch {
    }
    const at = fs.existsSync(handoff) ? stamp(fs.statSync(handoff).mtime) : "never";
    out.push(`- Continuity for this project: ON. ${here}/.nudge \u2014 journal has ${entries} entr${entries === 1 ? "y" : "ies"}, hand-off last changed ${at}.`);
    out.push("  Every turn here is asked for a journal entry, every new session is handed what it missed, and a long conversation is told to hand over.");
  } else if (project && memoryOffFor(project)) {
    out.push(`- Continuity for this project: OFF \u2014 turned off ${offOnMachine("memory") ? "on this whole machine" : "here"}. The journal and hand-off in ${project}/.nudge are kept. "Turn memory back on here" resumes it.`);
  } else if (consent() === "yes") {
    out.push(`- Continuity for this project: not started. ${process.cwd()} is not inside a git project, so nothing is recorded here; continuity switches on by itself in any project.`);
  } else {
    out.push(`- Continuity for this project: OFF. ${process.cwd()} has no journal, so Nudge says nothing here. That silence is deliberate, not a fault.`);
    out.push("  Turn it on with /nudge:continuity \u2014 it names every file it would write and asks first.");
  }
  const answer = consent();
  out.push(
    answer === "yes" ? "- On by default: yes, answered once for this machine \u2014 continuity and delegation advice switch on by themselves in every project, each switchable off per project or per machine; phone sessions only where asked for." : answer === "no" ? "- On by default: no, answered once for this machine and never asked again. Modules switch on only where asked." : "- On by default: not answered yet. Nudge asks once, at a session start."
  );
  let feed;
  try {
    feed = JSON.parse(fs.readFileSync(path.join(HOME, "prices.json"), "utf8"));
  } catch {
  }
  const feedOff = /^(?:off|0|false|no)$/i.test(process.env.NUDGE_PRICE_FEED || "");
  out.push(
    feedOff ? "- Prices: the built-in table only (NUDGE_PRICE_FEED=off)." : feed && Date.parse(feed.fetchedAt) > 0 ? `- Prices: from ${feed.sources.join(" and ")}, fetched ${stamp(new Date(feed.fetchedAt))}, ${Object.keys(feed.prices).length} models; refreshed about daily at the end of a turn${feed.disagree && feed.disagree.length ? `. The two lists disagree on ${feed.disagree.length}: ${feed.disagree.slice(0, 3).join("; ")}` : ""}${feed.lastError ? `. Last try failed: ${feed.lastError}` : ""}.` : "- Prices: the built-in table so far; the public price lists are fetched at the end of the next turn."
  );
  if (here) {
    const on = delegationOn(here);
    if (!on) {
      out.push(`- Delegation for this project: OFF. Turn it on with /nudge:delegation.`);
    } else {
      const d = delegationRead();
      out.push("- Delegation for this project: ON. It reads the transcripts Claude Code already keeps; nothing new is recorded and nothing leaves this machine.");
      if (d.line) out.push(`  ${d.line}`);
      if (d.outcomes) out.push(`  How handed-down work turned out: ${d.outcomes.worked} worked, ${d.outcomes.failed} ended in failure, ${d.outcomes.takenOver} were taken back over.`);
      if (d.loop) {
        const L = d.loop;
        out.push(
          `  Since ${L.since.slice(0, 10)}: ${L.spawns} helper${L.spawns === 1 ? "" : "s"} spawned in ${L.sessions} session${L.sessions === 1 ? "" : "s"}. The record named a model for ${L.advised}; the call used it or cheaper ${L.followed} time${L.followed === 1 ? "" : "s"}. ${L.acknowledged} of ${L.sessions} session${L.sessions === 1 ? "" : "s"} said in their notes what they handed down (${L.agrees} matched the spawns, ${L.differs} did not).`
        );
      }
      for (const t of d.tasks.slice(0, 3)) {
        out.push(`  ${t.task}: ${t.runs} run${t.runs === 1 ? "" : "s"}, ${Math.round(t.failedShare * 100)}% ended in failure${t.takenOverShare > 0 ? `, ${Math.round(t.takenOverShare * 100)}% taken back over` : ""}.`);
      }
      if (!d.line && !d.outcomes) out.push("  Nothing measured yet \u2014 the reading happens in the background, so the first figures appear after the next session start.");
    }
  }
  if (here) {
    const rec = readListener(listenerFile(here));
    if (!remoteOn(here)) out.push('- Phone sessions for this project: OFF. Say "turn on phone sessions here" to keep it ready in the Claude app.');
    else if (listenerRunning(rec)) {
      const link = listenerLink(here);
      out.push(`- Phone sessions for this project: ON \u2014 a listener is running (pid ${rec.pid}); a fresh session is one tap in the Claude app${link ? `: ${link}` : ""}.`);
    } else if (listenerBlocked(rec)) out.push(`- Phone sessions for this project: ON, but ${blocked()}`);
    else if (rec && rec.error) out.push(`- Phone sessions for this project: ON, but the listener could not start: ${rec.error}.`);
    else out.push(`- Phone sessions for this project: ON, not running right now \u2014 the next session start here starts it${rec && rec.log ? `; its last output is in ${rec.log}` : ""}.`);
  }
  out.push(`- Nudge's own state: ${HOME}`);
  const waiting = version ? marketplaceVersion() : void 0;
  if (waiting && newer(waiting, version)) {
    out.push(`- Update waiting: ${waiting} is in the marketplace clone, this is ${version}. Run \`claude plugin update nudge\`, then start a new session \u2014 skills load at session start, so the session that updates cannot see the new one.`);
  }
  const updates = autoUpdateState();
  if (updates !== "unknown") {
    out.push(
      updates === "off" ? '- Updates: off. New versions will not arrive on their own \u2014 run `claude plugin update nudge`, or say "turn Nudge updates back on".' : "- Updates: on. New versions arrive on their own, shortly after a session starts."
    );
  }
  out.push("");
  out.push("What Nudge can do:");
  for (const line of MODULES) out.push(line);
  out.push("");
  const cli = cliPath();
  out.push(
    cli ? `- Nudge CLI: ${cli}. Nudge's skills do not need it.` : "- Nudge CLI: not on PATH. Only /nudge:status, /nudge:list, /nudge:on, /nudge:off, /nudge:remove, /nudge:why and /nudge:impact need it; the journal and the hand-off need no CLI and no background service."
  );
  process.stdout.write(out.join("\n") + "\n");
}
const say = { visible: [], context: [] };
function emit(event) {
  if (!say.visible.length && !say.context.length) return;
  const out = {};
  if (say.visible.length) out.systemMessage = say.visible.join("\n");
  if (say.context.length) out.hookSpecificOutput = { hookEventName: event, additionalContext: say.context.join("\n\n") };
  process.stdout.write(JSON.stringify(out) + "\n");
}
function pluginVersion() {
  try {
    const dir = path.dirname(SELF);
    return JSON.parse(fs.readFileSync(path.join(dir, "..", ".claude-plugin", "plugin.json"), "utf8")).version;
  } catch {
    return void 0;
  }
}
function installedVersion() {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(claudeDir(), "plugins", "installed_plugins.json"), "utf8")).plugins || {};
    let best;
    for (const [key, entries] of Object.entries(all)) {
      if (!key.startsWith("nudge@") || !Array.isArray(entries)) continue;
      for (const e of entries) if (e && typeof e.version === "string" && (!best || newer(e.version, best))) best = e.version;
    }
    return best;
  } catch {
    return void 0;
  }
}
function introduceOnce(repo) {
  const flag = path.join(HOME, "introduced");
  try {
    if (fs.existsSync(flag)) return;
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(flag, String(Date.now()));
  } catch {
    return;
  }
  ensureAutoUpdate();
  const updatesOn = autoUpdateState() === "on";
  const memoryHere = memoryOn(repo);
  const answer = consent();
  say.visible.push(
    [
      memoryHere ? "Nudge is installed, and continuity is on in " + path.basename(repo) + ". Here is what it can do:" : "Nudge is installed. Here is what it can do:",
      "",
      ...MODULES,
      "",
      // Before the answer, the introduction ends with the question itself (said by askConsent, right after this).
      // A project whose memory is already on is told how to turn it off whether or not the question is answered yet.
      ...memoryHere || answer === "yes" ? ['Say "turn off continuity here" if you would rather it was not. Your journal and hand-off stay either way.'] : answer === "no" ? ['You said no to switching it on everywhere; "turn on continuity here" switches it on for one project.'] : [],
      'Ask "is Nudge installed?" or "what is Nudge doing?" any time.',
      ...updatesOn ? ['Nudge keeps itself up to date: it checks every hour, installs the new version itself, and tells you at your next session start. Say "turn off Nudge updates" if you would rather do it yourself.'] : []
    ].join("\n")
  );
}
function run(input) {
  const cwd = typeof input.cwd === "string" ? input.cwd : "";
  const sessionId = typeof input.session_id === "string" ? input.session_id : "unknown";
  const turnsDir2 = path.join(HOME, "turns");
  const mark = path.join(turnsDir2, sessionId.replace(/[^A-Za-z0-9._-]/g, "_"));
  if (EVENT === "SessionEnd") {
    try {
      fs.mkdirSync(turnsDir2, { recursive: true });
      fs.writeFileSync(mark + ".ended", String(Date.now()));
    } catch {
    }
    return;
  }
  const adopted = () => {
    try {
      const dir = fs.readFileSync(mark + ".repo", "utf8").trim();
      return dir && fs.existsSync(path.join(dir, ".nudge")) && !memoryOffFor(dir) ? dir : void 0;
    } catch {
      return void 0;
    }
  };
  let pinned = sessionId === "unknown" ? void 0 : adopted();
  let repinned;
  if (pinned && EVENT !== "SessionStart") {
    const to = repinFromEvidence(mark, pinned, input.transcript_path);
    if (to) {
      repinned = { from: pinned, to, notes: moveNotes(pinned, to, sessionId) };
      pinned = to;
    }
  }
  let project = findRepo(cwd);
  let justOn;
  if ((EVENT === "SessionStart" || EVENT === "UserPromptSubmit") && !pinned && !(project && hasMemory(project))) {
    const on = autoOn(cwd);
    if (on) project = justOn = on;
  }
  const here = project && !memoryOffFor(project) ? project : void 0;
  const turnedOff = project && !here ? project : void 0;
  const repo = pinned ?? here ?? (EVENT === "SessionStart" ? lastProject() : void 0);
  if (repinned) {
    say.context.push(
      "Nudge: this session's project is now " + repinned.to + " \u2014 the files you work in are there, not in " + repinned.from + ", which the start had guessed from the last project. Its notes, journal and record follow from here" + (repinned.notes ? ", and the notes written so far were moved with it." : ".")
    );
  }
  if (EVENT === "SessionStart") ensureAutoUpdate();
  if (EVENT === "SessionStart" || EVENT === "UserPromptSubmit") introduceOnce(here);
  if (EVENT === "UserPromptSubmit" && consent() === void 0 && typeof input.prompt === "string") {
    const m = /^\W*(yes|y|yep|yeah|sure|ok|okay|no|n|nope)\W*$/i.exec(input.prompt);
    if (m) {
      let reply;
      try {
        reply = consentReply(/^(no|n|nope)$/i.test(m[1]) ? "no" : "yes", typeof input.cwd === "string" ? input.cwd : process.cwd());
      } catch {
        reply = void 0;
      }
      if (reply) {
        const [head, ...rest] = reply.split("\n\n");
        say.visible.push(head.split("\n").map((l) => "Nudge \xB7 " + l).join("\n"));
        say.context.push(
          `The user answered Nudge's one question with "` + input.prompt.trim() + '", and Nudge recorded it itself: "' + head + '" Nothing to run for it. Say in one line that it is done, and ask what they want to work on.' + (rest.length ? "\n\n" + rest.join("\n\n") : "")
        );
      }
    }
  }
  if ((EVENT === "SessionStart" || EVENT === "UserPromptSubmit") && consent() === void 0 && !fs.existsSync(mark + ".asked")) {
    askConsent();
    try {
      fs.mkdirSync(turnsDir2, { recursive: true });
      fs.writeFileSync(mark + ".asked", String(Date.now()));
    } catch {
    }
  }
  if (EVENT === "SessionStart") lookForUpdate();
  if (EVENT === "SessionStart") {
    observeDelegation(project ?? repo);
    startShadowDashboard(project ?? repo);
    startSpendWatch(project ?? repo);
  }
  if (EVENT === "SessionStart") ensureListener(here);
  if (!repo) {
    if (EVENT === "SessionStart") {
      const version = pluginVersion();
      const answer = consent();
      const why = turnedOff ? [`continuity is turned off in ${path.basename(turnedOff)}`, `Continuity was turned off in this project (${turnedOff}) \u2014 nothing is recorded here until the user says "turn continuity back on here".`] : offOnMachine("memory") ? ["continuity is turned off on this machine", 'Continuity is turned off on this whole machine \u2014 nothing is recorded until the user says "turn continuity back on on this machine".'] : answer === "yes" ? ["no project here \u2014 continuity switches on by itself in any project", "This folder is not inside a project (no git repository), so nothing is recorded here; continuity switches on by itself in any project the user opens."] : answer === "no" ? ["continuity is off here", 'Continuity is off in this folder \u2014 the user declined switching it on everywhere; "turn on continuity here" switches it on for one project.'] : ["continuity is waiting on one yes", "Continuity is not on yet \u2014 Nudge is asking the user once whether to keep a diary and a hand-off in every project."];
      say.visible.push("Nudge" + (version ? " " + version : "") + " \xB7 " + why[0] + ".");
      say.context.push(
        `Nudge is installed on this machine${version ? ` (Claude Code plugin ${version})` : ""}; this message is its hook. ${why[1]} If asked whether Nudge is installed or active: it is; say so, offer /nudge:check for detail, and never investigate the machine or suggest nudge setup.`
      );
    }
    emit(EVENT);
    return;
  }
  if (EVENT !== "SessionStart") rememberProject(repo);
  if (EVENT === "SessionStart" && sessionId !== "unknown") {
    try {
      fs.mkdirSync(turnsDir2, { recursive: true });
      fs.writeFileSync(mark + ".repo", repo);
      if (!here) {
        if (!pinned) fs.writeFileSync(mark + ".adopted", JSON.stringify({ at: Date.now(), offset: 0, counts: {} }));
      } else fs.rmSync(mark + ".adopted", { force: true });
    } catch {
    }
  }
  const journal = path.join(repo, ".nudge", "journal.md");
  const handoff = path.join(repo, ".nudge", "handoff.md");
  const notes = notesMode(repo);
  const record = notes ? notesFile(repo, sessionId) : journal;
  const recordedCount = () => notes ? ownNotes(repo, sessionId) : ownEntries(journal, sessionId);
  const quiet = fs.existsSync(mark + ".quiet");
  const unrecorded = () => {
    try {
      return Number(fs.readFileSync(mark + ".n", "utf8")) || 0;
    } catch {
      return 0;
    }
  };
  if (EVENT === "UserPromptSubmit") {
    fs.mkdirSync(turnsDir2, { recursive: true });
    const firstTurn = !fs.existsSync(mark);
    fs.writeFileSync(mark, String(Date.now()));
    const mine = recordedCount();
    if (mine !== void 0) fs.writeFileSync(mark + ".entries", String(mine));
    const ctx = contextTokens(input.transcript_path);
    const hello = mark + ".hello";
    if (firstTurn && !fs.existsSync(hello)) {
      const version = pluginVersion();
      say.visible.push(
        "Nudge" + (version ? " " + version : "") + (justOn ? " \xB7 continuity is now on in " + path.basename(repo) + ' \xB7 say "turn off continuity here" if you don\u2019t want it' : " \xB7 continuity on in " + path.basename(repo) + (notes ? " \xB7 notes are being kept for this session" : " \xB7 journal and hand-off are being kept for this session"))
      );
      try {
        fs.writeFileSync(hello, String(Date.now()));
      } catch {
      }
    }
    const running = pluginVersion();
    const installed = installedVersion();
    if (running && installed && newer(installed, running) && !fs.existsSync(mark + ".reload-" + installed)) {
      say.visible.push("Nudge " + installed + " is installed; this session is still " + running + " \u2014 type /reload-plugins to switch now, or it loads when Claude Code next starts. (/clear does not do it.)");
      try {
        fs.writeFileSync(mark + ".reload-" + installed, String(Date.now()));
      } catch {
      }
    }
    if (spendWatchOn(repo) && !fs.existsSync(mark + ".spend")) {
      const spend = spendRead();
      if (spend && spend.line) {
        say.context.push(spend.line);
        try {
          fs.writeFileSync(mark + ".spend", String(Date.now()));
        } catch {
        }
      }
    }
    const dm = typeof input.prompt === "string" ? DELEGATE.exec(input.prompt) : null;
    if (dm) {
      let line;
      try {
        line = delegateSwitch((dm[1] || "").trim().split(/\s+/), repo || (typeof input.cwd === "string" ? input.cwd : process.cwd()));
      } catch {
        line = void 0;
      }
      if (line) {
        say.visible.push("Nudge \xB7 " + line);
        say.context.push(`Nudge acted on the user's "delegate" and told them: "` + line + '" Nothing more is needed from you for it.');
      }
    }
    const lengthAsk = typeof input.prompt === "string" && LENGTH.test(input.prompt);
    let lastStep = 0;
    try {
      lastStep = Number(fs.readFileSync(mark + ".remindstep", "utf8")) || 0;
    } catch {
    }
    const step = ctx !== void 0 ? Math.floor(ctx / REMIND_STEP) : 0;
    const due = ctx !== void 0 && ctx >= REMIND_FROM && step > lastStep;
    if (due) {
      try {
        fs.writeFileSync(mark + ".remindstep", String(step));
      } catch {
      }
    }
    if (due || lengthAsk) {
      const said = core("remind", repo, sessionId, JSON.stringify({ prompt: typeof input.prompt === "string" ? input.prompt : "", transcript: typeof input.transcript_path === "string" ? input.transcript_path : "" }));
      let spoke = false;
      if (said) {
        say.visible.push(...said.visible);
        say.context.push(...said.context);
        spoke = said.visible.some((l) => l.includes("this conversation is")) && !lengthAsk;
      } else if (ctx !== void 0 && ctx >= LIMIT && !fs.existsSync(mark + ".lengthsaid")) {
        const line = `Nudge \xB7 this conversation is at ${k(ctx)} tokens; a good time to wrap up with a short hand-off and a fresh session.`;
        say.visible.push(line);
        say.context.push(`Nudge told the user: "${line}" Don't repeat it. If they choose to wrap up, make sure ${record} says where the work got to.`);
        spoke = true;
        try {
          fs.writeFileSync(mark + ".lengthsaid", String(ctx));
        } catch {
        }
      }
      const offer = spoke ? freshOffer(repo) : void 0;
      if (offer) {
        say.context.push(offer);
        if (!fs.existsSync(mark + ".offered")) {
          say.visible.push(offer);
          try {
            fs.writeFileSync(mark + ".offered", String(Date.now()));
          } catch {
          }
        }
      }
    }
    const asksWhy = notes && typeof input.prompt === "string" && WHY.test(input.prompt);
    if (asksWhy) {
      const found = core("why", repo, sessionId, input.prompt);
      if (found) {
        say.visible.push(...found.visible);
        say.context.push(...found.context);
      }
    }
    if (typeof input.prompt === "string" && input.prompt.trim()) {
      const routed = mark + ".routed";
      let done = [];
      try {
        done = fs.readFileSync(routed, "utf8").split(/\r?\n/).filter(Boolean);
      } catch {
      }
      const other = namedProject(input.prompt, repo);
      if (other && !done.some((d) => samePath(d, other))) {
        const line = routeLine(other);
        if (line) {
          say.context.push(line);
          try {
            fs.appendFileSync(routed, other + "\n");
          } catch {
          }
        }
      }
    }
    if (quiet) {
      const n = unrecorded();
      const said = mark + ".quietsaid";
      if (n >= QUIET_CATCHUP && !fs.existsSync(said)) {
        fs.writeFileSync(said, String(n));
        say.context.push(
          notes ? `Nudge is quiet in this session and ${n} turns have gone unrecorded. When this turn is done, append to ${record} a heading "## ${stamp(/* @__PURE__ */ new Date())}" and one "- <kind>: <text>" line per piece covering them. Nudge will not ask again this session.` : `Nudge is quiet in this session and ${n} turns have gone unrecorded. When this turn is done, append one entry to ${journal} covering them \u2014 heading "## ${stamp(/* @__PURE__ */ new Date())} \xB7 session ${sessionId.slice(0, 8)}". Nudge will not ask again this session.`
        );
      }
      emit("UserPromptSubmit");
      return;
    }
    if (notes && delegationOn(repo)) {
      const spawns = spawnsOf(sessionId);
      const asked = (() => {
        try {
          return Number(fs.readFileSync(mark + ".spawnsasked", "utf8")) || 0;
        } catch {
          return 0;
        }
      })();
      if (spawns.length > asked) {
        const fresh = spawns.slice(asked);
        const by = {};
        for (const s of fresh) {
          const m = s.requested ? String(s.requested).toLowerCase().replace(/^claude-/, "").replace(/-\d.*$/, "") : "inherited";
          by[m] = (by[m] || 0) + 1;
        }
        const models = Object.entries(by).map(([m, n]) => n + " " + m).join(", ");
        say.context.push(
          `Nudge, delegation: since the last notes this session spawned ${fresh.length} helper${fresh.length === 1 ? "" : "s"} (${models}). Add one line to this turn's notes in this form: "- delegated: ${fresh.length} handed off (<count> <model>, \u2026), <n> kept; <why that model>". Nudge compares it with what was spawned.`
        );
        try {
          fs.writeFileSync(mark + ".spawnsasked", String(spawns.length));
        } catch {
        }
      }
    }
    if (shadowHere(repo)) say.context.push(SHADOW_PROMPT);
    if (shadowHere(repo)) {
      const line = shadowPassedFirst(sessionId);
      if (line) say.context.push(line);
    }
    if (notes) {
      if (firstTurn && !asksWhy && typeof input.prompt === "string" && input.prompt.trim()) {
        const found = core("route", repo, sessionId, input.prompt);
        if (found) {
          say.visible.push(...found.visible);
          say.context.push(...found.context);
        }
      }
      say.context.push(
        firstTurn ? (
          // the full path: relative, a session run from elsewhere read it as ~/.nudge/log (26 Sep, first headless run)
          `Notes (this session's own file, ${record}): before this turn ends, append with your file-editing tool a heading "## ${stamp(/* @__PURE__ */ new Date())}" and one line per piece of what happened \u2014 "- <kind>: <text>", kinds asked, did, decided, fact, todo, done, trap, question, idea, delegated \u2014 ending a line with the user's own words in double quotes when worth keeping. A side idea is its own "- idea:" line. Never edit earlier lines; Nudge adds the links.
`
        ) : `Notes (${record}): this turn's heading and "- <kind>: <text>" lines before it ends.`
      );
      emit("UserPromptSubmit");
      return;
    }
    say.context.push(
      firstTurn ? `Journal (${journal}): before this turn ends, append one dated entry for it \u2014 what was asked, what you did, what you learned or decided. One line is enough for a small turn. Heading format: "## ${stamp(/* @__PURE__ */ new Date())} \xB7 session ${sessionId.slice(0, 8)}". Never rewrite earlier entries. Leave ${handoff} alone: the next session to open folds the journal into it.
` : `Journal (${journal}): one dated entry for this turn before it ends.`
    );
    emit("UserPromptSubmit");
    return;
  }
  if (EVENT === "Stop") {
    if (typeof input.transcript_path === "string" && input.transcript_path) coreDetached("usage", repo, sessionId, input.transcript_path);
    if (input.stop_hook_active === true) return;
    if (!fs.existsSync(mark)) return;
    const turnAt = Number(fs.readFileSync(mark, "utf8")) || 0;
    const hold = (reason) => process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
    if (!notes) archiveHandoff(repo, sessionId);
    const counter = mark + ".n";
    let recorded;
    const before = (() => {
      try {
        return Number(fs.readFileSync(mark + ".entries", "utf8"));
      } catch {
        return Number.NaN;
      }
    })();
    const now = recordedCount();
    if (now !== void 0 && !Number.isNaN(before)) recorded = now > before;
    else recorded = (fs.existsSync(record) ? fs.statSync(record).mtimeMs : 0) >= turnAt;
    if (recorded) {
      fs.rmSync(counter, { force: true });
      fs.rmSync(mark + ".quietsaid", { force: true });
      if (notes) coreDetached("link", repo, sessionId);
    } else {
      const n = unrecorded() + 1;
      fs.writeFileSync(counter, String(n));
      const elsewhereSaid = mark + ".elsewhere";
      if (!notes && !quiet && !fs.existsSync(elsewhereSaid)) {
        const candidates = [...knownProjects(repo).map((d) => path.join(d, ".nudge", "journal.md")), path.join(HOME, "journal.md"), path.join(defaultHome(), "journal.md")];
        if (here) candidates.push(path.join(here, ".nudge", "journal.md"));
        const stray = candidates.find((f) => !samePath(f, journal) && (ownEntries(f, sessionId) || 0) > 0);
        if (stray) {
          fs.writeFileSync(elsewhereSaid, stray);
          fs.writeFileSync(counter, "0");
          hold(`This session's journal entries are going to ${stray}, but this session's project is ${repo}: its journal is ${journal}. Append this turn's entry there (leave the ones already written where they are), then finish.`);
          return;
        }
      }
      if (!quiet && n >= NAG_AFTER) {
        fs.writeFileSync(counter, "0");
        hold(
          notes ? `The last ${n} turns have no notes. Append to ${record} now a heading "## ${stamp(/* @__PURE__ */ new Date())}" and "- <kind>: <text>" lines covering them, then finish.` : `The last ${n} turns have no journal entry. Append one to ${journal} now covering them (one dated entry, a line is enough), then finish.`
        );
        return;
      }
    }
    const base = (() => {
      try {
        return JSON.parse(fs.readFileSync(mark + ".base", "utf8"));
      } catch {
        return void 0;
      }
    })();
    let half = "";
    try {
      half = agentHalf(fs.readFileSync(handoff, "utf8"));
    } catch {
    }
    const wroteIt = !notes && !!half && (fs.existsSync(handoff) ? fs.statSync(handoff).mtimeMs : 0) >= turnAt && (!base || half !== base.text);
    const mergeSaid = mark + ".merge";
    if (wroteIt && base && !fs.existsSync(mergeSaid)) {
      const short = sessionId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
      const lost = historyFiles(repo).filter((name) => {
        if (short && name.includes("-" + short)) return false;
        try {
          const f = path.join(historyDir(repo), name);
          if (fs.statSync(f).mtimeMs < base.at) return false;
          const text = fs.readFileSync(f, "utf8").trimEnd();
          return text !== base.text && text !== half;
        } catch {
          return false;
        }
      });
      if (lost.length) {
        fs.writeFileSync(mergeSaid, lost.join("\n"));
        hold(
          `Another lane changed ${handoff} after this session read it, and this session's write replaced it. Its version is kept at ${path.join(historyDir(repo), lost[lost.length - 1])}. Read that version now, put back anything from it that yours is missing, then finish.`
        );
        return;
      }
    }
    const longSaid = mark + ".long";
    if (!quiet && wroteIt && !fs.existsSync(longSaid)) {
      if (half.length > HANDOFF_TOO_LONG) {
        fs.writeFileSync(longSaid, String(half.length));
        const fat = fattestSection(half);
        hold(
          `${handoff} is ${half.length.toLocaleString("en-US")} characters against a limit of ${HANDOFF_MAX.toLocaleString("en-US")}${fat ? `; "${fat.heading}" is ${fat.chars.toLocaleString("en-US")} of them` : ""}. It is a synthesis, not a log: fold what is new into it, delete what is finished or overtaken, and put Left back in the order you would do it. Nothing is lost by cutting \u2014 ${journal} keeps the detail and every version of this file is archived in ${historyDir(repo)}. Run /nudge:handoff for how, then finish. Nudge will not raise this again this session.`
        );
        return;
      }
    }
    const ctx = contextTokens(input.transcript_path);
    const held = mark + ".held";
    if (quiet || ctx === void 0 || ctx < 2 * LIMIT || fs.existsSync(held)) return;
    if (recorded) return;
    fs.writeFileSync(held, String(ctx));
    const offer = freshOffer(repo);
    hold(`This conversation is at ${k(ctx)} tokens and this turn has no entry in ${record}. Append one now saying where this conversation got to \u2014 the next session starts from it \u2014 then finish.${offer ? " If the user wants a fresh session, give them this: " + offer : ""}`);
    return;
  }
  if (EVENT === "SessionStart") {
    if (!notes && !fs.existsSync(journal)) {
      emit("SessionStart");
      return;
    }
    if (!notes) archiveHandoff(repo, sessionId);
    try {
      let text = "";
      try {
        text = agentHalf(fs.readFileSync(handoff, "utf8"));
      } catch {
      }
      fs.mkdirSync(turnsDir2, { recursive: true });
      fs.writeFileSync(mark + ".base", JSON.stringify({ at: Date.now(), text }));
    } catch {
    }
    const since = fs.existsSync(handoff) ? stamp(fs.statSync(handoff).mtime) : "0000-00-00T00:00:00Z";
    const version = pluginVersion();
    const entries = [];
    let current;
    for (const line of (notes ? "" : fs.readFileSync(journal, "utf8")).split(/\r?\n/)) {
      const m = HEADING.exec(line);
      if (m) {
        current = utc(m[1]) > utc(since) ? { at: m[1], lines: [line] } : void 0;
        if (current) entries.push(current);
        continue;
      }
      if (current) current.lines.push(line);
    }
    const n = entries.length;
    const where = here || pinned ? "" : " \xB7 started outside a project, so this is where the last turn was";
    say.visible.push(
      justOn ? "Nudge" + (version ? " " + version : "") + " \xB7 continuity is now on in " + path.basename(repo) + ' \xB7 say "turn off continuity here" if you don\u2019t want it' : "Nudge" + (version ? " " + version : "") + where
    );
    const screen = notes ? core("start", repo, sessionId) : void 0;
    if (screen) say.context.push(...screen.visible, ...screen.context);
    say.context.push(
      notes ? `This session's project is ${repo}. Its notes for this session go in ${record}. Use that full path whatever folder the shell is in \u2014 a relative .nudge/ lands in whichever project the shell has wandered into.` : `This session's project is ${repo}. Its journal is ${journal} and its hand-off ${handoff}. Use these full paths whatever folder the shell is in \u2014 a relative .nudge/ lands in whichever project the shell has wandered into.`
    );
    if (!agentFileHasRules(repo, notes ? NOTES_RULES_HEADING : RULES_HEADING)) {
      say.context.push(`Nudge's working rules for this project (they come with every session start; nothing is written into CLAUDE.md):
${notes ? NOTES_RULES : RULES}`);
    }
    if (delegationOn(repo)) {
      const delegation = delegationRead();
      if (delegation.line) say.context.push(delegation.line);
      if (delegation.direction) say.context.push(delegation.direction);
      if (handoverAdvise(repo)) say.context.push(RECEIPT_DIRECTION);
      if (shadowHere(repo)) say.context.push(SHADOW_DIRECTION);
    }
    if (spendWatchOn(repo)) {
      say.context.push(SPEND_BATCH_RULE);
      const spend = spendRead();
      if (spend && spend.line) {
        say.context.push(spend.line);
        try {
          fs.mkdirSync(turnsDir2, { recursive: true });
          fs.writeFileSync(mark + ".spend", String(Date.now()));
        } catch {
        }
      }
    }
    const onDisk = marketplaceVersion();
    const inRepo = offeredVersion();
    const waiting = [onDisk, inRepo].filter((v) => v && version && newer(v, version)).sort((a, b) => newer(a, b) ? -1 : 1)[0];
    const did = lastUpdate();
    if (did && did.ok && version && newer(did.to, version)) {
      say.visible.push(
        // /reload-plugins applies a plugin update in place — "reloads plugins, skills, agents, hooks" — which is
        // what the docs offer instead of a restart. /clear does not: it keeps the version the session began with.
        "Nudge updated itself to " + did.to + ". This session is still " + version + " \u2014 type /reload-plugins to switch now, or it loads when Claude Code next starts. (/clear does not do it.)"
      );
    } else if (waiting && did && !did.ok && did.to === waiting) {
      say.visible.push("Nudge " + waiting + " is waiting and Nudge could not install it: " + did.why + '. Say "update Nudge" to do it here.');
    } else if (waiting) {
      say.visible.push("Nudge " + waiting + " is waiting; Nudge is installing it in the background. Next session, type /reload-plugins to switch to it.");
    }
    try {
      fs.mkdirSync(turnsDir2, { recursive: true });
      fs.writeFileSync(mark + ".hello", String(Date.now()));
    } catch {
    }
    say.context.push(
      `If the user asks whether Nudge is installed, set up, running or on: it is \u2014 Claude Code plugin${version ? ` ${version}` : ""}, continuity on in ${path.basename(repo)}, this very message is its hook. Say that; run /nudge:check for detail if they want it. Do not investigate the machine, do not report the CLI or the background service as the answer, and never suggest nudge setup.`
    );
    let updated = "";
    try {
      const reg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json"), "utf8"));
      const at = reg?.plugins?.["nudge@nudge"]?.[0]?.lastUpdated;
      if (typeof at === "string" && at) updated = " (updated " + new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ")";
    } catch {
    }
    const opening = "**Nudge**" + (version ? " " + version : "") + updated + (justOn ? " \xB7 continuity is now on in " + path.basename(repo) : " \xB7 on") + ". I have the record of your earlier work here; just say what you want.";
    say.context.push(
      `Nudge is on in this project${version ? ` (plugin ${version})` : ""}. **Open your first reply with this one line, word for word, and say nothing more about Nudge unless the user asks:**

${opening}

Then do what the rest of this message asks${n > 0 ? ` (fold in the ${n} journal entr${n === 1 ? "y" : "ies"} below)` : ""} and answer. This message is not shown to the user; if you do not print the greeting, nothing tells them Nudge is here.`
    );
    if (!entries.length) {
      emit("SessionStart");
      return;
    }
    let body = entries.slice(-MAX_ENTRIES).map((e) => e.lines.join("\n").trimEnd()).join("\n\n");
    if (body.length > MAX_CHARS) body = body.slice(-MAX_CHARS);
    const source = typeof input.source === "string" ? input.source : "start";
    const found = here || pinned ? "" : ` This is ${repo}, where the last turn was \u2014 you were started somewhere that names no project.`;
    const head = `Nudge journal catch-up (${source}):${found} ${n} journal entr${n === 1 ? "y was" : "ies were"} written after ${handoff} last changed (${since}). Start from the hand-off as it is \u2014 do not rebuild it. Fold these entries in: add what is new, delete what they overtake, and leave Left in the order you would do it. It is a synthesis, not a log \u2014 it absorbs what is new and comes back under ${HANDOFF_MAX.toLocaleString("en-US")} characters; ${journal} keeps the detail and every version of the hand-off is archived in ${historyDir(repo)}, so nothing is lost by cutting. Read ${handoff} from disk right before you write it \u2014 another lane may have folded it since this session began \u2014 and write it once. /nudge:handoff has the method. Do that first, then answer what was asked. The journal is never rewritten; after this, write only the journal.`;
    const older = n > MAX_ENTRIES ? `

(${n - MAX_ENTRIES} older entries are in ${journal}.)` : "";
    say.context.push(head + "\n\n" + body + older);
    emit("SessionStart");
  }
}
