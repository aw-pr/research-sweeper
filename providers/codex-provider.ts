import {
  ProviderBatchRequestItem,
  ProviderBatchResultItem,
  ProviderBatchStatus,
  ProviderMessageRequest,
  ProviderMessageResponse,
  ResearchProvider,
} from "./provider-types";

export class CodexProvider implements ResearchProvider {
  readonly name = "codex";
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.openai.com/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async createMessage(request: ProviderMessageRequest): Promise<ProviderMessageResponse> {
    const payload: Record<string, unknown> = {
      model: request.model,
      max_output_tokens: request.maxTokens,
      input: request.messages.map((m) => ({
        role: m.role,
        content: [{ type: "input_text", text: m.content }],
      })),
    };
    if (request.system) payload.instructions = request.system;
    if (request.tools && request.tools.length > 0) payload.tools = this.mapTools(request.tools);

    const response = await this.requestJson("POST", "/responses", payload);
    return this.toProviderMessageResponse(response);
  }

  async createBatch(requests: ProviderBatchRequestItem[]): Promise<{ id: string }> {
    const lines = requests.map((r) => JSON.stringify({
      custom_id: r.customId,
      method: "POST",
      url: "/v1/responses",
      body: this.toResponseBody(r.params),
    })).join("\n");

    const uploadForm = new FormData();
    uploadForm.append("purpose", "batch");
    uploadForm.append("file", new Blob([`${lines}\n`], { type: "application/jsonl" }), "batch-input.jsonl");

    const file = await this.requestJson("POST", "/files", uploadForm, true);
    const batch = await this.requestJson("POST", "/batches", {
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });
    return { id: batch.id };
  }

  async retrieveBatch(batchId: string): Promise<ProviderBatchStatus> {
    const batch = await this.requestJson("GET", `/batches/${batchId}`);
    const statusRaw = String(batch.status || "unknown");
    const ended = new Set(["completed", "failed", "cancelled", "expired"]);
    const counts = batch.request_counts || {};
    const completed = Number(counts.completed || 0);
    const failed = Number(counts.failed || 0);
    const total = Number(counts.total || 0);
    const processing = Number.isFinite(total) ? Math.max(0, total - completed - failed) : 0;

    return {
      status: ended.has(statusRaw) ? "ended" : statusRaw,
      counts: {
        processing,
        succeeded: completed,
        errored: failed,
      },
    };
  }

  async *iterateBatchResults(batchId: string): AsyncIterable<ProviderBatchResultItem> {
    const batch = await this.requestJson("GET", `/batches/${batchId}`);
    const outputFileId: string | undefined = batch.output_file_id;
    const errorFileId: string | undefined = batch.error_file_id;

    if (outputFileId) {
      const content = await this.requestText("GET", `/files/${outputFileId}/content`);
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const row = JSON.parse(trimmed);
        const customId = String(row.custom_id || "");
        const body = row.response?.body;
        if (!customId || !body) continue;
        yield {
          customId,
          type: "succeeded",
          message: this.toProviderMessageResponse(body),
        };
      }
    }

    if (errorFileId) {
      const content = await this.requestText("GET", `/files/${errorFileId}/content`);
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const row = JSON.parse(trimmed);
        const customId = String(row.custom_id || "");
        if (!customId) continue;
        yield { customId, type: "errored" };
      }
    }
  }

  private toResponseBody(request: ProviderMessageRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      max_output_tokens: request.maxTokens,
      input: request.messages.map((m) => ({
        role: m.role,
        content: [{ type: "input_text", text: m.content }],
      })),
    };
    if (request.system) body.instructions = request.system;
    if (request.tools && request.tools.length > 0) body.tools = this.mapTools(request.tools);
    return body;
  }

  private mapTools(tools: unknown[]): unknown[] {
    return tools.map((tool) => {
      const t = tool as { type?: string };
      if (t.type === "web_search_20250305") return { type: "web_search_preview" };
      return tool;
    });
  }

  private toProviderMessageResponse(response: any): ProviderMessageResponse {
    return {
      contentText: this.extractText(response),
      tokensIn: Number(response?.usage?.input_tokens || 0),
      tokensOut: Number(response?.usage?.output_tokens || 0),
    };
  }

  private extractText(response: any): string {
    if (typeof response?.output_text === "string" && response.output_text.trim() !== "") {
      return response.output_text;
    }
    const output = Array.isArray(response?.output) ? response.output : [];
    const chunks: string[] = [];
    for (const item of output) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const c of content) {
        if (typeof c?.text === "string") chunks.push(c.text);
      }
    }
    return chunks.join("\n");
  }

  private async requestJson(method: string, path: string, body?: unknown, isMultipart = false): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (!isMultipart) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : (isMultipart ? body as FormData : JSON.stringify(body)),
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`OpenAI ${method} ${path} failed: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ""}`);
    }
    return await res.json();
  }

  private async requestText(method: string, path: string): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`OpenAI ${method} ${path} failed: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ""}`);
    }
    return await res.text();
  }
}
