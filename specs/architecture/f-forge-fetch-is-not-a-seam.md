# F — `forge-fetch.ts` is not a seam

**Strength:** Speculative · **Dependency category:** mock

> **Recorded for completeness. Not recommended.** The deletion test comes back
> negative. This file exists so a future review does not re-raise it as though
> it were new, and so the one thing actually worth doing here is written down.

## Files

| File                           | Lines | Role                                          |
| ------------------------------ | ----- | --------------------------------------------- |
| `src/discourse/forge-fetch.ts` | 1–3   | the entire module                             |
| `src/discourse/index.ts`       | 57    | its only consumer                             |
| `test/discourse.test.ts`       | 8     | mocks `@forge/api` directly, reaching past it |

## The module

```ts
import { fetch } from "@forge/api";

export const forgeFetch = fetch as unknown as typeof globalThis.fetch;
```

Interface: one binding. Implementation: one cast. Interface and implementation
are the same size, which is shallow by definition.

## Why it looks like a candidate

Two reasons, and both hold up:

1. **It is shallow.** There is no behaviour behind the interface — nothing a
   caller gains by learning it beyond what `@forge/api` already offers.

2. **It is not the test seam either.** `test/discourse.test.ts:8` does
   `vi.mock("@forge/api", () => ({ fetch }))` — it substitutes the dependency
   _underneath_ this module, not at it. Nothing substitutes at this seam in
   production or in tests. Under "one adapter is a hypothetical seam, two
   adapters is a real one", there are **zero** adapters here.

## Why it is not worth acting on

The deletion test is the honest answer, and it comes back negative:

- Delete the module, and the cast lands inline at `src/discourse/index.ts:57`:
  `createClient<paths>({ baseUrl, fetch: fetch as unknown as typeof globalThis.fetch })`.
- Complexity **moves**. It does not vanish, and it does not concentrate.

That is a wash. One file deleted, one line made worse. No test changes either
way, because the tests never crossed this seam.

The remaining argument for keeping it — that it gives the cast somewhere to live
with a name — is real but weak. It is not the argument that "deep module" makes;
it is just tidiness.

## The thing actually worth doing

The cast is a double cast through `unknown`, which is TypeScript's way of saying
"these two types are unrelated and I am overruling you". Nothing in the repo
records why that is safe:

- Which parts of `globalThis.fetch` does Forge's `fetch` genuinely not
  implement?
- Is the cast covering a real behavioural gap that openapi-fetch happens not to
  exercise, or only a declaration mismatch?
- Will it stop being needed after a `@forge/api` upgrade?

A future reader — human or agent — has no way to answer those from the code.

**Recommended action: leave the module where it is and add the comment.** Use
the `/comment-code` skill. That is a few minutes of work and it is the whole
value available here.

If the cast turns out to be unnecessary, removing it is a better outcome than
either keeping or deleting this module — and it would make the module genuinely
empty, at which point deleting it costs nothing. Spec D raises the same question
about the `as never` casts at `src/discourse/index.ts:68,118`; if you
investigate one, investigate all three together.

## If you disagree and delete it anyway

Fine — it is a two-line change with no test impact. But record an ADR either
way, because the next architecture review will otherwise re-derive this whole
analysis from scratch. Frame it as: _"`forge-fetch.ts` is deliberately a shallow
named cast, not a seam"_, or the converse. Use the `/domain-modeling` skill,
which covers ADRs. `docs/adr/` does not exist yet; this would be its first
entry.

## Domain glossary obligation

None. Nothing here is a domain concept.
