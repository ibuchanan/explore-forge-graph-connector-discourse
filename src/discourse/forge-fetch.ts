import { fetch } from "@forge/api";

export const forgeFetch = fetch as unknown as typeof globalThis.fetch;
