import {
  err,
  fromPromise,
  fromThrowable,
  ok,
  type ProblemDetails,
  type Result,
  StandardError,
  toProblemDetails,
} from "@forge-ahead/errors";
import createClient from "openapi-fetch";

import type { operations, paths } from "./api/types";
import { forgeFetch } from "./forge-fetch";
import type { Topic } from "./map-topic";

type LatestTopicsResponse =
  operations["listLatestTopics"]["responses"][200]["content"]["application/json"];
type TopicResponse =
  operations["getTopic"]["responses"][200]["content"]["application/json"];
type DiscourseClient = ReturnType<typeof createDiscourseClient>;

const unavailable = (detail: string) =>
  StandardError.getOrDefault(502).error(detail);

export function discourseBaseUrl(): Result<string, ProblemDetails> {
  const baseUrl = process.env["DISCOURSE_BASE_URL"];
  if (!baseUrl) {
    return StandardError.getOrDefault(400).error(
      "DISCOURSE_BASE_URL must be set",
    );
  }

  return fromThrowable(
    () => new URL(baseUrl),
    (error) => toProblemDetails(error, 400, "DISCOURSE_BASE_URL is invalid"),
  )().andThen((url) => {
    if (url.protocol !== "https:") {
      return StandardError.getOrDefault(400).error(
        "DISCOURSE_BASE_URL must use HTTPS",
      );
    }
    if (url.username || url.password) {
      return StandardError.getOrDefault(400).error(
        "DISCOURSE_BASE_URL must not contain credentials",
      );
    }
    return ok(url.href);
  });
}

export function createDiscourseClient(baseUrl: string) {
  return createClient<paths>({ baseUrl, fetch: forgeFetch });
}

export function createDiscourseTopicSource(client: DiscourseClient) {
  return {
    async listLatestTopics(): Promise<Result<number[], ProblemDetails>> {
      const result = await fromPromise(
        client.GET("/latest.json", {
          params: { query: { per_page: 100 } },
        } as never),
        (error) =>
          toProblemDetails(
            error,
            502,
            "Could not list latest Discourse topics",
          ),
      );
      if (result.isErr()) {
        return err(result.error);
      }

      const response = result.value.data as unknown as
        | LatestTopicsResponse
        | undefined;
      return result.value.error || !response?.topic_list?.topics
        ? unavailable("Could not list latest Discourse topics")
        : ok(
            response.topic_list.topics.flatMap(({ id }) =>
              typeof id === "number" ? [id] : [],
            ),
          );
    },

    async getTopic(id: number): Promise<Result<Topic, ProblemDetails>> {
      const result = await fromPromise(
        client.GET("/t/{id}.json", {
          params: { path: { id: String(id) } },
        } as never),
        (error) =>
          toProblemDetails(error, 502, `Could not get Discourse topic ${id}`),
      );
      if (result.isErr()) {
        return err(result.error);
      }

      const response = result.value.data as unknown as
        | TopicResponse
        | undefined;
      return result.value.error || !response
        ? unavailable(`Could not get Discourse topic ${id}`)
        : ok({
            id: response.id,
            title: response.title,
            slug: response.slug,
            created_at: response.created_at,
            last_posted_at: response.last_posted_at ?? response.created_at,
            closed: response.closed,
            posts: response.post_stream.posts,
          });
    },
  };
}
