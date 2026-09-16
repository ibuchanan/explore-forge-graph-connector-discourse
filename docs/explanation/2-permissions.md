# Permissions

Permissions define who can discover an ingested object in search, open its
Atlassian views, or receive Rovo answers that use it.

A connector should choose its access model before it designs a rich data
projection. A useful object is not safe to ingest if the connector cannot give
access to the correct people.

## The access-model decision

The connector declares whether it replicates source permissions with
`capabilities.replicatesPermissions`.

### Workspace-wide access

Use `replicatesPermissions: false` when all users of the destination Atlassian
site can access the connected data.

This model is suitable for data that has no record-level access restrictions on
the source system. It gives site users a common view of the ingested data.

### Fine-grained access

Use `replicatesPermissions: true` when visibility differs by record in the
source system.

In this model, the connector supplies an access control list (ACL) for each
restricted object. Atlassian then filters search and Rovo context for the
active user.

## Identity translation

An external identity is not automatically an Atlassian identity. For example,
a person can have one identifier in the external system and a different
Atlassian account ID.

Before the connector can grant record access to a person, it maps an external
identity to an Atlassian identity. The `mapUsers` API supports this translation
for a connection. The connector can then use the returned identity in an
object's access data.

Groups can also express access when an Atlassian group matches the intended
audience.

## Permission enforcement

Atlassian evaluates access when a user searches or asks Rovo a question. If the
user is not entitled to an object, the object does not become available as a
search result or as Rovo context.

This means permissions are part of the connector's information model. They are
not an optional display feature.

## Where this leads

Permissions answer: *Who may use this connected data?* The access decision is
implemented on graph objects. See [Data payload](3-data-payload.md) for the
object structure that carries that data.
