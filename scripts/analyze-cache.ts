#!/usr/bin/env npx ts-node
/**
 * Compute the cached vs uncached cost counterfactual for the most recent N
 * Claude batch runs and emit an SVG bar chart + a markdown summary table.
 *
 * Usage:
 *   npx ts-node scripts/analyze-cache.ts [--last N] [--out docs/cache-experiment]
 */
import * as fs from "fs";
import * as path from "path";
import type { RunStats } from "../src/types";

const SONNET_IN_PER_M = 3;
const SONNET_OUT_PER_M = 15;
const OPUS_IN_PER_M = 15;
const OPUS_OUT_PER_M = 75;
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.10;
const BATCH_DISCOUNT = 0.5;

interface Row {
  label: string;
  depth: string;
  lanes: number;
  cacheCreateIn: number;
  cacheReadIn: number;
  actualCost: number;
  uncachedCost: number;
  saved: number;
  savedPct: number;
}

function lastN(stats: RunStats[], n: number): RunStats[] {
  return stats.filter((s) => s.provider === "claude").slice(-n);
}

function shortLabel(topic: string): string {
  const head = topic.split(/[,—]| from /)[0].trim();
  return head.length > 32 ? head.slice(0, 32) + "…" : head;
}

function analyze(stats: RunStats): Row {
  const t = stats.tokens;
  const create = t.cacheCreateIn ?? 0;
  const read = t.cacheReadIn ?? 0;
  const discount = stats.mode === "batch" ? BATCH_DISCOUNT : 1;
  const savedPerToken = SONNET_IN_PER_M * (read * (1 - CACHE_READ_MULT) - create * (CACHE_WRITE_MULT - 1)) / 1e6 * discount;
  const saved = Math.max(savedPerToken, 0);
  const actualCost = stats.estimatedCostUSD ?? 0;
  const uncachedCost = actualCost + saved;
  return {
    label: shortLabel(stats.topic),
    depth: stats.depth ?? "?",
    lanes: stats.lanes.length,
    cacheCreateIn: create,
    cacheReadIn: read,
    actualCost,
    uncachedCost,
    saved,
    savedPct: uncachedCost > 0 ? (saved / uncachedCost) * 100 : 0,
  };
}

function renderSvg(rows: Row[]): string {
  const W = 880;
  const H = 520;
  const margin = { top: 60, right: 200, bottom: 90, left: 70 };
  const chartW = W - margin.left - margin.right;
  const chartH = H - margin.top - margin.bottom;
  const maxCost = Math.max(...rows.map((r) => r.uncachedCost)) * 1.15;
  const groupW = chartW / rows.length;
  const barW = Math.min(40, groupW / 3);

  const yScale = (v: number) => margin.top + chartH - (v / maxCost) * chartH;

  const yTicks = 6;
  const tickStep = maxCost / yTicks;
  const gridLines: string[] = [];
  const tickLabels: string[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = i * tickStep;
    const y = yScale(v);
    gridLines.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + chartW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
    tickLabels.push(`<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#374151">$${v.toFixed(2)}</text>`);
  }

  const bars: string[] = [];
  rows.forEach((r, i) => {
    const cx = margin.left + groupW * i + groupW / 2;
    const xCached = cx - barW - 4;
    const xUncached = cx + 4;
    const yCached = yScale(r.actualCost);
    const yUncached = yScale(r.uncachedCost);
    const hCached = margin.top + chartH - yCached;
    const hUncached = margin.top + chartH - yUncached;

    bars.push(
      `<rect x="${xUncached}" y="${yUncached}" width="${barW}" height="${hUncached}" fill="#9ca3af" rx="2"/>`,
      `<rect x="${xCached}" y="${yCached}" width="${barW}" height="${hCached}" fill="#10b981" rx="2"/>`,
      `<text x="${xCached + barW / 2}" y="${yCached - 6}" text-anchor="middle" font-size="11" fill="#065f46" font-weight="600">$${r.actualCost.toFixed(2)}</text>`,
      `<text x="${xUncached + barW / 2}" y="${yUncached - 6}" text-anchor="middle" font-size="11" fill="#374151">$${r.uncachedCost.toFixed(2)}</text>`,
      `<text x="${cx}" y="${margin.top + chartH + 18}" text-anchor="middle" font-size="11" fill="#111827">${r.label}</text>`,
      `<text x="${cx}" y="${margin.top + chartH + 34}" text-anchor="middle" font-size="10" fill="#6b7280">${r.lanes}× ${r.depth}</text>`,
      `<text x="${cx}" y="${margin.top + chartH + 50}" text-anchor="middle" font-size="11" fill="#047857" font-weight="600">−${r.savedPct.toFixed(0)}%</text>`,
    );
  });

  const totalActual = rows.reduce((s, r) => s + r.actualCost, 0);
  const totalUncached = rows.reduce((s, r) => s + r.uncachedCost, 0);
  const totalSavedPct = ((totalUncached - totalActual) / totalUncached) * 100;

  const legendX = margin.left + chartW + 30;
  const legend = `
    <g font-size="12" fill="#111827">
      <rect x="${legendX}" y="${margin.top}" width="14" height="14" fill="#10b981" rx="2"/>
      <text x="${legendX + 22}" y="${margin.top + 12}">with caching (actual)</text>
      <rect x="${legendX}" y="${margin.top + 24}" width="14" height="14" fill="#9ca3af" rx="2"/>
      <text x="${legendX + 22}" y="${margin.top + 36}">no caching (counterfactual)</text>
      <text x="${legendX}" y="${margin.top + 78}" font-size="11" fill="#6b7280">Totals:</text>
      <text x="${legendX}" y="${margin.top + 96}" font-size="13" font-weight="600">actual $${totalActual.toFixed(2)}</text>
      <text x="${legendX}" y="${margin.top + 114}" font-size="13" fill="#6b7280">no-cache $${totalUncached.toFixed(2)}</text>
      <text x="${legendX}" y="${margin.top + 138}" font-size="14" fill="#047857" font-weight="700">saved $${(totalUncached - totalActual).toFixed(2)} (${totalSavedPct.toFixed(0)}%)</text>
    </g>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, -apple-system, sans-serif">
    <rect width="${W}" height="${H}" fill="white"/>
    <text x="${margin.left}" y="28" font-size="16" font-weight="700" fill="#111827">Prompt caching: actual vs counterfactual cost per sweep</text>
    <text x="${margin.left}" y="46" font-size="12" fill="#6b7280">Four Claude Sonnet batch sweeps after pass 5 caching fix · runs/stats.json</text>
    ${gridLines.join("\n    ")}
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartH}" stroke="#374151" stroke-width="1"/>
    <line x1="${margin.left}" y1="${margin.top + chartH}" x2="${margin.left + chartW}" y2="${margin.top + chartH}" stroke="#374151" stroke-width="1"/>
    ${tickLabels.join("\n    ")}
    <text transform="translate(20 ${margin.top + chartH / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#374151">Cost per sweep (USD, batch pricing)</text>
    ${bars.join("\n    ")}
    ${legend}
  </svg>`;
}

