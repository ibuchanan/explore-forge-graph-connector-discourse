# D — Collapse the two near-identical Discourse requests

**Strength:** Worth exploring · **Dependency category:** local-substitutable

Largest change of the six, with no untested rule behind it. Do it last.
Cheaper after [spec A](a-trust-the-topic-source-seam.md), which reduces the
`429` leak from two call sites to one.

## Files

| File                     | Lines   | Role                                                                       |
| ------------------------ | ------- | -------------------------------------------------------------------------- |
| `src/discourse/index.ts` | 60–112  | `listLatestTopics`                                                         |
| `src/discourse/index.ts` | 114–157 | `getTopic` — the same six steps again                                      |
| `src/discourse/index.ts` | 21–24   | the response type aliases                                                  |
| `src/discourse/sync.ts`  | 78, 87  | consumers reading `status === 429`                                         |
| `test/discourse.test.ts` | 1–72    | covers `discourseBaseUrl` and `createDiscourseClient` — **neither method** |

## Problem

`createDiscourseTopicSource` returns two methods that repeat the same six steps
and differ only in endpoint, log field name, and projection:

| Step                                                                         | `listLatestTopics` | `getTopic` |
| ---------------------------------------------------------------------------- | ------------------ | ---------- |
| wrap the call                                                                | line 65            | line 115   |
| cast params `as never`                                                       | line 68            | line 118   |
| destructure `data`/`error`/`response`                                        | 78–82              | 124–128    |
| `429` → warn with `retry-after` + `x-ratelimit-remaining`, return `err(429)` | 83–94              | 129–140    |
| `error \|\| !data` → warn, return `unavailable(...)`                         | 95–101             | 141–147    |
| project the payload                                                          | 103–111            | 148–156    |

Everything above the last row is identical in substance. The `429` block in
particular is 12 lines duplicated with three tokens changed.

Three consequences:

1. **The module holding all the transport policy has no tests.**
   `test/discourse.test.ts` covers URL validation and that requests go through
   Forge fetch without an `Api-Key`. The rate-limit handling, the header
   logging, the `error || !data` discrimination, and both projections — the
   substance of the module — are untested. Every bug in the table above is
   currently invisible.

2. **It is hard to test through its current interface**, which is why nobody
   did. `createDiscourseTopicSource` takes a `DiscourseClient`, which means a
   test must stand up `createClient<paths>` over a mocked Forge fetch and get
   the openapi-fetch result shape right. Doable — `test/discourse.test.ts:61`
   nearly does it — but the cost per assertion is high enough that the
   assertions never got written.

3. **The generated types are defeated at the one point they would pay off.**
   Both calls cast their params `as never` (lines 68, 118) and then re-assert
   the result shape by hand as `{ data?, error?, response? }`. So 7,858 lines of
   generated types buy nothing at the two call sites that touch the wire, and
   the cast is written twice with no comment explaining why it is needed.

4. **Rate-limit policy leaks across the seam as a magic number.** The adapter
   encodes "rate limited" as `problemDetails(429, ...)`, and `sync.ts:78` and
   `sync.ts:87` each read `status === 429` to mean "stop the page, retry later".
   The consumer has to know an HTTP status code to understand a control-flow
   decision. That is transport detail crossing a seam that exists to hide it.

## Solution

Absorb the shared six steps into one internal `request`, leaving each method as
its projection. **The interface stays two methods** — the implementation gets
deeper, not the interface.

### Interface sketch

The external interface is unchanged:

```ts
export function createDiscourseTopicSource(
  client: DiscourseClient,
): TopicSource;
```

The internal seam is new and private to the implementation:

```ts
/**
 * One Discourse GET. Converts transport failure, rate limiting, and empty
 * payloads into `ProblemDetails`; logs the diagnostic context for each.
 * Internal — not part of the Topic source interface.
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions,
  context: Record<string, unknown>,
): Promise<Result<T, ProblemDetails>>;
```

Each method then reads as what it is:

