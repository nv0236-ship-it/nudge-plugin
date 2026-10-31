# Nudge for Claude Code (0.46.0)

## Is it installed?

- `/nudge:check` — says what is on: the plugin, hand-over, sharing, and whether the CLI is here.

It runs the plugin's own script, so it needs nothing else and answers at once. Ask it rather than looking
for Nudge on the machine.

## The checked hand-over — on after one yes

Installing this plugin is the whole install. It brings its own hooks and the script they run; there is nothing
else to download, no background service and no account.

Nudge asks once per machine whether to turn hand-over on. After a yes, in every git project, Claude writes a
failing test first and hands the coding to a Haiku helper; when the helper stops, Nudge runs that test itself,
sends the helper back once on a fail, and on a second fail tells Claude to take the job back.
- `/nudge:metrics` — what was handed over, passed, sent back and taken back, and the estimated saving.
- `/nudge:sharing` — the weekly summary: off unless you said yes; `preview` shows it, `off` stops it.

## Continuity — for projects that already have it

Continuity is held back for new users. Where an earlier yes turned it on, it carries on, and in that project:

- every session writes its own notes in `.nudge/log/`: what was asked, done and decided, plus side ideas,
  one line each, so sessions running side by side never write the same file;
- a new session opens on what is in play, and your first request brings back the related earlier work;
- an idea from days ago is connected to new work when a session starts, and "why did we…?" is answered
  from the recorded path;
- at about half, three-quarters and nearly full of the conversation, it says so once each: how many times a
  fresh start's tokens each reply now uses, that everything is saved, and that /clear picks up where you were;
  nearly full, that compacting can lose detail. Say "extend" or "no length reminders" to change that.

Projects that already keep `.nudge/journal.md` and `.nudge/handoff.md` carry on with them.

## Delegation — advice on by itself, the rest when you say

Before Claude starts a helper agent, Nudge names the cheapest model proven on that kind of job, from its
public advice service; where none is proven it names none and the helper stays on your model. Type one of
these as your whole message:

- `delegate` — Nudge tells Claude to hand suitable jobs to Haiku helpers on your plan, from now.
- `delegate auto` — the same, once your weekly limit passes 70% (a number after it changes that).
- `delegate off` — stops hand-over: advice only.
- `delegate strict` — the guard: a helper started with no plan, or on a dearer model than the proven one
  without a stated reason, is blocked. Off by default; `delegate strict off` undoes it.
- `delegate workers` — in this project, Nudge may hand a job to a cheaper model from another company through
  your own AI gateway key (`AI_GATEWAY_API_KEY`, from https://vercel.com/ai-gateway), billed by the gateway,
  and checks its work before you get it. `delegate workers off` undoes it.
- `delegate status` — what is on.

## The rest — needs the Nudge CLI

These seven shell out to `nudge` on this machine, so what you see here and what you see in a terminal are the
same answer from the same process. The CLI is a separate install from this plugin; without it these seven say
so and stop — which is not the same as Nudge being absent.


## Nothing here writes on its own

`continuity`, `on`, `off` and `remove` print the whole change and wait for a yes in the conversation. A typed
command is a request; the yes is the consent.

## Where things are kept

Nudge's own records (hand-overs, checks, usage tallies) live in `~/.nudge`, or wherever `NUDGE_HOME` points;
continuity's notes are files in your own repo. No code, file names or prompts leave the machine; the weekly
summary goes only after a yes to sharing (PRIVACY.md). About once a day Nudge downloads two public model price
lists (LiteLLM and OpenRouter) so its cost figures stay current; `NUDGE_PRICE_FEED=off` stops that.
