# Verify a peer event flow through logs

Use this procedure to prove that a peer event was received and either forwarded to Automation or refused by the destination site.

## Prerequisites

- The source and destination apps are deployed and paired.
- The destination has a current, authorized pairing for the source Epic and operation.
- The destination's log sink is configured and reachable.
- You can view the destination Forge logs and the configured sink.

## Verify an accepted delivery

1. On the source site, perform the paired operation that emits a peer event. Do not manufacture a web-trigger request or copy its HMAC headers.
2. In the destination Forge logs, find the `scg.peer.event.flow` record whose `outcome` is `received` and note its `correlationId`.
3. Filter the destination Forge logs and the log sink by that `correlationId`.
4. Confirm the records, in order, have these outcomes:

   ```text
   received
   authenticated
   replay-checked
   authorized
   forwarded
   ```

5. Confirm the destination Automation rule ran and that the paired Epic reflects the forwarded change.
6. Inspect the records in both destinations. They must contain only `correlationId`, `event`, `outcome`, and `route`; they must not contain a shared secret, HMAC signature, request body, or Automation webhook URL.

## Verify a refusal

1. Produce one expected refusal using a non-production test pairing, for example by attempting an operation outside its allowlist.
2. Find the destination `scg.peer.event.flow` record with `outcome: received` and use its `correlationId` to filter the logs and sink.
3. Confirm the correlated `scg.peer.request.denied` record has `outcome: denied` and the expected `reason`, such as `operation-not-allowed`, `receiver-mismatch`, or `request-replayed`.
4. Confirm no Automation rule ran for the refused request.
5. Keep the correlation ID, the filtered sink records, the destination Forge-log records, and the resulting Jira/Automation state as the verification evidence for the change.
