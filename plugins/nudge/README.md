# Nudge for Claude Code (0.24.0)

## Is it installed?

- `/nudge:check` — says what is on: the plugin, whether this project has memory, and whether the CLI is here.

It runs the plugin's own script, so it needs nothing else and answers at once. Ask it rather than looking
for Nudge on the machine.

## Memory — works on its own

Installing this plugin is the whole install. It brings its own hooks and the script they run; there is nothing
else to download, no background service and no account.

Nudge asks once per machine. After a yes, memory switches on by itself in every git project.
- `/nudge:memory` — turn it off or back on, for one project or the whole machine.

Once it is on, in that project:

- every session writes its own notes in `.nudge/log/`: what was asked, done and decided, plus side ideas,
  one line each, so sessions running side by side never write the same file;
- a new session opens on what is in play, and your first request brings back the related earlier work;
- an idea from days ago is connected to new work when a session starts, and "why did we…?" is answered
  from the recorded path;
- past 150K tokens it suggests wrapping up, at most twice; past 300K it says what the extra length is costing,
  in your plan's terms. Say "extend" or "no length reminders" to change that.

Projects that already keep `.nudge/journal.md` and `.nudge/handoff.md` carry on with them.

## The rest — needs the Nudge CLI

These seven shell out to `nudge` on this machine, so what you see here and what you see in a terminal are the
same answer from the same process. The CLI is a separate install from this plugin; without it these seven say
so and stop — which is not the same as Nudge being absent.


## Nothing here writes on its own

`memory`, `on`, `off` and `remove` print the whole change and wait for a yes in the conversation. A typed
command is a request; the yes is the consent.

## Where things are kept

The notes are files in your own repo — yours to read, edit, commit or delete. Nudge's own state (usage
tallies, one mark per turn) lives in `~/.nudge`, or wherever `NUDGE_HOME` points. Nothing about you or your
work leaves the machine. About once a day Nudge downloads two public model price lists (LiteLLM and
OpenRouter) so its cost figures stay current; `NUDGE_PRICE_FEED=off` stops that.
