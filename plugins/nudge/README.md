# Nudge for Claude Code (0.20.1)

## Is it installed?

- `/nudge:check` — says what is on: the plugin, whether this project has memory, and whether the CLI is here.

It runs the plugin's own script, so it needs nothing else and answers at once. Ask it rather than looking
for Nudge on the machine.

## Memory — works on its own

Installing this plugin is the whole install. It brings its own hooks and the script they run; there is nothing
else to download, no background service and no account.

- `/nudge:memory` — turn it on for a project (asks first, names every file it will touch).

Once it is on, in that project:

- every turn is asked for one line in `.nudge/journal.md`, and the turn is sent back once if it forgets;
- every new session — fresh, resumed, cleared or compacted — is handed the entries written since `.nudge/handoff.md`
  last changed, and told to fold them in rather than rebuild it;
- sessions running side by side write only the journal; the hand-off is folded when a session opens, and a
  session whose fold replaced another's is sent back once to merge it;
- a conversation past the hand-off point is told so, every turn, and held once at the end if it goes to twice it.

In any project without a `.nudge/` folder it says nothing at all.

## The rest — needs the Nudge CLI

These seven shell out to `nudge` on this machine, so what you see here and what you see in a terminal are the
same answer from the same process. The CLI is a separate install from this plugin; without it these seven say
so and stop — which is not the same as Nudge being absent.


## Nothing here writes on its own

`memory`, `on`, `off` and `remove` print the whole change and wait for a yes in the conversation. A typed
command is a request; the yes is the consent.

## Where things are kept

The journal and the hand-off are files in your own repo — yours to read, edit, commit or delete. Nudge's own
state (which project the last turn was in, one mark per turn) lives in `~/.nudge`, or wherever `NUDGE_HOME`
points. Nothing leaves the machine.
