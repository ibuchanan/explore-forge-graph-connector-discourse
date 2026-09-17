import type { types } from "@forge/teamwork-graph";
import type { ProblemDetails, Result } from "@forge-ahead/errors";

import type { operations } from "./api/types";

type TopicResponse =
  operations["getTopic"]["responses"][200]["content"]["application/json"];

export type TopicPost = Pick<
  TopicResponse["post_stream"]["posts"][number],
  | "id"
  | "post_number"
  | "username"
  | "cooked"
  | "created_at"
  | "updated_at"
  | "version"
  | "hidden"
  | "reply_to_post_number"
>;

/**
 * One Discourse Topic as a Topic source yields it.
 *
 * `last_posted_at` is required here even though Discourse may omit it: adapters
 * substitute `created_at`, so consumers always have a timestamp.
 */
export type Topic = Omit<
  Pick<
    TopicResponse,
    "id" | "title" | "slug" | "created_at" | "last_posted_at" | "closed"
  >,
  "last_posted_at"
> & {
  last_posted_at: string;
  posts: TopicPost[];
};

/** One page of Topic IDs, and whether further pages follow. */
export type TopicPage = { ids: number[]; hasMore: boolean };

/**
 * Reads Topics from an external forum.
 *
 * Invariant: every method settles. Adapters convert transport failures into
 * `err(ProblemDetails)` and never reject, so callers unwrap exactly once.
 * A `429` status means the page should be retried later, not that the Topic
 * is unavailable.
 */
export type TopicSource = {
  listLatestTopics(page: number): Promise<Result<TopicPage, ProblemDetails>>;
  getTopic(id: number): Promise<Result<Topic, ProblemDetails>>;
};

/** Publishes objects without rejecting, converting transport failures to `err`. */
export type TopicPublisher = (
  connectionId: string,
  objects: types.Object[],
) => Promise<Result<void, ProblemDetails>>;
