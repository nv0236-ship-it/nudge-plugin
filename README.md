# Nudge

Nudge sits beside Claude Code, makes Claude write the test first and hand the coding to a cheaper model, checks
every result itself, and keeps a record of what happened.

For each code change, Claude writes a test that fails, then hands the coding to a Haiku helper on your own Claude
plan. When the helper stops, **Nudge runs the test itself**: a pass goes back to Claude; a fail sends the helper
back once with the output; a second fail comes back as CHECK FAILED and Claude does the job itself. You never get
work that did not pass its test, and the bigger model's time goes to understanding and deciding, not typing.

`/nudge:metrics` shows what happened: jobs handed over, passed first time, sent back, taken back by Claude, and
the estimated saving. Hand-over starts after one yes, in the first session; `delegate off` stops it, `delegate auto` waits
until your week is 70% used, and `delegate workers` also uses cheaper models from other companies through your
own AI gateway key.

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

The next time you type, Nudge asks once whether to turn hand-over on.

## What you need

**Node.js 22 or newer** (`node --version`): Claude Code can be installed without Node, but every Nudge hook
runs on it, so install Node first. Nothing else: no account, no sign-up, no background service, no GitHub
account. Updates arrive by themselves when Claude Code starts.

## What it does to your files

Nothing in your projects. Nudge keeps its own records of hand-overs and checks in `~/.nudge`; its instructions
to Claude come with each session start, so nothing is written into your `CLAUDE.md`. Claude, not Nudge, edits
your code; Nudge only runs the test the job names.

## For companies

Everything Nudge runs, reads, writes and sends, and the settings an administrator can set for every developer
through Claude Code's managed settings, are on one page: [SECURITY.md](SECURITY.md). On an API key the
reminders say what a reply costs, and `delegate` turns on Haiku helpers at a fraction of the price per token.

## What leaves your machine

No code, no file names, no prompts. Two public model price lists are downloaded about once a day
(`NUDGE_PRICE_FEED=off` stops it). The model advice comes from Nudge's public advice service: it is told only
the kind of job, a label such as `locate-definition`, and answers which model is proven on it
(`NUDGE_PUBLIC_API=off` stops it, and the advice then comes from the rules inside the plugin).

Sharing is off unless you say yes when asked: then, once a week, a summary of your hand-overs (kinds of job,
sizes, pass and fail counts, the type of failure, your project's language and framework) under a random machine
ID, never code, file or project names, prompts or messages. In return: improved rules first, a comparison with
similar projects in `/nudge:metrics`, and early warnings. `nudge sharing preview` shows exactly what would be
sent, `nudge sharing off` stops it. Details in [PRIVACY.md](PRIVACY.md).

Handing work to models from other companies (through your own Vercel AI Gateway key) is off unless you turn it
on in a project with `delegate workers`; that sends the job's files to that model, and costs a few cents a job
on your key.

## Turning it off

If you used `delegate auto`, type `delegate off` first: it puts your status line back as it was. Then
`/plugin uninstall nudge`.

## Licence and disclaimer

MIT: see `LICENSE`. Nudge is provided as is, without warranty. It changes how Claude splits and checks work; you
and Claude remain responsible for the code that is kept. Savings figures are estimates.
