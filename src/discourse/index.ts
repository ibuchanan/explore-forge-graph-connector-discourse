import createClient from "openapi-fetch";

import type { operations, paths } from "./api/types";

type LatestTopicsResponse =
  operations["listLatestTopics"]["responses"][200]["content"]["application/json"];
type TopicResponse =
  operations["getTopic"]["responses"][200]["content"]["application/json"];
import { forgeFetch } from "./forge-fetch";
import type { Topic } from "./map-topic";

export function discourseBaseUrl(): string {
  const baseUrl = process.env["DISCOURSE_BASE_URL"];

  if (!baseUrl) {
    throw new Error("DISCOURSE_BASE_URL must be set");
  }

  const url = new URL(baseUrl);

  if (url.protocol !== "https:") {
    throw new Error("DISCOURSE_BASE_URL must use HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("DISCOURSE_BASE_URL must not contain credentials");
  }

  return url.href;
}

export function createDiscourseClient(baseUrl = discourseBaseUrl()) {
  return createClient<paths>({ baseUrl, fetch: forgeFetch });
}

export function createDiscourseTopicSource(client = createDiscourseClient()) {
  return {
    async listLatestTopics(): Promise<number[]> {
      const { data, error } = await client.GET("/latest.json", {
        params: { query: { per_page: 100 } },
      } as never);

      const response = data as unknown as LatestTopicsResponse | undefined;
      if (error || !response?.topic_list?.topics) {
        throw new Error("Could not list latest Discourse topics");
      }

      return response.topic_list.topics.flatMap(({ id }) =>
        typeof id === "number" ? [id] : [],
      );
    },

    async getTopic(id: number): Promise<Topic> {
      const { data, error } = await client.GET("/t/{id}.json", {
        params: { path: { id: String(id) } },
      } as never);

      const response = data as unknown as TopicResponse | undefined;
      if (error || !response) {
        throw new Error(`Could not get Discourse topic ${id}`);
      }

      return {
        id: response.id,
        title: response.title,
        slug: response.slug,
        created_at: response.created_at,
        last_posted_at: response.last_posted_at ?? response.created_at,
        closed: response.closed,
        posts: response.post_stream.posts,
      };
    },
  };
}
