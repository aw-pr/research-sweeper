export interface ProviderMessage {
  role: "user";
  content: string;
}

export interface ProviderMessageRequest {
  model: string;
  maxTokens: number;
  system?: string;
  tools?: unknown[];
  messages: ProviderMessage[];
}

export interface ProviderMessageResponse {
  contentText: string;
  tokensIn: number;
  tokensOut: number;
}

export interface ProviderBatchRequestItem {
  customId: string;
  params: ProviderMessageRequest;
}

export interface ProviderBatchStatus {
  status: string;
  counts: {
    processing: number;
    succeeded: number;
    errored: number;
  };
}

export interface ProviderBatchResultItem {
  customId: string;
  type: string;
  message?: ProviderMessageResponse;
}

export interface ResearchProvider {
  readonly name: string;
  createMessage(request: ProviderMessageRequest): Promise<ProviderMessageResponse>;
  createBatch(requests: ProviderBatchRequestItem[]): Promise<{ id: string }>;
  retrieveBatch(batchId: string): Promise<ProviderBatchStatus>;
  iterateBatchResults(batchId: string): AsyncIterable<ProviderBatchResultItem>;
}

