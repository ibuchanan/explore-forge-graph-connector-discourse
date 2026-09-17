import type { types } from "@forge/teamwork-graph";

type Rejection = { errors: Array<{ key: string }> };
type RejectionDetail = { rejected: Rejection[] };

function traceId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const id = (value as { traceId?: unknown }).traceId;
  return typeof id === "string" ? id : undefined;
}

function rejectionDetail(value: unknown): RejectionDetail | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const rejected = (value as { rejected?: unknown }).rejected;
  if (!Array.isArray(rejected)) return undefined;
  if (
    !rejected.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        Array.isArray((item as { errors?: unknown }).errors) &&
        (item as { errors: unknown[] }).errors.every(
          (error) =>
            typeof error === "object" &&
            error !== null &&
            typeof (error as { key?: unknown }).key === "string",
        ),
    )
  ) {
    return undefined;
  }
  return { rejected: rejected as Rejection[] };
}

/**
 * Summarizes graph object rejections for the task result without exposing the
 * upstream response body.
 */
export function summarizeRejection(response: types.BulkObjectResponse): string {
  const detail =
    rejectionDetail(response.results) ??
    rejectionDetail(response.originalError);
  const responseTraceId =
    traceId(response.originalError) ??
    response.error?.match(/\(Trace ID: ([^)]+)\)/)?.[1];
  const fallback = `Could not publish Discourse topics${responseTraceId ? ` (Trace ID: ${responseTraceId})` : ""}`;
  if (!detail) return fallback;

  const counts = new Map<string, number>();
  for (const { errors } of detail.rejected) {
    for (const { key } of errors) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts];
  const errorCounts = entries
    .slice(0, 5)
    .map(([key, count]) => `${key} × ${count}`)
    .join(", ");
  const omitted = entries.length > 5 ? `, +${entries.length - 5} more` : "";
  return `Could not publish ${detail.rejected.length} Discourse objects (${errorCounts}${omitted})${responseTraceId ? ` (Trace ID: ${responseTraceId})` : ""}`;
}
