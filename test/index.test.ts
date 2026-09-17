import { describe, expect, it, vi } from "vitest";

const {
  createDiscourseClient,
  createDiscourseTopicSource,
  discourseBaseUrl,
  get,
  graph,
  kvs,
} = vi.hoisted(() => {
  const get = vi.fn();

  return {
    createDiscourseClient: vi.fn(() => ({ GET: get })),
    createDiscourseTopicSource: vi.fn(),
    discourseBaseUrl: vi.fn(() => "https://community.example.com/"),
    get,
    graph: {
      scheduleOrUpdateTask: vi.fn(),
      setObjects: vi.fn(),
      updateTaskStatus: vi.fn(),
    },
    kvs: { get: vi.fn(), set: vi.fn() },
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
      listLatestTopics: vi.fn(async () => []),
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
    expect(graph.updateTaskStatus).toHaveBeenCalledWith({
      connectionId: "connection-123",
      scanId: "scan-123",
      taskExecutionId: "execution-123",
      status: "success",
      task: { taskId: "task-123" },
    });
  });
});
