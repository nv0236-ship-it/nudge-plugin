---
name: sharing
description: Turn Nudge's sharing of hand-over summaries off or back on, change how often it sends, or preview exactly what is sent. Use when the user says nudge sharing on, nudge sharing off, nudge sharing every 2h, nudge sharing preview, or asks what Nudge shares or sends.
---

# /nudge:sharing

Sharing is on unless the user turned it off; it sends every 30 minutes unless changed. Run, with the words that match what the user said:

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/delegation.mjs" sharing <on|off|preview|every 2h>
```

- *yes / share / nudge sharing on* → `on`. *no / stop sharing / nudge sharing off* → `off`.
- *what would you send / nudge sharing preview* → `preview`: it shows the summary and sends nothing.
- *send less often / every two hours* → `every 2h` (from 15 minutes to a week).
- Never run `on` unless the user said yes in their own words. Show the line it prints and stop.
