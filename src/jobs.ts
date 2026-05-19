import * as fs from "fs";
import * as path from "path";
import { SweepJob } from "./types";

export function jobsDir(): string {
  return path.join(__dirname, "..", "jobs");
}

// Batch ids are not all filename-safe: Gemini ids are like
// "batches/w4ffv9..." (contain "/"), unlike Anthropic/OpenAI ids. The real id
// is always preserved inside the JSON (`job.batchId`); only the filename is
// sanitised. Enumerators must read `job.batchId`, never the filename.
function jobFileName(batchId: string): string {
  return `${batchId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
}

export function saveJob(job: SweepJob): string {
  const dir = jobsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, jobFileName(job.batchId));
  fs.writeFileSync(filePath, JSON.stringify(job, null, 2), "utf-8");
  return filePath;
}

export function loadJob(batchId: string): SweepJob {
  const filePath = path.join(jobsDir(), jobFileName(batchId));
  if (!fs.existsSync(filePath)) {
    throw new Error(`No job file found for batch ID: ${batchId}\nExpected: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SweepJob;
  return {
    ...parsed,
    provider: parsed.provider || "claude",
    config: {
      ...parsed.config,
      provider: parsed.config?.provider || parsed.provider || "claude",
    },
  };
}

export function deleteJob(batchId: string): void {
  fs.unlinkSync(path.join(jobsDir(), jobFileName(batchId)));
}
