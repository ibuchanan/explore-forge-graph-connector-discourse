# Concurrency

Concurrency keeps the graph projection correct when the external system changes
faster than the connector can deliver updates.

External events can arrive late, arrive twice, or run in parallel. Without a
way to order updates, an older record can overwrite a newer record in the
Teamwork Graph.

## Use a monotonic update sequence number

Each object payload includes an `updateSequenceNumber`. The value must increase
for each newer version of the same object.

For example, an external record can move from version 41 to version 42. If the
connector first sends version 42 and later retries version 41, Teamwork Graph
can reject or ignore the stale version.

The sequence number can come from a reliable external revision number or from
another value that always increases for that object. The connector should not
use a value that can move backward or collide for separate updates.

## Declare the sync model

The connector declares its broad synchronization behavior in the manifest.

- **`append`:** Publishes new objects only. Existing objects do not change.
- **`upsert`:** Publishes new objects and updates existing objects. Source
  deletions can remain in the graph.
- **`mirror`:** Publishes additions, updates, and removals so the graph follows
  the source lifecycle.

The connector can also declare whether it supports incremental synchronization.
An incremental sync gets only records that changed since a known point. A full
sync reads the complete selected data set.

## Support retries and recovery

A connector should make repeated delivery safe. Stable object IDs and increasing
update sequence numbers let the app retry a payload without creating duplicate
objects or replacing newer data with older data.

If the connector misses events, it can reconcile from the external system and
send the current object versions. In a mirror model, it should also reconcile
removals.

## The complete story

A `graph:connector` creates a managed connection, applies an access model,
projects useful objects, links them to relevant work, and keeps those objects
current. These responsibilities work together to make external work useful and
trustworthy in Atlassian.
