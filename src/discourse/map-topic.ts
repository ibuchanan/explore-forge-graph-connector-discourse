import {
  ok,
  type ProblemDetails,
  type Result,
  StandardError,
} from "@forge-ahead/errors";
import type { types } from "@forge/teamwork-graph";

import type { operations } from "./api/types";

type ConversationObject = types.ConversationObject;
type MessageObject = types.MessageObject;
type TopicResponse =
  operations["getTopic"]["responses"][200]["content"]["application/json"];
type TopicPost = Pick<
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

export type Topic = Omit<
  Pick<
    TopicResponse,
    "id" | "title" | "slug" | "created_at" | "last_posted_at" | "closed"
  >,
  "last_posted_at"
> & {
  // The HTTP adapter replaces a missing last-post timestamp with created_at.
  last_posted_at: string;
  posts: TopicPost[];
};

const everyone = {
  accessControls: [{ principals: [{ type: "EVERYONE" as const }] }],
};

function textFromHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function topicUrl(baseUrl: string, topic: Topic, postNumber?: number): string {
  const path = `/t/${encodeURIComponent(topic.slug)}/${topic.id}`;
  return new URL(postNumber ? `${path}/${postNumber}` : path, baseUrl).href;
}

function sequenceNumber(date: string): Result<number, ProblemDetails> {
  const value = Date.parse(date);
  return Number.isNaN(value)
    ? StandardError.getOrDefault(400).error(
        `Discourse timestamp is invalid: ${date}`,
      )
    : ok(value);
}

export function mapTopic(
  topic: Topic,
  baseUrl: string,
): Result<Array<ConversationObject | MessageObject>, ProblemDetails> {
  const firstPost = topic.posts[0];
  if (!firstPost) {
    return StandardError.getOrDefault(400).error(
      `Discourse topic ${topic.id} has no posts`,
    );
  }

  return sequenceNumber(topic.last_posted_at).map((updateSequenceNumber) => {
    const messages = topic.posts.map((post) => {
      const replyTo = topic.posts.find(
        ({ post_number }) => post_number === Number(post.reply_to_post_number),
      );

      return {
        schemaVersion: "1.0",
        id: `post:${post.id}`,
        updateSequenceNumber: post.version,
        description: textFromHtml(post.cooked),
        url: topicUrl(baseUrl, topic, post.post_number),
        createdAt: post.created_at,
        lastUpdatedAt: post.updated_at,
        permissions: everyone,
        containerKey: {
          type: "atlassian:conversation" as const,
          value: { entityId: `topic:${topic.id}` },
        },
        ...(replyTo
          ? {
              parentKey: {
                type: "atlassian:message" as const,
                value: { entityId: `post:${replyTo.id}` },
              },
            }
          : {}),
        "atlassian:message": {
          hidden: post.hidden ?? false,
          lastActive: post.updated_at,
        },
      } satisfies MessageObject;
    });

    return [
      {
        schemaVersion: "1.0",
        id: `topic:${topic.id}`,
        updateSequenceNumber,
        displayName: topic.title,
        description: textFromHtml(firstPost.cooked),
        url: topicUrl(baseUrl, topic),
        createdAt: topic.created_at,
        lastUpdatedAt: topic.last_posted_at,
        permissions: everyone,
        "atlassian:conversation": {
          type: "forum-topic",
          membershipType: "public",
          workspace: "Discourse",
          members: [
            ...new Set(topic.posts.map(({ username }) => username)),
          ].map((externalId) => ({ externalId })),
          lastActive: topic.last_posted_at,
          memberCount: new Set(topic.posts.map(({ username }) => username))
            .size,
          isArchived: topic.closed,
        },
      } satisfies ConversationObject,
      ...messages,
    ];
  });
}
