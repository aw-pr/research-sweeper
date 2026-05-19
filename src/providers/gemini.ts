import { detectGeminiAuthMode, GeminiAuthMode, requireApiKeyModeOrThrow } from "../auth/detect";
import { BatchStatus, Lane, LaneResult, ProviderAdapter, ProviderModels, SweepConfig } from "../types";

// Model IDs verified May 2026 against ai.google.dev/gemini-api/docs/pricing.
// gemini-2.5-* are the stable, non-preview production IDs.
const LANE_MODEL_FLASH_LITE = "gemini-2.5-flash-lite"; // shallow/standard lanes
const LANE_MODEL_FLASH = "gemini-2.5-flash"; // deep lanes
const SYNTHESIS_MODEL = "gemini-2.5-pro";
const TEST_MODEL = "gemini-2.5-flash-lite";

function resolveLaneModel(config: SweepConfig): string {
  // Gemini ignores --lane-model (Claude-specific); depth-based, like OpenAI.
  return config.depth === "deep" ? LANE_MODEL_FLASH : LANE_MODEL_FLASH_LITE;
}

const NOT_IMPLEMENTED = "GeminiProvider: not yet implemented (Phase B scaffold).";

/**
 * Gemini provider. Two auth routes:
 *  - api_key:      GEMINI_API_KEY (default).
 *  - gemini_oauth: Google OAuth access token (GOOGLE_ACCESS_TOKEN) passed as a
 *                  Bearer header via the @google/genai SDK httpOptions. NOTE:
 *                  GCP-billed (Generative Language API + billing required for
 *                  grounding), NOT consumer-subscription quota. Sync-only;
 *                  batch mode requires api_key.
 *
 * Phase A scaffold: contract + auth + model selection are real; the SDK calls
 * (lane/synthesis/batch) are filled in by Phase B.
 */
export class GeminiProvider implements ProviderAdapter {
  readonly provider = "gemini" as const;
  private authMode: GeminiAuthMode | null = null;

  requireApiKey(config?: SweepConfig): string {
    const mode = config ? this.resolveAuthMode(config) : this.authMode ?? (process.env.GEMINI_API_KEY ? "api_key" : null);
    if (mode === "gemini_oauth") return "gemini-oauth-auth";
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Error: GEMINI_API_KEY not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
    return apiKey;
  }

  getAuthMode(): GeminiAuthMode | null {
    return this.authMode;
  }

  private resolveAuthMode(config: SweepConfig): GeminiAuthMode {
    if (this.authMode) return this.authMode;
    this.authMode = detectGeminiAuthMode(config.geminiAuth);
    if (this.authMode === "gemini_oauth") {
      // Billing safeguard: never let the OAuth route silently fall back to
      // API-key billing (mirrors the openai.ts / claude.ts pattern).
      delete process.env.GEMINI_API_KEY;
    }
    return this.authMode;
  }

  getModels(config: SweepConfig, _mode: "sync" | "batch"): ProviderModels {
    return {
      lane: config.test ? TEST_MODEL : resolveLaneModel(config),
      synthesis: config.test ? TEST_MODEL : config.synthesisModel || SYNTHESIS_MODEL,
    };
  }

  async runLane(config: SweepConfig, _lane: Lane): Promise<LaneResult> {
    this.resolveAuthMode(config);
    throw new Error(NOT_IMPLEMENTED);
  }

  async runSynthesis(
    config: SweepConfig,
    _laneResults: LaneResult[],
    _sourcesName: string
  ): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    this.resolveAuthMode(config);
    throw new Error(NOT_IMPLEMENTED);
  }

  async submitBatchLanes(config: SweepConfig): Promise<string> {
    requireApiKeyModeOrThrow("gemini", this.resolveAuthMode(config));
    throw new Error(NOT_IMPLEMENTED);
  }

  async getBatchStatus(_batchId: string): Promise<BatchStatus> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async collectBatchResults(_batchId: string, _lanes: Lane[], _submittedModel?: string): Promise<LaneResult[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async submitBatchSynthesis(config: SweepConfig, _laneResults: LaneResult[], _sourcesName: string): Promise<string> {
    requireApiKeyModeOrThrow("gemini", this.resolveAuthMode(config));
    throw new Error(NOT_IMPLEMENTED);
  }

  async collectBatchSynthesisResult(_batchId: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
