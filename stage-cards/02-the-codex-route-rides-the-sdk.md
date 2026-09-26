# Stage card 02: the Codex route rides the SDK

## Metadata

- **Authored:** 2026-09-26
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/02-the-codex-route-rides-the-sdk
- **Worker effort:** high
- **Verifier effort:** high
- **Requires network:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 01-the-wrappers-pass-the-cloud-env-through
- **Path claims:** src/codex-sdk.ts, src/providers/openai.ts, src/auth-check.ts, package.json, package-lock.json, CLAUDE.md, AGENTS.md, README.md, docs/auth-route-guards.md, docs/SECURITY.md, src/__tests__/codex-sdk-route.test.ts
- **Pairing rationale:** cross-family. Codex writes the migration onto its
  own SDK, whose thread and usage model it knows first hand; Claude
  verifies because the risk is a silent billing-route regression (an API
  key leaking into the child env), which needs an adversarial reader from
  the other family.

## Objective

Four of the five auth routes go through a vendor SDK. The Codex route is
the exception: `src/providers/openai.ts` hand-spawns the `codex` binary
and parses JSONL from its stdout, and `src/auth-check.ts` carries a
separately hand-copied argv. That copy is where the stale `--full-auto`
flag lived, it never drains stdout (a verbose codex release hangs the auth
check), and it spawns with `OPENAI_API_KEY` still in the environment, so a
PASS may be produced on API-key billing. Replace both call sites with one
shared module built on `@openai/codex-sdk` so the route has the same shape
as the other four and there is exactly one place that builds a Codex turn.

## Inputs (read these in your own context)

- src/providers/openai.ts (`runViaCodexCli`, `parseCodexUsage`, and the two call sites in the lane and synthesis paths)
- src/auth-check.ts (`checkCodex`, `CODEX_TEST_MODEL`)
- src/auth/detect.ts (`codexAuthFile`, landed by stage 01)
- src/__tests__/codex-sdk-route.test.ts (the contract test; frozen block is read-only)
- The installed SDK's `node_modules/@openai/codex-sdk/dist/index.d.ts` after `npm install @openai/codex-sdk@0.157.1`
- CLAUDE.md, AGENTS.md, README.md, docs/auth-route-guards.md, docs/SECURITY.md: only the paragraphs that describe `codex exec`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `package.json` / `package-lock.json`: add `@openai/codex-sdk` pinned to
   the same version as the installed codex-cli (0.157.1) as a runtime
   dependency.
2. `src/codex-sdk.ts`: new shared module exporting
   - `codexChildEnv(env: NodeJS.ProcessEnv): Record<string, string>`:
     a copy of `env` with `OPENAI_API_KEY` removed and undefined values
     dropped. The SDK's `env` option replaces inheritance entirely, so
     this must keep `PATH`, `HOME`, `CODEX_HOME`, `TMPDIR` and the rest.
   - `runCodexTurn(opts: { prompt: string; model: string; reasoningEffort: string; useSearch: boolean; outputSchema?: object; sandbox?: "read-only" }): Promise<{ text: string; tokensIn: number; tokensOut: number }>`:
     builds `new Codex({ env: codexChildEnv(process.env) })`, starts a
     thread with `model`, `sandboxMode: "read-only"`, `skipGitRepoCheck: true`,
     `modelReasoningEffort`, `webSearchEnabled: useSearch`, runs one turn
     with `outputSchema` when given, and returns `finalResponse` plus
     `usage.input_tokens` / `usage.output_tokens`. Validate
     `reasoningEffort` against the SDK's `ModelReasoningEffort` union and
     throw on anything else. Also `delete process.env.OPENAI_API_KEY` before
     constructing the client, as the current provider does.
3. `src/providers/openai.ts`: `runViaCodexCli` and `parseCodexUsage` are
   removed; the lane and synthesis paths call `runCodexTurn`. The
   `child_process`, `os` and temp-file helpers go if nothing else uses
   them. Truncation and `parseMode` handling around the returned text is
   unchanged.
