# Security

## What runs

Nudge is a Claude Code plugin: plain JavaScript run by Node.js on the developer's machine, at Claude Code's
hook events (session start, each prompt, the end of a turn, before a helper agent starts), plus one local MCP
server that answers Claude's delegation questions over stdio. No service is installed and no port is opened.
Phone sessions, off unless asked for, run Claude Code's own `claude remote-control`.

## What it reads and writes

- Writes: `.nudge/log/` in each project it is on in (kept out of git by default, through the project's
  local `.git/info/exclude`), and its own state in `~/.nudge` (or `NUDGE_HOME`).
- Reads: Claude Code's session transcripts on the machine, to keep the notes and count tokens; nothing is
  sent from them.
- Never writes `CLAUDE.md`, never edits code itself, never pushes, and never reads or sends credentials.
- `delegate auto` adds a status line to Claude Code's settings (backing up the old one); `delegate off`
  puts it back.

## Every network call

| Call | What is sent | Turn it off |
|---|---|---|
| Public price lists (LiteLLM, OpenRouter), about daily | nothing but the request | `NUDGE_PRICE_FEED=off` |
| Nudge's public advice service, when Claude plans a helper | the kind of job, such as `locate-definition` | `NUDGE_PUBLIC_API=off` (the bundled rules answer) |
| GitHub, about hourly, for a new version | nothing but the request | `NUDGE_UPDATES=off` |
| Outside models, only after `delegate workers` in a project | the job's brief and files, to that model through the user's own AI gateway key | `NUDGE_WORKERS=off` |
| Organising notes with a decision model, only with `NUDGE_JEV_KEY` set or `NUDGE_NOTES_AI=on` | short lines from the project's notes, to rank and link them | `NUDGE_NOTES_AI=off` |

No code, file names, notes, prompts or results go to Nudge. There is no telemetry and no account.

On Amazon Bedrock, Google Vertex or Microsoft Foundry, Haiku helpers need Haiku enabled for the cloud
account; where it is not, leave delegation off and the helpers stay on your own model.

## For administrators

Set these in Claude Code's managed settings (`env`) to decide for every developer:

| Variable | Effect |
|---|---|
| `NUDGE_CONSENT=yes` or `no` | answers Nudge's one question for everyone |
| `NUDGE_DELEGATE=on` | Claude hands proven jobs to Haiku helpers |
| `NUDGE_GUARD=on` or `off` | blocks, or never blocks, helpers that skip the plan or the proven model |
| `NUDGE_WORKERS=off` | every job stays on Claude; no outside model is ever used |
| `NUDGE_PHONE=off` | no phone sessions |
| `NUDGE_UPDATES=off` | no self-update; install reviewed versions with `claude plugin update nudge` |
| `NUDGE_NOTES_AI=off` | notes are never sent to a model to be organised |
| `NUDGE_PUBLIC_API=off`, `NUDGE_PRICE_FEED=off` | no calls beyond the machine for advice or prices |

Each release is a tagged commit in this repository, so a reviewed version can be pinned and mirrored.

## Reporting a problem

Please report a vulnerability privately through this repository's Security tab ("Report a vulnerability"),
not in a public issue.
