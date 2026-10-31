# Privacy

- Kept on your machine: Nudge's records of hand-overs and checks, in `~/.nudge`. You can delete them any time.
- Leaves your machine only if you said yes to sharing: once a week, a summary of your hand-overs (kinds of job,
  sizes, pass and fail counts, the type of failure, your project's language and framework). Kinds of job with fewer than 5 jobs are merged into broader groups first.
  It carries a random machine ID, never your name, email or account. To stop fake summaries, the service keeps
  a one-way scramble of the sending internet address for two days, never the address itself, then deletes it.
- Never collected: code, file names, project names, prompts, Claude's replies, passwords or keys.
- Your control: `nudge sharing preview` shows exactly what would be sent; `nudge sharing off` stops it any time.
  To have what you already sent deleted, open an issue on this repository with your machine ID (`/nudge:check`
  shows it).
- Companies: sharing is off and can be locked off for everyone (`NUDGE_SHARING=off` in Claude Code's managed
  settings). An admin may share within the company only.

Nudge is provided as is, without warranty (MIT licence). It changes how Claude splits and checks work;
you and Claude remain responsible for the code that is kept. Savings figures are estimates.
