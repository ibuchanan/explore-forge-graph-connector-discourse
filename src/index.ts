import { kvs } from "@forge/kvs";
import { graph, types } from "@forge/teamwork-graph";
import {
  err,
  fromPromise,
  ok,
  type ProblemDetails,
  problemDetails,
  type Result,
  StandardError,
  toErrorMessage,
  toProblemDetails,
} from "@forge-ahead/errors";
import { log, logResult } from "@forge-ahead/logging";

import {
  createDiscourseClient,
  createDiscourseTopicSource,
  discourseBaseUrl,
} from "./discourse";
import {
  advance,
  crawlStateKey,
  pageToCrawl,
  type CrawlState,
} from "./discourse/crawl-state";
import { syncTopics, type SyncProgress } from "./discourse/sync";

type ConnectionChange = { action: string; connectionId: string };
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
type TaskInfo = { connectionId: string; taskType: types.ForgeTaskType };

const connectionTaskKey = (connectionId: string) =>
  `connectionTask:${connectionId}`;
const taskInfoKey = (taskId: string) => `taskInfo:${taskId}`;
const unavailable = (detail: string) =>
  StandardError.getOrDefault(502).error(detail);

type IngestionRejection = {
  errors: Array<{ key: string }>;
};

function summarizeIngestionFailure(error: string): string {
  const start = error.indexOf('{"accepted"');
  const end = error.lastIndexOf("} (Trace ID:");
  const traceId = error.match(/\(Trace ID: ([^)]+)\)/)?.[1];
  if (start === -1 || end === -1) {
    return traceId
      ? `Could not publish Discourse topics (Trace ID: ${traceId})`
      : "Could not publish Discourse topics";
  }

  try {
    const { rejected } = JSON.parse(error.slice(start, end + 1)) as {
      rejected?: IngestionRejection[];
    };
    if (!rejected) throw new Error("Missing rejected objects");
    const counts = new Map<string, number>();
    for (const { errors } of rejected) {
      for (const { key } of errors) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const entries = [...counts];
    const errorCounts = entries
      .slice(0, 5)
      .map(([key, count]) => `${key} × ${count}`)
      .join(", ");
    const omittedErrorCounts =
      entries.length > 5 ? `, +${entries.length - 5} more` : "";
    return `Could not publish ${rejected.length} Discourse objects (${errorCounts}${omittedErrorCounts})${traceId ? ` (Trace ID: ${traceId})` : ""}`;
  } catch {
    return traceId
      ? `Could not publish Discourse topics (Trace ID: ${traceId})`
      : "Could not publish Discourse topics";
  }
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
  return typeof action !== "string" || typeof connectionId !== "string"
    ? StandardError.getOrDefault(400).error(
        "Connection change event requires string action and connectionId fields",
      )
    : ok({ action, connectionId });
}

async function scheduleTopicSync(
  connectionId: string,
): Promise<Result<void, ProblemDetails>> {
  const existingTaskId = await fromPromise(
    kvs.get<string>(connectionTaskKey(connectionId)),
    (error) =>
      toProblemDetails(error, 502, "Could not read Discourse task state"),
  );
  if (existingTaskId.isErr()) return err(existingTaskId.error);

  const taskId = existingTaskId.value ?? crypto.randomUUID();
  const task: TaskInfo = {
    connectionId,
    taskType: types.FORGE_TASK_TYPES.ENTITY_INGESTION_FULL,
  };
  for (const [key, value] of [
    [connectionTaskKey(connectionId), taskId],
    [taskInfoKey(taskId), task],
  ] as const) {
    const saved = await fromPromise(kvs.set(key, value), (error) =>
      toProblemDetails(error, 502, "Could not save Discourse task state"),
    );
    if (saved.isErr()) return err(saved.error);
  }

  const scheduled = await fromPromise(
    graph.scheduleOrUpdateTask({
      connectionId,
      scheduleInterval: { value: 30, timeUnit: "minutes" },
      task: { taskId, taskType: task.taskType },
    }),
    (error) =>
      toProblemDetails(error, 502, "Could not schedule Discourse topic sync"),
  );
  return scheduled.isErr()
    ? err(scheduled.error)
    : scheduled.value.status === "ACCEPTED"
      ? ok(undefined)
      : unavailable(
          scheduled.value.error ?? "Could not schedule Discourse topic sync",
        );
}

async function updateTaskStatus(
  request: TaskRunnerPayload,
  status: "success" | "failure",
  failureReason?: "ENTITY_NOT_FOUND" | "RETRYABLE_ERROR",
): Promise<Result<void, ProblemDetails>> {
  const updated = await fromPromise(
    graph.updateTaskStatus({
      scanId: request.scanId,
      taskExecutionId: request.taskExecutionId,
      connectionId: request.connectionId,
      status,
      ...(failureReason ? { failureReason } : {}),
      task: { taskId: request.taskId },
    }),
    (error) =>
      toProblemDetails(error, 502, "Could not update Discourse task status"),
  );
  return updated.isErr() ? err(updated.error) : ok(undefined);
}

