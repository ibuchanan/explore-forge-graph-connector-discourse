import { describe, expect, it } from "vitest";

import { onConnectionChange } from "../src/index";

describe("onConnectionChange", () => {
  it("rejects a malformed connector event", () => {
    expect(onConnectionChange({ action: "CREATED" })).toMatchObject({
      success: false,
      error: { status: 400 },
    });
  });
});
