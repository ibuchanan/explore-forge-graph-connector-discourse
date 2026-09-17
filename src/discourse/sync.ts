import type { types } from "@forge/teamwork-graph";
import {
  err,
  fromPromise,
  ok,
  type ProblemDetails,
  type Result,
  toProblemDetails,
} from "@forge-ahead/errors";

import { mapTopic, type Topic } from "./map-topic";

type TopicSource = {
  listLatestTopics(): Promise<Result<number[], ProblemDetails>>;
  getTopic(id: number): Promise<Result<Topic, ProblemDetails>>;
};

type TopicPublisher = (
  connectionId: string,
  objects: types.Object[],
) => Promise<Result<void, ProblemDetails>>;

export async function syncTopics({
  source,
  publish,
  connectionId,
  baseUrl,
}: {
  source: TopicSource;
  publish: TopicPublisher;
  connectionId: string;
  baseUrl: string;
}): Promise<Result<void, ProblemDetails>> {
  const latestTopics = await fromPromise(source.listLatestTopics(), (error) =>
    toProblemDetails(error, 502, "Could not list latest Discourse topics"),
  );
  if (latestTopics.isErr()) {
    return err(latestTopics.error);
  }
  if (latestTopics.value.isErr()) {
    return err(latestTopics.value.error);
  }

  const objects: types.Object[] = [];
  for (const id of latestTopics.value.value) {
    const topic = await fromPromise(source.getTopic(id), (error) =>
      toProblemDetails(error, 502, `Could not get Discourse topic ${id}`),
    );
    if (topic.isErr()) {
      return err(topic.error);
    }
    if (topic.value.isErr()) {
      return err(topic.value.error);
    }

    const mappedTopic = mapTopic(topic.value.value, baseUrl);
    if (mappedTopic.isErr()) {
      return err(mappedTopic.error);
    }
    objects.push(...mappedTopic.value);
  }

  if (objects.length === 0) {
    return ok(undefined);
  }

  const published = await fromPromise(publish(connectionId, objects), (error) =>
    toProblemDetails(error, 502, "Could not publish Discourse topics"),
  );
  return published.isErr()
    ? err(published.error)
    : published.value.isErr()
      ? err(published.value.error)
      : ok(undefined);
}
