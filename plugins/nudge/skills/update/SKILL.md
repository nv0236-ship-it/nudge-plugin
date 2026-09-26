---
name: update
description: Update Nudge to the newest version, or check which version is installed. Use when the user says update Nudge, asks whether Nudge is up to date, asks what version is installed, or acts on Nudge's own line saying a new version is waiting.
---

# /nudge:update

Updates Nudge itself.

## Do this

```
!`claude plugin marketplace update nudge && claude plugin update nudge && claude plugin list | grep -A2 nudge@nudge`
```

Two steps, and the first is the one people forget: the marketplace is a clone on this machine, and until it
is refreshed the second command cannot see a version it does not know about yet.

## Then say

- The version now installed, from the last command's output. If it did not change, say that plainly rather
  than reporting success — it means the marketplace had nothing newer, or the clone could not be reached.
- **That this session still has the old one, and how to switch: type `/reload-plugins`.** It applies a plugin
  update in place — plugins, skills, hooks. Without it the new version loads when Claude Code next starts.
  `/clear` does neither; it keeps the version the session began with. Say this out loud: it is the reason an
  update looks like it did nothing, and it cost the owner a test on 21 Sep.

## If they ask why it is not automatic

It is automatic: Nudge checks the repo daily, installs the new version itself, and reports it at the next session
start. Claude Code has its own background plugin update and Nudge sets the flag for it too, but as of 21 Sep
2026 that path does not fire — tested in an isolated interactive session with debug logging, and open upstream
as anthropics/claude-code#95175 — so Nudge's own is the one that does the work. This skill is for the person who
wants it now rather than at the next start.
