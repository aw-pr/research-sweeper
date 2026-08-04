import * as fs from "fs";
import * as path from "path";

export interface ParsedBrief {
  briefFile: string;
  title?: string;
  topic?: string;
  briefing?: string;
  laneDirective?: string;
  synthesisDirective?: string;
  ignoredSections: string[];
}

// Read headings reach a model; everything else in a brief file does not. These
// are the headings that are meant to be human-facing, so they stay quiet.
// Anything else is reported, because a directive placed under its own heading
// looks correct and does nothing.
//
// "Lane directive" and "Synthesis directive" are free-form: whatever role,
// audience, or output contract the brief author writes is passed through
// verbatim to the six lane agents and to the synthesis pass respectively.
const READ_HEADINGS = [/^topic string/i, /^sub-questions/i, /^lane directive/i, /^synthesis directive/i];
const HUMAN_FACING_HEADINGS = [
  /^suggested command/i,
  /^notes\b/i,
  /^depth guide/i,
  /^date anchor guide/i,
  /^research brief/i,
  // Bookkeeping between related briefs, deliberately for the author only.
  /^distinction from sister brief/i,
];

export function findIgnoredSections(markdown: string): string[] {
  const headings = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => match[1]);
  return headings.filter((heading) => {
    const known = [...READ_HEADINGS, ...HUMAN_FACING_HEADINGS];
    return !known.some((pattern) => pattern.test(heading));
  });
}

function extractSection(markdown: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(markdown);
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.match(/\n##\s+/);
  const body = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  return body.trim();
}

function extractTopic(section: string): string {
  const fenced = section.match(/```(?:[\w-]+)?\n([\s\S]*?)\n```/);
  if (fenced) return fenced[1].trim();
  return section.trim();
}

function normalizeBriefing(section: string): string {
  const lines = section.split("\n");
  const firstStructuredLine = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("- ") || trimmed.startsWith("**") || /^\d+\.\s/.test(trimmed) || trimmed.startsWith("### ");
  });
  if (firstStructuredLine === -1) return section.trim();
  return lines.slice(firstStructuredLine).join("\n").trim();
}

function extractTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+Research Brief:\s*(.+)$/m);
  return match ? match[1].trim() : undefined;
}

export function parseBriefFile(filePath: string): ParsedBrief {
  const resolved = path.resolve(filePath);
  const markdown = fs.readFileSync(resolved, "utf-8");
  const topicSection = extractSection(markdown, /^##\s+Topic string.*$/m);
  const subQuestionSection = extractSection(markdown, /^##\s+Sub-questions.*$/m);
  const laneDirective = extractSection(markdown, /^##\s+Lane directive.*$/m);
  const synthesisDirective = extractSection(markdown, /^##\s+Synthesis directive.*$/m);
  const topic = extractTopic(topicSection);

  return {
    briefFile: resolved,
    title: extractTitle(markdown),
    topic: topic || undefined,
    briefing: subQuestionSection ? normalizeBriefing(subQuestionSection) : undefined,
    laneDirective: laneDirective || undefined,
    synthesisDirective: synthesisDirective || undefined,
    ignoredSections: findIgnoredSections(markdown),
  };
}

export function warnOnIgnoredSections(brief: ParsedBrief): void {
  if (brief.ignoredSections.length === 0) return;
  console.warn(
    `\n  Warning: ${brief.ignoredSections.length} section(s) in this brief are not read by the sweep and will not reach any model:`
  );
  for (const heading of brief.ignoredSections) console.warn(`    - ## ${heading}`);
  console.warn(
    `  Passed through: "## Topic string", "## Sub-questions", "## Lane directive" (to the lane agents), "## Synthesis directive" (to the synthesis pass). Move directives into one of those.\n`
  );
}
