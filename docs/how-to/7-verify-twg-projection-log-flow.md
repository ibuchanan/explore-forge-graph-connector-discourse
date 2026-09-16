# Verify the Teamwork Graph projection flow through logs

Use this procedure after a deployed Supplychain Graph change to prove that package projection evidence reaches the configured log sink and that it is safe to retain.

## Prerequisites

- The destination app is deployed with a configured CloudEvent log sink.
- You can inspect destination Forge logs and the sink's received CloudEvents.
- You have a non-production connection and a published test package.

## Verify an indexed projection

1. Create or update the Teamwork Graph connection for the test package.
2. In the sink, find `scg.graph.connection.changed` by `connectionId`.
3. Find its `scg.graph.connection.completed` record. For an indexed package, confirm it has `status: indexed`, a numeric `ingested` count, `sourceEpicId`, and the package `correlationId`.
4. Filter the sink by that `correlationId`. Confirm the matching `scg.graph.publish.completed` record has the same `connectionId`, `sourceEpicId`, package `version`, and indexed count.
5. Confirm the expected package objects are discoverable in Teamwork Graph. The sink count must equal the number of objects written.

## Verify suppression and retraction

1. Remove the test package's active Pairing (or use a receipt state without a current package), then update the connection.
2. Find the `scg.graph.connection.completed` record for the connection.
3. Confirm `status: suppressed` and the specific `reason` (`no-current-package` or `pairing-unavailable`). It must not be reported as `failed`.
4. Confirm the prior package objects have been removed from Teamwork Graph by the pairing properties.

## Verify a graph-write failure

1. In a non-production environment, make the graph write fail using the approved test mechanism.
2. Confirm the connection completion record has `status: failed`, `success: false`, and `reason: graph-write-failed`.
3. Confirm it is distinguishable from the indexed and suppressed records above.

## Retain safe evidence

For every captured CloudEvent, verify that its data contains only the correlation and approved operational fields: event identity, connection ID, source Epic ID, version, status/outcome, reason, and object count. Do not retain Jira descriptions, comments, endpoint URLs, credentials, HMAC signatures, or request bodies.

Record the connection ID, correlation ID, filtered sink events, and Teamwork Graph observation with the deployment change. Repeat this procedure after modifying projection, connector, or logging code.
