# Keep a starter synchronization correct

Re-ingest a small selected data set safely when source records change.

Use a full re-ingestion with stable object IDs and source revision numbers.
It is simpler than
webhooks,
delta tokens,
deletion reconciliation,
and task orchestration,
but it still protects the graph from stale updates.

## Before you begin

You need a connector that can publish one document object.
Read [Concurrency](../explanation/5-concurrency.md)
for the reason that object versions matter.

## 1. Declare a simple update model

Use `upsert` and set incremental synchronization to `false`.

```yaml
modules:
  graph:connector:
    - key: starter-connector
      capabilities:
        replicatesPermissions: false
        syncFidelity: upsert
        supportsIncrementalSync: false
```

`upsert` lets the connector create new objects
and replace existing objects.
A full sync keeps the first implementation simple
because it does not need to save a source cursor or delta token.

## 2. Keep object IDs stable

For every source record,
always use the same source identifier as the graph object ID.

```ts
id: sourceRecord.id;
```

Do not use an array index, the current time, or a random value.
A changed ID creates a different graph object
instead of updating the existing one.

## 3. Use a source revision number

Map an external version counter to `updateSequenceNumber`.

```ts
updateSequenceNumber: sourceRecord.revision;
```

The value must increase for each newer state of the same source record.
A reliable source revision counter is better
than a connector-generated time value
because it describes the source record's own order of change.

## 4. Re-ingest the selected records

On a manual trigger or a simple scheduled run,
read every selected source record.
Transform each record with its stable ID and current revision.
Then set the objects for the active `connectionId`.

For the first iteration,
use a small source selection
that you can inspect by hand.
Repeat the run after you change one source record.

## 5. Verify that stale data cannot win

Publish a record at revision 2.
Then retry the earlier revision-1 payload.
Confirm that the older payload does not replace the revision-2 state.

Also confirm that a repeated revision-2 run does not create a duplicate object.

## Result

You have a correct starter update path.
It handles new records, changed records, and safe retries
without relying on webhooks or incremental state.

## Evolve after the first synchronization works

Add the next capability that your source requires:

- incremental sync when the full selected data set becomes expensive;
- webhooks or connector tasks when updates need lower latency;
- `mirror` and explicit deletion handling when removed source records must
  disappear from the graph;
- monitoring and reconciliation when the connector runs at scale.
