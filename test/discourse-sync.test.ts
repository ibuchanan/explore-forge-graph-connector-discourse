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

describe("syncTopics", () => {
  it("fetches each discovered topic and publishes its conversation and messages as one batch", async () => {
    const source = {
      listLatestTopics: vi.fn(async () => [123]),
      getTopic: vi.fn(async () => topic),
    };
    const publish = vi.fn(async () => undefined);

    await syncTopics({
      source,
      publish,
      connectionId: "connection-123",
      baseUrl: "https://community.example.com/",
    });

    expect(source.getTopic).toHaveBeenCalledWith(123);
    expect(publish).toHaveBeenCalledWith("connection-123", [
      expect.objectContaining({ id: "topic:123" }),
      expect.objectContaining({ id: "post:456" }),
    ]);
  });
});
