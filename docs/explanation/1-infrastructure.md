# Infrastructure

Infrastructure is the managed bridge between an Atlassian site and an external
system. It lets a site administrator configure, validate, and remove a
connection without the app building a separate administration service.

Infrastructure comes first because every graph object belongs to a connection.
The connection sets the operational boundary for later choices about access,
data, relationships, and synchronization.

## The connection boundary

When an administrator connects a `graph:connector`, Atlassian creates a
platform-managed `connectionId`. This identifier represents one active pairing
between an Atlassian site and an external system.

The app uses the `connectionId` when it calls graph APIs, such as APIs that
push objects, map users, or remove objects. The identifier also lets Atlassian
identify the graph data that belongs to a connection.

A connection is not only a URL and credentials. It is the lifecycle boundary
for the integration.

## Native administration

A connector can declare its setup form in `manifest.yml`. The declaration lets
Atlassian render a native administration experience for the connection.

The form can ask for configuration values that the app needs, such as an
external service URL or an access token. A sensitive field prevents normal UI
display of a secret value.

The connector can also declare two important handlers:

- **`validateConnection`:** Tests whether the supplied configuration can reach
  and authenticate with the external system.
- **`onConnectionChange`:** Responds when an administrator creates, updates,
  or deletes a connection.

The app can store connection-specific configuration and start or stop its own
sync work in these handlers.

## Security and cleanup

Forge provides the execution environment for connector functions. The manifest
must declare the external domains that the app can contact. This egress control
limits where the connector can send data.

When an administrator deletes a connection, Atlassian can purge graph data that
belongs to its `connectionId`. The app should still remove its own local state
and stop external webhooks or scheduled work.

## Where this leads

Infrastructure answers: *Which external system is connected, and who manages
that connection?* The next question is more important for users: *Who may see
the data that the connection provides?* See [Permissions](2-permissions.md).
