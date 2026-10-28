#!/usr/bin/env node

// ../host/src/memory/core/main.ts
import fs13 from "node:fs";
import os3 from "node:os";
import path16 from "node:path";

// ../host/src/memory/core/log.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ../host/src/time.ts
var STAMP_SOURCE = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})`;
function localStamp(d) {
  const off = -d.getTimezoneOffset();
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const local = new Date(d.getTime() + off * 6e4).toISOString().slice(0, 19);
  return local + (off === 0 ? "Z" : `${off > 0 ? "+" : "-"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`);
}
function utcStamp(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : `${d.toISOString().slice(0, 19)}Z`;
}

// ../host/src/memory/core/log.ts
var LOG_DIR = path.join(".nudge", "log");
var KINDS = ["asked", "did", "decided", "fact", "todo", "done", "trap", "question", "idea", "delegated"];
var HOWS = ["relates", "closes", "replaces", "led-to"];
var BYS = ["rule", "jev", "owner"];
var TURN = new RegExp(String.raw`^## (${STAMP_SOURCE})(?![\d:])`);
var ITEM = new RegExp(`^\\s*[-*] (${KINDS.join("|")}):\\s*(.+?)\\s*$`, "i");
var REF = /^\[(?:(?:closes|replaces)\s+)?([0-9a-f]{6})\]\s*/i;
var QUOTE = /\s*[—–-]?\s*["“]([^"”]{2,})["”]\s*$/;
var ID = "([0-9a-f]{6})";
var LINK = new RegExp(String.raw`^\s*[-*] link:\s*${ID}\s+(${HOWS.join("|")})\s+${ID}(?:\s*\((${BYS.join("|")})(?:\s+([01](?:\.\d+)?))?\))?\s*$`, "i");
var UNLINK = new RegExp(String.raw`^\s*[-*] unlink:\s*${ID}\s+${ID}(?:\s*\((${BYS.join("|")})\))?\s*$`, "i");
var NAME = new RegExp(String.raw`^\s*[-*] name:\s*${ID}\s+(.+?)(?:\s+\((jev)(?:\s+[01](?:\.\d+)?)?\))?\s*$`, "i");
var FILE = /^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]{1,8})\.md$/;
function logFileName(now, sessionId) {
  return `${now.toISOString().slice(0, 10)}-${sessionId.slice(0, 8)}.md`;
}
function itemId(item) {
  return crypto.createHash("sha1").update(`${item.session}
${item.kind}
${item.text}`).digest("hex").slice(0, 6);
}
function emptyRecords() {
  return { items: [], links: [], unlinks: [], names: [] };
}
function mergeRecords(records) {
  const out = emptyRecords();
  for (const r of records) {
    out.items.push(...r.items);
    out.links.push(...r.links);
    out.unlinks.push(...r.unlinks);
    out.names.push(...r.names);
  }
  return out;
}
function parseLog(text, meta) {
  const name = FILE.exec(path.basename(meta.file));
  const session = name?.[2] ?? path.basename(meta.file, ".md");
  let at = name ? `${name[1]}T00:00:00Z` : (/* @__PURE__ */ new Date(0)).toISOString();
  const out = emptyRecords();
  text.split(/\r?\n/).forEach((raw, i) => {
    const turn = TURN.exec(raw);
    if (turn) {
      at = utcStamp(turn[1]);
      return;
    }
    const l = LINK.exec(raw);
    if (l) {
      const by = l[4]?.toLowerCase() ?? "rule";
      const confidence = l[5] !== void 0 ? Number(l[5]) : 1;
      out.links.push({ from: l[1].toLowerCase(), how: l[2].toLowerCase(), to: l[3].toLowerCase(), by, confidence, at, session });
      return;
    }
    const u = UNLINK.exec(raw);
    if (u) {
      out.unlinks.push({ a: u[1].toLowerCase(), b: u[2].toLowerCase(), by: u[3]?.toLowerCase() ?? "owner", at, session });
      return;
    }
    const n = NAME.exec(raw);
    if (n) {
      out.names.push({ item: n[1].toLowerCase(), name: n[2], by: n[3] ? "jev" : "owner", at, session });
      return;
    }
    const m = ITEM.exec(raw);
    if (!m) return;
    let body = m[2];
    let ref;
    const r = REF.exec(body);
    if (r) {
      ref = r[1].toLowerCase();
      body = body.slice(r[0].length);
    }
    let quote;
    const q = QUOTE.exec(body);
    if (q && q.index > 0) {
      quote = q[1];
      body = body.slice(0, q.index);
    }
    if (!body.trim()) return;
    out.items.push({
      kind: m[1].toLowerCase(),
      text: body.trim(),
      ...quote ? { quote } : {},
      ...ref ? { ref } : {},
      at,
      session,
      lane: meta.lane,
      file: meta.file,
      line: i + 1
    });
  });
  return out;
}
function readLogDir(worktree, lane) {
  const dir = path.join(worktree, LOG_DIR);
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => FILE.test(n)).sort();
  } catch {
    return emptyRecords();
  }
  return mergeRecords(
    names.map((n) => {
      const file = path.join(dir, n);
      try {
        return parseLog(fs.readFileSync(file, "utf8"), { file, lane });
      } catch {
        return emptyRecords();
      }
    })
  );
}
function nameLine(n) {
  return `- name: ${n.item} ${n.name}${n.by === "jev" ? ` (jev${n.confidence !== void 0 ? ` ${n.confidence.toFixed(2)}` : ""})` : ""}`;
}
function itemLine(it) {
  return `- ${it.kind}: ${it.ref ? `[${it.ref}] ` : ""}${it.text}${it.quote ? ` \u2014 "${it.quote}"` : ""}`;
}
function linkLine(l) {
  const tag = l.by === "rule" ? "" : ` (${l.by}${l.by === "jev" && l.confidence !== void 0 ? ` ${l.confidence.toFixed(2)}` : ""})`;
  return `- link: ${l.from} ${l.how} ${l.to}${tag}`;
}
function appendTurn(worktree, sessionId, now, turn) {
  const dir = path.join(worktree, LOG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, logFileName(now, sessionId));
  const lines = [
    ...(turn.items ?? []).map(itemLine),
    ...(turn.links ?? []).map(linkLine),
    ...(turn.names ?? []).map(nameLine)
  ];
  const head = fs.existsSync(file) ? "" : `# Session ${sessionId.slice(0, 8)}
`;
  fs.appendFileSync(file, `${head}
## ${localStamp(now)}
${lines.join("\n")}
`);
  return file;
}

// ../host/src/memory/core/words.ts
var STOP = new Set(
  "the a an and or but to of in on for with is it this that be we i you me my our at as by from so do did does not no yes can will just what how why when where which about into then than there here have has had are was were".split(
    " "
  )
);
function words(text) {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9.-]{2,}/g) ?? []).flatMap((w) => {
    const t = w.replace(/[.-]+$/, "");
    const v = /^0\.(\d+\.\d+)$/.exec(t);
    return v ? [t, v[1]] : [t];
  }).filter((w) => w.length > 2 && !STOP.has(w));
}

