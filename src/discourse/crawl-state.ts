import type { SyncProgress } from "./sync";

export type CrawlState = {
  nextPage: number;
  discoveredTopics?: number;
  publishedTopics?: number;
  publishedObjects?: number;
  skippedTopics?: number;
  oldestPostAt?: string;
  newestPostAt?: string;
};

/** KVS key for one connection's crawl state. */
export function crawlStateKey(connectionId: string): string {
  return `crawlState:${connectionId}`;
}

export function pageToCrawl(stored: CrawlState | undefined): number {
  return stored?.nextPage ?? 0;
}

export function advance(
  stored: CrawlState | undefined,
  progress: SyncProgress,
): CrawlState {
  const timestamps = [
    stored?.oldestPostAt,
    stored?.newestPostAt,
    progress.oldestPostAt,
    progress.newestPostAt,
  ]
    .filter((value): value is string => typeof value === "string")
    .sort();
  const [oldestPostAt] = timestamps;
  const newestPostAt = timestamps.at(-1);
  const cumulativeProgress = {
    discoveredTopics:
      (stored?.discoveredTopics ?? 0) + progress.discoveredTopics,
    publishedTopics: (stored?.publishedTopics ?? 0) + progress.publishedTopics,
    publishedObjects:
      (stored?.publishedObjects ?? 0) + progress.publishedObjects,
    skippedTopics: (stored?.skippedTopics ?? 0) + progress.skippedTopics,
    ...(oldestPostAt && newestPostAt ? { oldestPostAt, newestPostAt } : {}),
  };

  return progress.hasMore
    ? { nextPage: (stored?.nextPage ?? 0) + 1, ...cumulativeProgress }
    : { nextPage: 0 };
}
