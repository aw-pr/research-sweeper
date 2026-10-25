# Publish workflow

How research-sweeper keeps a public mirror in step with private development.
Read this before pushing to the public remote, or before changing the
publish-guard configuration.

Placeholders: `PRIV` = the private working remote (`origin`), `PUB` = the public
mirror (default branch `main`), `PUB_MATCH` = a substring of the public remote
URL (e.g. `myorg/myrepo`), `PUBLISH_BRANCH` = the line that becomes public
(`publish`).

## Model (read this first)

The history is **shared at the root but not identical**. There is one line of
development and one curated line derived from it:

- **`dev`** — the working branch on `PRIV`. Atomic commits, per-agent author
  attribution. This is the canonical line; all work lands here.
- **`publish`** — a curated replay of `dev`. Each new `dev` commit is replayed
  onto `publish` with the private-tier paths (`publishguard.privatefile`)
  stripped out, preserving message and author. Commits that were only ever
  private-tier drop out as empty. `publish` is pushed to `PUB` as `main`.
- `PUB/main` is whatever `publish` last replayed up to.

**`publish` is not a fast-forward of `dev`, and it must not be.** `HANDOFF.md` is
tracked on `dev` so it follows worktrees and clones, and a fast-forward would
make `publish`'s tree identical to `dev`'s — publishing it. A file can be at
most two of {tracked, published-by-fast-forward, absent-from-public}; curated
replay is what buys all three. The divergence is the accepted cost, not drift.

Run the replay with `bash scripts/publish-sync.sh --apply`; never
`git merge --ff-only dev`. The canonical script and the full rationale live in
mcp-hub (`docs/PUBLISH-SYNC.md`, `docs/BRANCH-PROTECTION.md`); the copy here is
distributed by `sync-guard-hooks.sh` and should stay identical to it.

> **No per-batch squash.** Earlier versions of this doc told you to
> `git merge --squash wip/<thing>` into `publish`. That collapsed atomic commits
> into one giant commit and is no longer the workflow. Preserve the atomic,
> per-agent-authored history; the only squash this repo ever did was the one-time
> orphan seed (see "History note"). If a doc or memory still describes a
> squash-merge step, it is stale.

## Default publish: PR-for-publish

The default way to move `publish` onto `PUB/main` is a self-reviewed PR, not a
direct ff-push. The final hop (`publish → PUB/main`) gets an explicit diff you
look at before anything public changes — the same fail-closed private-file
guard still runs underneath it, but the PR diff is the *visible* check.

```sh
# 1. work on dev as usual — atomic commits, per-agent --author=
# 2. when a batch is ready for the public mirror:
bash scripts/publish-sync.sh              # plan only: shows what would replay
bash scripts/publish-sync.sh --apply      # replays dev's new commits onto publish,
                                          # stripping private-tier paths, then moves the ref
git switch publish
git publish-pr                   # backs up to origin, pushes publish as a non-default
                                  # branch on PUB, then prints the gh pr create command
git switch dev                   # back to the working branch
```

`git publish-pr` is the alias
`git push origin publish && git push PUB publish:publish`, followed by an
echoed reminder. Run the reminded command (or the equivalent):

```sh
gh pr create --repo PUB_MATCH --base main --head publish
```

Then **review the PR diff** — confirm no private-tier path (`HANDOFF.md`,
`RUNBOOK.md`, `runs/`, `archive/`, anything under "What is private" below) is
present — and merge on GitHub. Keep the merge fast-forward/clean (GitHub's
"Rebase and merge" or "Create a merge commit" both work here since `publish`
and `main` share linear history; avoid squash-merging on GitHub, which would
rewrite the commits already reviewed in the PR).

The `pre-push` gate allows `publish` to be pushed to `PUB` as a non-default
branch (the PR source) without the `PUBLISH_GUARD_OK` sentinel — the PR review
is the safeguard on that path — but it still runs the private-file tree scan,
fail-closed, exactly as it does on the `main` path. See "The gate" below.

## Fast path: `git publish` (ff-push, requires the PR attestation)

The pre-push hook now enforces the PR boundary (`publishguard.boundary`,
default `pr`): the push to `PUB/main` is rejected unless
`PUBLISH_PR_REVIEWED=1` is set, attesting that a `publish → main` PR was
opened and its diff reviewed. The ff push then completes the PR — GitHub
marks it merged when the base receives the head SHAs. Repo-level opt-out:
`git config publishguard.boundary direct`.

For a batch whose PR diff has been reviewed, finish with:

```sh
bash scripts/publish-sync.sh --apply   # replay dev onto publish, private paths stripped
git switch publish
PUBLISH_PR_REVIEWED=1 git publish  # backs up to origin, then ff-pushes PUB main behind the gate
git switch dev                   # back to the working branch
```

