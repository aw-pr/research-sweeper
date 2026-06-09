# Publish workflow

How research-sweeper keeps a public mirror in step with private development.
Read this before pushing to the public remote, or before changing the
publish-guard configuration.

Placeholders: `PRIV` = the private working remote (`origin`), `PUB` = the public
mirror (`aw-pr`, default branch `main`), `PUBLISH_BRANCH` = the line that becomes
public (`publish`).

## Model (read this first)

The history is **linear and shared**. There is one line of development:

- **`dev`** — the working branch on `PRIV`. Atomic commits, per-agent author
  attribution. This is the canonical line; all work lands here.
- **`publish`** — not a separate history. It is a pointer that sits behind `dev`
  on the same line and is **fast-forwarded** up to a chosen `dev` commit when you
  publish. `publish` is pushed to `PUB` as `main`.
- `PUB/main` is whatever `publish` last fast-forwarded to.

`dev` and `publish` share history, and `git merge-base dev publish` is publish's
own tip. There is nothing to rebase or cherry-pick. To publish you fast-forward
`publish` up to `dev` and push. That is the whole model.

> **No per-batch squash.** Earlier versions of this doc told you to
> `git merge --squash wip/<thing>` into `publish`. That collapsed atomic commits
> into one giant commit and is no longer the workflow. Preserve the atomic,
> per-agent-authored history; the only squash this repo ever did was the one-time
> orphan seed (see "History note"). If a doc or memory still describes a
> squash-merge step, it is stale.

## Normal publish (the common case)

```sh
# 1. work on dev as usual — atomic commits, per-agent --author=
# 2. when a batch is ready for the public mirror:
git switch publish
git merge --ff-only dev          # publish catches up to dev's tip; always a clean ff
git publish                      # backs up to origin, then ff-pushes PUB main behind the gate
git switch dev                   # back to the working branch
```

`git publish` is the alias
`git push origin publish && PUBLISH_GUARD_OK=1 git push aw-pr publish:main`. It
backs up to the private remote first, then publishes. Never hand-type
`git push aw-pr publish:main`: the gate blocks it and points you back here.

If `git merge --ff-only dev` refuses, `publish` has commits `dev` does not
(someone committed directly on `publish`). That should not happen in this model;
reconcile by hand rather than forcing.

## The gate (why it cannot be bypassed by accident)

The guard ships at `scripts/git-hooks/` and installs via
`scripts/install-guards.sh`:

- `pre-commit` — refuses to stage files matching the personal or secret patterns
  in the gitignored `.publish-guard.local`, plus never-commit paths (`.env`,
  `*.local`, `op-refs.local.sh`, `.publish-guard.local`) regardless of
  `.gitignore` state.
- `pre-push` — on `PUB` (matched by `publishguard.publicmatch`): only the default
  branch (`main`/`master`) may be pushed, only when `PUBLISH_GUARD_OK=1` is set
  (which only `git publish` does), only as a **fast-forward**, and only if no
  `publishguard.privatefile` (e.g. `HANDOFF.md`) is present in the pushed tree.
  Non-default refs, non-fast-forward pushes, and private-file leaks are rejected.

Why fail-closed rather than a warning: publishing is effectively irreversible.
Objects stay fetchable by SHA and content gets cached and indexed. A guard for an
irreversible outward action has to stop it and point at the right command.

Deliberate one-off override: `git commit --no-verify` / `git push --no-verify`.
These are intentional escape hatches and should not appear in routine workflows.

## Config keys

Set once per machine via `git config --local`; never committed, which keeps org
and repo names out of the tracked tree. Current values for this repo:

```sh
git config publishguard.publicmatch   'aw-pr/research-sweeper'
git config publishguard.publicremote  'aw-pr'
git config publishguard.privateremote 'origin'
git config publishguard.publishbranch 'publish'
git config publishguard.sentinel      'PUBLISH_GUARD_OK'
git config publishguard.historymode   'preserve'   # atomic commits; no per-batch squash
git config publishguard.privatefile   'HANDOFF.md'
```

`scripts/install-guards.sh` reads these and writes the `git publish` alias. If
`publicmatch` or `publicremote` are unset, the alias is left inert and the
pre-push hook is a no-op on all remotes — the correct state on a fresh clone
before the operator has set the public-remote details. `historymode` is
informational (surfaced in guard messages); it records the convention — `preserve`
means atomic fast-forward, never a per-batch squash.

## What is private, and how

In a linear model there is **no private-tier branch**. Whatever is tracked and
committed on `dev` reaches `PUB` on the next fast-forward. Privacy is enforced by
`.gitignore` and the pre-commit guard, not by branch separation:

- **Gitignored, never public:** `.env*`, `*.local`, `op-refs.local.sh`,
  `.publish-guard.local`, `HANDOFF.md` (the dated operator log stays private),
  `runs/*.json` (job/state), `logs/`, `prompts/`, and `results/` except the three
  curated worked examples.
- **Tracked, intentionally public:** `runs/stats.json` (run metadata — paths are
  recorded relative to home dir so it is publish-safe) and the three curated
  `results/2026-04-07-*.md` examples.

If a file must never be public, it has to be gitignored. Keeping it only on `dev`
is no longer protection.

## When to re-audit

Run the `repo-publish-audit` skill before publishing if more than ten-ish commits
have landed on `dev` since the last publish, after any `.gitignore` change, after
any change to `scripts/git-hooks/*`, or after editing `.publish-guard.local`. A
fast-forward exposes the **history** of the commits it brings, not just the
current tree, so the audit covers the range `PUB/main..dev`, not only the working
tree.

## History note (the squashes, done once)

The public mirror was seeded by an orphan-squash (`research-sweeper: multi-lane
agentic research harness`) that buried messy pre-publication history. A later
one-off catch-up commit (`chore: retire in-process MCP server; sync recent CLI
work`) also bundled several dev commits. Those squashes are already on `PUB/main`
and are immutable. On 2026-06-09 the working line was rebuilt off `publish` so the
two share one linear history (the previous diverged `dev` is archived privately as
`dev-archive-20260609` on `origin`). From that point onward, `dev` and `publish`
are one linear, atomic history and the normal flow above is all you need. The
orphan-squash and catch-up squash are not part of routine publishing and should
not be repeated.