function renderMarkdown(rows: Row[]): string {
  const total = (k: keyof Row) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const totalActual = total("actualCost");
  const totalUncached = total("uncachedCost");
  const totalSaved = total("saved");
  const lines: string[] = [];
  lines.push("# Prompt-caching experiment results");
  lines.push("");
  lines.push("Generated by `scripts/analyze-cache.ts` against the last four Claude batch sweeps in `runs/stats.json`.");
  lines.push("");
  lines.push("## Per-sweep results");
  lines.push("");
  lines.push("| Sweep | Lanes | Depth | Cache create | Cache read | Read/write | Actual $ | No-cache $ | Saved | Saved % |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const ratio = r.cacheCreateIn > 0 ? (r.cacheReadIn / r.cacheCreateIn).toFixed(2) : "–";
    lines.push(
      `| ${r.label} | ${r.lanes} | ${r.depth} | ${r.cacheCreateIn.toLocaleString()} | ${r.cacheReadIn.toLocaleString()} | ${ratio}× | $${r.actualCost.toFixed(2)} | $${r.uncachedCost.toFixed(2)} | $${r.saved.toFixed(2)} | ${r.savedPct.toFixed(0)}% |`,
    );
  }
  lines.push(`| **Totals** | | | | | | **$${totalActual.toFixed(2)}** | **$${totalUncached.toFixed(2)}** | **$${totalSaved.toFixed(2)}** | **${((totalSaved / totalUncached) * 100).toFixed(0)}%** |`);
  lines.push("");
  lines.push("## Pricing assumptions");
  lines.push("");
  lines.push("- Sonnet input $3 / MTok, output $15 / MTok");
  lines.push("- Cache write 1.25× input, cache read 0.10× input");
  lines.push("- Batch discount 0.5× on everything");
  lines.push("- Synthesis cost is identical between cached and counterfactual columns (only lane prompts are cached)");
  lines.push("");
  lines.push("## Chart");
  lines.push("");
  lines.push("![Cache experiment](./cache-experiment.svg)");
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const last = args.includes("--last") ? Number(args[args.indexOf("--last") + 1]) : 4;
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "docs/cache-experiment";

  const statsPath = path.join(process.cwd(), "runs", "stats.json");
  const stats: RunStats[] = JSON.parse(fs.readFileSync(statsPath, "utf8"));
  const rows = lastN(stats, last).map(analyze);
  if (rows.length === 0) {
    console.error("No Claude runs found in runs/stats.json");
    process.exit(1);
  }

  const svg = renderSvg(rows);
  const md = renderMarkdown(rows);
  const outDir = path.dirname(path.join(process.cwd(), out));
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), `${out}.svg`), svg);
  fs.writeFileSync(path.join(process.cwd(), `${out}.md`), md);
  console.log(`Wrote ${out}.svg and ${out}.md (${rows.length} rows)`);
}

main();
