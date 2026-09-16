# Publish one external record as a document

Make one selected external record discoverable in Teamwork Graph
as an `atlassian:document` object.

Start with a document
even when the source record will eventually map to a more specific type.
A document needs a small, understandable projection:
a stable identifier, a title, a source URL, timestamps, and useful text.

## Before you begin

You need an active connector `connectionId`
and a source record that every site user may see.
This guide uses the workspace-wide model from
[Share data with all site users](2-share-data-with-all-site-users.md).

## 1. Declare the document object type

Include `atlassian:document` in the connector manifest.

```yaml
modules:
  graph:connector:
    - key: starter-connector
      objectTypes:
        - atlassian:document
```

## 2. Map one source record to a small document

Use a stable source identifier for `id`.
Use a source revision number for `updateSequenceNumber`.
Put the useful summary in the document content.

```ts
const document = {
  schemaVersion: "1.0",
  id: sourceRecord.id,
  updateSequenceNumber: sourceRecord.revision,
  displayName: sourceRecord.title,
  url: sourceRecord.url,
  createdAt: sourceRecord.createdAt,
  lastUpdatedAt: sourceRecord.updatedAt,
  permissions: [
    {
      accessControls: [{ principals: [{ type: "EVERYONE" }] }],
    },
  ],
  "atlassian:document": {
    type: {
      category: "document",
      mimeType: "text/plain",
    },
    content: {
      mimeType: "text/plain",
      text: sourceRecord.summary,
    },
  },
};
```

Use a real source URL and source timestamps.
Do not generate a new object ID on each run.

## 3. Send the object for the active connection

Use the Connector SDK object operation that sets objects.
Pass the active `connectionId`
and the single document object.

```ts
import { graph, type DocumentObject } from "@forge/teamwork-graph";

const result = await graph.setObjects({
  connectionId,
  objects: [document as DocumentObject],
});

if (!result.success) {
  throw new Error(`Could not publish the document: ${result.error}`);
}
```

Keep the first request small:
one known source record.
Record the API result
and the source record ID
so you can diagnose a failed mapping.

## 4. Confirm retrieval

Search for the document title in Atlassian.
Open the result and confirm that:

- the title is clear;
- the source URL opens the intended record;
- the summary contains useful text;
- a site user can find the result.

## Result

You have proven the core path from a source record to a graph object.
You can now add records one at a time
or publish a small batch.

## Evolve after the first document works

Change to a more specific object type
only when it improves the user outcome.
For example, use a work-item type
when status, ownership, and hierarchy need first-class handling.
Add richer content only when it improves retrieval.

Next, make the source relationship explicit in
[Link a starter object to its source](4-link-a-starter-object-to-its-source.md).
