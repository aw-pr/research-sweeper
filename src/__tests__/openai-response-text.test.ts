import { describe, expect, it } from "vitest";
import { extractOpenAIUsage, extractOutputText } from "../providers/openai";

describe("extractOutputText", () => {
  it("uses the SDK output_text convenience property when present", () => {
    expect(extractOutputText({ output_text: "SDK text" } as never)).toBe("SDK text");
  });

  it("reconstructs text from deserialised Responses API batch output", () => {
    const response = {
      output: [
        { type: "web_search_call", id: "search_1" },
        {
          type: "message",
          content: [
            { type: "output_text", text: "{\"sources\":[" },
            { type: "output_text", text: "],\"narrative\":\"Recovered\"}" },
          ],
        },
      ],
    };

    expect(extractOutputText(response as never)).toBe('{"sources":[],"narrative":"Recovered"}');
  });
});

describe("extractOpenAIUsage", () => {
  it("preserves reported zero cache usage while omitting unavailable cache fields", () => {
    expect(extractOpenAIUsage({ usage: { input_tokens: 10, output_tokens: 3, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } } })).toEqual({
      tokensIn: 10,
      tokensOut: 3,
      reasoningOut: 0,
      openaiCachedIn: 0,
      openaiCacheWriteIn: 0,
    });
    expect(extractOpenAIUsage({ usage: { input_tokens: 10, output_tokens: 3 } })).toEqual({ tokensIn: 10, tokensOut: 3, reasoningOut: 0 });
  });
});
