import { describe, expect, it } from "vitest";

import { summarizeRejection } from "../src/discourse/ingestion-rejection";

describe("summarizeRejection", () => {
  it("summarizes a single rejection with its trace ID", () => {
    expect(
      summarizeRejection({
        success: false,
        originalError: {
          rejected: [
            {
              errors: [{ key: "conversationData.schemaVersion.invalid" }],
            },
          ],
          traceId: "trace-123",
        },
      }),
    ).toBe(
      "Could not publish 1 Discourse objects (conversationData.schemaVersion.invalid × 1) (Trace ID: trace-123)",
    );
  });

  it("groups rejection errors by key", () => {
    expect(
      summarizeRejection({
        success: false,
        originalError: {
          rejected: [
            { errors: [{ key: "invalid" }] },
            { errors: [{ key: "invalid" }] },
            { errors: [{ key: "invalid" }] },
          ],
        },
      }),
    ).toBe("Could not publish 3 Discourse objects (invalid × 3)");
  });

  it("lists at most five error keys", () => {
    expect(
      summarizeRejection({
        success: false,
        originalError: {
          rejected: [
            { errors: [{ key: "one" }] },
            { errors: [{ key: "two" }] },
            { errors: [{ key: "three" }] },
            { errors: [{ key: "four" }] },
            { errors: [{ key: "five" }] },
            { errors: [{ key: "six" }] },
            { errors: [{ key: "seven" }] },
          ],
        },
      }),
    ).toBe(
      "Could not publish 7 Discourse objects (one × 1, two × 1, three × 1, four × 1, five × 1, +2 more)",
    );
  });

  it("omits the trace clause when absent", () => {
    expect(
      summarizeRejection({
        success: false,
        originalError: { rejected: [{ errors: [{ key: "invalid" }] }] },
      }),
    ).toBe("Could not publish 1 Discourse objects (invalid × 1)");
  });

  it("falls back when structured rejection details are absent or malformed", () => {
    expect(summarizeRejection({ success: false })).toBe(
      "Could not publish Discourse topics",
    );
    expect(
      summarizeRejection({ success: false, originalError: { rejected: {} } }),
    ).toBe("Could not publish Discourse topics");
  });
});
