import {
  ok,
  type ProblemDetails,
  type Result,
  StandardError,
} from "@forge-ahead/errors";
import { log, logResult } from "@forge-ahead/logging";

import { createDiscourseClient } from "./discourse";

type ConnectionChange = {
  action: string;
  connectionId: string;
};

type ConnectionChangeResponse =
  | { success: true }
  | { success: false; error: ProblemDetails };

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
    async () => {
      try {
        const { error } = await createDiscourseClient().GET("/site.json");

        if (error) {
          return connectionCheckFailure();
        }

        return { success: true };
      } catch {
        return connectionCheckFailure();
      }
    },
    async (error) => ({ success: false, error }),
  );
}
