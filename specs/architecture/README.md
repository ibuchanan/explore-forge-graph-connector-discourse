# Architecture deepening specs

Candidates from the architecture review of 17 Sep 2026 (`main` @ `d20c56c`).

Each spec is self-contained: a fresh session can pick up any one file without
having read the others. Where two specs touch the same lines, the spec says so.

## Vocabulary

These specs use the `/codebase-design` vocabulary exactly. Use these terms and
not their neighbours:

- **Module** — anything with an interface and an implementation. Not
  "component", "service", or "unit".
- **Interface** — everything a caller must know to use the module correctly:
  type signature, invariants, ordering constraints, error modes, required
  configuration. Not "API" or "signature", which cover only the type surface.
- **Implementation** — what is inside the module.
- **Depth** — behaviour a caller or test can exercise per unit of interface it
  must learn. **Deep** = small interface, large implementation. **Shallow** =
  interface nearly as complex as the implementation.
- **Seam** — a place where behaviour can be altered without editing in that
  place; where a module's interface lives. Not "boundary".
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers gain from depth.
- **Locality** — what maintainers gain from depth: change, bugs, and
  verification concentrate in one module.

Two principles the specs lean on:

- **The deletion test.** Imagine deleting the module. If complexity vanishes it
  was a pass-through. If complexity reappears across N callers it was earning
  its keep.
- **One adapter is a hypothetical seam. Two adapters is a real one.**

## Order of work

Recommended sequence. The dependencies are soft — each spec notes any real
coupling.

| #   | Spec                                                                    | Strength        | Why here                                         |
| --- | ----------------------------------------------------------------------- | --------------- | ------------------------------------------------ |
| 1   | [B — Crawl state module](b-crawl-state-module.md)                       | Strong          | The only candidate sitting on untested behaviour |
| 2   | [C — Ingestion rejection module](c-ingestion-rejection-module.md)       | Strong          | Same file as B, immediate test payoff            |
| 3   | [A — Trust the Topic source seam](a-trust-the-topic-source-seam.md)     | Strong          | Deletes branches; pairs with E                   |
| 4   | [E — Own the seam types](e-own-the-seam-types.md)                       | Worth exploring | Cheap, improves navigability; do with A          |
| 5   | [D — Collapse the Discourse requests](d-collapse-discourse-requests.md) | Worth exploring | Largest change, no untested rule behind it       |
| 6   | [F — forge-fetch is not a seam](f-forge-fetch-is-not-a-seam.md)         | Speculative     | Recorded for completeness; **not** recommended   |

## Cross-cutting: the domain glossary describes a different project

`CONTEXT.md` and `README.md` define _Supplychain Graph_ — Site relationship,
Authorization lease, Pairing, Source Epic, Starter projection. **None of those
terms appears anywhere in `src/`.**

The concepts this codebase actually turns on are named nowhere but in the code:

- **Topic** — one Discourse topic and its posts, as the Topic source yields it.
- **Post** — one message within a Topic.
- **Conversation** / **Message** — the `atlassian:conversation` and
  `atlassian:message` graph objects a Topic projects into.
- **Topic page** — one page of topic IDs from `/latest.json`, plus whether more
  pages follow.
- **Crawl state** — the tenant-local record of how far a connection's crawl has
  progressed, and the cumulative totals so far.
- **Sync progress** — what one page of crawling produced.
- **Ingestion rejection** — the graph's refusal of some objects in a
  `setObjects` call, and the reasons.

Every spec below that introduces or renames a module states which of these terms
it needs added to `CONTEXT.md`. **Treat that as part of the work, not a
follow-up.** Run the `/domain-modeling` skill to add them.

## No ADRs exist

`docs/adr/` is absent. Nothing in these specs contradicts a recorded decision.
If you reject a candidate for a reason a future reviewer would need in order to
avoid re-suggesting it, record an ADR then — that is the point at which
`docs/adr/` should come into existence.

## Already deep — the local model

`src/discourse/map-topic.ts` is what these specs are trying to make the rest of
the codebase look like: two parameters in, graph objects out, every projection
rule behind that one interface, and 217 lines of tests crossing exactly that
seam with no mocks.

It is also the only module whose recent bug fixes (`post_number` for the
original post at `d20c56c`, Markdown title stripping at `d48d70a`) landed as
one-line changes with a test each. That is locality paying out, and it is the
argument for specs B and C.

Two nits in it, neither architectural, both unclaimed by any spec here:

- `map-topic.ts:83` — the `reply_to_post_number` lookup is a `find` inside a
  `map`, so it is quadratic in posts per topic.
- `map-topic.ts:131,134` — the member `Set` is built twice, once for `members`
  and once for `memberCount`.
