import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Optional fleet model registry (a models.json keyed `claude.opus`,
// `claude.sonnet`, ... plus a `pricing` map). Opt-in via this env var so a
// fresh clone never depends on a file outside the checkout: unset means the
// built-in constants apply. Resolution order for every consumer is
// env override > registry > built-in fallback.
export const MODEL_REGISTRY_ENV = "MODEL_REGISTRY";

export interface RegistryPricing {
  inPer1M: number;
  outPer1M: number;
  cachedInPer1M?: number;
}

type RegistryJson = Record<string, unknown>;

let cached: { path: string; registry: RegistryJson | null } | null = null;

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Read lazily (not at import) so a MODEL_REGISTRY set in .env.local, which
// main() loads after imports, still applies. Cached per resolved path.
function loadRegistry(): RegistryJson | null {
  const raw = process.env[MODEL_REGISTRY_ENV]?.trim();
  if (!raw) return null;
  const resolved = path.resolve(expandHome(raw));
  if (cached?.path === resolved) return cached.registry;
  let registry: RegistryJson | null = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) registry = parsed as RegistryJson;
    else throw new Error("not a JSON object");
  } catch (err) {
    console.warn(`  Warning: ${MODEL_REGISTRY_ENV} is set but unreadable (${(err as Error).message}); using built-in model defaults.`);
  }
  cached = { path: resolved, registry };
  return registry;
}

export function resetModelRegistryCache(): void {
  cached = null;
}

export function registryModel(provider: string, tier: string): string | undefined {
  const section = loadRegistry()?.[provider];
  if (!section || typeof section !== "object") return undefined;
  const value = (section as Record<string, unknown>)[tier];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function registryPricing(modelId: string): RegistryPricing | undefined {
  const pricing = loadRegistry()?.pricing;
  if (!pricing || typeof pricing !== "object") return undefined;
  const row = (pricing as Record<string, unknown>)[modelId] as Record<string, unknown> | undefined;
  if (!row || !isNonNegativeNumber(row.inPer1M) || !isNonNegativeNumber(row.outPer1M)) return undefined;
  return {
    inPer1M: row.inPer1M,
    outPer1M: row.outPer1M,
    ...(isNonNegativeNumber(row.cachedInPer1M) ? { cachedInPer1M: row.cachedInPer1M } : {}),
  };
}

export function envModel(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
