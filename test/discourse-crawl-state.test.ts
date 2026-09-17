import { describe, expect, it } from "vitest";

import {
  advance,
  crawlStateKey,
  pageToCrawl,
} from "../src/discourse/crawl-state";

describe("advance", () => {
  it("starts a crawl with the page totals and next page", () => {
    expect(
      advance(undefined, {
        discoveredTopics: 2,
        publishedTopics: 1,
        publishedObjects: 3,
        skippedTopics: 1,
        oldestPostAt: "2026-09-16T10:00:00.000Z",
        newestPostAt: "2026-09-16T12:00:00.000Z",
        hasMore: true,
      }),
    ).toEqual({
      nextPage: 1,
      discoveredTopics: 2,
      publishedTopics: 1,
      publishedObjects: 3,
      skippedTopics: 1,
      oldestPostAt: "2026-09-16T10:00:00.000Z",
      newestPostAt: "2026-09-16T12:00:00.000Z",
    });
  });

  it("accumulates a subsequent page and widens its temporal window", () => {
    expect(
      advance(
        {
          nextPage: 1,
          discoveredTopics: 2,
          publishedTopics: 1,
          publishedObjects: 3,
          skippedTopics: 1,
          oldestPostAt: "2026-09-16T10:00:00.000Z",
          newestPostAt: "2026-09-16T12:00:00.000Z",
        },
        {
          discoveredTopics: 4,
          publishedTopics: 3,
          publishedObjects: 7,
          skippedTopics: 1,
          oldestPostAt: "2026-09-16T08:00:00.000Z",
          newestPostAt: "2026-09-16T14:00:00.000Z",
          hasMore: true,
        },
      ),
    ).toEqual({
      nextPage: 2,
      discoveredTopics: 6,
      publishedTopics: 4,
      publishedObjects: 10,
      skippedTopics: 2,
      oldestPostAt: "2026-09-16T08:00:00.000Z",
      newestPostAt: "2026-09-16T14:00:00.000Z",
    });
  });

  it("keeps the stored temporal window when a page has no posts", () => {
    expect(
      advance(
        {
          nextPage: 2,
          oldestPostAt: "2026-09-16T08:00:00.000Z",
          newestPostAt: "2026-09-16T14:00:00.000Z",
        },
        {
          discoveredTopics: 0,
          publishedTopics: 0,
          publishedObjects: 0,
          skippedTopics: 0,
          hasMore: true,
        },
      ),
    ).toMatchObject({
      nextPage: 3,
      oldestPostAt: "2026-09-16T08:00:00.000Z",
      newestPostAt: "2026-09-16T14:00:00.000Z",
    });
  });

  it("resets the crawl state when the final page completes", () => {
    expect(
      advance(
        { nextPage: 3, discoveredTopics: 10 },
        {
          discoveredTopics: 2,
          publishedTopics: 2,
          publishedObjects: 4,
          skippedTopics: 0,
          hasMore: false,
        },
      ),
    ).toEqual({ nextPage: 0 });
  });
});

describe("pageToCrawl", () => {
  it("returns the first page when no crawl state exists", () => {
    expect(pageToCrawl(undefined)).toBe(0);
  });

  it("returns the stored next page", () => {
    expect(pageToCrawl({ nextPage: 3 })).toBe(3);
  });
});

describe("crawlStateKey", () => {
  it("isolates state by connection", () => {
    expect(crawlStateKey("connection-123")).toBe("crawlState:connection-123");
  });
});