`git publish` is the alias
`git push origin publish && PUBLISH_GUARD_OK=1 git push PUB publish:main`. It
backs up to the private remote first, then publishes. Never hand-type
`git push PUB publish:main`: the gate blocks it and points you back here.

`publish-sync.sh` refuses rather than guessing if the replay would conflict.
Resolve toward `dev`'s version (`git checkout <commit> -- <file>`), since `dev`
is the source of truth for public content. Do not fall back to
`git merge --ff-only dev` — that is what publishes the private-tier files.

## The gate (why it cannot be bypassed by accident)

The guard ships at `scripts/git-hooks/` and installs via
`scripts/install-guards.sh`:

- `pre-commit` — refuses to stage files matching the personal or secret patterns
  in the gitignored `.publish-guard.local`, plus never-commit paths (`.env`,
  `*.local`, `op-refs.local.sh`, `.publish-guard.local`) regardless of
  `.gitignore` state.
- `pre-push` — on `PUB` (matched by `publishguard.publicmatch`): the default
  branch (`main`/`master`) may be pushed only when `PUBLISH_GUARD_OK=1` is set
  (which only `git publish` does), only as a **fast-forward**, and only if no
  `publishguard.privatefile` (e.g. `HANDOFF.md`) is present in the pushed tree.
  The PR-source branch (`publishguard.prsource`, default `publish`) may also be
  pushed as a non-default ref — no sentinel required, but the same
  private-file scan still runs, fail-closed. Any other non-default ref,
  non-fast-forward pushes to the default branch, and private-file leaks are
  rejected.

Why fail-closed rather than a warning: publishing is effectively irreversible.
Objects stay fetchable by SHA and content gets cached and indexed. A guard for an
irreversible outward action has to stop it and point at the right command.

Deliberate one-off override: `git commit --no-verify` / `git push --no-verify`.
These are intentional escape hatches and should not appear in routine workflows.

## Config keys

Set once per machine via `git config --local`; never committed, which keeps org
and repo names out of the tracked tree. Current values for this repo:

```sh
git config publishguard.publicmatch   'PUB_MATCH'
git config publishguard.publicremote  'PUB'
git config publishguard.privateremote 'origin'
git config publishguard.publishbranch 'publish'
git config publishguard.sentinel      'PUBLISH_GUARD_OK'
git config publishguard.historymode   'preserve'   # atomic commits; no per-batch squash
git config publishguard.privatefile   'HANDOFF.md'
git config publishguard.prsource      'publish'    # PR-source branch allowed on PUB
```

`scripts/install-guards.sh` reads these and writes the `git publish` and
`git publish-pr` aliases. If `publicmatch` or `publicremote` are unset, both
aliases are left inert and the pre-push hook is a no-op on all remotes — the
correct state on a fresh clone before the operator has set the public-remote
details. `historymode` is informational (surfaced in guard messages); it
records the convention — `preserve` means atomic fast-forward, never a
per-batch squash. `prsource` is local-only config (never committed) — it is
not one of the five keys `install-guards.sh` prompts for when unset, since it
defaults sensibly to `publishbranch`; set it explicitly only if the PR-source
branch should differ from `publish`.

## What is private, and how

There is **no private-tier branch**. Privacy comes from two mechanisms, not from
branch separation: `.gitignore` plus the pre-commit guard for anything that must
never be committed at all, and curated replay (`publishguard.privatefile`) for
files that must be tracked on `dev` but stripped before they reach `PUB`:

- **Gitignored, never public:** `.env*`, `*.local`, `op-refs.local.sh`,
  `.publish-guard.local`, `runs/*.json` (job/state **and** `stats.json`), and
  `logs/`.
- **Tracked on `dev`, stripped at publish** (`publishguard.privatefile`):
  `HANDOFF.md` — the dated operator log. Tracked so it follows worktrees and
  clones; removed from every replayed commit so it never reaches `PUB`.
- **Tracked, intentionally public:** the ~25 briefs already tracked under
  `prompts/` (shipped as worked examples) and the three curated
  `results/2026-04-07-*.md` examples.

`runs/stats.json` used to be tracked on the grounds that its paths are recorded
relative to the home dir. Path-safety was the wrong test: the ledger also records
the **topic string of every sweep**, so publishing it publishes a running log of
what the operator researches and when. Treat the run ledger as operator activity,
not repo documentation. `scripts/analyze-cache.ts` still reads it from the local
working copy; a fresh clone simply has no run history to analyse yet.
- **Gitignored directory with a curated tracked subset:** both `prompts/` and
  `results/` are listed in `.gitignore`, so *new* files dropped there are not
  auto-staged. Only briefs and examples you deliberately `git add` become
  tracked, and those reach the public mirror on the next fast-forward. This is
  intentional: it keeps scratch briefs and raw run outputs private while letting
  a hand-picked set ship as documentation.

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
