# C — Stop scraping the Ingestion rejection out of a sentence

**Strength:** Strong · **Dependency category:** in-process

## Files

| File                                         | Lines   | Role                                                               |
| -------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `src/index.ts`                               | 52–54   | `IngestionRejection` type                                          |
| `src/index.ts`                               | 56–90   | `summarizeIngestionFailure` — the string surgery                   |
| `src/index.ts`                               | 251–275 | the publish adapter that flattens the response, then calls it      |
| `test/index.test.ts`                         | 132–198 | a test of this module wearing 60 lines of `taskRunner` scaffolding |
| `src/discourse/ingestion-rejection.ts`       | —       | new                                                                |
| `test/discourse-ingestion-rejection.test.ts` | —       | new                                                                |

Shares `src/index.ts` with spec B. Doing B first is easier; they do not conflict
textually (B touches 295–344, C touches 52–90 and 251–275).

## Problem

`summarizeIngestionFailure` recovers structured data by cutting a substring out
of a human-readable error message and re-parsing it:

```ts
const start = error.indexOf('{"accepted"');
const end = error.lastIndexOf("} (Trace ID:");
const traceId = error.match(/\(Trace ID: ([^)]+)\)/)?.[1];
...
JSON.parse(error.slice(start, end + 1))
```

Three things are wrong with the shape, not the code:

1. **The structured data was already in hand and was thrown away.** At line 265
   the adapter takes `published.value.error` — a formatted sentence — and
   discards `published.value`, which carries `originalError` with the upstream
   detail. `test/index.test.ts:137` shows the response really does contain
   `originalError: { details: "full upstream response" }`. The module then
   spends 35 lines reconstructing, by string surgery, a worse version of what it
   discarded.

2. **It is coupled to a message format it does not own.** The two sentinels
   `'{"accepted"'` and `"} (Trace ID:"` are `@forge/teamwork-graph`'s
   formatting, not a contract. A wording change upstream silently routes every
   call into the fallback branch, which is the same "Could not publish Discourse
   topics" string the code would emit if it had never tried.

3. **It has no test surface of its own.** The only test that exercises it
   (`test/index.test.ts:132`) must construct a task-info KVS response, a crawl
   state, a topic source with a full `Topic` fixture, a `setObjects` rejection,
   and a task-status response — five pieces of scaffolding to assert one string.
   That test is a test of this module. It just cannot say so.

There is also duplication inside the implementation: the fallback
`traceId ? ... : ...` ternary appears twice, verbatim, at lines 61–63 and 86–88.

## Solution

An **Ingestion rejection** module that takes the whole `setObjects` response
rather than a flattened string. The publish adapter hands it the response it
already has.

### Interface sketch

Not final. Settle it with `/grilling`; the shape of the response type is the
main unknown — see _Open questions_.

```ts
/**
 * One-line summary of why the graph refused objects, for the task result
 * message. Counts rejections by error key, caps the enumeration, and carries
 * the trace ID when the response has one.
 */
export function summarizeRejection(response: SetObjectsResponse): string;
```

One function. One parameter. The caller no longer needs to know that a trace ID
exists, that rejections have keys, or that any of it was ever a string.

### What changes in the publish adapter

`src/index.ts:261–274` becomes roughly:

```ts
if (published.isErr()) return err(published.error);
if (published.value.success) return ok(undefined);

log.debug?.(
  () => ({ connectionId, objectCount: objects.length, response: published.value }),
  "Discourse topic ingestion failed",
);
return unavailable(summarizeRejection(published.value));
```

The `log.debug` call stays exactly as it is — reserving the full response for
debug logs is deliberate (`47f120a`, "Summarize ingestion errors") and this spec
does not disturb it.

## Benefits

- **Message-format drift stops breaking it.** Reading `rejected[]` off the
  response cannot be invalidated by upstream re-wording.
- **The interface is the test surface** — fixtures in, sentences out, no Forge
  mocks. The existing 60 lines of scaffolding go away.
- **`src/index.ts` loses ~40 lines** of parsing and one duplicated fallback.
- **Leverage** — with the structured response in scope, a richer summary (which
  object IDs, which schema fields) costs implementation, not interface.

## Deletion test

Delete the module and the string surgery reappears inline in the publish
adapter, where it would sit alongside task lookup and crawl bookkeeping.
Complexity concentrates behind the interface. It earns its keep.

## Test plan

New `test/discourse-ingestion-rejection.test.ts`, no mocks. Reuse the fixture
already embedded at `test/index.test.ts:133–138`.

1. **Single rejection with a trace ID** — reproduces today's asserted output:
   `Could not publish 1 Discourse objects (conversationData.schemaVersion.invalid × 1) (Trace ID: trace-123)`.
2. **Counts group by key** — three rejections sharing one error key tally as
   `key × 3`.
3. **Enumeration caps at five keys** — seven distinct keys yield five plus
   `+2 more`.
4. **No trace ID** — the trace clause is omitted, not rendered empty.
5. **No `rejected` array** — falls back to the generic sentence without
   throwing.
6. **Malformed or absent structured detail** — falls back, still one branch.

Then reduce `test/index.test.ts:132–198` to what it is actually for: that
`taskRunner` returns `success: false` with the summary as its message, and
reserves the full response for the debug log.

## Open questions for `/grilling`

- **What is the real shape of the `setObjects` response?** `graph.setObjects`
  returns `{ success, error?, originalError? }` based on the test fixture and
  the current code, but the published type from `@forge/teamwork-graph` should
  be checked rather than inferred. If `originalError` is typed as `unknown`,
  decide whether the module narrows it or whether the string path stays as a
  documented fallback.
- **Keep the string path as a fallback, or drop it?** If `originalError` is
  reliably populated the surgery can go entirely. If it is not, the module keeps
  both paths — but behind one interface, which is still the win.
- **Does the 5-key cap belong in the interface?** It is a presentation choice
  driven by the task-result message length limit. If that limit is real it is an
  invariant worth stating; if it is a guess, say so.
- **Should the summary be a `ProblemDetails` rather than a `string`?** Every
  caller immediately wraps it in `unavailable(...)`. One adapter, so this may be
  a hypothetical seam — do not add structure without a second caller.

## Domain glossary obligation

Add to `CONTEXT.md`:

- **Ingestion rejection** — the Teamwork Graph's refusal of some or all objects
  in one `setObjects` call, together with the per-object error keys explaining
  why. A partial rejection still leaves the accepted objects published.

Use the `/domain-modeling` skill.
