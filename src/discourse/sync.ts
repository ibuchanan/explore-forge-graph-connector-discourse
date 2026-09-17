import { types } from "@forge/teamwork-graph";

import { mapTopic, type Topic } from "./map-topic";

type TopicSource = {
  listLatestTopics(): Promise<number[]>;
  getTopic(id: number): Promise<Topic>;
};

type TopicPublisher = (
  connectionId: string,
  objects: types.Object[],
) => Promise<void>;

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
}): Promise<void> {
  const objects = (
    await Promise.all(
      (
        await source.listLatestTopics()
      ).map(async (id) => mapTopic(await source.getTopic(id), baseUrl)),
    )
  ).flat();

  if (objects.length > 0) {
    await publish(connectionId, objects);
  }
}
