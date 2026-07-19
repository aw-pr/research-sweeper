import { jsonrepair } from "jsonrepair";
import { Lane, LaneDefinition, LaneParseMode, LaneResult, SourceItem } from "./types";

export function extractText(blocks: Array<{ type?: string; text?: string }>): string {
  return blocks.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text || "").join("\n");
}

const TITLE_KEYS = ["title", "headline", "headline_claim", "model_or_paper", "practice_or_pattern", "paper", "claim"];
const SIGNIFICANCE_KEYS = [
  "significance", "why_it_matters", "evidence_value", "core_contribution", "evidence_role", "why_relevant",
  "relevance", "core_relevance", "core_claim", "core_claim_or_finding", "core_finding", "claim", "finding",
  "key_finding", "takeaway", "practice", "practice_or_pattern", "empirical_grounding", "headline_claim",
];
// Source items drift the same way narratives do: models rename the
// "why it matters" field per lane (observed: `core_relevance`,
// `core_claim_or_finding`). Match the known names, then fall back to any
// hinted key so a renamed field can't drop an otherwise-valid source.
const SIGNIFICANCE_HINT = /(significan|relevan|matters|claim|finding|contribution|takeaway|insight|implication|evidence|impact)/i;
const URL_RE = /https?:\/\/[^)\s]+/;

function coerceSourceItem(value: unknown): SourceItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const firstString = (...values: unknown[]): string | undefined => values.find((item): item is string => typeof item === "string" && item.length > 0);
  const title = firstString(...TITLE_KEYS.map((key) => record[key]));
  let significance = firstString(...SIGNIFICANCE_KEYS.map((key) => record[key]));
  if (!significance) {
    for (const [key, nested] of Object.entries(record)) {
      if (TITLE_KEYS.includes(key) || !SIGNIFICANCE_HINT.test(key)) continue;
      if (typeof nested === "string" && nested.length > 40) {
        significance = nested;
        break;
      }
    }
  }
  if (!title || !significance) return null;
  const citation = firstString(record.url, record.source, record.source_citation, record.citation, record.evidence_role);
  // Prefer an explicit citation field; otherwise recover a URL embedded in any
  // string value (some lanes inline the link inside the significance prose).
  const url = citation?.match(URL_RE)?.[0] ?? Object.values(record).map((v) => (typeof v === "string" ? v.match(URL_RE)?.[0] : undefined)).find(Boolean);
  return {
    title,
    significance,
    url,
    date: typeof record.date === "string" || typeof record.date === "number" ? String(record.date) : typeof record.year === "number" ? String(record.year) : undefined,
    outlet: firstString(record.outlet, record.publication, record.lab_or_evaluator, record.venue, record.firm),
  };
}

function stringifyNarrative(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringifyNarrativeLines(item)).filter(Boolean).join("\n\n");
  }
  if (value && typeof value === "object") {
    return stringifyNarrativeLines(value).join("\n\n");
  }
  return undefined;
}

function stringifyNarrativeLines(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringifyNarrativeLines(item)).filter(Boolean);
  }
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const label = key.replace(/_/g, " ");
    const lines = stringifyNarrativeLines(nested);
    if (lines.length === 0) return [];
    if (typeof nested === "string") return [`**${label}:** ${lines[0]}`];
    return [`**${label}:**`, ...lines.map((line) => `- ${line.replace(/^-\s+/, "")}`)];
  });
}

// Pull the first balanced { ... } object out of a string by brace-depth
// scanning (string/escape aware). Handles trailing prose after the JSON and
// avoids the greedy regex over-capturing into a later stray brace — common
// with chattier models like gemini-2.5-flash-lite.
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

// Models are asked for a `narrative` field but freely rename it (observed:
// `synthesis`, `summary`, `research_summary`, `synthesis_signals`, …). Check
// the known names first, then — only when the lane actually returned sources —
// fall back to the longest value under any narrative-hinted key so a newly
// invented name can't silently strand the narrative as empty.
const NARRATIVE_KEYS = ["narrative", "synthesis", "summary", "research_summary", "synthesis_signals", "findings", "recommended_narrative_themes"];
const NON_NARRATIVE_KEYS = new Set(["lane", "label", "topic", "date_range", "sources", "model_context", "searches_used"]);
const NARRATIVE_HINT = /(narrative|synthesis|summary|finding|analysis|takeaway|insight|signal|theme)/i;

function resolveNarrative(parsed: Record<string, unknown>, sourceCount: number): string {
  for (const key of NARRATIVE_KEYS) {
    const value = stringifyNarrative(parsed[key]);
    if (value && value.trim()) return value;
  }
  if (sourceCount === 0) return "";
  let best = "";
  for (const [key, value] of Object.entries(parsed)) {
    if (NON_NARRATIVE_KEYS.has(key) || !NARRATIVE_HINT.test(key)) continue;
    const text = (stringifyNarrative(value) ?? "").trim();
    if (text.length > best.length) best = text;
  }
  return best;
}

// Models occasionally emit invalid JSON — raw newlines/tabs inside string
// values, unescaped quotes in prose, trailing commas. Repair with the
// jsonrepair library (a tolerant parser, not regex — regex cannot reliably
// disambiguate structural quotes/newlines from content). Returns null when
// even jsonrepair gives up on the text.
function repairJson(text: string): string | null {
  try {
    return jsonrepair(text);
  } catch {
    return null;
  }
}

