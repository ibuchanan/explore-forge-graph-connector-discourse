import { err, ok, problemDetails } from "@forge-ahead/errors";
import { expectErr, expectOk } from "@forge-ahead/errors/testing";
import { describe, expect, it, vi } from "vitest";

import type { Topic } from "../src/discourse/map-topic";
import { syncTopics } from "../src/discourse/sync";

const topic: Topic = {
  id: 123,
  title: "Topic title",
  slug: "topic-title",
  created_at: "2026-09-16T10:00:00.000Z",
  last_posted_at: "2026-09-16T10:00:00.000Z",
  closed: false,
  posts: [
    {
      id: 456,
      post_number: 1,
      username: "ada",
      cooked: "<p>Hello.</p>",
      created_at: "2026-09-16T10:00:00.000Z",
      updated_at: "2026-09-16T10:00:00.000Z",
      version: 1,
    },
  ],
};

const sync = (source: Parameters<typeof syncTopics>[0]["source"]) =>
  syncTopics({
    source,
    publish: vi.fn(async () => ok(undefined)),
    connectionId: "connection-123",
    baseUrl: "https://community.example.com/",
    page: 2,
  });

describe("syncTopics", () => {
  it("fetches one topic page and publishes its topics and posts as one batch", async () => {
    const source = {
      listLatestTopics: vi.fn(async () => ok({ ids: [123], hasMore: true })),
      getTopic: vi.fn(async () => ok(topic)),
    };
    const publish = vi.fn(async () => ok(undefined));

    expect(
      expectOk(
        await syncTopics({
          source,
          publish,
          connectionId: "connection-123",
          baseUrl: "https://community.example.com/",
          page: 2,
        }),
      ),
    ).toMatchObject({
      discoveredTopics: 1,
      publishedTopics: 1,
      publishedObjects: 2,
      oldestPostAt: "2026-09-16T10:00:00.000Z",
      newestPostAt: "2026-09-16T10:00:00.000Z",
      hasMore: true,
    });
    expect(source.listLatestTopics).toHaveBeenCalledWith(2);
    expect(source.getTopic).toHaveBeenCalledWith(123);
    expect(publish).toHaveBeenCalledWith("connection-123", [
      expect.objectContaining({ id: "topic:123" }),
      expect.objectContaining({ id: "post:456" }),
    ]);
  });

  it("splits more than 100 objects into permitted bulk ingestion batches", async () => {
    const topics = Array.from({ length: 51 }, (_, index) => ({
      ...topic,
      id: index + 1,
      posts: [{ ...topic.posts[0], id: index + 1 }],
    }));
    const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
    const source = {
      listLatestTopics: vi.fn(async () =>
        ok({ ids: topics.map(({ id }) => id), hasMore: false }),
      ),
      getTopic: vi.fn(async (id: number) => ok(topicsById.get(id) ?? topic)),
    };
    const publish = vi.fn(async () => ok(undefined));

    expect(
      expectOk(
        await syncTopics({
          source,
          publish,
          connectionId: "connection-123",
          baseUrl: "https://community.example.com/",
          page: 2,
        }),
      ),
    ).toMatchObject({ publishedObjects: 102 });
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls.map(([, objects]) => objects)).toEqual([
      expect.arrayContaining([expect.objectContaining({ id: "topic:1" })]),
      expect.arrayContaining([expect.objectContaining({ id: "post:51" })]),
    ]);
    expect(publish.mock.calls.map(([, objects]) => objects.length)).toEqual([
      100, 2,
    ]);
  });

  it("skips a failed topic and completes the rest of the page", async () => {
    const source = {
      listLatestTopics: vi.fn(async () =>
        ok({ ids: [123, 124], hasMore: false }),
      ),
      getTopic: vi.fn(async (id: number) =>
        id === 123
          ? ok(topic)
          : err(problemDetails(502, "upstream unavailable")),
      ),
    };

    expect(expectOk(await sync(source))).toMatchObject({
      discoveredTopics: 2,
      publishedTopics: 1,
      skippedTopics: 1,
      hasMore: false,
    });
  });

  it("stops on rate limiting so the page can be retried", async () => {
    const source = {
      listLatestTopics: vi.fn(async () => ok({ ids: [123], hasMore: true })),
      getTopic: vi.fn(async () => err(problemDetails(429, "rate limited"))),
    };

    expect(expectErr(await sync(source))).toMatchObject({ status: 429 });
  });
});