// ../host/src/memory/core/graph.ts
var RANK = { rule: 0, jev: 1, owner: 2 };
var JEV_FLOOR = 0.6;
var COMMON_PATH = 8;
var PATH = /`([^`\s]*(?:\/[^`\s]*|\.[a-z]{1,5}))`/gi;
function pathsIn(text) {
  return [...text.matchAll(PATH)].map((m) => m[1].replace(/\\/g, "/").replace(/\/$/, "").toLowerCase());
}
function isRepoFile(p) {
  return p.includes("/") && /\.[a-z]{1,5}$/.test(p) && !/^[/~]/.test(p) && !/^(feat|fix|chore|release)\//.test(p);
}
function piecesOf(records) {
  const out = /* @__PURE__ */ new Map();
  for (const it of records.items) {
    const id = itemId(it);
    if (!out.has(id)) out.set(id, { ...it, id });
  }
  return out;
}
function ruleLinks(pieces) {
  const out = [];
  const add2 = (from, how, to) => out.push({ from: from.id, how, to, by: "rule", confidence: 1, at: from.at, session: from.session });
  const turns = /* @__PURE__ */ new Map();
  const byPath = /* @__PURE__ */ new Map();
  for (const p of pieces.values()) {
    if (p.ref && pieces.has(p.ref)) add2(p, p.kind === "done" ? "closes" : p.kind === "decided" ? "replaces" : "relates", p.ref);
    const key = `${p.session}
${p.at}`;
    turns.set(key, [...turns.get(key) ?? [], p]);
    for (const f of new Set(pathsIn(p.text).filter(isRepoFile))) byPath.set(f, [...byPath.get(f) ?? [], p]);
  }
  for (const turn of turns.values()) {
    const work = turn.filter((p) => p.kind !== "idea");
    const head = work.find((p) => p.kind === "asked") ?? work[0];
    if (!head) continue;
    for (const p of work) if (p !== head) add2(head, head.kind === "asked" ? "led-to" : "relates", p.id);
  }
  for (const group of byPath.values()) {
    if (group.length < 2 || group.length > COMMON_PATH) continue;
    for (let i = 1; i < group.length; i++) add2(group[i], "relates", group[i - 1].id);
  }
  return out;
}
function linksInForce(records, pieces) {
  const all = [...records.links, ...ruleLinks(pieces)];
  const pairKey = (a, b) => a < b ? `${a} ${b}` : `${b} ${a}`;
  const withdrawn = /* @__PURE__ */ new Map();
  for (const u of records.unlinks) {
    const k = pairKey(u.a, u.b);
    withdrawn.set(k, [...withdrawn.get(k) ?? [], { rank: RANK[u.by], at: u.at }]);
  }
  return all.filter((l) => {
    if (!pieces.has(l.from) || !pieces.has(l.to)) return false;
    if (l.by === "jev" && l.confidence < JEV_FLOOR) return false;
    const w = withdrawn.get(pairKey(l.from, l.to)) ?? [];
    return !w.some((u) => u.rank >= RANK[l.by] && u.at >= l.at);
  });
}
function plain(text) {
  return text.replace(/[*_`]+/g, "").replace(/^\s*(?:(?:the\s+)?owner\b[^:"“]{0,40}:|asked:)\s*/i, "").replace(/^(?:the\s+)?owner\s+(?:asked|wants|wanted|said|chose|raised)\s+(?:(?:me\s+)?(?:whether|if|for|to|about|that)\s+)?/i, "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
}
var GENERIC = new Set(
  "owner asked said answered answer yes pls please ok okay now then also still new next done did made make built checked read ran run same one two three all any each more less plain terms words let part step whats thing lot".split(" ")
);
var BOILERPLATE = /^(continue|folded|asked to cd|said hi|hi\b|yes\b|ok\b|go ahead)/i;
var PHRASE_CHARS = 70;
function phraseOf(text) {
  const clauses = plain(text).split(/(?<=[a-z0-9)])[.;:!?]\s|\s[—–]\s|\?\s/i).map((c2) => c2.trim()).filter(Boolean);
  const c = clauses.find((x) => !BOILERPLATE.test(x)) ?? clauses[0] ?? "";
  return c.length <= PHRASE_CHARS ? c : `${c.slice(0, PHRASE_CHARS - 1).trimEnd()}\u2026`;
}
function groupFreq(groups) {
  const df = /* @__PURE__ */ new Map();
  for (const g of groups) for (const w of new Set(g.flatMap((p) => words(`${p.text} ${p.quote ?? ""}`)))) df.set(w, (df.get(w) ?? 0) + 1);
  return df;
}
function nameCandidates(group, docFreq, groupCount, k = 6) {
  const telling = (w) => !GENERIC.has(w) && !/^\d+$/.test(w);
  const inPieces = /* @__PURE__ */ new Map();
  for (const p of group) for (const w of new Set(words(p.text))) inPieces.set(w, (inPieces.get(w) ?? 0) + 1);
  const ranked2 = group.map((p) => {
    const ws = [...new Set(words(p.text))].filter(telling);
    const s = ws.reduce((a, w) => a + (inPieces.get(w) - 1) / group.length * Math.log(1 + groupCount / (docFreq.get(w) ?? 1)), 0);
    return { p, phrase: phraseOf(p.text), s };
  }).sort((a, b) => b.s - a.s);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const { p, phrase } of ranked2) {
    if (BOILERPLATE.test(phrase) || words(phrase).filter(telling).length < 2) continue;
    if (seen.has(phrase.toLowerCase())) continue;
    seen.add(phrase.toLowerCase());
    out.push({ item: p.id, phrase });
    if (out.length === k) break;
  }
  return out;
}
function autoName(group, docFreq, groupCount) {
  const first = group.find((p) => p.kind === "asked") ?? group[0];
  const sessions = new Set(group.map((p) => p.session));
  if (sessions.size < 2 || group.length < 3) return phraseOf(first.text);
  return nameCandidates(group, docFreq, groupCount, 1)[0]?.phrase ?? phraseOf(first.text);
}
function buildGraph(records) {
  const pieces = piecesOf(records);
  const links = linksInForce(records, pieces);
  const parent = /* @__PURE__ */ new Map();
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    parent.set(x, r);
    return r;
  };
  for (const id of pieces.keys()) parent.set(id, id);
  for (const l of links) {
    const a = find(l.from);
    const b = find(l.to);
    if (a !== b) parent.set(a, b);
  }
  const groups = /* @__PURE__ */ new Map();
  for (const p of pieces.values()) {
    const r = find(p.id);
    groups.set(r, [...groups.get(r) ?? [], p]);
  }
  const rank = (n) => `${n.by === "owner" ? 1 : 0}${n.at}`;
  const namesByPiece = /* @__PURE__ */ new Map();
  for (const n of records.names) {
    const prev = namesByPiece.get(n.item);
    if (!prev || rank(n) >= rank(prev)) namesByPiece.set(n.item, n);
  }
  const docFreq = groupFreq([...groups.values()]);
  const topics = [];
  const topicOf = /* @__PURE__ */ new Map();
  for (const group of groups.values()) {
    group.sort((a, b) => a.at.localeCompare(b.at) || a.line - b.line);
    const named = group.map((p) => namesByPiece.get(p.id)).filter((n) => !!n).sort((a, b) => rank(b).localeCompare(rank(a)))[0];
    const topic = {
      id: group[0].id,
      name: named?.name ?? autoName(group, docFreq, groups.size),
      pieces: group,
      last: group[group.length - 1].at,
      lanes: [...new Set(group.map((p) => p.lane))],
      sessions: [...new Set(group.map((p) => p.session))]
    };
    topics.push(topic);
    for (const p of group) topicOf.set(p.id, topic);
  }
  topics.sort((a, b) => b.last.localeCompare(a.last));
  return { pieces, links, topics, topicOf };
}
function openPieces(graph, topic) {
  const closed = new Set(graph.links.filter((l) => l.how === "closes" || l.how === "replaces").map((l) => l.to));
  return topic.pieces.filter((p) => (p.kind === "todo" || p.kind === "question") && !closed.has(p.id));
}
function standingDecisions(graph, topic) {
  const replaced = new Set(graph.links.filter((l) => l.how === "replaces").map((l) => l.to));
  return topic.pieces.filter((p) => p.kind === "decided" && !replaced.has(p.id)).reverse();
}

// ../host/src/memory/core/brief.ts
var RUNNING_MS = 30 * 6e4;
var SHOWN = 3;
function ago(from, now) {
  const min = Math.max(0, Math.round((now.getTime() - Date.parse(from)) / 6e4));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
function short(text, max = 48) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}
function latestWork(topic) {
  const work = topic.pieces.filter((p) => p.kind === "did" || p.kind === "decided" || p.kind === "done" || p.kind === "asked");
  return (work.length ? work : topic.pieces)[(work.length ? work : topic.pieces).length - 1];
}
var CLOCK_SLACK_MS = 5 * 6e4;
function runningSessions(graph, now, self, ended = /* @__PURE__ */ new Set()) {
  const me = self.slice(0, 8);
  const last = /* @__PURE__ */ new Map();
  for (const p of graph.pieces.values()) {
    const at = Date.parse(p.at);
    if (at - now.getTime() > CLOCK_SLACK_MS) continue;
    if ((last.get(p.session) ?? 0) < at) last.set(p.session, at);
  }
  return new Set([...last].filter(([s, at]) => s !== me && !ended.has(s) && now.getTime() - at < RUNNING_MS).map(([s]) => s));
}
function ranked(graph) {
  const needs = (t) => openPieces(graph, t).some((p) => p.kind === "question");
  return [...graph.topics].sort((a, b) => Number(needs(b)) - Number(needs(a)) || b.last.localeCompare(a.last));
}
function lateLines(graph, late) {
  return late.flatMap((l) => {
    const [oldId, newId, verb] = l.how === "closes" ? [l.to, l.from, "done by"] : l.how === "led-to" ? [l.from, l.to, "picked up by"] : [];
    const old = oldId ? graph.pieces.get(oldId) : void 0;
    const later = newId ? graph.pieces.get(newId) : void 0;
    return old && later ? [`\u2022 ${old.kind} from ${old.at.slice(0, 10)}, ${short(old.text, 36)}: ${verb} ${short(later.text, 36)}`] : [];
  });
}
function startScreen(records, now, session, late = [], ended = /* @__PURE__ */ new Set()) {
  const graph = buildGraph(records);
  if (!graph.topics.length) return "Nudge \xB7 nothing recorded here yet. Just start.";
  const running = runningSessions(graph, now, session, ended);
  const head = running.size ? `Nudge \xB7 ${running.size} other window${running.size === 1 ? "" : "s"} running here` : "Nudge \xB7 picking up here";
  const topics = ranked(graph);
  const lines = topics.slice(0, SHOWN).map((t) => {
    const q = openPieces(graph, t).find((p) => p.kind === "question");
    if (q) return `\u2022 ${short(t.name, 28)}: needs you, ${short(plain(q.text), 40)}`;
    const on = t.sessions.some((s) => running.has(s)) ? "now" : ago(t.last, now);
    return `\u2022 ${short(t.name, 28)}: ${short(phraseOf(latestWork(t).text), 40)} (${on})`;
  });
  const more = topics.length - SHOWN;
  if (more > 0) lines.push(`\u2022 and ${more} more`);
  const found = lateLines(graph, late);
  if (found.length) lines.push("Connected since last time:", ...found.slice(0, SHOWN));
  return [head, ...lines, "Just type. I'll bring up what's related."].join("\n");
}
function matchTopic(graph, message) {
  const df = /* @__PURE__ */ new Map();
  const bags = graph.topics.map((t) => new Set(t.pieces.flatMap((p) => words(`${p.text} ${p.quote ?? ""}`)).concat(words(t.name))));
  for (const bag2 of bags) for (const w of bag2) df.set(w, (df.get(w) ?? 0) + 1);
  const asked = new Set(words(message));
  let best = null;
  graph.topics.forEach((t, i) => {
    let score = 0;
    for (const w of asked) if (bags[i].has(w)) score += 1 / df.get(w);
    if (score > (best?.score ?? 0)) best = { topic: t, score };
  });
  const found = best;
  return found && found.score >= 1 ? found.topic : null;
}
function renderTopic(graph, topic, now, session, ended = /* @__PURE__ */ new Set()) {
  if (!topic) return "New topic.";
  const running = runningSessions(graph, now, session, ended);
  const lines = [short(topic.name, 60) + "."];
  if (topic.sessions.some((s) => running.has(s))) lines.push(`Another window is on this now (${short(latestWork(topic).text, 36)}).`);
  const decided = standingDecisions(graph, topic)[0];
  if (decided) lines.push(`Last decided: ${short(decided.text, 60)}`);
  const open = openPieces(graph, topic);
  for (const p of open.filter((p2) => p2.kind === "question").slice(0, 1)) lines.push(`Needs you: ${short(p.text, 60)}`);
  for (const p of open.filter((p2) => p2.kind === "todo").slice(-2)) lines.push(`Open: ${short(p.text, 60)}`);
  for (const p of topic.pieces.filter((p2) => p2.kind === "trap").slice(-1)) lines.push(`Careful: ${short(p.text, 60)}`);
  return lines.join("\n");
}

// ../host/src/memory/core/identity.ts
import { execFileSync } from "node:child_process";
import path3 from "node:path";

// ../host/src/memory/core/seed.ts
import fs2 from "node:fs";
import path2 from "node:path";
var ENTRY = new RegExp(String.raw`^## (${STAMP_SOURCE})\s*·\s*session\s+([A-Za-z0-9]{1,8})`);
function readJournal(worktree, lane) {
  const file = path2.join(worktree, ".nudge", "journal.md");
  const out = emptyRecords();
  let text;
  try {
    text = fs2.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  let current = null;
  const flush = () => {
    if (!current) return;
    const body = current.body.join(" ").replace(/^\s*-\s*/, "").replace(/\s+/g, " ").trim();
    if (body) out.items.push({ kind: "did", text: body, at: current.at, session: current.session, lane, file, line: current.line });
    current = null;
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = ENTRY.exec(raw);
    if (m) {
      flush();
      const at = utcStamp(m[1]);
      current = { at, session: m[2], line: i + 1, body: [] };
    } else if (current && raw.trim()) {
      current.body.push(raw.trim());
    } else if (raw.startsWith("## ")) {
      flush();
    }
  });
  flush();
  return out;
}

// ../host/src/memory/core/identity.ts
function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5e3 });
  } catch {
    return null;
  }
}
function lanes(cwd) {
  const out = git(cwd, ["worktree", "list", "--porcelain"]);
  if (!out) return [{ path: cwd, name: path3.basename(cwd) }];
  const found = [];
  let current = {};
  const flush = () => {
    if (current.path) found.push({ path: current.path, name: current.branch ?? path3.basename(current.path) });
    current = {};
  };
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      flush();
      current.path = path3.resolve(line.slice("worktree ".length));
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
  }
  flush();
  return found.length ? found : [{ path: cwd, name: path3.basename(cwd) }];
}
function readProject(cwd) {
  return mergeRecords(lanes(cwd).flatMap((l) => [readJournal(l.path, l.name), readLogDir(l.path, l.name)]));
}

