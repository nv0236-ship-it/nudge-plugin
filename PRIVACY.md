# Privacy

- Kept on your machine: Nudge's records of hand-overs and checks, in `~/.nudge`. You can delete them any time.
- Leaves your machine unless you turn it off: every 30 minutes, a summary of your hand-overs (kinds of job,
  sizes, pass and fail counts, the type of failure, your project's language and framework), Nudge's version and your
  operating system. It carries a random machine ID, never your name, email or account. To stop fake summaries, the service keeps
  a one-way scramble of the sending internet address for two days, never the address itself, then deletes it.
- Never collected: code, file names, prompts, Claude's replies, passwords or keys; project names only during early access or in a team (below).
- Your control: `nudge sharing preview` shows exactly what is sent; `nudge sharing off` stops it any time;
  `nudge sharing every 2h` sends less often.
  To have what you already sent deleted, open an issue on this repository with your machine ID (`/nudge:check`
  shows it).
- Early access, until the public launch: the summary also names your projects by folder, so we can help early
  users directly. `nudge sharing projects off` stops it; it ends for everyone at the public launch.
- Teams: a machine that joined a team (`nudge team join`, or `NUDGE_TEAM` in settings) also sends its week's
  hand-overs by project folder name, so the team can see its projects. After early access, a machine outside a team sends none.
- Companies: sharing can be locked off for everyone (`NUDGE_SHARING=off` in Claude Code's managed
  settings). An admin may share within the company only.

Nudge is provided as is, without warranty (MIT licence). It changes how Claude splits and checks work;
you and Claude remain responsible for the code that is kept. Savings figures are estimates.
