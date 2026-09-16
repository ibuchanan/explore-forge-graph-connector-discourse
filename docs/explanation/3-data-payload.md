# Data payload

A data payload is the graph representation of one external record. The
connector transforms data from the external system into a supported Teamwork
Graph object type, such as `atlassian:document`, `atlassian:project`, or
`atlassian:work-item`.

It is a deliberate projection, not a raw export. The payload contains the
information that Atlassian products need to identify, present, search, and
secure the object.

## What a payload does

A useful payload has four responsibilities:

- **Identity:** It gives the object a stable `id`, type, and version value.
- **Meaning:** It maps source fields to recognized graph properties, such as a
  display name, status, owner, description, or URL.
- **Content:** It provides useful text that search and Rovo can use.
- **Access:** When the connector replicates permissions, it includes the
  principals who may use the object. See [Permissions](2-permissions.md).

## A generic example

```json
{
  "id": "external-record-42",
  "type": "atlassian:work-item",
  "updateSequenceNumber": 42,
  "permissions": {
    "principals": [
      {
        "id": "ari:cloud:identity::user/example-user",
        "type": "user"
      }
    ]
  },
  "properties": {
    "displayName": "External work item: approved design",
    "description": "A short summary of the approved design and its scope.",
    "status": {
      "name": "In progress",
      "category": "IN_PROGRESS"
    },
    "url": "https://external.example.com/records/42"
  }
}
```

The example shows one object. Actual required and supported fields depend on
the graph type that the connector uses.

## Design for useful retrieval

Atlassian does not interpret every custom source field as a graph concept. The
connector should map the information that helps people understand and find the
record. A clear title, a concise description, a meaningful status, and a source
URL are often more useful than a large set of unstructured custom fields.

Too little content gives search and Rovo little context. Too much unrelated
content can make results less useful and can fail schema validation.

## Where this leads

A payload makes one record available in the graph. It is more useful when it
also preserves the record's source and relationships. See
[Linkage](4-linkage.md).
