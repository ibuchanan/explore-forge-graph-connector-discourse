# Link a starter object to its source

Give each published object one canonical URL
that points to its authoritative record in the external system.

Start with the source URL.
It is the smallest useful form of linkage
because it supports provenance and navigation
without modeling containers, parent-child hierarchy, or cross-system associations.

## Before you begin

You need a published object.
This guide uses the document object from
[Publish one external record as a document](3-publish-one-external-record-as-a-document.md).

## 1. Choose one canonical URL

Select the stable page
that a user should open to see the source record.
Prefer the record page,
not a temporary export URL, a search page, or an API endpoint.

The URL must be useful to a person
and must remain valid as the record changes.

## 2. Put the URL on the object

Set the object's `url` field from the source record.

```ts
const document = {
  id: sourceRecord.id,
  displayName: sourceRecord.title,
  url: sourceRecord.url,
  // Other required fields are omitted here.
};
```

Use the same URL on every update of that source record.
Do not replace it with an Atlassian URL.
The external system remains authoritative.

## 3. Verify navigation

Find the object in Atlassian,
open its link,
and confirm that it reaches the expected source record.
Test with a user who has normal source-system access.

A graph permission allows discovery in Atlassian.
It does not grant access in the external system.
The source system must still enforce its own access rules.

## Result

Users can trace the graph object back to its source.
This is enough linkage for a first useful connector
and gives later relationship work a trustworthy base.

## Evolve after the first link works

Add more linkage only when the source model needs it:

- use a container or parent key to preserve a useful hierarchy;
- add associations for verified relationships to other graph objects;
- publish parent objects before child objects when the hierarchy requires them.

Next, make updates safe with
[Keep a starter synchronization correct](5-keep-a-starter-synchronization-correct.md).