4. `src/auth-check.ts`: `checkCodex` keeps its MISS result when
   `codexAuthFile()` does not exist, then calls `runCodexTurn` with
   `CODEX_TEST_MODEL`, no search, no schema, prompt `Reply with OK.`, and
   reports the trimmed response. No `spawn`, no temp file.
5. Docs: in CLAUDE.md, AGENTS.md, README.md, docs/auth-route-guards.md and
   docs/SECURITY.md replace the descriptions of `codex exec` argv and
   `--output-schema` with the SDK route (thread options and
   `outputSchema`), keeping every existing guarantee statement about
   `OPENAI_API_KEY` being stripped before the Codex child starts. Keep the
   three files aligned as the repo's notes require. Do not edit SKILL.md.

## Constraints

- Do not edit the frozen block in the contract test.
- The Codex route stays sync-only and keeps refusing batch mode; no change
  to `requireApiKeyModeOrThrow` call sites.
- `OPENAI_API_KEY` must never reach the Codex child: neither via
  inheritance nor via the SDK's `apiKey` option.
- Do not install the SDK's bundled binary path override; leave
  `codexPathOverride` unset so the SDK's own bundled `codex` is used.
- Run `npm ci` then `npm install @openai/codex-sdk@0.157.1` in the run
  worktree before the checks.
- Sibling contract test `wait-all-batches.test.ts` may be red if stage 03
  has not landed; do not touch it. Run your own test file, the existing
  `openai-*.test.ts` files and the typecheck.
- British English, no em dashes, no absolute home paths.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npx vitest run src/__tests__/codex-sdk-route.test.ts src/__tests__/openai-detect.test.ts src/__tests__/openai-retry.test.ts src/__tests__/openai-response-text.test.ts src/__tests__/openai-batch-synthesis.test.ts` passes.
2. `npm run typecheck` passes.
3. `grep -n 'child_process\|spawn(' src/providers/openai.ts src/auth-check.ts` prints nothing.
4. `grep -c 'runCodexTurn' src/providers/openai.ts` is at least 2 and
   `grep -c 'runCodexTurn' src/auth-check.ts` is at least 1.
5. `grep -rn 'codex exec' CLAUDE.md AGENTS.md README.md docs/auth-route-guards.md docs/SECURITY.md`
   returns only lines that describe history or the SDK wrapping the CLI,
   not an argv the repo still builds; the verifier reads each hit.
6. Live smoke, run by the verifier with a Codex ChatGPT login present and
   `OPENAI_API_KEY` unset: `npx ts-node research-sweep.ts --auth-check codex`
   prints a PASS line for Codex auth within 120s.
7. The frozen block digest recomputed with
   `bash scripts/check-contract-test-gate.sh print src/__tests__/codex-sdk-route.test.ts`
   equals the digest recorded on this card.
8. `git diff --stat dev...HEAD` on the run branch touches only the claimed
   paths.

## Contract test

- **Test file:** `src/__tests__/codex-sdk-route.test.ts`
- **Assertions digest:** `sha256:6d8f0e00ccd10a79e3bc9e9c3ccf833f6639e46b69ab1eae41e93f0a28d721ec`

## Out of scope

- Streaming or resumable threads; one `run()` per lane is the contract.
- Any change to the OpenAI API-key route or batch flows.
- SKILL.md and sweeper-prompt-creation/SKILL.md (stage 03 owns them).

## Budget

- **Worker wall-clock:** 3000s
- **Verifier wall-clock:** 2400s

## Dispatch envelope

Report the exact commands run with exit codes, the recomputed digest, the
`git diff --stat`, and quote the lane-path and synthesis-path call sites
of `runCodexTurn`. If the SDK's usage object differs from what
`parseCodexUsage` used to read, say so and how it was mapped.

## Family-specific notes

Codex worker: the run worktree is sandboxed workspace-write; `npm install`
needs the socket, which `Requires network: true` opens. The live smoke in
criterion 6 is the verifier's to run, not the worker's.
