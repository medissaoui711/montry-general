# ADR-003: External Execution Policy Gate

- **Status:** IMPLEMENTED — INITIAL LIBRARY BOUNDARY; HOST INTEGRATION REQUIRED
- **Date:** 2026-11-22
- **Scope:** Policy evaluation and pre-dispatch authorization for external skill adapters
- **Depends on:** ADR-001 (accepted with limitations), MONTRY-EXT-SKILL-INTEGRATION-001

## Context

The external adapter contract validates provider identity, skill binding, capabilities, schemas and result envelopes. It does not authenticate the caller or decide whether a particular operation may be dispatched. External execution requires a deny-by-default policy boundary that is separate from provider metadata and tool descriptions.

## Decision

The repository provides a pure policy evaluator in `src/orchestration/policy.ts` and a policy-enforced entry point in `src/orchestration/authorized-external-adapter.ts`.

The evaluator checks:
- exact provider and skill allowlists;
- exact capability membership and environment allowlisting;
- side-effect class allowlisting;
- explicit denial of unknown cost;
- approval identity, exact operation scope and expiry for operations not covered by the configured free/read-only exception;
- a pre-existing reserved budget, matching currency and both host-policy and approval ceilings for metered/paid work.

`executeAuthorizedExternalSkill` evaluates policy before calling the provider adapter and throws `ExternalExecutionDeniedError` on denial. The lower-level `executeExternalSkill` remains a contract primitive and does not independently enforce policy. Host applications MUST use the authorized entry point for external dispatch and MUST NOT expose the low-level primitive as an unguarded execution surface.

## Host responsibilities and limitations

This library does not:
- authenticate `principalId` or prove that the caller is the named operator;
- verify approval signatures, storage provenance, revocation or one-time consumption;
- create or atomically reserve budget funds;
- reconcile estimated and actual provider charges;
- persist audit events or enforce approval replay protection across processes;
- define a user interface for granting or revoking approvals.

The embedding host MUST authenticate the principal, verify approval provenance and current validity, create a durable reservation before passing it to the evaluator, atomically consume one-time approvals where applicable, and record redacted audit events. The policy evaluator is a deterministic decision function, not a complete enterprise policy service.

## Security posture

Default is deny. Unknown provider cost is denied. A free read-only operation may bypass per-operation approval only when the host policy explicitly enables that exception. All other operations require an exact, unexpired approval. Metered and paid operations additionally require a reserved amount in a currency bounded by both host policy and approval.

A policy allow decision is not proof that a provider is safe, that a reservation is financially enforceable, or that a remote operation will complete exactly once. External results remain untrusted and adapter outcomes may remain indeterminate.

## Verification

Focused tests cover allowlisted free read-only execution, unknown-cost denial, capability denial, exact approval scope, expiry, principal mismatch, metered reservation requirements and the no-dispatch-on-denial wrapper behavior. CI evidence must be tied to the final commit containing these tests; this ADR does not claim a passing CI run by itself.

## Follow-up gates

1. Require the authorized entry point in the host integration architecture and prevent accidental use of the low-level primitive.
2. Add authenticated approval storage, revocation and one-time consumption.
3. Add durable budget reservation and post-execution cost reconciliation.
4. Add structured audit persistence with secret/payload redaction.
5. Add integration tests against the real host authorization and budget components.
