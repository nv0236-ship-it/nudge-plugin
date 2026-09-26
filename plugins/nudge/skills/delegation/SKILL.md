---
name: delegation
description: Turn Nudge's delegation module off or back on, for this project or this machine. Use when the user asks to stop, disable, switch off, enable or switch on delegation, or asks what handing work to helper agents has cost.
---

# /nudge:delegation

Delegation reads the transcripts Claude Code already keeps, works out what was handed to helper agents and what
it cost, and says so in one sentence at a session start. It is on by default once the machine has said yes to
Nudge. Nothing new is recorded and nothing leaves the machine; the figures count every project on this machine.

## The script

```
!`echo "${CLAUDE_PLUGIN_ROOT}/hooks/memory-hooks.mjs"`
```

That is the path of Nudge's bundled script. Run it with `node "<that path>" switch delegation <on|off> <here|machine>`,
from the project's folder, and show the one line it prints.

## What the user meant

- *turn off delegation here / not in this project* → `switch delegation off here`.
- *turn off delegation everywhere / on this machine* → `switch delegation off machine`.
- *turn delegation back on / on here* → `switch delegation on here` (or `on machine`).
- *is it on?* → run nothing; `/nudge:check` answers that.

## What to say

- Off deletes nothing: it writes one marker file, `.nudge/off-delegation` in the project or `~/.nudge/off-delegation` for the machine.
  Say that, so nobody thinks their record is gone.
- A request to switch is the consent; do it, then report. Never switch the other way from what was asked.
