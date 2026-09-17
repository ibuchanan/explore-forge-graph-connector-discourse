import { describe, expect, it, vi } from "vitest";

const { createDiscourseClient, get } = vi.hoisted(() => {
  const get = vi.fn();

  return {
    createDiscourseClient: vi.fn(() => ({ GET: get })),
    get,
  };
});

vi.mock("../src/discourse", () => ({ createDiscourseClient }));

import { onConnectionChange } from "../src/index";

describe("onConnectionChange", () => {
  it("rejects a malformed connector event", async () => {
    await expect(
      onConnectionChange({ action: "CREATED" }),
    ).resolves.toMatchObject({
      success: false,
      error: { status: 400 },
    });
  });

  it("probes Discourse when a connection is created", async () => {
    get.mockResolvedValue({ data: { site: {} } });

    await expect(
      onConnectionChange({ action: "CREATED", connectionId: "connection-123" }),
    ).resolves.toEqual({ success: true });

    expect(createDiscourseClient).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith("/site.json");
  });

  it("returns an unavailable response when Discourse rejects the probe", async () => {
    get.mockResolvedValue({ error: { errors: ["unavailable"] } });

    await expect(
      onConnectionChange({ action: "CREATED", connectionId: "connection-123" }),
    ).resolves.toMatchObject({ success: false, error: { status: 502 } });
  });
});
