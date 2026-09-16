# Share connector data with all site users

Publish data that every user of the destination site may discover and use.

Use this guide only
when every selected source record is safe for all site users.
It is the simplest permission model
because the connector does not map external identities
or maintain a record-level access control list.

## Before you begin

You need an enabled `graph:connector` connection.
Read [Permissions](../explanation/2-permissions.md) before you choose this model.

## 1. Declare workspace-wide access

Set `replicatesPermissions` to `false` in the connector capabilities.

```yaml
modules:
  graph:connector:
    - key: starter-connector
      capabilities:
        replicatesPermissions: false
        syncFidelity: append
        supportsIncrementalSync: false
```

This declaration tells administrators
that the connector does not reproduce source-system permissions.

## 2. Select only universally shareable records

Filter the source data before you transform it.
Start with a small set of records
that all destination-site users may see.

For example,
select public product notes
or a shared knowledge base.
Do not use this model for records
that contain a private comment,
a customer-specific field,
or any other restricted data.

## 3. Do not implement identity or ACL synchronization

For this first iteration,
do not call user-mapping APIs
and do not build a separate user or group synchronization flow.
Keep the connector focused on publishing selected public data.

Publish one test object,
then check search and Rovo with more than one ordinary site user.
Each user should receive the same permitted result.

## Result

You now have the smallest access model
that can make a connector useful across a site.
It removes identity translation
and per-record ACL work from the first end-to-end slice.

## Evolve after the first result works

Move to replicated permissions
when the source has record-level restrictions
or when source access differs from Atlassian site access.
That change requires a clear identity-mapping design
and current access data for each restricted object.

Next, publish a first object with
[Publish one external record as a document](3-publish-one-external-record-as-a-document.md).
