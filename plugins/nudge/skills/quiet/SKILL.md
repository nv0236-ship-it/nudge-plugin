---
name: quiet
description: Turn Nudge down: stop its reminders for this session, stop its daily line, or stop it updating itself. Use when the user says nudge quiet, asks Nudge to stop reminding, stop asking for the journal, stop interrupting, be quiet, pipe down, stop showing its daily message, or to stop or start Nudge updating itself — and when they ask any of it back.
---

# /nudge:quiet

Turns Nudge's reminders down. It does **not** turn memory off: the journal and the hand-off keep working,
Nudge just stops asking every turn.

## The script

```
!`echo "${CLAUDE_PLUGIN_ROOT}/hooks/memory-hooks.mjs"`
```

That is the path of Nudge's bundled script. Pick the one command below that matches what the user meant and
run `node "<that path>" <command>`. Nothing has run yet: Claude Code runs a bang line as soon as the skill
loads, so none of these is one.

## What the user meant

- *quiet / stop reminding me / stop asking for the journal* → `quiet`, for this session.
- *reminders back on* → `quiet off`.
- *stop showing me that daily message* → `notices off`. *show it again* → `notices on`.
- *stop updating itself / I'll update it myself* → `updates off`. *update itself again* → `updates on`.
  Updates are on when Nudge is installed, because a version nobody pulls is a version nobody has. Turning
  them off is remembered for good — Nudge never turns them back on by itself.
- *turn memory off altogether* → this is the wrong skill. Say what `/nudge:memory` does and let them choose;
  never switch a module off because someone asked for quiet.

## What to do with it

- Show the line it prints and stop.
- Say plainly that the record is still being kept, so nobody thinks they have lost their journal.
- Quiet lasts this session only, on purpose: a quiet that outlives the irritation is how a record
  quietly stops existing.
