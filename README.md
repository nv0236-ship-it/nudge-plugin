# Nudge

Your coding agent forgets everything between sessions, and you pay to tell it again. Nudge keeps notes as it
works, opens the next session on what is in play instead of a blank slate, brings back related earlier work
when you ask for something, and says so when a conversation has run long enough to cost more than it should.

It also watches what helper agents cost you. Before Claude starts a helper, Nudge names the cheapest model that
has proven itself on that kind of job, so routine reading, searching and test-first changes run on a smaller
model on your own Claude plan instead of the one you are talking to.

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
with each session start, so nothing is written into your `CLAUDE.md`.

## What leaves your machine

No code, no file names, no notes. Two public model price lists are downloaded about once a day
(`NUDGE_PRICE_FEED=off` stops it). The model advice comes from Nudge's public advice service: it is told only
the kind of job, a label such as `locate-definition`, and answers which model is proven on it
(`NUDGE_PUBLIC_API=off` stops it, and the advice then comes from the rules inside the plugin).

Handing work to models from other companies (through your own Vercel AI Gateway key) is off unless you turn it
on in a project; that sends the job's files to that model, and costs a few cents a job on your key.

## Turning it off

`/plugin uninstall nudge`. Your notes stay where they are — they are your record,
not Nudge's.

## Licence

MIT: see `LICENSE`.
