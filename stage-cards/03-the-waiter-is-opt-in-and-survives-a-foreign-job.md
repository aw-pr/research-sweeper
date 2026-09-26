# Stage card 03: the waiter is opt-in and survives a foreign job

## Metadata

- **Authored:** 2026-09-26
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** Codex GPT-5.6 Sol <codex-gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/03-the-waiter-is-opt-in-and-survives-a-foreign-job
- **Worker effort:** medium
- **Verifier effort:** high
- **Requires network:** true
- **Verifier panel:** false
- **Path claims:** batch-search.sh, src/cli/batches.ts, SKILL.md, sweeper-prompt-creation/SKILL.md, src/__tests__/wait-all-batches.test.ts
- **Pairing rationale:** cross-family, and the worker family alternates
  from stage 01 so the two may overlap under the pipeline class. The
  deliverable mixes a small TypeScript refactor with two skill documents
  whose wording must stay precise, which suits the Claude tier; Codex
  verifies the shell and TypeScript behaviour mechanically.

## Objective

`batch-search.sh` hard-codes `--wait-all` on every submit, which contradicts
its own header (`--wait` is documented as opt-in) and forces every pending
job to auto-resume with the default synthesis on the API key, defeating a
two-step plan where synthesis runs on a subscription route. The skill
prose then papers over that with an instruction to kill the tmux waiter
unconditionally. Separately, `waitAllBatches` calls `requireApiKey` on
every manifest in `jobs/`, so one stale job from another provider throws
and kills the waiter right after submit. Make the wait opt-in, make the
waiter skip and report jobs it has no credential for, and correct the two
skill documents so their pre-flight is accurate.

## Inputs (read these in your own context)

- batch-search.sh
- research-sweep.ts lines 280 to 300 (the CLI already honours `--wait` for a single job and `--wait-all` for all)
- src/cli/batches.ts (`waitAllBatches`)
- SKILL.md, the "Output lands under" paragraph and the pre-flight sentence after it
- sweeper-prompt-creation/SKILL.md, the "Confirm with tmux ls" paragraph
- src/env.ts (`loadDotEnv`: `.env.local` is read first and the loader is fill-only, so `.env.local` wins)
- src/__tests__/wait-all-batches.test.ts (the contract test; frozen block is read-only)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `batch-search.sh`: forwards its arguments to
   `./run-secure-sweep.sh --batch "$@"` with no forced `--wait-all`. The
   header comment explains that `--wait` waits for and auto-resumes this
   job, `--wait-all` does so for every pending job, and neither is the
   default.
2. `src/cli/batches.ts`: export
   `partitionJobsByCredential(jobs: SweepJob[], providerFor: (name: string) => Pick<ProviderAdapter, "requireApiKey">): { ready: SweepJob[]; skipped: { job: SweepJob; reason: string }[] }`
   where a job is skipped when `requireApiKey(job.config)` throws, with the
   error message as the reason. `waitAllBatches` calls it once before the
   poll loop, prints one line per skipped job naming the provider and the
   route-aware resume command, and polls only the ready set. With nothing
   ready it prints that and returns rather than looping.
3. `SKILL.md`: the pre-flight reads
   `grep -E '^RESEARCH_SWEEPER_OUTPUT_DIR=' .env.local .env`, states that
   `.env.local` wins over `.env`, asks for an absolute path, and says the
   `Output:` line is confirmation after the fact (the stub is already
   written by then) rather than a check to act on.
4. `sweeper-prompt-creation/SKILL.md`: replace the unconditional kill
   sentence with: launch with `--wait` only when the user wants
   auto-resume on the API key; for a two-step plan where synthesis runs on
   a subscription route, launch without it and, if a waiter is running,
   stop it with `tmux kill-session -t sweep-[slug]` once "Batch submitted"
   appears.

## Constraints

- Do not edit the frozen block in the contract test.
- Do not change `research-sweep.ts`; the CLI's flag handling is already
  correct.
- Do not touch the secure wrappers, `src/auth/*`, `src/env.ts` or
  `src/providers/*`; other queued stages own them.
- Run `npm ci` in the run worktree before the checks.
- Sibling contract tests (`cloud-env-passthrough.test.ts`,
  `codex-sdk-route.test.ts`) are red on purpose until their stages land;
  do not edit them. Run only your own test file plus the typecheck.
- British English, no em dashes, no absolute home paths.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npx vitest run src/__tests__/wait-all-batches.test.ts` passes.
2. `npm run typecheck` passes.
3. `bash -n batch-search.sh` passes and
   `grep -c -- '--wait-all' batch-search.sh` counts only comment lines
   (the verifier reads them).
4. `grep -n 'requireApiKey' src/cli/batches.ts` shows the call inside
   `partitionJobsByCredential` and no unguarded call inside the
   `waitAllBatches` poll loop.
5. The frozen block digest recomputed with
   `bash scripts/check-contract-test-gate.sh print src/__tests__/wait-all-batches.test.ts`
   equals the digest recorded on this card.
6. `git diff --stat dev...HEAD` on the run branch touches only the claimed
   paths.

## Contract test

- **Test file:** `src/__tests__/wait-all-batches.test.ts`
- **Assertions digest:** `sha256:bd6d97d45f8eba74d5a7a7a834208098de4ed574acdeeacb39c41e7ee5a2c590`

## Out of scope

- Merging resubmitted lanes back into an original run.
- Any wording in SKILL.md about the Codex execution path (stage 02).
- Tilde expansion of the output dir (stage 01).

## Budget

- **Worker wall-clock:** 1800s
- **Verifier wall-clock:** 1500s

## Dispatch envelope

Report the exact commands run with exit codes, the recomputed digest, the
`git diff --stat`, and paste the final pre-flight paragraph from each
skill file.

## Family-specific notes

None.
