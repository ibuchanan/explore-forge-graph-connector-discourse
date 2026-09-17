import type { types } from "@forge/teamwork-graph";
import {
  err,
  fromPromise,
  ok,
  type ProblemDetails,
  type Result,
  toProblemDetails,
} from "@forge-ahead/errors";
import { log } from "@forge-ahead/logging";

import { mapTopic, type Topic } from "./map-topic";

export type TopicPage = { ids: number[]; hasMore: boolean };

type TopicSource = {
  listLatestTopics(page: number): Promise<Result<TopicPage, ProblemDetails>>;
  getTopic(id: number): Promise<Result<Topic, ProblemDetails>>;
};

type TopicPublisher = (
  connectionId: string,
  objects: types.Object[],
) => Promise<Result<void, ProblemDetails>>;

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
  log.info({ connectionId, page }, "Discourse crawl page started");
  const latestTopics = await fromPromise(
    source.listLatestTopics(page),
    (error) =>
      toProblemDetails(error, 502, "Could not list latest Discourse topics"),
  );
  if (latestTopics.isErr()) return err(latestTopics.error);
  if (latestTopics.value.isErr()) return err(latestTopics.value.error);

  const topics: Topic[] = [];
  const objects: types.Object[] = [];
  const skippedTopicIds: number[] = [];
  for (const id of latestTopics.value.value.ids) {
    const topic = await fromPromise(source.getTopic(id), (error) =>
      toProblemDetails(error, 502, `Could not get Discourse topic ${id}`),
    );
    if (topic.isErr()) {
      if (topic.error.status === 429) return err(topic.error);
      skippedTopicIds.push(id);
      log.warn(
        { connectionId, page, topicId: id, status: topic.error.status },
        "Discourse topic skipped after fetch failure",
      );
      continue;
    }
    if (topic.value.isErr()) {
      if (topic.value.error.status === 429) return err(topic.value.error);
      skippedTopicIds.push(id);
      log.warn(
        { connectionId, page, topicId: id, status: topic.value.error.status },
        "Discourse topic skipped after fetch failure",
      );
      continue;
    }

    const mappedTopic = mapTopic(topic.value.value, baseUrl);
    if (mappedTopic.isErr()) {
      skippedTopicIds.push(id);
      log.warn(
        { connectionId, page, topicId: id, status: mappedTopic.error.status },
        "Discourse topic skipped after mapping failure",
      );
      continue;
    }
    topics.push(topic.value.value);
    objects.push(...mappedTopic.value);
  }
  if (objects.length > 0) {
    const published = await fromPromise(
      publish(connectionId, objects),
      (error) =>
        toProblemDetails(error, 502, "Could not publish Discourse topics"),
    );
    if (published.isErr()) return err(published.error);
    if (published.value.isErr()) return err(published.value.error);
  }

  const progress: SyncProgress = {
    discoveredTopics: latestTopics.value.value.ids.length,
    publishedTopics: topics.length,
    publishedObjects: objects.length,
    skippedTopics: skippedTopicIds.length,
    hasMore: latestTopics.value.value.hasMore,
    ...temporalCoverage(topics),
  };
  log.info(
    {
      connectionId,
      page,
      ...progress,
      skippedTopicIds: skippedTopicIds.slice(0, 10),
    },
    "Discourse crawl page completed",
  );
  return ok(progress);
}