// Some lanes serialise `sources` as an XML-ish string (<item><title>…</item>)
// rather than a JSON array. Recover the items so a formatting slip on one lane
// doesn't strand its entire source list.
function parseXmlSourceItems(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const record: Record<string, string> = {};
    for (const name of ["title", "url", "date", "outlet", "significance"]) {
      const tag = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
      const value = tag ? tag[1].trim() : "";
      if (value) record[name] = value;
    }
    if (Object.keys(record).length) items.push(record);
  }
  return items;
}

// String-aware extraction of a `"key": [ ... ]` array value. Used to salvage
// the sources array when the enclosing object is unparseable (typically an
// unescaped quote in a prose field) but the array itself is valid JSON.
function extractArrayValue(text: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
  if (!m) return null;
  const start = text.indexOf("[", m.index);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

const LANE_STOP_KEYS = ["lane", "label", "sources", "narrative", "model_context", "searches_used"];

// Lenient extraction of a string field's prose, tolerant of unescaped quotes in
// the value (which defeat JSON.parse). The value's end is anchored on the next
// known key rather than on a closing quote that may be ambiguous. Spurious
// mid-sentence newlines are collapsed to spaces; a break is treated as a
// paragraph only after sentence-ending punctuation before a new sentence.
function extractStringFieldLoose(text: string, key: string): string | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(text);
  if (!m) return undefined;
  const start = m.index + m[0].length;
  let end = text.length;
  for (const stop of LANE_STOP_KEYS) {
    if (stop === key) continue;
    const anchor = new RegExp(`"${stop}"\\s*:`).exec(text.slice(start));
    if (anchor) end = Math.min(end, start + anchor.index);
  }
  let raw = text.slice(start, end).replace(/[\s"\],}]+$/, "");
  raw = raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\//g, "/").replace(/\\\\/g, "\\");
  raw = raw.replace(/\s*\n\s*([.,;:])/g, "$1");
  const segs = raw.split(/[ \t]*\n[ \t]*/).map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return undefined;
  let out = segs[0];
  for (const seg of segs.slice(1)) {
    out += /[.!?:]$/.test(out) && /^["“A-Z]/.test(seg) ? `\n\n${seg}` : ` ${seg}`;
  }
  return out;
}

export function parseLaneResponse(rawText: string): { sources: SourceItem[]; narrative: string; model_context?: string; parseMode: LaneParseMode } | null {
  // Strip ```json / ``` fences some models wrap the object in.
  const unfenced = rawText.replace(/```(?:json)?/gi, "");
  let parsed: Record<string, unknown> | null = null;
  // Whether any repair strategy fired; distinguishes "clean" from "repaired"
  // in the recorded parseMode.
  let repaired = false;
  // 1) greedy outer-brace match (fast path, unchanged behaviour)
  // 2) balanced-brace fallback for prose-wrapped / multi-block replies
  // Each candidate is tried as-is, then through jsonrepair.
  const candidates = [unfenced.match(/\{[\s\S]*\}/)?.[0], extractBalancedObject(unfenced)];
  for (let c = 0; c < candidates.length && !parsed; c++) {
    const candidate = candidates[c];
    if (!candidate) continue;
    const variants = [candidate, repairJson(candidate)];
    for (let v = 0; v < variants.length; v++) {
      const variant = variants[v];
      if (variant === null) continue;
      try {
        parsed = JSON.parse(variant) as Record<string, unknown>;
        if (c > 0 || v > 0) repaired = true;
        break;
      } catch {
        /* try next strategy */
      }
    }
  }
  if (!parsed) {
    // Object as a whole is unparseable (commonly an unescaped quote in prose).
    // Salvage the sources array on its own, and extract the prose fields loosely
    // so a formatting slip drops neither the lane's sources nor its narrative.
    const arr = extractArrayValue(unfenced, "sources");
    if (!arr) return null;
    const repairedArr = repairJson(arr);
    if (repairedArr === null) return null;
    let salvaged: unknown[];
    try {
      salvaged = JSON.parse(repairedArr) as unknown[];
    } catch {
      return null;
    }
    return {
      sources: salvaged.map(coerceSourceItem).filter((item): item is SourceItem => item !== null),
      narrative: extractStringFieldLoose(unfenced, "narrative") ?? "",
      model_context: extractStringFieldLoose(unfenced, "model_context"),
      parseMode: "salvaged",
    };
  }
  const sourcesWereXml = typeof parsed.sources === "string" && parsed.sources.includes("<item>");
  const sourceValues = Array.isArray(parsed.sources) ? parsed.sources : sourcesWereXml ? parseXmlSourceItems(parsed.sources as string) : [];
  if (sourcesWereXml || typeof parsed.narrative !== "string") repaired = true;
  const narrative = resolveNarrative(parsed, sourceValues.length);
  return {
    sources: sourceValues.map(coerceSourceItem).filter((item): item is SourceItem => item !== null),
    narrative,
    model_context: typeof parsed.model_context === "string" ? parsed.model_context : undefined,
    parseMode: repaired ? "repaired" : "clean",
  };
}

export function fallbackLaneResult(
  lane: Lane,
  definition: LaneDefinition,
  rawText: string,
  tokensIn: number,
  tokensOut: number,
  model: string = ""
): LaneResult {
  return {
    lane,
    label: definition.label,
    sources: [],
    narrative: rawText,
    parseMode: "fallback",
    rawText,
    tokensIn,
    tokensOut,
    model,
  };
}
