# Privacy

- Kept on your machine: Nudge's records of hand-overs and checks, in `~/.nudge`. You can delete them any time.
- Leaves your machine unless you turn it off: every 30 minutes, a summary of your hand-overs (kinds of job,
  sizes, pass and fail counts, the type of failure, your project's language and framework), Nudge's version and your
  operating system. It carries a random machine ID, never your name, email or account. To stop fake summaries, the service keeps
  a one-way scramble of the sending internet address for two days, never the address itself, then deletes it.
- Never collected: code, file names, prompts, Claude's replies, passwords or keys; project names only as said below.
- Your control: `nudge sharing preview` shows exactly what is sent; `nudge sharing off` stops it any time;
  `nudge sharing every 2h` sends less often.
  To have what you already sent deleted, open an issue on this repository with your machine ID (`/nudge:check`
  shows it).
- Projects: the summary also names each project by its folder, with a code made from the project's first commit,
  so everyone working on the same project sees it in `nudge team`, and nobody without the project can. During
  early access Nudge's team sees project names too; after the public launch it sees counts only.
  `nudge sharing projects off` stops project names leaving this machine.
- Companies: sharing can be locked off for everyone (`NUDGE_SHARING=off` in Claude Code's managed
  settings). An admin may share within the company only.

Nudge is provided as is, without warranty (MIT licence). It changes how Claude splits and checks work;
you and Claude remain responsible for the code that is kept. Savings figures are estimates.
