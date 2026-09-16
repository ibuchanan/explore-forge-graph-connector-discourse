# Create a minimal connector connection

Create a Teamwork Graph connection
that records its `connectionId`
when an administrator enables the connector.

Use this guide when you want to prove
that the site can create and manage your connector
before you add
a source configuration form,
OAuth,
webhooks,
or scheduled sync work.

## Before you begin

You need a Forge app with a `graph:connector` module
and a function entry point.
This guide does not connect to a remote API yet.
It proves the Atlassian side of the connection lifecycle.

## 1. Declare one document connector

Start with one object type
and a connection-change handler.

```yaml
modules:
  graph:connector:
    - key: starter-connector
      name: Starter connector
      capabilities:
        replicatesPermissions: false
        syncFidelity: append
        supportsIncrementalSync: false
      icons:
        light: https://developer.atlassian.com/platform/forge/images/icons/issue-panel-icon.svg
        dark: https://developer.atlassian.com/platform/forge/images/icons/issue-panel-icon.svg
      objectTypes:
        - atlassian:document
      datasource:
        onConnectionChange:
          function: onConnectionChange

  function:
    - key: onConnectionChange
      handler: index.onConnectionChange

permissions:
  scopes:
    - storage:app
    - read:object:jira
    - write:object:jira
    - delete:object:jira
```

Keep the first connection free of configuration fields.
A form is useful only when the connector must collect values from the administrator.

## 2. Record the connection lifecycle

Implement the handler.
Store only the data that later ingestion needs:
the connection identifier
and, when relevant, the connection action.

```ts
import { kvs } from "@forge/kvs";

type ConnectionChange = {
  action: "CREATED" | "UPDATED" | "DELETED";
  connectionId: string;
};

export async function onConnectionChange(event: ConnectionChange) {
  const key = `connection:${event.connectionId}`;

  if (event.action === "DELETED") {
    await kvs.delete(key);
    return { success: true };
  }

  await kvs.set(key, { connectionId: event.connectionId });
  return { success: true };
}
```

Do not log secrets if you later add them to the connection configuration.

## 3. Deploy and create the connection

Deploy the app and install it on a test site.
In Atlassian Administration,
open the connector and create a connection.

Confirm that the handler receives a `CREATED` event
and that the stored value contains the new `connectionId`.

## Result

You now have a managed connector boundary.
Later graph API calls use this `connectionId`,
and deleting the connection gives your app a clear cleanup signal.

## Evolve after the first connection works

Add these capabilities only when the connection needs them:

- a form and `validateConnection` for source settings or credentials;
- a sensitive configuration field for a secret;
- outbound-domain permissions for the external API;
- a task runner, webhook, or scheduled trigger for ingestion.

Next, choose the first access model in
[Share data with all site users](2-share-data-with-all-site-users.md).
