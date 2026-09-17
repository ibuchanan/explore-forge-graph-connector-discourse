import { ok } from "@forge-ahead/errors";
import { describe, expect, it, vi } from "vitest";

const {
  createDiscourseClient,
  createDiscourseTopicSource,
  discourseBaseUrl,
  get,
  graph,
  kvs,
  log,
  logResult,
} = vi.hoisted(() => {
  const get = vi.fn();

  return {
    createDiscourseClient: vi.fn(() => ({ GET: get })),
    createDiscourseTopicSource: vi.fn(),
    discourseBaseUrl: vi.fn(() => ok("https://community.example.com/")),
    get,
    graph: {
      scheduleOrUpdateTask: vi.fn(),
      setObjects: vi.fn(),
      updateTaskStatus: vi.fn(),
    },
    kvs: { get: vi.fn(), set: vi.fn() },
    log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    logResult: vi.fn(),
  };
});

vi.mock("../src/discourse", () => ({
  createDiscourseClient,
  createDiscourseTopicSource,
  discourseBaseUrl,
}));
vi.mock("@forge/teamwork-graph", () => ({
  graph,
  types: {
    FORGE_TASK_TYPES: { ENTITY_INGESTION_FULL: "entity_ingestion_full" },
  },
}));
vi.mock("@forge/kvs", () => ({ kvs }));
vi.mock("@forge-ahead/logging", () => ({ log, logResult }));

import { onConnectionChange, taskRunner } from "../src/index";

describe("onConnectionChange", () => {
  it("rejects a malformed connector event", async () => {
    await expect(
      onConnectionChange({ action: "CREATED" }),
    ).resolves.toMatchObject({
      success: false,
      error: { status: 400 },
    });
  });

  it("probes Discourse and schedules a full entity crawl when a connection is created", async () => {
    get.mockResolvedValue({ data: { site: {} } });
    kvs.get.mockResolvedValue(undefined);
    kvs.set.mockResolvedValue(undefined);
    graph.scheduleOrUpdateTask.mockResolvedValue({ status: "ACCEPTED" });

    await expect(
      onConnectionChange({ action: "CREATED", connectionId: "connection-123" }),
    ).resolves.toEqual({ success: true });

    expect(createDiscourseClient).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith("/site.json");
    expect(kvs.set).toHaveBeenCalledWith(
      expect.stringMatching(/^taskInfo:/),
      expect.objectContaining({
        connectionId: "connection-123",
        taskType: "entity_ingestion_full",
      }),
    );
    expect(graph.scheduleOrUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection-123",
        scheduleInterval: { value: 30, timeUnit: "minutes" },
        task: expect.objectContaining({ taskType: "entity_ingestion_full" }),
      }),
    );
  });

  it("returns an unavailable response when Discourse rejects the probe", async () => {
    get.mockResolvedValue({ error: { errors: ["unavailable"] } });

    await expect(
      onConnectionChange({ action: "CREATED", connectionId: "connection-123" }),
    ).resolves.toMatchObject({ success: false, error: { status: 502 } });
  });
});

describe("taskRunner", () => {
  it("publishes a scheduled connection crawl and reports success", async () => {
    const source = {
      listLatestTopics: vi.fn(async () => ok({ ids: [], hasMore: true })),
      getTopic: vi.fn(),
    };
    createDiscourseTopicSource.mockReturnValue(source);
    kvs.get.mockResolvedValue({
      connectionId: "connection-123",
      taskType: "entity_ingestion_full",
    });
    graph.updateTaskStatus.mockResolvedValue({ status: "ACCEPTED" });

    await expect(
      taskRunner({
        connectionId: "connection-123",
        scanId: "scan-123",
        taskExecutionId: "execution-123",
        taskId: "task-123",
      }),
    ).resolves.toEqual({ success: true });

    expect(createDiscourseTopicSource).toHaveBeenCalledOnce();
    expect(kvs.get).toHaveBeenCalledWith("crawlState:connection-123");
    expect(kvs.set).toHaveBeenCalledWith(
      "crawlState:connection-123",
      expect.objectContaining({ nextPage: 1, discoveredTopics: 0 }),
    );
    expect(graph.updateTaskStatus).toHaveBeenCalledWith({
      connectionId: "connection-123",
      scanId: "scan-123",
      taskExecutionId: "execution-123",
      status: "success",
      task: { taskId: "task-123" },
    });
  });

  it("summarizes rejected ingestion and reserves the full response for debug logs", async () => {
    const response = {
      success: false,
      error: "Failed to set objects (Trace ID: trace-123)",
      results: {
        rejected: [
          {
            key: "topic-123",
            errors: [{ key: "conversationData.schemaVersion.invalid" }],
          },
        ],
      },
      originalError: { details: "full upstream response" },
    };
    const source = {
      listLatestTopics: vi.fn(async () => ok({ ids: [123], hasMore: false })),
      getTopic: vi.fn(async () =>
        ok({
          id: 123,
          title: "Topic title",
          slug: "topic-title",
          created_at: "2026-09-16T10:00:00.000Z",
          last_posted_at: "2026-09-16T10:00:00.000Z",
          closed: false,
          posts: [
            {
              id: 456,
              post_number: 1,
              username: "ada",
              cooked: "<p>Hello.</p>",
              created_at: "2026-09-16T10:00:00.000Z",
              updated_at: "2026-09-16T10:00:00.000Z",
              version: 1,
            },
          ],
        }),
      ),
    };
    const debug = log.debug;
    createDiscourseTopicSource.mockReturnValue(source);
    kvs.get
      .mockResolvedValueOnce({
        connectionId: "connection-123",
        taskType: "entity_ingestion_full",
      })
      .mockResolvedValueOnce({ nextPage: 0 });
    graph.setObjects.mockResolvedValue(response);
    graph.updateTaskStatus.mockResolvedValue({ status: "ACCEPTED" });

    await expect(
      taskRunner({
        connectionId: "connection-123",
        scanId: "scan-123",
        taskExecutionId: "execution-123",
        taskId: "task-123",
      }),
    ).resolves.toEqual({
      success: false,
      message:
        "Could not publish 1 Discourse objects (conversationData.schemaVersion.invalid × 1) (Trace ID: trace-123)",
    });

    expect(debug).toHaveBeenCalledWith(
      expect.any(Function),
      "Discourse topic ingestion failed",
    );
    const payload = debug.mock.calls[0]?.[0];
    expect(payload).toEqual(expect.any(Function));
    expect((payload as () => unknown)()).toMatchObject({
      connectionId: "connection-123",
      objectCount: 2,
      response,
    });
  });
});
