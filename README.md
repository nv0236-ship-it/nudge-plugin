# Nudge

Your coding agent forgets everything between sessions, and you pay to tell it again. Nudge keeps notes as it
works, opens the next session on what is in play instead of a blank slate, brings back related earlier work
when you ask for something, and says so when a conversation has run long enough to cost more than it should.

## Install

In Claude Code, two lines:

```
/plugin marketplace add https://github.com/nv0236-ship-it/nudge-plugin.git
/plugin install nudge@nudge
```

The next time you type, Nudge introduces itself and asks once whether it may switch on in your projects.

## What you need

Claude Code, and Node.js 22 or newer (`node --version`). Nothing else: no account, no sign-up, no background
service, no phone, no GitHub account. Updates arrive by themselves when Claude Code starts.

## What it does to your files

One folder in each git project it is on in: `.nudge/log/`, one notes file per session. Its working rules come
with each session start, so nothing is written into your `CLAUDE.md`. Nothing about you or your work leaves
your machine; the only download is two public model price lists, about once a day (`NUDGE_PRICE_FEED=off`
stops it).

## Turning it off

`/plugin uninstall nudge`. Your notes stay where they are — they are your record,
not Nudge's.
