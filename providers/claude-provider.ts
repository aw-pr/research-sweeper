import Anthropic from "@anthropic-ai/sdk";
import {
  ProviderBatchRequestItem,
  ProviderBatchResultItem,
  ProviderBatchStatus,
  ProviderMessageRequest,
  ProviderMessageResponse,
  ResearchProvider,
} from "./provider-types";

export class ClaudeProvider implements ResearchProvider {
  readonly name = "claude";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async createMessage(request: ProviderMessageRequest): Promise<ProviderMessageResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      system: request.system,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: (request.tools || []) as any,
      messages: request.messages,
    });

    const textBlocks = response.content.filter((b) => b.type === "text");
    const contentText = textBlocks.map((b) => (b as { type: "text"; text: string }).text).join("\n");
    return {
      contentText,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  }

  async createBatch(requests: ProviderBatchRequestItem[]): Promise<{ id: string }> {
    const payload = requests.map((r) => ({
      custom_id: r.customId,
      params: {
        model: r.params.model,
        max_tokens: r.params.maxTokens,
        system: r.params.system,
        tools: r.params.tools || [],
        messages: r.params.messages,
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batch = await (this.client.messages.batches as any).create({ requests: payload });
    return { id: batch.id };
  }

  async retrieveBatch(batchId: string): Promise<ProviderBatchStatus> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batch = await (this.client.messages.batches as any).retrieve(batchId);
    return {
      status: batch.processing_status,
      counts: {
        processing: batch.request_counts.processing,
        succeeded: batch.request_counts.succeeded,
        errored: batch.request_counts.errored,
      },
    };
  }

  async *iterateBatchResults(batchId: string): AsyncIterable<ProviderBatchResultItem> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const item of await (this.client.messages.batches as any).results(batchId)) {
      if (item.result.type !== "succeeded") {
        yield { customId: item.custom_id, type: item.result.type };
        continue;
      }

      const message = item.result.message;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textBlocks = message.content.filter((b: any) => b.type === "text");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentText = textBlocks.map((b: any) => b.text).join("\n");

      yield {
        customId: item.custom_id,
        type: "succeeded",
        message: {
          contentText,
          tokensIn: message.usage.input_tokens,
          tokensOut: message.usage.output_tokens,
        },
      };
    }
  }
}