export async function onConnectionChange(
  event: unknown,
): Promise<ConnectionChangeResponse> {
  const connection = validateConnectionChange(event);
  logResult(log, connection, {
    successMessage: "Discourse connection changed",
    errorMessage: "Rejected Discourse connection change",
    summarizeOk: ({ action, connectionId }) => ({ action, connectionId }),
  });
  if (connection.isErr()) return { success: false, error: connection.error };
  if (connection.value.action === "DELETED") return { success: true };

  const baseUrl = discourseBaseUrl();
  if (baseUrl.isErr()) return { success: false, error: baseUrl.error };
  log.info(
    { connectionId: connection.value.connectionId, baseUrl: baseUrl.value },
    "Discourse connection URL parsed",
  );
  const site = await fromPromise(
    createDiscourseClient(baseUrl.value).GET("/site.json"),
    (error) =>
      toProblemDetails(error, 502, "Discourse connection check failed"),
  );
  if (site.isErr() || site.value.error) {
    return {
      success: false,
      error: site.isErr()
        ? site.error
        : problemDetails(502, "Discourse connection check failed"),
    };
  }

  const scheduled = await scheduleTopicSync(connection.value.connectionId);
  return scheduled.isOk()
    ? { success: true }
    : { success: false, error: scheduled.error };
}

export async function taskRunner(
  request: TaskRunnerPayload,
): Promise<TaskRunnerResult> {
  const task = await fromPromise(
    kvs.get<TaskInfo>(taskInfoKey(request.taskId)),
    (error) =>
      toProblemDetails(error, 502, "Could not read Discourse task state"),
  );
  if (
    task.isErr() ||
    !task.value ||
    task.value.connectionId !== request.connectionId
  ) {
    const error = task.isErr()
      ? task.error
      : problemDetails(502, "Task not found");
    await updateTaskStatus(request, "failure", "ENTITY_NOT_FOUND");
    return {
      success: false,
      message: error.detail ?? error.title ?? "Discourse task failed",
    };
  }

  const crawlState = await fromPromise(
    kvs.get<CrawlState>(crawlStateKey(request.connectionId)),
    (error) =>
      toProblemDetails(error, 502, "Could not read Discourse crawl state"),
  );
  if (crawlState.isErr()) {
    await updateTaskStatus(request, "failure", "RETRYABLE_ERROR");
    return { success: false, message: toErrorMessage(crawlState.error) };
  }

  const page = pageToCrawl(crawlState.value);
  const baseUrl = discourseBaseUrl();
  const synced: Result<SyncProgress, ProblemDetails> = baseUrl.isErr()
    ? err(baseUrl.error)
    : await syncTopics({
        source: createDiscourseTopicSource(
          createDiscourseClient(baseUrl.value),
        ),
        publish: async (connectionId, objects) => {
          const published = await fromPromise(
            graph.setObjects({ connectionId, objects }),
            (error) =>
              toProblemDetails(
                error,
                502,
                "Could not publish Discourse topics",
              ),
          );
          if (published.isErr()) return err(published.error);
          if (published.value.success) return ok(undefined);

          const error =
            published.value.error ?? "Could not publish Discourse topics";
          log.debug?.(
            () => ({
              connectionId,
              objectCount: objects.length,
              response: published.value,
            }),
            "Discourse topic ingestion failed",
          );
          return unavailable(summarizeIngestionFailure(error));
        },
        connectionId: request.connectionId,
        baseUrl: baseUrl.value,
        page,
      });
  logResult(log, synced, {
    successMessage: "Discourse topic pagination succeeded",
    errorMessage: "Discourse topic pagination failed",
    summarizeOk: (progress) => ({
      connectionId: request.connectionId,
      page,
      ...progress,
    }),
    summarizeErr: (error) => ({
      connectionId: request.connectionId,
      page,
      status: error.status,
      detail: error.detail,
    }),
  });
  let advanced: Result<void, ProblemDetails>;
  if (synced.isErr()) {
    advanced = err(synced.error);
  } else {
    const nextState = advance(crawlState.value, synced.value);
    const completed = nextState.nextPage === 0;
    log.info(
      { connectionId: request.connectionId, page, completed, ...nextState },
      completed
        ? "Discourse topic crawl completed"
        : "Discourse topic crawl progress",
    );
    advanced = await fromPromise(
      kvs.set(crawlStateKey(request.connectionId), nextState),
      (error) =>
        toProblemDetails(error, 502, "Could not save Discourse crawl state"),
    );
  }
  const status = advanced.isOk() ? "success" : "failure";
  const reported = await updateTaskStatus(
    request,
    status,
    status === "failure" ? "RETRYABLE_ERROR" : undefined,
  );
  if (advanced.isOk() && reported.isOk()) return { success: true };
  return {
    success: false,
    message: toErrorMessage(
      advanced.isErr()
        ? advanced.error
        : reported.isErr()
          ? reported.error
          : problemDetails(500, "Could not update Discourse task status"),
    ),
  };
}
