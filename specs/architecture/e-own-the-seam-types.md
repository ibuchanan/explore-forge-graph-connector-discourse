# E — Put the seam's types where the seam is

**Strength:** Worth exploring · **Dependency category:** ports & adapters

Best done in one pass with [spec A](a-trust-the-topic-source-seam.md). A changes
what these declarations mean; E changes where they live.

## Files

| File                            | Lines | Role                                                 |
| ------------------------------- | ----- | ---------------------------------------------------- |
| `src/discourse/map-topic.ts`    | 28–38 | `Topic` — declared here, produced by the adapter     |
| `src/discourse/map-topic.ts`    | 15–26 | `TopicPost` — the post projection `Topic` depends on |
| `src/discourse/sync.ts`         | 14    | `TopicPage` — declared here, produced by the adapter |
| `src/discourse/sync.ts`         | 16–19 | `TopicSource` — not exported                         |
| `src/discourse/sync.ts`         | 21–24 | `TopicPublisher` — not exported                      |
| `src/discourse/index.ts`        | 18–19 | the adapter importing both from its consumers        |
| `src/discourse/topic-source.ts` | —     | new                                                  |

## Problem

The contract that crosses this seam is spread across the three modules that use
it, and the dependency arrows run backwards.

`src/discourse/index.ts` is the HTTP adapter. It _produces_ `Topic` and
`TopicPage`. It imports both from elsewhere:

```ts
// src/discourse/index.ts:18-19
import type { Topic } from "./map-topic";
import type { TopicPage } from "./sync";
```

So:

- `Topic` is declared in `map-topic.ts`, the module that _consumes_ a `Topic`.
- `TopicPage` is declared in `sync.ts`, the module that _consumes_ a
  `TopicPage`.
- `sync.ts` imports `mapTopic` and `Topic` from `map-topic.ts`, and holds a
  `TopicSource` it never names publicly.
- The adapter therefore depends on both modules that depend on it.

Two costs:

1. **Learning one contract means opening three files.** "What does the Topic
   source hand me?" is answered in `map-topic.ts`; "what does a page look like?"
   in `sync.ts`; "what methods exist?" in `sync.ts` but unexported, so it cannot
   be referenced by name from anywhere else. `test/discourse-sync.test.ts:28`
   has to reach it as
   `Parameters<typeof syncTopics>[0]["source"]` — a type-level detour that only
   exists because the interface has no name to import.

2. **A second adapter is more expensive than it should be.** Anything satisfying
   this seam must import its own output types from the sync loop and the
   projection — which is backwards, and which couples any future adapter to
   modules it has no business knowing.

There is a wrinkle worth noticing: `Topic` at `map-topic.ts:28–38` is not a
clean port type. It is derived from the generated OpenAPI response
(`Omit<Pick<TopicResponse, ...>>`) with `last_posted_at` widened to a required
`string`, and it carries a comment explaining that the HTTP adapter substitutes
`created_at` when the timestamp is missing. That comment is documenting adapter
behaviour from inside the projection module — the clearest possible sign the
type is living in the wrong place.

## Solution

One module owning the four seam types. The HTTP adapter, the sync loop, and the
projection all depend on it; it depends on nothing but the generated types.

### Interface sketch

```ts
// src/discourse/topic-source.ts
import type { operations } from "./api/types";

type TopicResponse = operations["getTopic"]["responses"][200]["content"]["application/json"];

export type TopicPost = Pick<TopicResponse["post_stream"]["posts"][number], ...>;

/**
 * One Discourse Topic as a Topic source yields it.
 *
 * `last_posted_at` is required here even though Discourse may omit it: adapters
 * substitute `created_at`, so consumers always have a timestamp.
 */
export type Topic = ... & { last_posted_at: string; posts: TopicPost[] };

/** One page of Topic IDs, and whether further pages follow. */
export type TopicPage = { ids: number[]; hasMore: boolean };

export type TopicSource = { ... };
export type TopicPublisher = ...;
```

`map-topic.ts` imports `Topic`. `sync.ts` imports `Topic`, `TopicPage`,
`TopicSource`, `TopicPublisher`. `discourse/index.ts` imports what it produces.
Every arrow points one way.

`SyncProgress` (`sync.ts:26–34`) is a judgement call — it is the sync loop's
output, not something crossing this seam. Leave it in `sync.ts` unless spec B
decides the Crawl state module should own it.

## Benefits

- **One file answers "what crosses this seam".** The main AI-navigability win
  here: the contract stops being a three-file scavenger hunt.
- **No cycles between adapter and consumer.** The adapter depends only on the
  port.
- **A second adapter becomes cheap** — import one module, satisfy it.
- **The `last_posted_at` comment lands where it is true**, next to the invariant
  it describes, instead of inside the projection.
- **`TopicSource` gets a name tests can import**, replacing the
  `Parameters<typeof syncTopics>[0]["source"]` detour.

## Deletion test

Not the right question for a types-only module — it holds no behaviour, so
deleting it moves declarations rather than concentrating complexity. Judge this
one on locality and on seam placement instead: does the contract have one
address, and do the arrows point one way? Today, no to both.

## Is this seam real?

Under "one adapter is a hypothetical seam, two adapters is a real one", this
looks hypothetical — there is one HTTP adapter.

It is not. `test/discourse-sync.test.ts:38–41`, `79–82` and `108–117` build
`TopicSource` literals by hand. That is the second adapter, and it already
exists. The seam is real; it just has no address.

**But keep the change proportionate.** Move the types. Do not introduce a
registry, a factory, or a `createTopicSource` abstraction over the two adapters
— nothing varies that would justify it.

## Test plan

No new tests. This is a pure move; `npm run check` type-checks it.

One cleanup to include: replace
`Parameters<typeof syncTopics>[0]["source"]` at `test/discourse-sync.test.ts:28`
with a direct `TopicSource` import.

## Open questions for `/grilling`

- **Should `Topic` stay derived from the generated OpenAPI types, or become an
  independent port type?** Deriving keeps it honest about the wire format but
  couples the port to `api/types.ts` (7,858 generated lines). Declaring it
  independently decouples the port but means the adapter's projection is
  unchecked against the schema. Genuine trade-off; decide explicitly.
- **Does `TopicPost` belong in the port at all?** Only `map-topic.ts` reads
  individual post fields. The adapter passes `data.post_stream.posts` straight
  through (`discourse/index.ts:155`), so the port could treat posts opaquely —
  but then the projection needs the shape from somewhere.
- **Module name.** `topic-source.ts` names it after the reading half and leaves
  `TopicPublisher` looking like a lodger. Alternatives worth weighing:
  `topic-port.ts`, or splitting the reading and publishing ports into two
  modules. Check the result against `CONTEXT.md` once the terms are added there.

## Domain glossary obligation

Add to `CONTEXT.md`:

- **Topic** — one Discourse topic and its posts, as a Topic source yields it.
  Always carries a last-posted timestamp; adapters substitute the creation
  timestamp when Discourse omits one.
- **Post** — one message within a Topic, identified by its post number within
  that Topic.
- **Topic page** — one page of Topic IDs from the forum's latest-topics
  listing, plus whether further pages follow.
- **Topic source** — the seam through which the connector reads Topics. Two
  adapters satisfy it: the Discourse HTTP client, and the literals the sync
  tests build.

Use the `/domain-modeling` skill.
