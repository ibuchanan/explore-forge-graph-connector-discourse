import {
  ok,
  type ProblemDetails,
  type Result,
  StandardError,
} from "@forge-ahead/errors";
import { log, logResult } from "@forge-ahead/logging";

type ConnectionChange = {
  action: string;
  connectionId: string;
};

type ConnectionChangeResponse =
  | { success: true }
  | { success: false; error: ProblemDetails };

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

export function onConnectionChange(event: unknown): ConnectionChangeResponse {
  const result = validateConnectionChange(event);

  logResult(log, result, {
    successMessage: "Discourse connection changed",
    errorMessage: "Rejected Discourse connection change",
    summarizeOk: ({ action, connectionId }) => ({ action, connectionId }),
  });

  return result.match(
    () => ({ success: true }),
    (error) => ({ success: false, error }),
  );
}
