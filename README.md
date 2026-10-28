# Nudge

Your coding agent forgets everything between sessions, and you pay to tell it again. Nudge keeps notes as it
works, opens the next session on what is in play instead of a blank slate, brings back related earlier work
when you ask for something, and tells you when a conversation has grown long enough that each reply costs
several times a fresh start's tokens. That is **continuity**.

It also places work on the right model. Before Claude starts a helper, Nudge names the cheapest model that
has proven itself on that kind of job, so routine work runs on a smaller model on your own Claude plan instead
of the one you are talking to. That is **delegation**. Type `delegate` to have Nudge hand suitable jobs to Haiku
helpers, `delegate auto` to do it once your week is 70% used, or `delegate workers` to also use cheaper models
from other companies through your own AI gateway key.

## What "proven" means

A model is proven on a kind of job once it has passed at least five in a row with none failed since, graded by
rule (the job's own tests, or an answer checked against the code), never by another model. Today Haiku is
proven on finding code, renames, code questions, writing tests for named cases and building from a spec,
from about 500 graded jobs replayed on the real code and commits of two TypeScript projects. It is early: the advice is
only as wide as those jobs, and it changes as more are graded.

## Install

In Claude Code, two lines:

```
/plugin marketplace add https://github.com/nv0236-ship-it/nudge-plugin.git
/plugin install nudge@nudge
```

The next time you type, Nudge introduces itself and asks once whether it may switch on in your projects.

## What you need

**Node.js 22 or newer** (`node --version`): Claude Code can be installed without Node, but every Nudge hook
runs on it, so install Node first. Nothing else: no account, no sign-up, no background service, no GitHub
account. Updates arrive by themselves when Claude Code starts.

## What it does to your files

One folder in each git project it is on in: `.nudge/log/`, one notes file per session. It is kept out of git
(the project's own `.git/info/exclude`, so no tracked file changes); say "share notes" to commit the notes
with your code. Its working rules come with each session start, so nothing is written into your `CLAUDE.md`.

Phone sessions, which keep each project ready in the Claude app, are off until you say "turn on phone
sessions"; they need Claude Code signed in with a claude.ai account.

## For companies

Everything Nudge runs, reads, writes and sends, and the settings an administrator can set for every developer
through Claude Code's managed settings, are on one page: [SECURITY.md](SECURITY.md). On an API key the
reminders say what a reply costs, and `delegate` turns on Haiku helpers at a fraction of the price per token.

## What leaves your machine

No code, no file names, no notes. Two public model price lists are downloaded about once a day
(`NUDGE_PRICE_FEED=off` stops it). The model advice comes from Nudge's public advice service: it is told only
the kind of job, a label such as `locate-definition`, and answers which model is proven on it
(`NUDGE_PUBLIC_API=off` stops it, and the advice then comes from the rules inside the plugin).

Handing work to models from other companies (through your own Vercel AI Gateway key) is off unless you turn it
on in a project with `delegate workers`; that sends the job's files to that model, and costs a few cents a job
on your key. Nothing about how your helpers did is sent anywhere.

## Turning it off

If you used `delegate auto`, type `delegate off` first: it puts your status line back as it was. Then
`/plugin uninstall nudge`. Your notes stay where they are — they are your record, not Nudge's.

## Licence

MIT: see `LICENSE`.
