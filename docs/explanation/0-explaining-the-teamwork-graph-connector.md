# Understanding a Teamwork Graph connector

A `graph:connector` brings selected work data from an external system into
Atlassian's Teamwork Graph (TWG).

The connector does not replace the external system. The external system stays
the source of truth. The connector creates a useful, governed projection of its
work data in Atlassian.

This projection can help people find work in global search, use Rovo with more
context, and analyze related work across Atlassian and external systems.

## The reader journey

This explanation set follows the life of data in a connector.

1. **Infrastructure** explains how a site administrator creates and manages a
   connection to an external system.
2. **Permissions** explains who can discover and use the data from that
   connection.
3. **Data payload** explains how the connector represents an external record as
   a graph object.
4. **Linkage** explains how an object points to its source and relates to other
   graph objects.
5. **Concurrency** explains how the projection stays correct as the external
   system changes.

This is a design story, not an implementation procedure. It starts with a
trusted connection, then sets the access boundary, then describes the data,
its relationships, and its lifetime.

## Why use a connector?

Work often exists outside Atlassian. It can exist in an internal service, a
partner tool, or another SaaS product. If that work remains separate, people
must know where to look and Rovo has less context.

A connector makes selected external work visible in Atlassian while keeping the
external system authoritative. It can provide:

- **Search:** Users can find permitted external work in Atlassian search.
- **Rovo context:** Rovo can use permitted graph objects when it answers a
  question.
- **Connected understanding:** Linked objects show how external work relates to
  Jira work items, Confluence content, projects, and other graph objects.
- **Governance:** Site administrators manage connections through Atlassian, and
  the platform can remove graph data when a connection ends.

## What a connector is not

A connector is not a raw database copy or an unrestricted data export. A good
connector selects useful work data, maps it to a supported graph type, applies
the right access model, and keeps the projection current.

The following pages explain why each of those responsibilities matters.
