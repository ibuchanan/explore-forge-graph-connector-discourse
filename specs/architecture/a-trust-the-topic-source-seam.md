# A — Make the Topic source seam's no-throw guarantee real

**Strength:** Strong · **Dependency category:** ports & adapters

Best done in one pass with [spec E](e-own-the-seam-types.md), which moves the
same interface declarations into their own module. A changes their meaning; E
changes their address.

## Files

| File                     | Lines   | Role                                                    |
| ------------------------ | ------- | ------------------------------------------------------- |
| `src/discourse/sync.ts`  | 16–24   | `TopicSource` and `TopicPublisher` interfaces           |
| `src/discourse/sync.ts`  | 62–68   | `listLatestTopics` double unwrap                        |
| `src/discourse/sync.ts`  | 74–94   | `getTopic` double unwrap, **two identical skip blocks** |
| `src/discourse/sync.ts`  | 108–116 | `publish` double unwrap                                 |
| `src/discourse/index.ts` | 65, 115 | the adapter's own `fromPromise` — already there         |
| `src/index.ts`           | 251–261 | the publish adapter's `fromPromise` — already there     |

## Problem

Both adapters at this seam already wrap their throwing dependency exactly once
and return a `Result`:

- `src/discourse/index.ts:65` — `listLatestTopics` wraps `client.GET` in
  `fromPromise` and thereafter returns only `err(...)` or `ok(...)`.
- `src/discourse/index.ts:115` — `getTopic`, likewise.
- `src/index.ts:253` — the publish closure wraps `graph.setObjects` in
  `fromPromise`, likewise.

The interfaces say so too: `TopicSource.listLatestTopics` is declared
`Promise<Result<TopicPage, ProblemDetails>>` (`sync.ts:17`), and
`TopicPublisher` is declared `Promise<Result<void, ProblemDetails>>`
(`sync.ts:21–24`).

`sync.ts` does not trust any of it. It wraps every call in a _second_
`fromPromise`, producing `Result<Result<T, ProblemDetails>, ProblemDetails>` and
forcing two unwraps per call:

```ts
// sync.ts:62-68
const latestTopics = await fromPromise(source.listLatestTopics(page), ...);
if (latestTopics.isErr()) return err(latestTopics.error);
if (latestTopics.value.isErr()) return err(latestTopics.value.error);
//     ^^^^^ the inner Result the adapter already returned
```

Three consequences:

1. **Six unwraps where three would do** — lines 67, 68, 77, 87, 114, 115.
2. **The skip-and-log block exists twice, verbatim.** `sync.ts:77–85` handles
   "the outer wrap failed" and `sync.ts:86–94` handles "the inner Result
   failed". Both push to `skippedTopicIds`, both check `status === 429`, both
   call `log.warn` with the identical five-field payload and the identical
   message `"Discourse topic skipped after fetch failure"`. Nothing is broken
   today _because_ they are identical — which is exactly the hazard. They must
   be kept in step by hand, and there is no test that would notice if they
   drifted.
3. **The nested `Result` is load-bearing noise.** `src/index.ts:245` has to
   annotate `Result<SyncProgress, ProblemDetails>` explicitly because the
   inference through this is unpleasant enough to need help.

The inner `fromPromise` in each adapter is doing real work — `client.GET` and
`graph.setObjects` can reject. The outer one in `sync.ts` is defending against
a rejection the interface promises cannot happen, and which no adapter produces.

## Solution

Make the no-throw guarantee part of the interface rather than something each
caller re-checks, and delete the defensive outer wrap.

### Interface change

The type signatures do not change. What changes is that the guarantee becomes
stated and relied upon:

```ts
/**
 * Reads Topics from an external forum.
 *
 * Invariant: every method settles. Adapters convert transport failures into
 * `err(ProblemDetails)` and never reject, so callers unwrap exactly once.
 * A `429` status means the page should be retried later, not that the Topic
 * is unavailable.
 */
type TopicSource = {
  listLatestTopics(page: number): Promise<Result<TopicPage, ProblemDetails>>;
  getTopic(id: number): Promise<Result<Topic, ProblemDetails>>;
};
```

That comment is not decoration — under the `/codebase-design` definition, the
invariant and the error modes _are_ part of the interface, as much as the
signature is.

### What changes in `sync.ts`

Drop the three outer `fromPromise` calls; unwrap once each. The two skip blocks
become one:

```ts
for (const id of latestTopics.value.ids) {
  const topic = await source.getTopic(id);
  if (topic.isErr()) {
    if (topic.error.status === 429) return err(topic.error);
    skippedTopicIds.push(id);
    log.warn(
      { connectionId, page, topicId: id, status: topic.error.status },
      "Discourse topic skipped after fetch failure",
    );
    continue;
  }
  const mappedTopic = mapTopic(topic.value, baseUrl);
  ...
}
```

Roughly 20 lines out of a 136-line module, and the branch count on the hot path
halves.

## Benefits

- **Locality: one skip path, not two.** A change to how a failed Topic is logged
  or counted is a one-place change.
- **Six unwraps become three.** The `Result<Result<…>>` shape disappears, and
  with it the explicit annotation at `src/index.ts:245`.
- **The interface shrinks** in the sense that matters: a caller learns one
  unwrap, not two, and learns why.
- **Existing tests survive unchanged.** `test/discourse-sync.test.ts` already
  builds `TopicSource` literals returning bare `Result` values
  (lines 40–41, 79–82, 108–117) — they satisfy the tightened interface exactly
  as written. This is a strong signal the seam is already the right shape.

## Deletion test

Deleting the outer wraps concentrates error handling at the adapters, where the
throwing dependency actually lives. Complexity vanishes rather than moving — the
clean "yes" case.

## Test plan

No new tests are required; this is a behaviour-preserving change and the
existing suite covers the paths.

Do add one, though, because the deleted defence had a theoretical purpose:

- **An adapter that rejects is a defect, not a handled case.** Decide during
  grilling whether to assert that (a throwing `TopicSource` propagates) or to
  leave it undefined. Asserting it documents the invariant; leaving it undefined
  is also defensible. What is not defensible is the current position — defending
  against it silently, in duplicate, untested.

Verify with `npm run check`, which type-checks and runs the suite.

## Open questions for `/grilling`

- **Does anything actually throw at this seam?** Confirm `log.warn` and
  `log.info` from `@forge-ahead/logging` cannot throw. If they can, the adapter
  methods are not total and the invariant needs narrowing.
- **`429` as a magic number.** `sync.ts:78` and `sync.ts:87` both read
  `status === 429` to mean "stop the page and retry later". That is rate-limit
  policy leaking across the seam as a number. Fixing it properly is
  [spec D](d-collapse-discourse-requests.md) — but collapsing the two skip
  blocks here reduces the leak from two sites to one, which makes D cheaper.
  Decide whether to stop at one site or go straight to a named outcome.
- **Should `TopicPublisher` keep its two-argument shape?** `connectionId` is
  fixed for the whole crawl and is already a parameter of `syncTopics`. Passing
  it per call means the publisher cannot be bound once. Low stakes, but it is
  interface surface that buys nothing.
