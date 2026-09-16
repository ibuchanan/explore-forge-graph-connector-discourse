# Supplychain Graph Context

## Ubiquitous language

- **Site relationship**: the bilaterally approved trust relationship between two
  sites, reusable across separately authorized Pairings. It does not grant access
  to all work on either site. Revoking it stops exchange for all its Pairings.
- **Authorization lease**: the finite period during which a Site relationship
  may authorize exchange, unless revoked earlier. An active lease does not
  replace the separate authorization required for each Pairing.
- **Site relationship invitation**: a pending proposal to establish a Site
  relationship, distinct from an Invitation to pair two Epics.
- **Activation proposal**: what the approving site returns to an authenticated
  poll after its administrator approves a nomination. It names the approved
  counterpart identity, relationship ID, terms version, and agreement end
  instant, and never an endpoint URL.
- **Bilateral confirmation**: the exchange that activates both local records. A
  site activates only after the matching confirmation it can verify: the
  approver on the confirmation it receives, the nominator on the authenticated
  success response.
- **Pairing**: the bilateral relationship between exactly one Source Epic and one
  Paired Epic. Each Pairing requires its own authorization within an active Site
  relationship; revoking one Pairing does not revoke other Pairings.
- **Local readiness**: the state in which the current tenant has the local
  prerequisites for its role. A source tenant needs an active Pairing and peer
  delivery endpoint. A destination tenant also needs an active Teamwork Graph
  connection. Local readiness makes no claim about peer-tenant state.
- **Pairing reference**: a non-secret, single-use setup correlation reference;
  it is never an authenticator or authorization credential.
- **Invitation**: a pending proposal to establish a Pairing through a pairing
  reference.
- **Outbound pairing**: the manufacturer-local pending record created when a
  Pairing reference is issued and awaiting supplier acceptance.
- **Inbound pairing**: the supplier-local pending record created from a received
  Pairing reference before the supplier binds its existing Paired Epic.
- **Acceptance**: the supplier administrator's explicit decision to activate a
  pending Invitation.
- **Pairing activation**: the manufacturer-local application of a supplier
  Acceptance, which changes its Outbound pairing from pending to active.
- **Correlation ID**: the shared opaque identifier joining both tenants' records
  of one collaboration operation.
- **Idempotency key**: an opaque identifier that makes repeated delivery of one
  peer operation safe.
- **Audit event**: immutable, tenant-local, non-content evidence of a
  collaboration operation. There is no central audit ledger.
- **Source Epic**: the manufacturer-owned Epic whose approved subset may be
  published.
- **Starter projection**: one workspace-visible `atlassian:document` that
  represents the selected Source Epic only. It has no child issues or graph
  associations. Its first content is limited to the Source Epic key and summary;
  it does not yet flatten Jira descriptions from ADF.
- **Starter delivery**: a direct request from the source Forge runtime to the
  destination Forge runtime. The terminal triggers and verifies the flow but
  does not relay Epic content.
- **Peer delivery endpoint**: the destination's development webtrigger URL. It
  is stored only in the source tenant's local Pairing and is never displayed or
  logged.
- **Paired Epic**: the supplier-owned existing Epic that represents supplier
  delivery work.
