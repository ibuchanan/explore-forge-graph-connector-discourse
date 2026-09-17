import type { types } from "@forge/teamwork-graph";
import { err, ok, type ProblemDetails, type Result } from "@forge-ahead/errors";
import { log } from "@forge-ahead/logging";

import { mapTopic } from "./map-topic";
import type { Topic, TopicPublisher, TopicSource } from "./topic-source";

export type SyncProgress = {
  discoveredTopics: number;
  publishedTopics: number;
  publishedObjects: number;
  skippedTopics: number;
  oldestPostAt?: string;
  newestPostAt?: string;
  hasMore: boolean;
};

function temporalCoverage(
  topics: Topic[],
): Pick<SyncProgress, "oldestPostAt" | "newestPostAt"> {
  const timestamps = topics.flatMap((topic) =>
    topic.posts.flatMap((post) => [post.created_at, post.updated_at]),
  );
  const orderedTimestamps = timestamps.sort();
  const oldestPostAt = orderedTimestamps[0];
  const newestPostAt = orderedTimestamps.at(-1);
  return oldestPostAt && newestPostAt ? { oldestPostAt, newestPostAt } : {};
}

export async function syncTopics({
  source,
  publish,
  connectionId,
  baseUrl,
  page,
}: {
  source: TopicSource;
  publish: TopicPublisher;
  connectionId: string;
  baseUrl: string;
  page: number;
}): Promise<Result<SyncProgress, ProblemDetails>> {
  log.info({ connectionId, page }, "Discourse topic pagination started");
  const latestTopics = await source.listLatestTopics(page);
  if (latestTopics.isErr()) return err(latestTopics.error);

  const topics: Topic[] = [];
  const objects: types.Object[] = [];
  const skippedTopicIds: number[] = [];
  for (const id of latestTopics.value.ids) {
    const topic = await source.getTopic(id);
    if (topic.isErr()) {
      if (topic.error.status === 429) return err(topic.error);
      skippedTopicIds.push(id);
      log.warn(
        { connectionId, page, topicId: id, status: topic.error.status },
        "Discourse topic skipped after fetch failure",
      );
      continue;
    }

    const mappedTopic = mapTopic(topic.value, baseUrl);
    if (mappedTopic.isErr()) {
      skippedTopicIds.push(id);
      log.warn(
        { connectionId, page, topicId: id, status: mappedTopic.error.status },
        "Discourse topic skipped after mapping failure",
      );
      continue;
    }
    topics.push(topic.value);
    objects.push(...mappedTopic.value);
  }
  for (let start = 0; start < objects.length; start += 100) {
    const published = await publish(
      connectionId,
      objects.slice(start, start + 100),
    );
    if (published.isErr()) return err(published.error);
  }

  const progress: SyncProgress = {
    discoveredTopics: latestTopics.value.ids.length,
    publishedTopics: topics.length,
    publishedObjects: objects.length,
    skippedTopics: skippedTopicIds.length,
    hasMore: latestTopics.value.hasMore,
    ...temporalCoverage(topics),
  };
  log.info(
    {
      connectionId,
      page,
      ...progress,
      skippedTopicIds: skippedTopicIds.slice(0, 10),
    },
    "Discourse topic pagination completed",
  );
  return ok(progress);
}
