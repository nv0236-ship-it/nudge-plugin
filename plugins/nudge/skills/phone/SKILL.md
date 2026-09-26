---
name: phone
description: Turn off, or back on, Nudge keeping this project ready in the Claude app on the phone (a Remote Control listener). Use when the user says turn off remote sessions, turn off phone sessions, stop the remote control listener, or asks how to start a fresh session from the phone.
---

# /nudge:phone

Nudge keeps one Claude Code Remote Control listener running for each project with memory on, so the project
shows in the Claude app and at claude.ai/code and a fresh session there is one tap — no terminal on the computer.
It is started by the session-start hook, and started again at the next session start after a reboot.

## The script

```
!`echo "${CLAUDE_PLUGIN_ROOT}/hooks/memory-hooks.mjs"`
```

That is the path of Nudge's bundled script. Run it with `node "<that path>" switch remote <on|off> <here|machine>`,
from the project's folder, and show the one line it prints.

## What the user meant

- *turn off phone sessions here / not in this project* → `switch remote off here`.
- *turn off phone sessions everywhere / on this machine* → `switch remote off machine`.
- *turn phone sessions back on / on here* → `switch remote on here` (or `on machine`).
- *is it on?* → run nothing; `/nudge:check` answers that.

## What to say

- Off deletes nothing: it writes one marker file, `.nudge/off-remote` in the project or `~/.nudge/off-remote` for the machine.
  Say that, so nobody thinks their record is gone.
- A request to switch is the consent; do it, then report. Never switch the other way from what was asked.
- Turning it off stops the running listener at once. Turning it on starts it at once.
- For the link to a fresh session in this project, `/nudge:check` prints it.
