# Linkage

Linkage turns a set of ingested objects into a connected graph. It preserves
where an object came from and describes how it relates to other work.

A payload gives an object meaning. Linkage gives that object context.

## Link back to the source

An ingested object should include a canonical source `url` when its graph type
supports it. The URL points from the graph representation to the authoritative
record in the external system.

This link has two purposes:

- It shows that the external system remains the source of truth.
- It gives users a path to the original record, subject to access in that
  system.

## Preserve hierarchy

A connector can model structural relationships among the objects that it
publishes.

- **`containerKey`** places an object in a larger boundary, such as a project
  or workspace.
- **`parentKey`** connects a child work item to its parent work item.

These links preserve useful source structure. They can also help users and
Atlassian products understand the object in its wider context.

## Create associations

A connector can also create explicit associations between an ingested object
and another graph object, including an Atlassian-native object. An association
expresses a meaningful relationship, such as a related work item, a supporting
document, or a dependency.

The connector should create associations only when it can state the
relationship accurately. Weak or guessed links reduce trust in the graph.

## What linkage enables

Good linkage helps users follow work across systems. It can support parent-child
views, source navigation, graph-aware Rovo answers, and context that connects
external work with Jira, Confluence, or other supported entities.

## Where this leads

Linkage explains the desired graph shape. The connector must also preserve that
shape when its source changes, retries occur, or events arrive late. See
[Concurrency](5-concurrency.md).
