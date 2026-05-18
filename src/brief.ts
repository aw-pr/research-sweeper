import * as fs from "fs";
import * as path from "path";

export interface ParsedBrief {
  briefFile: string;
  title?: string;
  topic?: string;
  briefing?: string;
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
  const topic = extractTopic(topicSection);

  return {
    briefFile: resolved,
    title: extractTitle(markdown),
    topic: topic || undefined,
    briefing: subQuestionSection ? normalizeBriefing(subQuestionSection) : undefined,
  };
}
