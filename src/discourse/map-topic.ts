import { types } from "@forge/teamwork-graph";

type ConversationObject = types.ConversationObject;
type MessageObject = types.MessageObject;

type TopicPost = {
  id: number;
  post_number: number;
  username: string;
  cooked: string;
  created_at: string;
  updated_at: string;
  version: number;
  hidden?: boolean;
  reply_to_post_number?: number | string | null;
};

export type Topic = {
  id: number;
  title: string;
  slug: string;
  created_at: string;
  last_posted_at: string;
  closed: boolean;
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

function sequenceNumber(date: string): number {
  const value = Date.parse(date);
  if (Number.isNaN(value)) {
    throw new Error(`Discourse timestamp is invalid: ${date}`);
  }
  return value;
}

export function mapTopic(
  topic: Topic,
  baseUrl: string,
): Array<ConversationObject | MessageObject> {
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
  const firstPost = topic.posts[0];

  if (!firstPost) {
    throw new Error(`Discourse topic ${topic.id} has no posts`);
  }

  return [
    {
      schemaVersion: "1.0",
      id: `topic:${topic.id}`,
      updateSequenceNumber: sequenceNumber(topic.last_posted_at),
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
        members: [...new Set(topic.posts.map(({ username }) => username))].map(
          (externalId) => ({ externalId }),
        ),
        lastActive: topic.last_posted_at,
        memberCount: new Set(topic.posts.map(({ username }) => username)).size,
        isArchived: topic.closed,
      },
    } satisfies ConversationObject,
    ...messages,
  ];
}
