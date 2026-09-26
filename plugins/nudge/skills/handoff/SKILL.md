---
name: handoff
description: How to rewrite .nudge/handoff.md so it stays one readable page — fold in the journal, cut what is finished, re-order what is left. Use when Nudge hands you journal entries to fold in at session start, when it says the hand-off is too long, or when the user asks for a hand-off, a synthesis or a summary to carry into a new session.
---

# /nudge:handoff

Rewriting `.nudge/handoff.md` so it stays the size it was.

## What this document is

A synthesis, not a log. It takes the previous hand-off as its starting point, absorbs what happened since,
and comes back **under 3,000 characters**. It is the one page a fresh session reads instead of
reconstructing the last one, so every line that does not change what the next session does is costing the
thing the file exists to save.

The record is `.nudge/journal.md`: append-only, never rewritten, and it keeps the detail. Every version of
the hand-off is archived in `.nudge/handoff-history/` as it changes. **So nothing is lost by cutting** —
that is what makes deleting the right move rather than a risk.

## The pass

1. **Read the hand-off from disk, now.** Start from it. Other sessions may be open in this project and one may
   have folded it since yours began, so read it right before you write, and write it once. Never rebuild the
   document from scratch and never from the conversation — the previous session's judgement is in there.
2. **Fold in the journal entries since it last changed.** Nudge hands them to you at session start; otherwise
   read `.nudge/journal.md` from the bottom. New work goes into `Done` in its own words, with the command that
   proved it and that command's result.
3. **Delete what is finished.** An item whose work is done leaves `Left` entirely — not struck through, not
   marked superseded, not kept "for the record". The journal is the record. A list carrying its own history
   is a list nobody reads to the bottom of.
4. **Re-order `Left`.** It is an ordered plan: what the next session should do first, first. Each item an
   instruction, not a topic — "add the retry to `fetchUser`" beats "retries".
5. **Compress `Done`.** Recent work in its own words; older work folded into a line. Something finished days
   ago and unlikely to be touched again belongs in a report, not here.
6. **Keep `Facts` and `Traps` to what the next session cannot derive.** A fact it could get from the code in
   one command is not a fact worth carrying. A trap is something that cost time once and would again.
7. **Check the size.** Over 3,000 characters, cut the fattest section first — Nudge names it when it asks.

## Never

- Never paste file contents, credentials, tokens or environment values. Name the file, the function, or
  where the credential lives.
- Never quote the conversation. The next session needs the state, not the history.
- Never delete something the journal does not already hold. If it is only written here, write the journal
  entry first, then cut.
- Never edit a marked Nudge block if one is present at the bottom; it is rewritten and yours is the text above it.

## When the conversation is the thing that is long

Past the hand-off point Nudge says so every turn. Make sure the journal says where this conversation got to —
the next session to open folds it into this document — tell the user the conversation should end and the next
task start in a fresh session, then actually stop. Running sessions write the journal, not the hand-off.