// ../host/src/memory/core/link.ts
import fs3 from "node:fs";
import path4 from "node:path";

// ../host/src/memory/core/jev.ts
var JEV_URL = "https://ai-gateway.vercel.sh/v1/evaluate";
var JEV_MODEL = "typesafe-ai/jev";
var JEV_DIRECT_URL = "https://api.typesafe.ai/v1/systemone";
var JEV_DIRECT_MODEL = "jev-latest";
var JEV_BATCH = 8;
var TIMEOUT_MS = 2500;
var RETRY_WAIT_MS = 500;
function jevKey(env = process.env) {
  const ai = (env.NUDGE_NOTES_AI ?? "").trim().toLowerCase();
  if (/^(off|0|false|no)$/.test(ai)) return null;
  const general = /^(on|1|true|yes)$/.test(ai) ? env.AI_GATEWAY_API_KEY : "";
  return (env.NUDGE_JEV_KEY || general || "").trim() || null;
}
function typesafeKey(env = process.env) {
  const ai = (env.NUDGE_NOTES_AI ?? "").trim().toLowerCase();
  if (/^(off|0|false|no)$/.test(ai)) return null;
  if (!(env.NUDGE_JEV_KEY || "").trim() && !/^(on|1|true|yes)$/.test(ai)) return null;
  return (env.TYPESAFE_API_KEY || "").trim() || null;
}
function jevRoutes(env = process.env) {
  const routes = [];
  const direct = typesafeKey(env);
  if (direct) routes.push({ name: "direct", url: JEV_DIRECT_URL, model: JEV_DIRECT_MODEL, key: direct });
  const gw = jevKey(env);
  if (gw) routes.push({ name: "gateway", url: JEV_URL, model: JEV_MODEL, key: gw });
  return routes;
}
var toDirect = (questions) => Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, q.type === "boolean" ? { ...q, type: "noul" } : q]));
function fromDirect(a) {
  const x = a;
  return x && typeof x === "object" && x.type === "noul" ? { type: "boolean", probability: Number(x.noul) } : a;
}
function valid(a) {
  if (!a || typeof a !== "object") return false;
  const x = a;
  if (x.type === "boolean") return typeof x.probability === "number";
  if (x.type === "choice") return typeof x.choice === "string" && typeof x.confidence === "number";
  if (x.type === "score") return typeof x.score === "number" && typeof x.confidence === "number";
  return false;
}
async function once(route, state, questions, opts) {
  const doFetch = opts.fetchImpl ?? fetch;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
    let retry = false;
    try {
      const res = await doFetch(route.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${route.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: route.model, state, questions: route.name === "direct" ? toDirect(questions) : questions }),
        signal: ctrl.signal
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.answers && typeof json.answers === "object") {
        const out = {};
        for (const id of Object.keys(questions)) {
          const a = route.name === "direct" ? fromDirect(json.answers[id]) : json.answers[id];
          if (!valid(a)) return null;
          out[id] = a;
        }
        return out;
      }
      retry = res.status === 429 || res.status >= 500;
    } catch {
      retry = true;
    } finally {
      clearTimeout(timer);
    }
    if (!retry) return null;
    if (attempt === 1) await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
  }
  return null;
}
async function jevEvaluate(state, questions, opts = {}) {
  const routes = jevRoutes(opts.env);
  const ids = Object.keys(questions);
  if (!routes.length || !ids.length) return null;
  const batches = [];
  for (let i = 0; i < ids.length; i += JEV_BATCH) batches.push(Object.fromEntries(ids.slice(i, i + JEV_BATCH).map((id) => [id, questions[id]])));
  for (const route of routes) {
    const results = await Promise.all(batches.map((b) => once(route, state, b, opts)));
    if (results.every((r) => r)) return Object.assign({}, ...results);
  }
  return null;
}

