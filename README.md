# Nudge

Your coding agent forgets everything between sessions, and you pay to tell it again. Nudge keeps a journal
as it works and a one-page hand-off it keeps current, hands the next session that page instead of a blank
slate, and says so when a conversation has run long enough that it should be handed over.

## Install

In Claude Code, two lines:

```
/plugin marketplace add git@github.com:nv0236-ship-it/nudge-plugin.git
/plugin install nudge@nudge
```

Then, in a project you want it to remember:

```
/nudge:memory
```

It says what it will write and waits for a yes.

## What you need

Claude Code, and Node.js 22 or newer (`node --version`). Nothing else: no account, no sign-up, no background
service, no phone. A private repo is fine — Claude Code uses the git credentials already on your machine, so
use the SSH address if the repo is private, which keeps the automatic update check working.

## What it does to your files

Two files in the project you switch it on in (`.nudge/journal.md`, `.nudge/handoff.md`), and one marked block
at the end of that project's `CLAUDE.md`. Nothing else, nowhere else, and nothing leaves your machine.

## Turning it off

`/plugin uninstall nudge`. Your journal and hand-off stay where they are — they are your record,
not Nudge's.
