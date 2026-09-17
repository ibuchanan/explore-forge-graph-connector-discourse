import { expectErr, expectOk } from "@forge-ahead/errors/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetch } = vi.hoisted(() => ({
  fetch: vi.fn<typeof globalThis.fetch>(),
}));

vi.mock("@forge/api", () => ({ fetch }));

import { createDiscourseClient, discourseBaseUrl } from "../src/discourse";

describe("discourseBaseUrl", () => {
  const originalBaseUrl = process.env.DISCOURSE_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.DISCOURSE_BASE_URL;
    } else {
      process.env.DISCOURSE_BASE_URL = originalBaseUrl;
    }
  });

  it("reads and normalizes the configured base URL", () => {
    process.env.DISCOURSE_BASE_URL = "https://community.example.com/";

    expect(expectOk(discourseBaseUrl())).toBe("https://community.example.com/");
  });

  it("rejects a missing base URL", () => {
    delete process.env.DISCOURSE_BASE_URL;

    expect(expectErr(discourseBaseUrl())).toMatchObject({
      status: 400,
      detail: "DISCOURSE_BASE_URL must be set",
    });
  });

  it("rejects a non-HTTPS base URL", () => {
    process.env.DISCOURSE_BASE_URL = "http://community.example.com";

    expect(expectErr(discourseBaseUrl())).toMatchObject({
      status: 400,
      detail: "DISCOURSE_BASE_URL must use HTTPS",
    });
  });

  it("rejects a base URL with embedded credentials", () => {
    process.env.DISCOURSE_BASE_URL =
      "https://user:password@community.example.com";

    expect(expectErr(discourseBaseUrl())).toMatchObject({
      status: 400,
      detail: "DISCOURSE_BASE_URL must not contain credentials",
    });
  });
});

describe("createDiscourseClient", () => {
  it("sends requests through Forge fetch without authentication", async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ site: {} })));
    const client = createDiscourseClient("https://community.example.com/");

    await client.GET("/site.json");

    const request = fetch.mock.calls[0]?.[0];

    expect(request).toBeInstanceOf(Request);
    expect(request?.url).toBe("https://community.example.com/site.json");
    expect(request?.method).toBe("GET");
    expect(request?.headers.get("Api-Key")).toBeNull();
  });
});
