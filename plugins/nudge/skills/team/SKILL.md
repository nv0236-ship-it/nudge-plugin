---
name: team
description: See your team's Nudge figures by project and machine, make a team, join one with a code, or leave. Use when the user says nudge team, team create, join team, team code, wants to see their team's or their projects' hand-overs, or asks how teammates share figures.
---

# /nudge:team

Run, with the words that match what the user said:

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/delegation.mjs" team [create | join <code> | leave]
```

- *show my team / how are my projects doing / nudge team* → no word: the team's projects and machines this week.
- *make a team / team create* → `create`: prints the code and the lines teammates add.
- *join team t_… / nudge team join t_…* → `join` and the code exactly as the user gave it.
- *leave the team* → `leave`.
- Show the lines it prints as they are and stop. A machine in a team sends its project folder names with its summary.
