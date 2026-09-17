import { expectErr, expectOk } from "@forge-ahead/errors/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetch, log } = vi.hoisted(() => ({
  fetch: vi.fn<typeof globalThis.fetch>(),
  log: { warn: vi.fn() },
}));

vi.mock("@forge/api", () => ({ fetch }));
vi.mock("@forge-ahead/logging", () => ({ log }));

import {
  createDiscourseClient,
  createDiscourseTopicSource,
  discourseBaseUrl,
} from "../src/discourse";

const topicSource = (GET: ReturnType<typeof vi.fn>) =>
  createDiscourseTopicSource({ GET } as unknown as Parameters<
    typeof createDiscourseTopicSource
  >[0]);

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

describe("createDiscourseTopicSource", () => {
  afterEach(() => {
    log.warn.mockReset();
  });

  it("projects numeric topic IDs and the next-page signal", async () => {
    const GET = vi.fn(async () => ({
      data: {
        topic_list: {
          topics: [{ id: 1 }, { id: "not-a-number" }, { id: 3 }],
          more_topics_url: "/latest?page=2",
        },
      },
    }));

    expect(expectOk(await topicSource(GET).listLatestTopics(1))).toEqual({
      ids: [1, 3],
      hasMore: true,
    });
  });

  it("reports no next page when Discourse omits more_topics_url", async () => {
    const GET = vi.fn(async () => ({
      data: { topic_list: { topics: [] } },
    }));

    expect(expectOk(await topicSource(GET).listLatestTopics(1))).toEqual({
      ids: [],
      hasMore: false,
    });
  });

  it("projects a topic and substitutes its creation time when unposted", async () => {
    const GET = vi.fn(async () => ({
      data: {
        id: 1,
        title: "A topic",
        slug: "a-topic",
        created_at: "2026-09-16T10:00:00.000Z",
        closed: false,
        post_stream: { posts: [] },
      },
    }));

    expect(expectOk(await topicSource(GET).getTopic(1))).toEqual({
      id: 1,
      title: "A topic",
      slug: "a-topic",
      created_at: "2026-09-16T10:00:00.000Z",
      last_posted_at: "2026-09-16T10:00:00.000Z",
      closed: false,
      posts: [],
    });
  });

  it.each([
    [
      "listLatestTopics",
      () =>
        topicSource(
          vi.fn(async () => ({
            response: new Response(null, {
              status: 429,
              headers: { "retry-after": "60", "x-ratelimit-remaining": "0" },
            }),
          })),
        ).listLatestTopics(1),
    ],
    [
      "getTopic",
      () =>
        topicSource(
          vi.fn(async () => ({
            response: new Response(null, {
              status: 429,
              headers: { "retry-after": "60", "x-ratelimit-remaining": "0" },
            }),
          })),
        ).getTopic(1),
    ],
  ])(
    "returns rate-limited errors and diagnostic headers from %s",
    async (_, request) => {
      expect(expectErr(await request())).toMatchObject({ status: 429 });
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ retryAfter: "60", rateLimitRemaining: "0" }),
        "Discourse rate limit reached",
      );
    },
  );

  it.each([
    [
      "upstream error",
      {
        error: { message: "bad gateway" },
        response: new Response(null, { status: 502 }),
      },
    ],
    [
      "missing listing payload",
      {
        data: { topic_list: {} },
        response: new Response(null, { status: 200 }),
      },
    ],
  ])("returns unavailable when %s", async (_, result) => {
    expect(
      expectErr(
        await topicSource(vi.fn(async () => result)).listLatestTopics(1),
      ),
    ).toMatchObject({ status: 502 });
  });
});