// ../host/src/memory/core/link.ts
var SHORTLIST = 6;
var CACHE_FILE = path4.join(LOG_DIR, ".jev-cache.json");
var PARALLEL = 4;
var PIECE_CHARS = 400;
var SAMPLE_CHARS = 160;
function clip(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}
function bag(p) {
  return new Set(words(`${p.text} ${p.quote ?? ""}`));
}
function shortlist(graph, piece, k = SHORTLIST) {
  const own = graph.topicOf.get(piece.id);
  const earlier = [...graph.pieces.values()].filter((p) => p.id !== piece.id && p.at < piece.at && graph.topicOf.get(p.id) !== own);
  const bags = new Map(earlier.map((p) => [p.id, bag(p)]));
  const df = /* @__PURE__ */ new Map();
  for (const b of bags.values()) for (const w of b) df.set(w, (df.get(w) ?? 0) + 1);
  const mine = bag(piece);
  const best = /* @__PURE__ */ new Map();
  for (const p of earlier) {
    let score = 0;
    for (const w of mine) if (bags.get(p.id).has(w)) score += 1 / df.get(w);
    if (score <= 0) continue;
    const topic = graph.topicOf.get(p.id);
    const prev = best.get(topic.id);
    if (!prev || score > prev.score) best.set(topic.id, { anchor: p, topicName: topic.name, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
var cacheKey = (piece, c) => `${piece.id}:${c.map((x) => x.anchor.id).sort().join(",")}`;
function readCache(file) {
  try {
    return JSON.parse(fs3.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
function question(piece, cands) {
  const criteria = { none: "None of these: it starts something new, or is about something else." };
  cands.forEach((c, i) => {
    criteria[`t${i}`] = `${clip(c.topicName, 80)} \u2014 for example: "${clip(c.anchor.text, SAMPLE_CHARS)}"`;
  });
  return {
    type: "choice",
    instructions: `A record of work on a software project was just written: "${clip(piece.text, PIECE_CHARS)}". Which earlier piece of work does it continue \u2014 the same feature, bug, decision or idea? Choose none unless it clearly continues one.`,
    criteria
  };
}
async function jevLinks(records, ids, worktree, opts = {}) {
  const graph = buildGraph(records);
  const linked = new Set(records.links.filter((l) => l.by !== "rule").map((l) => l.from));
  const cacheFile = path4.join(worktree, CACHE_FILE);
  const cache = opts.cache === false ? {} : readCache(cacheFile);
  const out = { links: [], asked: 0, cached: 0, failed: 0 };
  const ask = [];
  const take = (piece, cands, hit) => {
    if (!hit.to || hit.p < JEV_FLOOR) return;
    const to = cands.find((c) => c.anchor.id === hit.to);
    if (to) out.links.push({ from: piece.id, how: "relates", to: to.anchor.id, by: "jev", confidence: Math.round(hit.p * 100) / 100 });
  };
  for (const id of ids) {
    const piece = graph.pieces.get(id);
    if (!piece || linked.has(id)) continue;
    const cands = shortlist(graph, piece);
    if (!cands.length) continue;
    const key = cacheKey(piece, cands);
    const hit = cache[key];
    if (hit) {
      out.cached++;
      take(piece, cands, hit);
    } else ask.push({ piece, cands, key });
  }
  const batches = [];
  for (let i = 0; i < ask.length; i += JEV_BATCH) batches.push(ask.slice(i, i + JEV_BATCH));
  for (let i = 0; i < batches.length; i += PARALLEL) {
    await Promise.all(
      batches.slice(i, i + PARALLEL).map(async (batch) => {
        const qs = Object.fromEntries(batch.map((b, j) => [`p${j}`, question(b.piece, b.cands)]));
        const answers = await jevEvaluate({ task: "link related records of one software project" }, qs, opts);
        if (!answers) {
          out.failed += batch.length;
          return;
        }
        batch.forEach((b, j) => {
          const a = answers[`p${j}`];
          if (a?.type !== "choice") return;
          const idx = a.choice === "none" ? -1 : Number(a.choice.slice(1));
          const hit = { to: b.cands[idx]?.anchor.id ?? null, p: a.probabilities[a.choice] ?? a.confidence };
          cache[b.key] = hit;
          out.asked++;
          take(b.piece, b.cands, hit);
        });
      })
    );
  }
  if (opts.cache !== false && out.asked) {
    fs3.mkdirSync(path4.dirname(cacheFile), { recursive: true });
    fs3.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return out;
}
async function linkAndRecord(records, ids, worktree, sessionId, now, opts = {}) {
  const result = await jevLinks(records, ids, worktree, opts);
  if (result.links.length) appendTurn(worktree, sessionId, now, { links: result.links });
  return result;
}

// ../host/src/memory/core/names.ts
import fs4 from "node:fs";
import path5 from "node:path";
var NAME_CACHE_FILE = path5.join(LOG_DIR, ".jev-names.json");
function question2(topic, cands) {
  const sample = topic.pieces.slice(-8).map((p) => `"${phraseOf(p.text)}"`).join("; ");
  return {
    type: "choice",
    instructions: `These records are one piece of work on a software project: ${sample}. Which phrase best names the whole piece of work, for its owner scanning a short list?`,
    criteria: Object.fromEntries(cands.map((c, i) => [`n${i}`, c.phrase]))
  };
}
function readCache2(file) {
  try {
    return JSON.parse(fs4.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
async function jevNames(records, worktree, opts = {}) {
  const graph = buildGraph(records);
  const ownerNamed = new Set(records.names.filter((n) => n.by === "owner").map((n) => n.item));
  const current = new Map(records.names.filter((n) => n.by === "jev").map((n) => [n.item, n.name]));
  const cacheFile = path5.join(worktree, NAME_CACHE_FILE);
  const cache = opts.cache === false ? {} : readCache2(cacheFile);
  const out = { names: [], asked: 0, cached: 0, failed: 0 };
  const take = (topic, cands, hit) => {
    if (!hit.item || hit.p < JEV_FLOOR) return;
    const c = cands.find((x) => x.item === hit.item);
    if (c && topic.name !== c.phrase && current.get(c.item) !== c.phrase)
      out.names.push({ item: c.item, name: c.phrase, by: "jev", confidence: Math.round(hit.p * 100) / 100 });
  };
  const ask = [];
  const df = groupFreq(graph.topics.map((t) => t.pieces));
  for (const topic of graph.topics) {
    if (topic.sessions.length < 2 || topic.pieces.length < 3 || topic.pieces.some((p) => ownerNamed.has(p.id))) continue;
    const cands = nameCandidates(topic.pieces, df, graph.topics.length);
    if (cands.length < 2) continue;
    const key = cands.map((c) => c.item).sort().join(",");
    if (cache[key]) {
      out.cached++;
      take(topic, cands, cache[key]);
    } else ask.push({ topic, cands, key });
  }
  for (let i = 0; i < ask.length; i += JEV_BATCH) {
    const batch = ask.slice(i, i + JEV_BATCH);
    const answers = await jevEvaluate({ task: "name groups of related records of one software project" }, Object.fromEntries(batch.map((b, j) => [`t${j}`, question2(b.topic, b.cands)])), opts);
    if (!answers) {
      out.failed += batch.length;
      continue;
    }
    batch.forEach((b, j) => {
      const a = answers[`t${j}`];
      if (a?.type !== "choice") return;
      const hit = { item: b.cands[Number(a.choice.slice(1))]?.item ?? null, p: a.probabilities[a.choice] ?? a.confidence };
      cache[b.key] = hit;
      out.asked++;
      take(b.topic, b.cands, hit);
    });
  }
  if (opts.cache !== false && out.asked) {
    fs4.mkdirSync(path5.dirname(cacheFile), { recursive: true });
    fs4.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return out;
}
async function nameAndRecord(records, worktree, sessionId, now, opts = {}) {
  const result = await jevNames(records, worktree, opts);
  if (result.names.length) appendTurn(worktree, sessionId, now, { names: result.names });
  return result;
}

// ../host/src/memory/core/relink.ts
import fs5 from "node:fs";
import path6 from "node:path";
var RELINK_CACHE_FILE = path6.join(LOG_DIR, ".jev-relink.json");
var LATE_SHORTLIST = 4;
var MERGE_FLOOR = 0.8;
var MERGE_MAX = 20;
var FIRST_WINDOW_MS = 7 * 24 * 36e5;
var PIECE_CHARS2 = 300;
var SAMPLE_CHARS2 = 160;
function clip2(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}
var bagOf = (p) => new Set(words(`${p.text} ${p.quote ?? ""}`));
function readCache3(file) {
  try {
    const c = JSON.parse(fs5.readFileSync(file, "utf8"));
    return { last: c.last, answers: c.answers ?? {} };
  } catch {
    return { answers: {} };
  }
}
function lateShortlist(graph, old, fresh, df, k = LATE_SHORTLIST) {
  const mine = bagOf(old);
  const own = graph.topicOf.get(old.id);
  return fresh.filter((p) => p.at > old.at && graph.topicOf.get(p.id) !== own).map((p) => {
    let s = 0;
    for (const w of bagOf(p)) if (mine.has(w)) s += 1 / (df.get(w) ?? 1);
    return { p, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.p);
}
function lateQuestion(old, cands) {
  const what = old.kind === "todo" ? "a thing left to do" : old.kind === "question" ? "an open question" : "an idea";
  const criteria = { none: "None of these: they are about something else." };
  cands.forEach((c, i) => {
    criteria[`f${i}`] = `This later record takes it further, without finishing it: "${clip2(c.text, SAMPLE_CHARS2)}"`;
    if (old.kind !== "idea") criteria[`c${i}`] = `This later record finishes or answers it: "${clip2(c.text, SAMPLE_CHARS2)}"`;
  });
  return {
    type: "choice",
    instructions: `Earlier on a software project, ${what} was recorded: "${clip2(old.text, PIECE_CHARS2)}". Did any of these later records pick it up? Choose none unless one clearly does.`,
    criteria
  };
}
function mergeShortlist(graph, topic, df, k = LATE_SHORTLIST) {
  const bag2 = (t) => new Set(t.pieces.flatMap((p) => [...bagOf(p)]));
  const mine = bag2(topic);
  return graph.topics.filter((t) => t !== topic && t.pieces.length <= MERGE_MAX).map((t) => {
    let s = 0;
    for (const w of bag2(t)) if (mine.has(w)) s += 1 / (df.get(w) ?? 1);
    return { t, s };
  }).filter((x) => x.s >= 1).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.t);
}
function central(topic, df, groups) {
  const id = nameCandidates(topic.pieces, df, groups, 1)[0]?.item;
  return topic.pieces.find((p) => p.id === id) ?? topic.pieces[topic.pieces.length - 1];
}
function closest(topic, other, df, k = 2) {
  const theirs = new Set(other.pieces.flatMap((p) => [...bagOf(p)]));
  return topic.pieces.map((p) => {
    let s = 0;
    for (const w of bagOf(p)) if (theirs.has(w)) s += 1 / (df.get(w) ?? 1);
    return { p, s };
  }).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.p);
}
var quoted = (ps) => ps.map((p) => `"${clip2(p.text, SAMPLE_CHARS2)}"`).join("; ");
function mergeQuestion(topic, cands, df) {
  const criteria = { none: "None: different work, even if the words overlap." };
  cands.forEach((t, i) => {
    criteria[`m${i}`] = `${clip2(t.name, 80)} \u2014 for example: ${quoted(closest(t, topic, df))}`;
  });
  return {
    type: "choice",
    instructions: `These records are one piece of work on a software project: ${quoted(topic.pieces.slice(-3))}. Is it the same piece of work \u2014 same feature, bug or decision \u2014 as one of these? Choose none unless clearly so.`,
    criteria
  };
}
async function relink(records, worktree, now, opts = {}) {
  const graph = buildGraph(records);
  const cacheFile = path6.join(worktree, RELINK_CACHE_FILE);
  const cache = opts.cache === false ? { answers: {} } : readCache3(cacheFile);
  const since = opts.since ?? cache.last ?? new Date(now.getTime() - FIRST_WINDOW_MS).toISOString();
  const fresh = [...graph.pieces.values()].filter((p) => p.at > since && p.at <= now.toISOString());
  const out = { links: [], fresh: fresh.length, asked: 0, cached: 0, failed: 0 };
  const save = () => {
    if (opts.cache === false) return;
    if (!out.failed) cache.last = now.toISOString();
    fs5.mkdirSync(path6.dirname(cacheFile), { recursive: true });
    fs5.writeFileSync(cacheFile, JSON.stringify(cache));
  };
  if (!fresh.length) {
    save();
    return out;
  }
  const df = /* @__PURE__ */ new Map();
  for (const p of graph.pieces.values()) for (const w of bagOf(p)) df.set(w, (df.get(w) ?? 0) + 1);
  const pair = (a, b) => a < b ? `${a} ${b}` : `${b} ${a}`;
  const joined = new Set(graph.links.filter((l) => l.how !== "relates" || l.by !== "rule").map((l) => pair(l.from, l.to)));
  const asks = [];
  const freshTopics = new Set(fresh.map((p) => graph.topicOf.get(p.id)));
  const open = graph.topics.flatMap((t) => [...openPieces(graph, t), ...t.pieces.filter((p) => p.kind === "idea")]);
  for (const old of open) {
    if (old.at > since) continue;
    const cands = lateShortlist(graph, old, fresh, df).filter((c) => !joined.has(pair(old.id, c.id)));
    if (!cands.length) continue;
    asks.push({
      key: `late:${old.id}:${cands.map((c) => c.id).sort().join(",")}`,
      q: lateQuestion(old, cands),
      take: (pick, p) => {
        if (!pick || pick === "none" || p < JEV_FLOOR) return;
        const c = cands[Number(pick.slice(1))];
        if (!c) return;
        const confidence = Math.round(p * 100) / 100;
        out.links.push(pick[0] === "c" ? { from: c.id, how: "closes", to: old.id, by: "jev", confidence } : { from: old.id, how: "led-to", to: c.id, by: "jev", confidence });
      }
    });
  }
  const tdf = groupFreq(graph.topics.map((t) => t.pieces));
  const merged = /* @__PURE__ */ new Set();
  for (const topic of freshTopics) {
    if (topic.pieces.length > MERGE_MAX) continue;
    const cands = mergeShortlist(graph, topic, tdf);
    if (!cands.length) continue;
    const from = central(topic, tdf, graph.topics.length);
    asks.push({
      key: `merge:${topic.id}:${topic.pieces.length}:${cands.map((t) => `${t.id}.${t.pieces.length}`).sort().join(",")}`,
      q: mergeQuestion(topic, cands, df),
      take: (pick, p) => {
        if (!pick || pick === "none" || p < MERGE_FLOOR) return;
        const t = cands[Number(pick.slice(1))];
        if (!t || merged.has(pair(topic.id, t.id))) return;
        merged.add(pair(topic.id, t.id));
        out.links.push({ from: from.id, how: "relates", to: closest(t, topic, df, 1)[0].id, by: "jev", confidence: Math.round(p * 100) / 100 });
      }
    });
  }
  const toAsk = [];
  for (const a of asks) {
    const hit = cache.answers[a.key];
    if (hit) {
      out.cached++;
      a.take(hit.pick, hit.p);
    } else toAsk.push(a);
  }
  const batches = [];
  for (let i = 0; i < toAsk.length; i += JEV_BATCH) batches.push(toAsk.slice(i, i + JEV_BATCH));
  const answered = await Promise.all(
    batches.map((batch) => jevEvaluate({ task: "connect earlier and later records of one software project" }, Object.fromEntries(batch.map((a, j) => [`q${j}`, a.q])), opts))
  );
  batches.forEach((batch, b) => {
    const answers = answered[b];
    if (!answers) {
      out.failed += batch.length;
      return;
    }
    batch.forEach((a, j) => {
      const ans = answers[`q${j}`];
      if (ans?.type !== "choice") return;
      const hit = { pick: ans.choice === "none" ? null : ans.choice, p: ans.probabilities[ans.choice] ?? ans.confidence };
      cache.answers[a.key] = hit;
      out.asked++;
      a.take(hit.pick, hit.p);
    });
  });
  save();
  return out;
}
async function relinkAndRecord(records, worktree, sessionId, now, opts = {}) {
  const result = await relink(records, worktree, now, opts);
  if (result.links.length) appendTurn(worktree, sessionId, now, { links: result.links });
  return result;
}

// ../host/src/memory/core/route.ts
var ROUTE_SHORTLIST = 6;
var MESSAGE_CHARS = 500;
function clip3(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}
function scored(graph, message) {
  const bags = graph.topics.map((t) => new Set(t.pieces.flatMap((p) => words(`${p.text} ${p.quote ?? ""}`))));
  const df = /* @__PURE__ */ new Map();
  for (const b of bags) for (const w of b) df.set(w, (df.get(w) ?? 0) + 1);
  const asked = new Set(words(message));
  const weight = new Map([...asked].filter((w) => df.has(w)).map((w) => [w, 1 / df.get(w)]));
  return graph.topics.map((t, i) => {
    let score = 0;
    for (const [w, v] of weight) if (bags[i].has(w)) score += v;
    return { t, score, weight };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}
function closest2(topic, weight, n = 2) {
  return topic.pieces.map((p, i) => {
    const bag2 = new Set(words(`${p.text} ${p.quote ?? ""}`));
    let s = 0;
    for (const [w, v] of weight) if (bag2.has(w)) s += v;
    return { p, s, i };
  }).sort((a, b) => b.s - a.s || b.i - a.i).slice(0, n).map((x) => `"${clip3(x.p.text, 140)}"`).join("; ");
}
async function routeTopic(graph, message, opts = {}) {
  const rule = () => ({ topic: matchTopic(graph, message), by: "rule" });
  const top = scored(graph, message).slice(0, ROUTE_SHORTLIST);
  const cands = top.map((x) => x.t);
  if (!cands.length) return rule();
  const criteria = { none: "None of these: it is something new." };
  top.forEach((x, i) => {
    criteria[`t${i}`] = `Earlier work (${x.t.pieces.length} records), for example: ${closest2(x.t, x.weight)}`;
  });
  const answers = await jevEvaluate(
    { task: "route the first message of a coding session to the earlier work it belongs to" },
    {
      route: {
        type: "choice",
        instructions: `The owner opened a new session on a software project and wrote: "${clip3(message, MESSAGE_CHARS)}". Which earlier work is this about: the same feature, bug, release, decision or idea? Choose none unless it clearly is.`,
        criteria
      }
    },
    opts
  );
  const a = answers?.route;
  if (!a || a.type !== "choice") return rule();
  const p = a.probabilities[a.choice] ?? a.confidence;
  const jev = { criteria, probabilities: a.probabilities };
  if (p < JEV_FLOOR) return { ...rule(), jev };
  if (a.choice === "none") return { topic: null, by: "jev", confidence: p, jev };
  const topic = cands[Number(a.choice.slice(1))];
  return topic ? { topic, by: "jev", confidence: p, jev } : { ...rule(), jev };
}
async function topicViewJev(records, message, now, session, opts = {}, ended = /* @__PURE__ */ new Set()) {
  const graph = buildGraph(records);
  const route = await routeTopic(graph, message, opts);
  return renderTopic(graph, route.topic, now, session, ended);
}

// ../host/src/memory/core/why.ts
import path7 from "node:path";
var WHY_SHORTLIST = 8;
var WHY_STEPS = 8;
var WHY_DEPTH = 4;
var QUESTION_CHARS = 400;
function clip4(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}
function questionWeights(bags, question3) {
  const df = /* @__PURE__ */ new Map();
  for (const b of bags) for (const w of b) df.set(w, (df.get(w) ?? 0) + 1);
  const n = bags.length;
  return new Map([...new Set(words(question3))].filter((w) => df.has(w)).map((w) => [w, Math.log(1 + (n - df.get(w) + 0.5) / (df.get(w) + 0.5))]));
}
function pieceShortlist(graph, question3, k = WHY_SHORTLIST) {
  const pieces = [...graph.pieces.values()];
  const texts = pieces.map((p) => words(`${p.text} ${p.quote ?? ""}`));
  const bags = texts.map((t) => new Set(t));
  const avg = texts.reduce((s, t) => s + t.length, 0) / Math.max(1, texts.length);
  const weight = questionWeights(bags, question3);
  return pieces.map((p, i) => {
    const norm = (1.2 + 1) / (1 + 1.2 * (0.25 + 0.75 * texts[i].length / Math.max(1, avg)));
    let score = 0;
    for (const [w, v] of weight) if (bags[i].has(w)) score += v * norm;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.p.at.localeCompare(a.p.at)).slice(0, k).map((x) => x.p);
}
function excerpt(text, question3, max = 280) {
  if (text.length <= max) return clip4(text, max);
  const asked = new Set(words(question3));
  const sentences = text.split(/(?<=[.;!?])\s+|\s[—–]\s/).filter((x) => x.trim());
  const best = sentences.map((x, i) => ({ x, i, s: words(x).filter((w) => asked.has(w)).length })).sort((a, b) => b.s - a.s || a.i - b.i);
  const picked = [];
  let len = 0;
  for (const b of best) {
    if (len + b.x.length > max && picked.length) break;
    picked.push(b);
    len += b.x.length + 5;
  }
  return clip4(picked.sort((a, b) => a.i - b.i).map((b) => b.x.trim()).join(" \u2026 "), max);
}
async function whyTarget(graph, question3, opts = {}) {
  const cands = pieceShortlist(graph, question3);
  if (!cands.length) return { piece: null, by: "rule" };
  const rule = { piece: cands[0], by: "rule" };
  const criteria = { none: "None of these: the question is about something not recorded here." };
  cands.forEach((p2, i) => {
    criteria[`p${i}`] = `${day(p2.at)}, ${p2.kind}: "${excerpt(p2.text, question3)}"`;
  });
  const answers = await jevEvaluate(
    { task: "find the recorded decision or piece of work a question about the past is asking about" },
    {
      target: {
        type: "choice",
        instructions: `The owner of a software project asked: "${clip4(question3, QUESTION_CHARS)}". Which record is this question about: the decision, change or piece of work whose reasons they want? Choose none unless one clearly is.`,
        criteria
      }
    },
    opts
  );
  const a = answers?.target;
  if (!a || a.type !== "choice") return rule;
  const p = a.probabilities[a.choice] ?? a.confidence;
  if (p < JEV_FLOOR) return rule;
  if (a.choice === "none") return { piece: null, by: "jev", confidence: p };
  const piece = cands[Number(a.choice.slice(1))];
  return piece ? { piece, by: "jev", confidence: p } : rule;
}
function older(a, b) {
  return a.at < b.at || a.at === b.at && a.file === b.file && a.line < b.line;
}
function pathBack(graph, from, max = WHY_STEPS) {
  const start = graph.pieces.get(from);
  if (!start) return [];
  const near = /* @__PURE__ */ new Map();
  const add2 = (a, b, strong) => near.set(a, [...near.get(a) ?? [], { id: b, strong }]);
  for (const l of graph.links) {
    const strong = l.how !== "relates";
    add2(l.from, l.to, strong);
    add2(l.to, l.from, strong);
  }
  const seen = /* @__PURE__ */ new Set([from]);
  let frontier = [start];
  for (let depth = 0; depth < WHY_DEPTH && frontier.length && seen.size < max; depth++) {
    const next = [];
    for (const p of frontier) {
      const back = (near.get(p.id) ?? []).map((n) => ({ ...n, piece: graph.pieces.get(n.id) })).filter((n) => !!n.piece && !seen.has(n.id) && older(n.piece, p)).sort((a, b) => Number(b.strong) - Number(a.strong) || b.piece.at.localeCompare(a.piece.at));
      for (const n of back) {
        if (seen.size >= max) break;
        seen.add(n.id);
        next.push(n.piece);
      }
    }
    frontier = next;
  }
  return [...seen].map((id) => graph.pieces.get(id)).sort((a, b) => a.at.localeCompare(b.at) || a.line - b.line);
}
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function day(at) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(at);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : at;
}
function where(p, repo) {
  const rel = path7.isAbsolute(p.file) ? path7.relative(repo, p.file) : p.file;
  return `${rel.split(path7.sep).join("/")}:${p.line}`;
}
async function whyView(records, question3, repo, opts = {}) {
  const graph = buildGraph(records);
  const target = await whyTarget(graph, question3, opts);
  if (!target.piece) return { visible: [], context: [] };
  const steps = pathBack(graph, target.piece.id);
  const lines = steps.map((p) => {
    const said = p.quote ? ` \u2014 owner: "${clip4(p.quote, 200)}"` : "";
    const mark = p.id === target.piece.id ? " \u2190 the question is about this" : "";
    return `- ${day(p.at)} \xB7 ${p.kind}: ${excerpt(p.text, question3, 300)}${said} (${where(p, repo)})${mark}`;
  });
  const first = steps[0];
  return {
    visible: [`Nudge \xB7 traced back ${steps.length} step${steps.length === 1 ? "" : "s"} to ${day(first.at)}: ${clip4(first.text, 60)}`],
    context: [
      `Nudge memory, the recorded path behind this question, oldest first. Answer from it: the decision, then what led to it, each step with its date and the owner's own words where there are any, and where it is saved. If it does not answer the question, say so rather than guess.
${lines.join("\n")}`
    ]
  };
}

// ../host/src/usage/plan.ts
import os2 from "node:os";
import path13 from "node:path";

// ../host/src/oversight/analytics/plan.ts
import fs6 from "node:fs";
import path8 from "node:path";
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
  const multiple2 = /max_(\d+)x\b/.exec(tier)?.[1];
  if (name === "Claude Max" && multiple2) name = `Claude Max (${multiple2}\xD7)`;
  const known = !!org && org in ORG_NAMES;
  const kind = billing.includes("subscription") || known && org !== "free" && org !== "claude_free" ? "subscription" : "unknown";
  const listed = kind === "subscription" ? PLAN_MONTHLY_USD[name.trim().toLowerCase()] : void 0;
  const monthly = "monthlyPriceUsd" in price ? price : listed ? { monthlyPriceUsd: listed } : {};
  return { provider: "anthropic", kind, name, extraUsage: a.hasExtraUsageEnabled === true, source: PLAN_SOURCE, ...monthly };
}
function configuredPlanPrice(root) {
  try {
    const raw = JSON.parse(fs6.readFileSync(path8.join(root, "config.json"), "utf8"));
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
    const parsed = JSON.parse(fs6.readFileSync(path8.join(opts.home, ".claude.json"), "utf8"));
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
import fs10 from "node:fs";
import os from "node:os";
import path12 from "node:path";

// ../host/src/memory/rules.ts
var HANDOFF_TOKENS = 15e4;
var COSTLY_TOKENS = 2 * HANDOFF_TOKENS;
var EXTEND_TOKENS = 1e5;
var HANDOFF_MAX_CHARS = 3e3;
var HANDOFF_TOO_LONG_CHARS = 2 * HANDOFF_MAX_CHARS;

// ../host/src/oversight/prices.ts
import { createHash } from "node:crypto";
import fs8 from "node:fs";
import path10 from "node:path";

// ../host/src/oversight/price-feed.ts
import fs7 from "node:fs";
import path9 from "node:path";
var LITELLM_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
var OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
var FEED_MAX_AGE_MS = 24 * 36e5;
var FEED_RETRY_MS = 36e5;
var FETCH_TIMEOUT_MS = 1e4;
var DISAGREE = 0.05;
var FAMILIES = /^(?:claude-|gpt-|o\d|kimi-|deepseek-|glm-|qwen|gemini-|grok-|mistral-|llama-)/;
var feedFile = (home) => path9.join(home, "prices.json");
var perM = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e6) / 1e6 : void 0;
};
function sane(p) {
  return p.input > 0 && p.output > 0 && p.output >= p.input && p.input < 1e3 && p.output < 5e3;
}
var dashed = (id) => id.toLowerCase().replace(/(\d)\.(\d)/g, "$1-$2");
function parseLiteLLM(json) {
  const out = {};
  if (!json || typeof json !== "object") return out;
  for (const [key, v] of Object.entries(json)) {
    if (key.includes("/") || key.includes(":") || !v || typeof v !== "object") continue;
    const e = v;
    if (e.mode !== void 0 && e.mode !== "chat") continue;
    const name = dashed(key);
    if (!FAMILIES.test(name)) continue;
    const input = perM(e.input_cost_per_token);
    const output = perM(e.output_cost_per_token);
    if (input === void 0 || output === void 0) continue;
    const p = { input, output };
    const read = perM(e.cache_read_input_token_cost);
    const write5m = perM(e.cache_creation_input_token_cost);
    const write1h = perM(e.cache_creation_input_token_cost_above_1hr);
    if (read !== void 0 && read > 0) p.cacheRead = read;
    if (write5m !== void 0 && write5m > 0) p.cacheWrite5m = write5m;
    if (write1h !== void 0 && write1h > 0) p.cacheWrite1h = write1h;
    if (sane(p)) out[name] = p;
  }
  return out;
}
function parseOpenRouter(json) {
  const out = {};
  const data = json?.data;
  if (!Array.isArray(data)) return out;
  for (const m of data) {
    const id = typeof m.id === "string" ? m.id : "";
    if (!id || id.includes(":")) continue;
    const name = dashed(id.slice(id.lastIndexOf("/") + 1));
    if (!FAMILIES.test(name)) continue;
    const pr = m.pricing ?? {};
    const input = perM(pr.prompt);
    const output = perM(pr.completion);
    if (input === void 0 || output === void 0) continue;
    const p = { input, output };
    const read = perM(pr.input_cache_read);
    const write = perM(pr.input_cache_write);
    const write1h = perM(pr.input_cache_write_1h);
    if (read !== void 0 && read > 0) p.cacheRead = read;
    if (write !== void 0 && write > 0) p.cacheWrite5m = write;
    if (write1h !== void 0 && write1h > 0) p.cacheWrite1h = write1h;
    if (sane(p)) out[name] = p;
  }
  return out;
}
var apart = (a, b) => Math.abs(a - b) / Math.max(a, b) > DISAGREE;
function mergeFeeds(primary, second) {
  const prices = { ...second, ...primary };
  const disagree = [];
  for (const [name, p] of Object.entries(primary)) {
    const o = second[name];
    if (!o) continue;
    if (apart(p.input, o.input) || apart(p.output, o.output)) {
      prices[name] = { ...p, verify: true };
      disagree.push(`${name}: ${p.input}/${p.output} vs ${o.input}/${o.output}`);
    }
  }
  return { prices, disagree };
}
function feedDisabled(home, env = process.env) {
  if (/^(?:off|0|false|no)$/i.test(env.NUDGE_PRICE_FEED ?? "")) return true;
  try {
    const raw = JSON.parse(fs7.readFileSync(path9.join(home, "config.json"), "utf8"));
    return raw.prices?.feed === false;
  } catch {
    return false;
  }
}
function readFeed(home) {
  try {
    const f = JSON.parse(fs7.readFileSync(feedFile(home), "utf8"));
    return f && f.v === 1 && f.prices && typeof f.prices === "object" ? f : void 0;
  } catch {
    return void 0;
  }
}
function loadPriceFeed(home, env = process.env) {
  if (feedDisabled(home, env)) return {};
  return readFeed(home)?.prices ?? {};
}
function writeFeed(home, feed2) {
  const file = feedFile(home);
  fs7.mkdirSync(path9.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs7.writeFileSync(tmp, JSON.stringify(feed2));
  fs7.renameSync(tmp, file);
}
async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}
async function refreshPriceFeed(home, opts = {}) {
  const env = opts.env ?? process.env;
  const now = opts.now ?? /* @__PURE__ */ new Date();
  if (feedDisabled(home, env)) return "off";
  const prev = readFeed(home);
  const sinceFetch = prev ? now.getTime() - Date.parse(prev.fetchedAt) : Infinity;
  const sinceTry = prev ? now.getTime() - Date.parse(prev.triedAt) : Infinity;
  if (sinceTry < FEED_RETRY_MS) return sinceFetch < FEED_MAX_AGE_MS ? "fresh" : "waiting";
  if (!opts.force && sinceFetch < FEED_MAX_AGE_MS) return "fresh";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const [lite, open] = await Promise.allSettled([getJson(LITELLM_URL, fetchImpl), getJson(OPENROUTER_URL, fetchImpl)]);
  const a = lite.status === "fulfilled" ? parseLiteLLM(lite.value) : {};
  const b = open.status === "fulfilled" ? parseOpenRouter(open.value) : {};
  const sources = [...Object.keys(a).length ? ["litellm"] : [], ...Object.keys(b).length ? ["openrouter"] : []];
  const errors = [lite, open].filter((r) => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));
  const at = now.toISOString();
  try {
    if (!sources.length) {
      writeFeed(home, { ...prev ?? { v: 1, fetchedAt: (/* @__PURE__ */ new Date(0)).toISOString(), sources: [], prices: {} }, triedAt: at, lastError: errors.join("; ") || "no prices in either list" });
      return "failed";
    }
    const { prices, disagree } = mergeFeeds(a, b);
    writeFeed(home, { v: 1, fetchedAt: at, triedAt: at, sources, prices, ...disagree.length ? { disagree } : {}, ...errors.length ? { lastError: errors.join("; ") } : {} });
    return "updated";
  } catch {
    return "failed";
  }
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
function matches(model, key) {
  if (key.endsWith("*")) return model.startsWith(key.slice(0, -1));
  if (model === key) return true;
  return model.startsWith(key) && /^-(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(model.slice(key.length));
}
function loadPriceOverrides(root) {
  try {
    const raw = JSON.parse(fs8.readFileSync(path10.join(root, "config.json"), "utf8"));
    if (!raw.prices || typeof raw.prices !== "object") return {};
    const out = {};
    for (const [key, v] of Object.entries(raw.prices)) {
      const p = v;
      if (!p || typeof p.input !== "number" || typeof p.output !== "number") continue;
      out[key.toLowerCase()] = { input: p.input, output: p.output, ...typeof p.cacheRead === "number" ? { cacheRead: p.cacheRead } : {} };
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
      const key = keys.find((k) => matches(m, k));
      return key ? table[key] : FALLBACK_PRICE;
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

// ../host/src/oversight/usage.ts
import fs9 from "node:fs";
import path11 from "node:path";

// ../host/src/oversight/commands.ts
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
function transcriptFiles(transcriptPath) {
  const files = [transcriptPath];
  const dir = path11.join(path11.dirname(transcriptPath), path11.basename(transcriptPath, ".jsonl"), "subagents");
  try {
    for (const f of fs9.readdirSync(dir).sort()) if (f.endsWith(".jsonl")) files.push(path11.join(dir, f));
  } catch {
  }
  return files;
}

// ../host/src/usage/tally.ts
var nudgeHome = (env = process.env) => env.NUDGE_HOME || path12.join(os.homedir(), ".nudge");
var claudeConfigDir = (env = process.env) => env.CLAUDE_CONFIG_DIR || path12.join(os.homedir(), ".claude");
var usageDir = (home = nudgeHome()) => path12.join(home, "usage");
var safeId = (s) => s.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "unknown";
function readJson(file) {
  try {
    return JSON.parse(fs10.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function writeJson(file, value) {
  fs10.mkdirSync(path12.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs10.writeFileSync(tmp, JSON.stringify(value));
  fs10.renameSync(tmp, file);
}
var contextOf = (t) => t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
function extraOf(t, model, prices, baseline = HANDOFF_TOKENS) {
  const over = contextOf(t) - baseline;
  if (over <= 0) return 0;
  const p = prices.priceFor(model);
  return over * (p.cacheRead ?? p.input * CACHE_READ) / 1e6;
}
var CHUNK = 8 * 1024 * 1024;
function consume(file, cursor, main2, prices, on) {
  let cur = cursor ?? { offset: 0, size: 0 };
  let fd;
  try {
    fd = fs10.openSync(file, "r");
    const size = fs10.fstatSync(fd).size;
    if (size < cur.offset) cur = { offset: 0, size: 0 };
    let pos = cur.offset;
    let carry = "";
    while (pos < size) {
      const len = Math.min(CHUNK, size - pos);
      const buf = Buffer.alloc(len);
      fs10.readSync(fd, buf, 0, len, pos);
      pos += len;
      const text = carry + buf.toString("utf8");
      const cut = text.lastIndexOf("\n");
      if (cut < 0) {
        carry = text;
        continue;
      }
      carry = text.slice(cut + 1);
      for (const line of text.slice(0, cut).split("\n")) cur = feed(line, cur, main2, prices, on);
    }
    cur = { ...cur, offset: size - Buffer.byteLength(carry, "utf8"), size };
  } catch {
  } finally {
    if (fd !== void 0) fs10.closeSync(fd);
  }
  return cur;
}
function feed(line, cur, main2, prices, on) {
  if (!line.includes('"assistant"') || !line.includes('"usage"')) return cur;
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    return cur;
  }
  const m = d.message;
  if (d.type !== "assistant" || !m || typeof m.id !== "string" || typeof m.model !== "string" || m.model === "<synthetic>") return cur;
  if (!m.usage || typeof m.usage !== "object") return cur;
  const tokens = readUsage(m.usage);
  const model = normalizeModel(m.model);
  const at = typeof d.timestamp === "string" ? d.timestamp : void 0;
  const reply = {
    id: m.id,
    model,
    tokens,
    usd: costUsd(tokens, prices.priceFor(model)),
    main: main2 && d.isSidechain !== true,
    ...at && /^\d{4}-\d{2}-\d{2}/.test(at) ? { day: at.slice(0, 10) } : {}
  };
  const prev = cur.last && cur.last.id === reply.id ? { ...cur.last } : void 0;
  on(reply, prev);
  return { ...cur, last: { id: reply.id, model, usd: reply.usd, tokens, main: reply.main, ...reply.day ? { day: reply.day } : {} } };
}
function add(t, r, sign) {
  t.replies += sign;
  t.input += sign * r.tokens.input;
  t.output += sign * r.tokens.output;
  t.cacheRead += sign * r.tokens.cacheRead;
  t.cacheWrite5m += sign * r.tokens.cacheWrite5m;
  t.cacheWrite1h += sign * r.tokens.cacheWrite1h;
  t.usd += sign * r.usd;
}
function pricesFor(home = nudgeHome(), env = process.env) {
  return createPriceTable(loadPrices(home, env));
}
var sessionFile = (session, home = nudgeHome()) => path12.join(usageDir(home), "sessions", `${safeId(session)}.json`);
function emptySession(session, transcript) {
  return { v: 1, session, transcript, files: {}, replies: 0, byModel: {}, usd: 0, context: 0, peak: 0, lastReplyUsd: 0, extraUsd: 0, updatedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
}
function updateSession(prev, session, transcript, prices, now = /* @__PURE__ */ new Date()) {
  const same = prev && prev.v === 1 && prev.transcript === transcript && (prev.prices ?? prices.stamp) === prices.stamp;
  const s = same ? structuredClone(prev) : emptySession(session, transcript);
  s.prices = prices.stamp;
  const unpriced = new Set(s.unpriced ?? []);
  for (const file of transcriptFiles(transcript)) {
    const main2 = file === transcript;
    s.files[file] = consume(file, s.files[file], main2, prices, (r, undo) => {
      if (undo) {
        add(s.byModel[undo.model] ??= { ...emptyUsage(), replies: 0, usd: 0 }, undo, -1);
        s.usd -= undo.usd;
        if (undo.main) {
          s.replies -= 1;
          s.extraUsd -= extraOf(undo.tokens, undo.model, prices);
        }
      }
      add(s.byModel[r.model] ??= { ...emptyUsage(), replies: 0, usd: 0 }, r, 1);
      s.usd += r.usd;
      if (prices.priceFor(r.model).unknown) unpriced.add(r.model);
      if (r.main) {
        s.replies += 1;
        s.extraUsd += extraOf(r.tokens, r.model, prices);
        const ctx = contextOf(r.tokens);
        if (ctx > 0) {
          s.context = ctx;
          s.peak = Math.max(s.peak, ctx);
          if (!s.first) s.first = ctx;
          s.model = r.model;
          s.lastReplyUsd = r.usd;
        }
      }
    });
  }
  if (unpriced.size) s.unpriced = [...unpriced].sort();
  else delete s.unpriced;
  s.updatedAt = now.toISOString();
  return s;
}
function refreshSession(session, transcript, home = nudgeHome(), now = /* @__PURE__ */ new Date()) {
  if (!transcript || !fs10.existsSync(transcript)) return void 0;
  const file = sessionFile(session, home);
  const next = updateSession(readJson(file), session, transcript, pricesFor(home), now);
  writeJson(file, next);
  return next;
}
var weekFile = (home = nudgeHome()) => path12.join(usageDir(home), "week.json");
var WEEK_EVERY_MS = 10 * 6e4;
var KEEP_MS = 8 * 864e5;
function jsonlFiles(dir, since, out = [], depth = 0) {
  if (depth > 4) return out;
  let entries;
  try {
    entries = fs10.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path12.join(dir, e.name);
    if (e.isDirectory()) jsonlFiles(p, since, out, depth + 1);
    else if (e.name.endsWith(".jsonl")) {
      try {
        if (fs10.statSync(p).mtimeMs >= since) out.push(p);
      } catch {
      }
    }
  }
  return out;
}
function updateWeek(prev, projectsDir, prices, now = /* @__PURE__ */ new Date()) {
  const since = now.getTime() - KEEP_MS;
  const same = prev && prev.v === 1 && (prev.prices ?? prices.stamp) === prices.stamp;
  const w = same ? structuredClone(prev) : { v: 1, files: {}, updatedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
  w.prices = prices.stamp;
  const oldest = new Date(since).toISOString().slice(0, 10);
  const live = new Set(jsonlFiles(projectsDir, since));
  for (const file of Object.keys(w.files)) if (!live.has(file)) delete w.files[file];
  for (const file of live) {
    const was = w.files[file];
    const days = { ...was?.days ?? {} };
    const cur = consume(file, was, true, prices, (r, undo) => {
      if (undo?.day) days[undo.day] = (days[undo.day] ?? 0) - undo.usd;
      if (r.day) days[r.day] = (days[r.day] ?? 0) + r.usd;
    });
    for (const d of Object.keys(days)) if (d < oldest) delete days[d];
    w.files[file] = { ...cur, days };
  }
  w.updatedAt = now.toISOString();
  return w;
}
function weekUsd(w, sinceDay) {
  if (!w || !Object.keys(w.files).length) return void 0;
  let usd2 = 0;
  for (const f of Object.values(w.files)) for (const [d, v] of Object.entries(f.days)) if (d >= sinceDay) usd2 += v;
  return usd2;
}
function refreshWeek(home = nudgeHome(), env = process.env, now = /* @__PURE__ */ new Date(), force = false) {
  const file = weekFile(home);
  const prev = readJson(file);
  const prices = pricesFor(home, env);
  const repriced = !!prev?.prices && prev.prices !== prices.stamp;
  if (!force && !repriced && prev && now.getTime() - Date.parse(prev.updatedAt) < WEEK_EVERY_MS) return prev;
  const next = updateWeek(prev, path12.join(claudeConfigDir(env), "projects"), prices, now);
  writeJson(file, next);
  return next;
}

// ../host/src/usage/plan.ts
var limitsFile = (home = nudgeHome()) => path13.join(usageDir(home), "limits.json");
function windowOf(v, now) {
  const used = typeof v?.used_percentage === "number" && Number.isFinite(v.used_percentage) ? v.used_percentage : void 0;
  const resets = typeof v?.resets_at === "number" && Number.isFinite(v.resets_at) ? v.resets_at : void 0;
  if (used === void 0 || resets === void 0 || used < 0 || resets * 1e3 <= now.getTime()) return void 0;
  return { usedPct: Math.min(100, used), resetsAt: new Date(resets * 1e3).toISOString() };
}
function planTerms(opts = {}) {
  const home = opts.home ?? nudgeHome(opts.env);
  const env = opts.env ?? process.env;
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const limits = readJson(limitsFile(home));
  const week = windowOf(limits?.seven_day, now);
  const five = windowOf(limits?.five_hour, now);
  const settingsHome = env.CLAUDE_CONFIG_DIR || os2.homedir();
  let local;
  try {
    local = readPlan({ home: settingsHome, root: home, env });
  } catch {
    local = void 0;
  }
  const extraUsage = local?.extraUsage === true;
  const name = local && local.kind === "subscription" ? local.name : void 0;
  if (week || five) return { kind: "subscription", source: "status line", ...name ? { name } : {}, ...week ? { week } : {}, ...five ? { fiveHour: five } : {}, extraUsage };
  if (local && local.kind !== "unknown") return { kind: local.kind, source: "local settings", ...name ? { name } : {}, extraUsage };
  return { kind: "unknown", source: "none", extraUsage };
}
function weekStartDay(terms, now = /* @__PURE__ */ new Date()) {
  const start = terms.week ? Date.parse(terms.week.resetsAt) - 7 * 864e5 : now.getTime() - 7 * 864e5;
  return new Date(start).toISOString().slice(0, 10);
}

// ../host/src/usage/jobs.ts
import fs12 from "node:fs";
import path15 from "node:path";

// ../host/src/delegation/api-client.ts
import fs11 from "node:fs";
import path14 from "node:path";
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
var CONFIG_FILE = "delegation-api.json";
var ADVICE_FILE = "delegation-advice.json";
function readAdvice(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const o = raw;
  if (!isKind(o.operation)) return void 0;
  if (o.why !== "cheapest-proven" && o.why !== "none-proven") return void 0;
  if (o.why === "cheapest-proven" && !API_MODELS.includes(o.model)) return void 0;
  const advised = o.why === "cheapest-proven" && CANDIDATES.includes(o.model) ? o.model : null;
  if (!Array.isArray(o.ladder)) return void 0;
  const n = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  const ladder = [];
  for (const r of o.ladder) {
    if (!r || !API_MODELS.includes(r.model)) continue;
    ladder.push({
      model: r.model,
      runs: n(r.runs),
      passes: n(r.passes),
      failures: n(r.failures),
      proven: r.proven === true,
      medianUsd: typeof r.medianUsd === "number" && Number.isFinite(r.medianUsd) ? r.medianUsd : null
    });
  }
  return { operation: o.operation, model: advised, why: advised ? "cheapest-proven" : "none-proven", ladder };
}
function readCache4(home) {
  try {
    const c = JSON.parse(fs11.readFileSync(path14.join(home, ADVICE_FILE), "utf8"));
    if (c.version !== 1 || typeof c.fetchedAt !== "string" || !Array.isArray(c.operations)) return void 0;
    return { version: 1, fetchedAt: c.fetchedAt, operations: c.operations.map(readAdvice).filter((a) => !!a) };
  } catch {
    return void 0;
  }
}
function provenOn(home, model = "haiku") {
  return (readCache4(home)?.operations ?? []).filter((a) => a.model === model).map((a) => a.operation);
}

// ../host/src/usage/remind.ts
var emptyRemindState = () => ({ turns: 0, levelsSaid: 0, offerBand: 0, off: false, extend: 0 });
var TOPIC = String.raw`(?:length|wrap(?:ping)?[ -]?up|context)`;
var WHAT = String.raw`${TOPIC}\s+(?:reminders?|warnings?)`;
var OFF = new RegExp(String.raw`\b(?:turn(?:ing)? off|switch off|stop|mute|silence|disable|no more|don'?t (?:show|need|want))\b[^.?!\n]{0,40}\b${WHAT}\b|\bno ${WHAT}\b|\b${WHAT}\s+off\b`, "i");
var ON = new RegExp(String.raw`\b(?:turn(?:ing)? on|switch on|resume|bring back|re-?enable)\b[^.?!\n]{0,40}\b${WHAT}\b|\b${WHAT}\s+(?:back\s+)?on\b`, "i");
var EXTEND = /^\W*(?:nudge[,:\s]+)?(?:please\s+)?extend(?:\s+(?:it|this|that|the session|the conversation))?(?:\s+(?:by\s+)?(?:another\s+)?\d{2,4}\s*k)?(?:\s+please)?\W*$|\bextend\b[^.?!\n]{0,20}\b(?:length|context|wrap(?:ping)?[ -]?up)\s+(?:reminders?|warnings?|limit|budget)\b/i;
var LENGTH_WORDS = new RegExp(`${ON.source}|${OFF.source}|${EXTEND.source}`, "i");
function lengthCommand(prompt) {
  if (!prompt) return void 0;
  if (ON.test(prompt)) return { kind: "on" };
  if (OFF.test(prompt)) return { kind: "off" };
  if (EXTEND.test(prompt)) {
    const k = /(\d{2,4})\s*k\b/i.exec(prompt);
    const tokens = k ? Math.min(1e6, Number(k[1]) * 1e3) : EXTEND_TOKENS;
    return { kind: "extend", tokens };
  }
  return void 0;
}
var kTokens = (n) => `${Math.round(n / 1e3)}K`;
function usd(n) {
  if (!(n > 0)) return "$0";
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n < 10) return `$${n.toFixed(1)}`;
  return `$${Math.round(n)}`;
}
var HINT = 'Say "no length reminders" to stop these.';
var LEVELS = [0.5, 0.75, 0.95];
var OFFER_BANDS = [0.2, 0.4, 0.6, 0.8];
var FRESH_TOKENS = 25e3;
var WINDOW_TOKENS = 2e5;
var LONG_WINDOW_TOKENS = 1e6;
function contextWindow(u, model) {
  if (u.peak > WINDOW_TOKENS || /\[1m\]/i.test(model ?? "")) return LONG_WINDOW_TOKENS;
  return WINDOW_TOKENS;
}
function multiple(u) {
  const base = u.first && u.first > 0 ? u.first : FRESH_TOKENS;
  return Math.max(2, Math.round(u.context / base));
}
function levelLine(level, times) {
  if (level >= 0.95) return "Nudge \xB7 this conversation is nearly full. Claude will soon compact it, and compacting can lose detail. Everything is saved, so /clear now to keep it exact.";
  if (level >= 0.75) return `Nudge \xB7 this conversation is three-quarters full: each reply uses about ${times}x the tokens of a fresh start. Everything is saved, so /clear now and I'll pick up here.`;
  return `Nudge \xB7 this conversation is half full, so each reply now uses about ${times}x the tokens of a fresh start. Everything is saved: when this piece is done, type /clear and I'll pick up where you left off.`;
}
function offerLine(proven, apiKey = false) {
  if (!proven.length) return void 0;
  const list = proven.length === 1 ? proven[0] : `${proven.slice(0, -1).join(", ")} and ${proven[proven.length - 1]}`;
  const gain = apiKey ? "cuts what they cost on your API key, since Haiku costs a fraction as much per token" : "stretches your plan";
  return `Nudge \xB7 Haiku is proven on jobs like ${list}. Handing those to Haiku helpers ${gain}. Type "delegate" to switch it on.`;
}
function remind(input) {
  const state = { ...emptyRemindState(), ...input.state ?? {} };
  state.turns += 1;
  const out = { visible: [], context: [], state };
  const cmd = lengthCommand(input.prompt);
  if (cmd) {
    if (cmd.kind === "off") {
      state.off = true;
      out.visible.push('Nudge \xB7 no more length reminders in this session. Say "length reminders on" to bring them back.');
    } else if (cmd.kind === "on") {
      state.off = false;
      out.visible.push("Nudge \xB7 length reminders are back on for this session.");
    } else {
      state.extend += cmd.tokens;
      state.off = false;
      state.levelsSaid = 0;
      out.visible.push(`Nudge \xB7 extended by ${kTokens(cmd.tokens)}: the reminders come ${kTokens(cmd.tokens)} later in this conversation.`);
    }
    out.context.push(`Nudge acted on the user's words about length reminders and told them: "${out.visible[0]}" Nothing more is needed from you for it.`);
    return out;
  }
  const u = input.usage;
  if (state.off || !u || u.context <= 0) return out;
  const window = input.window ?? contextWindow(u);
  const full = Math.max(0, u.context - state.extend) / window;
  const reached = LEVELS.filter((l) => full >= l).length;
  let line;
  if (reached > state.levelsSaid) {
    const money = input.terms.kind === "api" && u.lastReplyUsd > 0 && reached < LEVELS.length ? ` On your API key each reply now costs about ${usd(u.lastReplyUsd)}.` : "";
    line = levelLine(LEVELS[reached - 1], multiple(u)) + money + (state.levelsSaid === 0 && reached < LEVELS.length ? " " + HINT : "");
    state.levelsSaid = reached;
  }
  if (line) {
    out.visible.push(line);
    out.context.push(`Nudge told the user: "${line}" Don't repeat it. Carry on with what they asked; if they choose to clear, make sure this session's record says where the work got to.`);
    return out;
  }
  const band = OFFER_BANDS.filter((b) => full >= b).length;
  if (!input.delegating && band > state.offerBand) {
    state.offerBand = band;
    const offer = offerLine(input.proven ?? [], input.terms.kind === "api");
    if (offer) {
      out.visible.push(offer);
      out.context.push(`Nudge told the user: "${offer}" Don't repeat it. If they type "delegate", Nudge switches it on itself.`);
    }
  }
  return out;
}

// ../host/src/usage/jobs.ts
var remindFile = (session, home) => sessionFile(session, home).replace(/\.json$/, ".remind.json");
async function runUsageJob(session, transcript, home = nudgeHome(), env = process.env, now = /* @__PURE__ */ new Date(), fetchImpl) {
  const unpriced = readJson(sessionFile(session, home))?.unpriced?.length;
  await refreshPriceFeed(home, { env, now, ...unpriced ? { force: true } : {}, ...fetchImpl ? { fetchImpl } : {} });
  refreshSession(session, transcript, home, now);
  refreshWeek(home, env, now);
}
var OFFER_WORDS = {
  "locate-definition": "finding code",
  "rename-in-one-file": "renames",
  "answer-code-question": "code questions",
  "test-named-branches": "writing tests",
  "implement-from-spec": "building from a spec",
  "change-one-function": "changing one function",
  "explain-named-code": "explaining code",
  "copy-existing-pattern": "copying a pattern",
  "fix-compiler-listed": "fixing listed compiler errors"
};
function settingsModel(env) {
  const m = readJson(path15.join(claudeConfigDir(env), "settings.json"))?.model;
  return typeof m === "string" ? m : env.ANTHROPIC_MODEL ?? void 0;
}
function delegating(home, repo) {
  if (repo && fs12.existsSync(path15.join(repo, ".nudge", "handover-advise"))) return true;
  const h = readJson(path15.join(home, CONFIG_FILE))?.handover;
  return h?.mode === "advise" || typeof h?.weeklyPct === "number";
}
function runRemindJob(session, input, home = nudgeHome(), env = process.env, now = /* @__PURE__ */ new Date()) {
  const usage = input.transcript ? refreshSession(session, input.transcript, home, now) : void 0;
  const terms = planTerms({ home, env, now });
  const week = weekUsd(readJson(weekFile(home)), weekStartDay(terms, now));
  const file = remindFile(session, home);
  const state = readJson(file) ?? emptyRemindState();
  const proven = provenOn(home, "haiku").map((k) => OFFER_WORDS[k]).filter((w) => !!w);
  const out = remind({
    usage,
    state,
    terms,
    ...week !== void 0 ? { weekUsd: week } : {},
    ...input.prompt ? { prompt: input.prompt } : {},
    ...usage ? { window: contextWindow(usage, settingsModel(env)) } : {},
    delegating: delegating(home, input.repo),
    proven
  });
  writeJson(file, out.state);
  return { visible: out.visible, context: out.context };
}

// ../host/src/memory/core/main.ts
var START_DEADLINE_MS = 12e3;
var ROUTE_DEADLINE_MS = 6e3;
function within(ms, work, fallback) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => data += c);
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}
function endedSessions(home = process.env.NUDGE_HOME || path16.join(os3.homedir(), ".nudge")) {
  try {
    return new Set(
      fs13.readdirSync(path16.join(home, "turns")).filter((n) => n.endsWith(".ended")).map((n) => n.replace(/[^A-Za-z0-9]/g, "").slice(0, 8))
    );
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
async function runCore(job, repo, session, message = "", now = /* @__PURE__ */ new Date(), ended = endedSessions()) {
  const out = { visible: [], context: [] };
  if (job === "start") {
    const records = readProject(repo);
    const [late] = await within(
      START_DEADLINE_MS,
      Promise.all([
        relinkAndRecord(records, repo, session, now).then((r) => r.links),
        nameAndRecord(records, repo, session, now).then(() => void 0)
      ]),
      [[], void 0]
    );
    const screen = startScreen(readProject(repo), now, session, late, ended);
    out.visible.push(screen);
    out.context.push(`Nudge memory, what is in play in this repo (shown to the user):
${screen}`);
  } else if (job === "route") {
    const records = readProject(repo);
    if (!buildGraph(records).topics.length || !message.trim()) return out;
    const view = await within(ROUTE_DEADLINE_MS, topicViewJev(records, message, now, session, {}, ended), "");
    if (!view || view === "New topic.") return out;
    out.visible.push(`Related: ${view.split("\n")[0].replace(/\.$/, "")}`);
    out.context.push(`Nudge memory, the earlier work this request belongs to:
${view}`);
  } else if (job === "why") {
    if (!message.trim()) return out;
    const found = await within(ROUTE_DEADLINE_MS, whyView(readProject(repo), message, repo), { visible: [], context: [] });
    out.visible.push(...found.visible);
    out.context.push(...found.context);
  } else if (job === "remind") {
    let input = {};
    try {
      input = JSON.parse(message || "{}");
    } catch {
      return out;
    }
    const said = runRemindJob(session, {
      ...typeof input.prompt === "string" ? { prompt: input.prompt } : {},
      ...typeof input.transcript === "string" ? { transcript: input.transcript } : {},
      ...repo ? { repo } : {}
    });
    out.visible.push(...said.visible);
    out.context.push(...said.context);
  } else if (job === "usage") {
    if (message) await runUsageJob(session, message);
  } else if (job === "link") {
    const records = readProject(repo);
    const me = session.slice(0, 8);
    const ids = [...buildGraph(records).pieces.values()].filter((p) => p.session === me).map((p) => p.id);
    if (ids.length) await linkAndRecord(records, ids, repo, session, now);
  }
  return out;
}
async function main() {
  const [job, repo, session, arg] = process.argv.slice(2);
  if (!job || !repo || !session) return;
  const message = job === "route" || job === "why" || job === "remind" ? await readStdin() : job === "usage" ? arg ?? "" : "";
  try {
    const out = await runCore(job, repo, session, message);
    process.stdout.write(JSON.stringify(out) + "\n", () => process.exit(0));
  } catch {
    process.exit(0);
  }
}
var invoked = process.argv[1] ?? "";
if (/memory-core\.m?js$|main\.ts$/.test(invoked)) void main();
export {
  endedSessions,
  runCore
};
