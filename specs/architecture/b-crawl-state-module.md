# B — Give Crawl state a module

**Strength:** Strong · **Dependency category:** in-process · **Recommended first**

## Files

| File                                 | Lines   | Role                                                  |
| ------------------------------------ | ------- | ----------------------------------------------------- |
| `src/index.ts`                       | 35–43   | `CrawlState` type                                     |
| `src/index.ts`                       | 47      | `crawlStateKey`                                       |
| `src/index.ts`                       | 233–243 | read Crawl state, derive `page`                       |
| `src/index.ts`                       | 295–344 | **the rule, written inline**                          |
| `test/index.test.ts`                 | 96–130  | the only test that reaches it, via three module mocks |
| `src/discourse/crawl-state.ts`       | —       | new                                                   |
| `test/discourse-crawl-state.test.ts` | —       | new                                                   |

## Problem

Resumable pagination is the one rule in this app that is genuinely the app's
own. It has no module, no name, and no test that does not first stand up three
Forge mocks.

The rule currently lives at `src/index.ts:295–344`, inline inside `taskRunner`,
between the `kvs.get` that precedes it and the `kvs.set` that follows. It does
four separate things:

1. **Accumulate counters** across pages — `discoveredTopics`,
   `publishedTopics`, `publishedObjects`, `skippedTopics` are each summed from
   the previous Crawl state and the new Sync progress (lines 307–318).
2. **Widen the temporal window** — the previous `oldestPostAt` / `newestPostAt`
   and the new ones are concatenated, filtered to strings, sorted
   lexicographically, then the first and last are taken (lines 299–306,
   318–320).
3. **Decide the next page** — `nextPage: page + 1`, carrying the cumulative
   totals forward (line 339).
4. **Reset on completion** — when `!synced.value.hasMore`, the whole state
   collapses to `{ nextPage: 0 }`, discarding every cumulative total
   (lines 322, 338).

None of this touches I/O. All of it is unreachable from a test except through
`taskRunner`, which requires mocking `@forge/kvs`, `@forge/teamwork-graph` and
the whole `../src/discourse` module (`test/index.test.ts:32–44`).

The consequence is visible in the test suite: **no test exercises a second
page.** `test/index.test.ts:96` asserts `{ nextPage: 1, discoveredTopics: 0 }`
from an empty first page. The accumulation arithmetic, the timestamp widening,
and the completion reset have no coverage at all. This is pure logic hiding in
how it is called.

## Solution

A **Crawl state** module owning the type, the KVS key, and the rule.
`taskRunner` keeps the read and the write — the I/O stays where it is — and the
rule moves behind one interface.

### Interface sketch

Not final. Settle it with `/grilling` before writing the implementation; see
_Open questions_ below.

```ts
export type CrawlState = {
  nextPage: number;
  discoveredTopics?: number;
  publishedTopics?: number;
  publishedObjects?: number;
  skippedTopics?: number;
  oldestPostAt?: string;
  newestPostAt?: string;
};

/** KVS key for one connection's Crawl state. */
export function crawlStateKey(connectionId: string): string;

/** Page the crawl should request next, given what was stored. */
export function pageToCrawl(stored: CrawlState | undefined): number;

/**
 * Fold one page's Sync progress into the stored Crawl state.
 * Returns the state to persist: cumulative totals and the next page while
 * pages remain, a reset state once the crawl completes.
 */
export function advance(
  stored: CrawlState | undefined,
  progress: SyncProgress,
): CrawlState;
```

Three functions, two of which are one-liners. `advance` is the deep one: all
four behaviours above sit behind a signature a caller learns in one reading.

### What changes in `taskRunner`

Lines 295–344 collapse to roughly:

```ts
advanced = synced.isErr()
  ? err(synced.error)
  : await fromPromise(
      kvs.set(
        crawlStateKey(request.connectionId),
        advance(crawlState.value, synced.value),
      ),
      (error) =>
        toProblemDetails(error, 502, "Could not save Discourse crawl state"),
    );
```

The `log.info` at lines 323–333 stays in `taskRunner` — it is observability on
the decision, not part of it. It can read the returned `CrawlState` and derive
`completed` from `nextPage === 0`, or `advance` can return `completed` alongside
the state. Decide during grilling.

## Benefits

- **Locality** — resume bugs concentrate in one module. Today a wrong total or a
  lost timestamp is a bug in a 110-line handler that also does task lookup,
  publishing, and status reporting.
- **The interface becomes the test surface** — `advance` is a pure function over
  two plain values. Multi-page behaviour becomes four cheap assertions instead
  of being untestable.
- **`taskRunner` loses ~45 lines** of arithmetic, leaving it as what it should
  be: read, sync, write, report.
- **Names a concept the domain glossary is missing.**

## Deletion test

Inverted, and that is the point. The rule is already "deleted" in the sense of
having no module — which is precisely why the only way to test it is through
three mocks. Extracting it concentrates complexity that is currently smeared
across a handler.

## Test plan

New `test/discourse-crawl-state.test.ts`, no mocks:

1. **First page, more to come** — `advance(undefined, progress)` returns
   `nextPage: 1` with the page's own totals as the cumulative totals.
2. **Second page accumulates** — stored totals plus new progress sum correctly,
   and `nextPage` advances. _This is the case with no coverage today._
3. **Temporal window widens** — a stored window and a new page that extends it
   in both directions yield the outer bounds.
4. **Temporal window survives a page with no posts** — a page whose progress
   omits both timestamps must not erase the stored window.
5. **Completion resets** — `hasMore: false` yields `{ nextPage: 0 }`.
6. **`pageToCrawl(undefined)`** is `0`; `pageToCrawl({ nextPage: 3 })` is `3`.

Then trim `test/index.test.ts:96–130`: it keeps asserting that `taskRunner`
reads and writes the right KVS key and reports task status, and stops being the
only route to the arithmetic.

## Open questions for `/grilling`

- **Does the completion reset really want to discard the cumulative totals?**
  Line 338 writes `{ nextPage: 0 }` and drops every count and both timestamps.
  That may be intentional — the next full scan recomputes them — but it means
  the totals are only ever observable mid-crawl, never for a completed crawl.
  Worth deciding deliberately rather than inheriting.
- **Lexicographic timestamp sorting** (lines 306, 42 in `sync.ts`) is correct
  only for same-offset ISO-8601 strings. Discourse returns UTC `Z` timestamps,
  so it holds today. Should the module state that as an invariant in its
  interface, or parse to instants?
- **Should `advance` return `completed` explicitly**, or should callers infer it
  from `nextPage === 0`? The latter makes `nextPage: 0` mean two things — "start
  here" and "we just finished".
- **Does `SyncProgress` belong to this module or to the sync loop?** It is
  currently exported from `src/discourse/sync.ts:26`. See spec E, which moves
  the other seam types; `SyncProgress` may or may not belong with them.

## Domain glossary obligation

Add to `CONTEXT.md`:

- **Crawl state** — the tenant-local record of how far one connection's crawl
  has progressed, plus the cumulative totals and temporal window observed so
  far. Reset when the crawl completes.
- **Sync progress** — what one page of crawling produced: topics discovered,
  published, and skipped, objects published, the page's temporal window, and
  whether further pages remain.

Use the `/domain-modeling` skill.
