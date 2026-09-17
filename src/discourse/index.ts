import {
  err,
  fromPromise,
  fromThrowable,
  problemDetails,
  ok,
  type ProblemDetails,
  type Result,
  StandardError,
  toProblemDetails,
} from "@forge-ahead/errors";
import createClient from "openapi-fetch";

import type { operations, paths } from "./api/types";
import { log } from "@forge-ahead/logging";

import { forgeFetch } from "./forge-fetch";
import type { Topic } from "./map-topic";
import type { TopicPage } from "./sync";

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
    async listLatestTopics(
      page: number,
    ): Promise<Result<TopicPage, ProblemDetails>> {
      const result = await fromPromise(
        client.GET("/latest.json", {
          params: { query: { page, per_page: 100 } },
        } as never),
        (error) =>
          toProblemDetails(
            error,
            502,
            "Could not list latest Discourse topics",
          ),
      );
      if (result.isErr()) return err(result.error);

      const { data, error, response } = result.value as {
        data?: LatestTopicsResponse;
        error?: unknown;
        response?: Response;
      };
      if (response?.status === 429) {
        log.warn(
          {
            endpoint: "/latest.json",
            page,
            retryAfter: response.headers.get("retry-after"),
            rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
          },
          "Discourse rate limit reached",
        );
        return err(problemDetails(429, "Discourse rate limit reached"));
      }
      if (error || !data?.topic_list?.topics) {
        log.warn(
          { endpoint: "/latest.json", page, status: response?.status },
          "Discourse topic listing failed",
        );
        return unavailable("Could not list latest Discourse topics");
      }

      const ids = data.topic_list.topics.flatMap(({ id }) =>
        typeof id === "number" ? [id] : [],
      );
      return ok({
        ids,
        hasMore: Boolean(
          (data.topic_list as { more_topics_url?: string }).more_topics_url,
        ),
      });
    },

    async getTopic(id: number): Promise<Result<Topic, ProblemDetails>> {
      const result = await fromPromise(
        client.GET("/t/{id}.json", {
          params: { path: { id: String(id) } },
        } as never),
        (error) =>
          toProblemDetails(error, 502, `Could not get Discourse topic ${id}`),
      );
      if (result.isErr()) return err(result.error);

      const { data, error, response } = result.value as {
        data?: TopicResponse;
        error?: unknown;
        response?: Response;
      };
      if (response?.status === 429) {
        log.warn(
          {
            endpoint: "/t/{id}.json",
            topicId: id,
            retryAfter: response.headers.get("retry-after"),
            rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
          },
          "Discourse rate limit reached",
        );
        return err(problemDetails(429, "Discourse rate limit reached"));
      }
      if (error || !data) {
        log.warn(
          { endpoint: "/t/{id}.json", topicId: id, status: response?.status },
          "Discourse topic request failed",
        );
        return unavailable(`Could not get Discourse topic ${id}`);
      }
      return ok({
        id: data.id,
        title: data.title,
        slug: data.slug,
        created_at: data.created_at,
        last_posted_at: data.last_posted_at ?? data.created_at,
        closed: data.closed,
        posts: data.post_stream.posts,
      });
    },
  };
}
