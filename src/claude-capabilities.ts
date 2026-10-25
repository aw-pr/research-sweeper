// Per-model request capabilities for the Claude API route, keyed on the
// undated model id so a dated snapshot (claude-haiku-4-5-20251001) matches.

function baseModelId(model: string): string {
  return model.trim().replace(/-\d{8}$/, "");
}

// An allowlist, not a denylist: Opus 5.5 and Fable 5.1 reject forced
// tool_choice (`any` / `tool`) with a 400, and the direction of travel is
// removal, so an unknown or newer id is assumed to reject until verified and
// listed here. Getting this wrong the safe way costs a slightly weaker nudge;
// the other way fails every lane.
const FORCED_TOOL_CHOICE_MODELS = new Set([
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-opus-4-5",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
]);

export function acceptsForcedToolChoice(model: string): boolean {
  return FORCED_TOOL_CHOICE_MODELS.has(baseModelId(model));
}

// output_config.effort returns a 400 on these (Haiku 4.5 is the test-mode and
// judge model, so this is not theoretical). Every model since accepts it, and
// newer ones default below `high` (Opus 5.5 defaults to `medium`), so an
// unknown id is assumed to support it.
const NO_EFFORT_MODELS = new Set(["claude-haiku-4-5", "claude-sonnet-4-5", "claude-sonnet-4", "claude-opus-4", "claude-opus-4-1"]);

export function supportsEffort(model: string): boolean {
  const id = baseModelId(model);
  return !NO_EFFORT_MODELS.has(id) && !id.startsWith("claude-3");
}
