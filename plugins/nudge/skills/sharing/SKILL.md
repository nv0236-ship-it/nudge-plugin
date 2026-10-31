---
name: sharing
description: Turn Nudge's weekly sharing of hand-over summaries on or off, or preview exactly what would be sent. Use when the user says nudge sharing on, nudge sharing off, nudge sharing preview, asks what Nudge shares or sends, or answers Nudge's sharing question.
---

# /nudge:sharing

Sharing is off unless the user says yes. Run, with the word that matches what the user said:

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/delegation.mjs" sharing <on|off|preview>
```

- *yes / share / nudge sharing on* → `on`. *no / stop sharing / nudge sharing off* → `off`.
- *what would you send / nudge sharing preview* → `preview`: it shows the summary and sends nothing.
- Never run `on` unless the user said yes in their own words. Show the line it prints and stop.
