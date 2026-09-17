import {
  ok,
  type ProblemDetails,
  type Result,
  StandardError,
} from "@forge-ahead/errors";
import { log, logResult } from "@forge-ahead/logging";
import { kvs } from "@forge/kvs";
import { graph, types } from "@forge/teamwork-graph";

import {
  createDiscourseClient,
  createDiscourseTopicSource,
  discourseBaseUrl,
} from "./discourse";
import { syncTopics } from "./discourse/sync";

type ConnectionChange = {
  action: string;
  connectionId: string;
};

type ConnectionChangeResponse =
  | { success: true }
  | { success: false; error: ProblemDetails };

type TaskRunnerPayload = {
  connectionId: string;
  scanId: string;
  taskExecutionId: string;
  taskId: string;
};

type TaskRunnerResult = { success: boolean; message?: string };

type TaskInfo = {
  connectionId: string;
  taskType: types.ForgeTaskType;
};

const connectionTaskKey = (connectionId: string) =>
  `connectionTask:${connectionId}`;
const taskInfoKey = (taskId: string) => `taskInfo:${taskId}`;

function connectionCheckFailure(): ConnectionChangeResponse {
  return StandardError.getOrDefault(502)
    .error("Discourse connection check failed")
    .match(
      () => ({ success: true }),
      (error) => ({ success: false, error }),
    );
}

function validateConnectionChange(
  event: unknown,
): Result<ConnectionChange, ProblemDetails> {
  if (typeof event !== "object" || event === null) {
    return StandardError.getOrDefault(400).error(
      "Connection change event must be an object",
    );
  }

  const { action, connectionId } = event as Record<string, unknown>;

  if (typeof action !== "string" || typeof connectionId !== "string") {
    return StandardError.getOrDefault(400).error(
      "Connection change event requires string action and connectionId fields",
    );
  }

  return ok({ action, connectionId });
}

async function scheduleTopicSync(connectionId: string): Promise<void> {
  const existingTaskId = await kvs.get<string>(connectionTaskKey(connectionId));
  const taskId = existingTaskId ?? crypto.randomUUID();
  const task: TaskInfo = {
    connectionId,
    taskType: types.FORGE_TASK_TYPES.ENTITY_INGESTION_FULL,
  };

  await kvs.set(connectionTaskKey(connectionId), taskId);
  await kvs.set(taskInfoKey(taskId), task);
  const result = await graph.scheduleOrUpdateTask({
    connectionId,
    scheduleInterval: { value: 30, timeUnit: "minutes" },
    task: { taskId, taskType: task.taskType },
  });

  if (result.status !== "ACCEPTED") {
    throw new Error(result.error ?? "Could not schedule Discourse topic sync");
  }
}

export async function onConnectionChange(
  event: unknown,
): Promise<ConnectionChangeResponse> {
  const result = validateConnectionChange(event);

  logResult(log, result, {
    successMessage: "Discourse connection changed",
    errorMessage: "Rejected Discourse connection change",
    summarizeOk: ({ action, connectionId }) => ({ action, connectionId }),
  });

  return result.match(
    async ({ action, connectionId }) => {
      try {
        const { error } = await createDiscourseClient().GET("/site.json");

        if (error) {
          return connectionCheckFailure();
        }

        if (action !== "DELETED") {
          await scheduleTopicSync(connectionId);
        }

        return { success: true };
      } catch {
        return connectionCheckFailure();
      }
    },
    async (error) => ({ success: false, error }),
  );
}

export async function taskRunner(
  request: TaskRunnerPayload,
): Promise<TaskRunnerResult> {
  try {
    const task = await kvs.get<TaskInfo>(taskInfoKey(request.taskId));

    if (!task || task.connectionId !== request.connectionId) {
      await graph.updateTaskStatus({
        scanId: request.scanId,
        taskExecutionId: request.taskExecutionId,
        connectionId: request.connectionId,
        status: "failure",
        failureReason: "ENTITY_NOT_FOUND",
        task: { taskId: request.taskId },
      });
      return { success: false, message: "Task not found" };
    }

    await syncTopics({
      source: createDiscourseTopicSource(),
      publish: async (connectionId, objects) => {
        const result = await graph.setObjects({ connectionId, objects });
        if (!result.success) {
          throw new Error(result.error ?? "Could not publish Discourse topics");
        }
      },
      connectionId: request.connectionId,
      baseUrl: discourseBaseUrl(),
    });
    await graph.updateTaskStatus({
      scanId: request.scanId,
      taskExecutionId: request.taskExecutionId,
      connectionId: request.connectionId,
      status: "success",
      task: { taskId: request.taskId },
    });
    return { success: true };
  } catch (error) {
    await graph.updateTaskStatus({
      scanId: request.scanId,
      taskExecutionId: request.taskExecutionId,
      connectionId: request.connectionId,
      status: "failure",
      failureReason: "RETRYABLE_ERROR",
      task: { taskId: request.taskId },
    });
    return { success: false, message: String(error) };
  }
}
