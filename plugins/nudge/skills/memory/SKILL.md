---
name: memory
description: Turn Nudge's memory (the journal and the hand-off) off or back on, for this project or this machine. Use when the user says turn off memory here, turn memory back on, turn on memory here, stop the journal in this project, or asks why Nudge is saying nothing in a project.
---

# /nudge:memory

Memory is two files in the project — `.nudge/journal.md`, an append-only record of each turn, and `.nudge/handoff.md`,
one page a fresh session reads instead of reconstructing the last one. Once the machine has said yes to Nudge,
the first session in any git project creates them by itself; the rules come with every session start and
nothing is written into CLAUDE.md.

## The script

```
!`echo "${CLAUDE_PLUGIN_ROOT}/hooks/memory-hooks.mjs"`
```

That is the path of Nudge's bundled script. Run it with `node "<that path>" switch memory <on|off> <here|machine>`,
from the project's folder, and show the one line it prints.

## What the user meant

- *turn off memory here / not in this project* → `switch memory off here`.
- *turn off memory everywhere / on this machine* → `switch memory off machine`.
- *turn memory back on / on here* → `switch memory on here` (or `on machine`).
- *is it on?* → run nothing; `/nudge:check` answers that.

## What to say

- Off deletes nothing: it writes one marker file, `.nudge/off-memory` in the project or `~/.nudge/off-memory` for the machine.
  Say that, so nobody thinks their record is gone.
- A request to switch is the consent; do it, then report. Never switch the other way from what was asked.
- Turning memory off in a project whose CLAUDE.md or AGENTS.md still carries an older Nudge memory block (between
  `<!-- nudge:memory:start ·…` markers): the script says so. Offer to remove that block; do not remove it unasked.
- If the user never said yes for this machine, `switch memory on here` is their yes for this one project.