```ts
async listLatestTopics(page) {
  const data = await request<LatestTopicsResponse>(
    "/latest.json", { params: { query: { page, per_page: 100 } } }, { page },
  );
  return data.map((payload) => ({ ids: ..., hasMore: ... }));
}
```

This is the "deep module with internal seams" case from `/codebase-design`:
`request` is mockable and testable by the module's own tests without being
visible to callers.

## Benefits

- **Locality: rate-limit policy in one place.** Today a change to how `429` is
  detected, logged, or reported is a two-place change with no test to catch a
  miss.
- **A third endpoint costs a projection.** `/site.json` is already fetched
  directly at `src/index.ts:191`, bypassing the Topic source entirely — with
  `request` in place, the connection probe could move behind the seam where it
  belongs.
- **The internal seam makes the module testable at all** — assertions against
  `request` instead of against a hand-built openapi-fetch client.
- **One place to revisit `as never`**, with one comment explaining it.

## Deletion test

Delete `request` and the six steps reappear in both methods, and in any third.
Complexity concentrates. It earns its keep — which is the argument for it being
an internal seam rather than two more exported helpers.

## Test plan

This is the spec that adds the most coverage, because the module currently has
none of its own.

New tests in `test/discourse.test.ts` (or a new `test/discourse-topic-source.test.ts`):

1. **`listLatestTopics` projects IDs and `hasMore`** — a payload with three
   topics and a `more_topics_url` yields all three IDs and `hasMore: true`.
2. **Non-numeric topic IDs are dropped** — exercises the `flatMap` guard at
   line 103, which currently has no coverage.
3. **Missing `more_topics_url`** yields `hasMore: false`.
4. **`getTopic` projects the Topic** including the `last_posted_at ?? created_at`
   substitution at line 153 — the invariant spec E wants documented.
5. **`429` from either endpoint** yields `err` with status `429`, and logs
   `retry-after` and `x-ratelimit-remaining`.
6. **Upstream error or empty payload** yields status `502`.
7. **Malformed `topic_list`** — `data` present but `topic_list.topics` absent
   yields `502`, not a crash.

Cases 5 and 6 are where the duplication currently lives, and where collapsing it
pays off: they become one test each rather than two.

## Open questions for `/grilling`

- **Should `429` become a named outcome on the interface?** Options: keep
  `ProblemDetails.status === 429` and document it as part of the interface; or
  return a discriminated outcome (`rate-limited` vs `unavailable`) so `sync.ts`
  never reads a status code. The second is cleaner and is a wider change — it
  touches `sync.ts`, and `ProblemDetails` is shared with `@forge-ahead/errors`.
  Decide before writing `request`, since it determines the return type.
- **Why is `as never` needed?** Establish whether it is an openapi-fetch typing
  limitation, a defect in the generated `api/types.ts`, or a workaround that has
  outlived its cause. If it can be removed, that is a better outcome than
  centralising it. This is worth a `/find-docs` pass on openapi-fetch before
  committing to the cast.
- **Should the `/site.json` connection probe move behind this seam?**
  `src/index.ts:190–202` builds a client and calls `GET("/site.json")` inline in
  the handler, duplicating the error-to-`ProblemDetails` conversion. A
  `checkConnection()` method on the Topic source would consolidate it — but it
  is a different concern from reading Topics, so it may deserve its own seam
  rather than a third method here.
- **Is `per_page: 100` (line 68) a Discourse maximum or a choice?** It pairs
  with the 100-object ingestion batch size at `sync.ts:108`. If those two
  numbers are coincidentally equal rather than causally linked, they should not
  look linked.

## Domain glossary obligation

No new terms beyond those already claimed by spec E (**Topic**, **Post**,
**Topic page**, **Topic source**). If the `429` question resolves toward a named
outcome, add:

- **Rate limited** — the forum's refusal to serve further requests for a period.
  The crawl retries the same Topic page later rather than skipping its Topics.

Use the `/domain-modeling` skill.
