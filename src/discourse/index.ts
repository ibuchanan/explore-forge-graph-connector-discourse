import createClient from "openapi-fetch";

import type { paths } from "./api/types";
import { forgeFetch } from "./forge-fetch";

export function discourseBaseUrl(): string {
  const baseUrl = process.env["DISCOURSE_BASE_URL"];

  if (!baseUrl) {
    throw new Error("DISCOURSE_BASE_URL must be set");
  }

  const url = new URL(baseUrl);

  if (url.protocol !== "https:") {
    throw new Error("DISCOURSE_BASE_URL must use HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("DISCOURSE_BASE_URL must not contain credentials");
  }

  return url.href;
}

export function createDiscourseClient(baseUrl = discourseBaseUrl()) {
  return createClient<paths>({ baseUrl, fetch: forgeFetch });
}
