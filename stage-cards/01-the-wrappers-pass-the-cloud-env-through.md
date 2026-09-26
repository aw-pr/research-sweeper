# Stage card 01: the wrappers pass the cloud env through

## Metadata

- **Authored:** 2026-09-26
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/01-the-wrappers-pass-the-cloud-env-through
- **Worker effort:** medium
- **Verifier effort:** high
- **Requires network:** true
- **Verifier panel:** false
- **Path claims:** run-secure-sweep.sh, run-secure-command.sh, src/auth/detect.ts, src/env.ts, .env.example, src/__tests__/cloud-env-passthrough.test.ts
- **Pairing rationale:** cross-family. The change is mechanical (two shell
  wrappers, two small TypeScript helpers) so it goes to the Codex batch
  tier; Claude verifies because the failure mode is a silently wrong
  output directory, which needs a reader who checks the env plumbing end
  to end rather than the diff in isolation.

## Objective

Make the secure wrappers usable from a cloud runner that injects
configuration as environment variables. Today every route in
`run-secure-sweep.sh` and `run-secure-command.sh` execs through
`op-fetch`, which rebuilds the child env from a fixed allowlist, so a
shell-exported `RESEARCH_SWEEPER_OUTPUT_DIR` or `CODEX_HOME` never reaches
the CLI. Codex auth detection also hard-codes `~/.codex/auth.json` even
though the codex CLI honours `CODEX_HOME`, and `researchRoot()` never
expands a leading `~`, so a tilde path in `.env` writes into a directory
literally named `~` inside the repo.

## Inputs (read these in your own context)

- run-secure-sweep.sh (every `exec op-fetch` line)
- run-secure-command.sh (the one `exec op-fetch` line; note its existing `--pass RESEARCH_SWEEPER_HELPER_ACTIVE`)
- src/auth/detect.ts (`CODEX_AUTH_FILE`, `hasCodexChatGPTAuth`)
- src/env.ts (`researchRoot`)
- src/model-registry.ts (its private `expandHome` is the helper to reuse, not to copy)
- src/__tests__/cloud-env-passthrough.test.ts (the contract test; frozen block is read-only)
- .env.example (the `RESEARCH_SWEEPER_OUTPUT_DIR` placeholder)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `run-secure-sweep.sh` and `run-secure-command.sh`: every `exec op-fetch`
   invocation carries `--pass RESEARCH_SWEEPER_OUTPUT_DIR` and
   `--pass CODEX_HOME`. `op-fetch` skips a `--pass` var that is unset, so
   this is safe on a laptop where neither is exported.
2. `src/env.ts`: `researchRoot()` expands a leading `~` or `~/` to the
   home directory. Export one `expandHome` from `src/env.ts` and have
   `src/model-registry.ts` import it only if that file is within your
   claims; it is not, so leave `model-registry.ts` untouched and add the
   helper to `src/env.ts` (duplicating four lines is acceptable here; note
   it in the envelope so a follow-up card can converge them).
3. `src/auth/detect.ts`: add `export function codexAuthFile(): string`
   returning `$CODEX_HOME/auth.json` when `CODEX_HOME` is set, else
   `~/.codex/auth.json`. `hasCodexChatGPTAuth()` reads through it. Keep
   `CODEX_AUTH_FILE` exported (computed at load from the same function) so
   `src/auth-check.ts` keeps compiling unchanged; the error text in
   `detectOpenAIAuthMode` should name `CODEX_HOME` as an alternative.
4. `.env.example`: one comment line under the output-dir placeholder saying
   a `~/` prefix is expanded and that the value is also honoured when
   exported in the environment on the secure path.

## Constraints

- Do not edit the frozen block in the contract test. Scaffolding outside
  the markers is allowed.
- Do not touch `src/auth-check.ts`, `src/providers/*`, `CLAUDE.md`,
  `AGENTS.md` or `README.md`; those belong to other queued stages.
- No absolute home-directory paths in any committed file.
- Run `npm ci` in the run worktree before the checks; the worktree has no
  `node_modules`.
- Sibling contract tests (`codex-sdk-route.test.ts`,
  `wait-all-batches.test.ts`) are red on purpose until their stages land.
  Do not fix or edit them. Run only your own test file plus the typecheck.
- British English, no em dashes.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npx vitest run src/__tests__/cloud-env-passthrough.test.ts` passes.
2. `npm run typecheck` passes.
3. `bash -n run-secure-sweep.sh && bash -n run-secure-command.sh` pass.
4. `grep -c 'exec op-fetch' run-secure-sweep.sh` equals
   `grep -c -- '--pass CODEX_HOME' run-secure-sweep.sh`; same for
   `run-secure-command.sh`.
5. The frozen block digest recomputed with
   `bash scripts/check-contract-test-gate.sh print src/__tests__/cloud-env-passthrough.test.ts`
   equals the digest recorded on this card.
6. `git diff --stat dev...HEAD` on the run branch touches only the claimed
   paths.

## Contract test

- **Test file:** `src/__tests__/cloud-env-passthrough.test.ts`
- **Assertions digest:** `sha256:0de0c7d248105e4a137d26e7d367058429a05823968c816f9591da7c4c1a9669`

## Out of scope

- Any change to the Codex execution path (stage 02).
- The batch waiter and skill prose (stage 03).
- Converging the two `expandHome` copies.

## Budget

- **Worker wall-clock:** 1800s
- **Verifier wall-clock:** 1500s

## Dispatch envelope

Report the exact commands run with their exit codes, the recomputed
digest, and the `git diff --stat`. Say explicitly whether
`model-registry.ts` still holds its own `expandHome`.

## Family-specific notes

None.
