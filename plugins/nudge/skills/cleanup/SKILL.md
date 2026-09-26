---
name: cleanup
description: Remove leftover wiring from Nudge's old background service, which fails at every session end. Use when a Nudge or daemon hook fails, when a hook call to 127.0.0.1 or a port is refused, when something suggests running `nudge restart` or `nudge setup`, or when the user asks to clean up, repair or fix their Nudge or Claude Code hooks.
---

# /nudge:cleanup

Removes hooks left behind by Nudge's old background service. The service is switched off for good, so they
fail every session and achieve nothing.

## What Nudge says

```
!`node "${CLAUDE_PLUGIN_ROOT}/hooks/memory-hooks.mjs" cleanup`
```

## What to do with it

- This first command **only reports**. Show what it found and ask whether to remove it.
- On a yes, and not before, run `node "<the script path>" cleanup apply`, where the script path is:

```
!`echo "${CLAUDE_PLUGIN_ROOT}/hooks/memory-hooks.mjs"`
```

- The removal is deliberately not a bang line above: Claude Code runs every one of those as soon as the skill
  loads, before anyone has answered.

- It writes a backup beside `settings.json` first and names it. Pass that name on.
- Say what is **not** touched, because that is the worry: the Nudge plugin, the memory hooks, the status
  line and every other setting are left exactly as they are. This removes dead wiring, not Nudge.
- Hooks are read at session start, so the failures stop from the next session, not this one.
- If it reports that the status line also posts to the dead port, pass that on as it is written. Nudge does
  not edit that script: the user may have changed it, and it still shows live context and usage.
- **Never offer `nudge restart` or `nudge setup`.** The background service was switched off deliberately.
  If a hook failure mentions a port, this skill is the answer.
