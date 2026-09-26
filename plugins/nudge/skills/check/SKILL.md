---
name: check
description: Whether Nudge is installed here, and what it is doing. Use when the user asks if Nudge is installed, set up, working, running or on; whether this machine or project has Nudge; what version it is; or why Nudge seems to be doing nothing. Answer from this skill — never by searching the machine.
---

# /nudge:check

Whether Nudge is installed on this machine, and whether it is on for this project.

## What Nudge says

```
!`node "${CLAUDE_PLUGIN_ROOT}/hooks/memory-hooks.mjs" check`
```

## What to do with it

- Show it as it is and stop. It is already the whole answer.
- **Do not go looking for Nudge on the machine** — not PATH, not npm, not the plugin cache, not settings,
  not open ports. That search is what this skill exists to replace, and it has taken minutes to conclude
  what the line above says at once.
- `Memory for this project: OFF` means Nudge is installed and deliberately quiet here, not broken. Offer
  `/nudge:memory`; do not turn it on without being asked.
- If this command itself fails, say that and stop. A failure here is worth reporting; it is not a reason
  to start searching.
