import { describe, expect, it } from "vitest";
import { extractOutputText } from "../providers/openai";

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
