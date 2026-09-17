import { expectOk } from "@forge-ahead/errors/testing";
import { describe, expect, it } from "vitest";

import { mapTopic } from "../src/discourse/map-topic";

describe("mapTopic", () => {
  it("projects a topic and its posts as a conversation with contained messages", () => {
    expect(
      expectOk(
        mapTopic(
          {
            id: 123,
            title: "How do I connect Discourse?",
            slug: "how-do-i-connect-discourse",
            created_at: "2026-09-16T10:00:00.000Z",
            last_posted_at: "2026-09-16T11:00:00.000Z",
            closed: false,
            posts: [
              {
                id: 456,
                post_number: 1,
                username: "ada",
                cooked: "<p>Start with a connector.</p>",
                created_at: "2026-09-16T10:00:00.000Z",
                updated_at: "2026-09-16T10:00:00.000Z",
                version: 1,
              },
              {
                id: 457,
                post_number: 2,
                username: "grace",
                cooked: "<p>Then publish the messages.</p>",
                created_at: "2026-09-16T11:00:00.000Z",
                updated_at: "2026-09-16T11:00:00.000Z",
                version: 2,
                reply_to_post_number: 1,
              },
            ],
          },
          "https://community.example.com/",
        ),
      ),
    ).toEqual([
      {
        schemaVersion: "1.0",
        id: "topic:123",
        updateSequenceNumber: 1_789_556_400_000,
        displayName: "How do I connect Discourse?",
        description: "Start with a connector.",
        url: "https://community.example.com/t/how-do-i-connect-discourse/123",
        createdAt: "2026-09-16T10:00:00.000Z",
        lastUpdatedAt: "2026-09-16T11:00:00.000Z",
        permissions: {
          accessControls: [{ principals: [{ type: "EVERYONE" }] }],
        },
        "atlassian:conversation": {
          type: "forum-topic",
          membershipType: "public",
          workspace: "Discourse",
          isArchived: false,
          members: [{ externalId: "ada" }, { externalId: "grace" }],
          lastActive: "2026-09-16T11:00:00.000Z",
          memberCount: 2,
        },
      },
      {
        schemaVersion: "1.0",
        id: "post:456",
        updateSequenceNumber: 1,
        description: "Start with a connector.",
        url: "https://community.example.com/t/how-do-i-connect-discourse/123/1",
        createdAt: "2026-09-16T10:00:00.000Z",
        lastUpdatedAt: "2026-09-16T10:00:00.000Z",
        permissions: {
          accessControls: [{ principals: [{ type: "EVERYONE" }] }],
        },
        containerKey: {
          type: "atlassian:conversation",
          value: { entityId: "topic:123" },
        },
        "atlassian:message": {
          hidden: false,
          lastActive: "2026-09-16T10:00:00.000Z",
        },
      },
      {
        schemaVersion: "1.0",
        id: "post:457",
        updateSequenceNumber: 2,
        description: "Then publish the messages.",
        url: "https://community.example.com/t/how-do-i-connect-discourse/123/2",
        createdAt: "2026-09-16T11:00:00.000Z",
        lastUpdatedAt: "2026-09-16T11:00:00.000Z",
        permissions: {
          accessControls: [{ principals: [{ type: "EVERYONE" }] }],
        },
        containerKey: {
          type: "atlassian:conversation",
          value: { entityId: "topic:123" },
        },
        parentKey: {
          type: "atlassian:message",
          value: { entityId: "post:456" },
        },
        "atlassian:message": {
          hidden: false,
          lastActive: "2026-09-16T11:00:00.000Z",
        },
      },
    ]);
  });
});
