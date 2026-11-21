# ADR-001: External Adapter Contract V1

- **Status:** ACCEPTED WITH EXPLICIT LIMITATIONS
- **Decision date:** 2026-11-22
- **Scope:** Typed boundary in `src/orchestration/external-adapter.ts`
- **Authority:** Repository architecture decision; does not authorize provider activation or external side effects.

## Context

Montry needs a stable boundary between trusted orchestration code and external skill providers. The contract must preserve provider identity, skill identity, capability parity, schema validation and uncertainty after dispatch. It must not imply that descriptive metadata is an authorization engine or that a required idempotency key provides durable deduplication.

The inspected implementation pins provider ID, provider version and source revision by exact string comparison against the adapter instance. It checks the external skill ID/version and exact capability set against a trusted host binding, validates input/output through the host-provided Zod schemas, and validates result envelopes.

## Decisions

### D1 — Keep the adapter boundary typed and host-bound

The adapter remains an explicitly supplied trusted host object. A descriptor or discovered manifest cannot instantiate arbitrary code, choose an executable, establish trust by itself, or grant a capability. Provider ID/version/source revision and skill ID/version/capabilities must match the trusted binding before invocation.

A matching source-revision string is identity consistency, not cryptographic provenance verification. The host remains responsible for establishing that the adapter binary/package actually corresponds to that revision.

### D2 — Treat adapter exceptions as uncertain outcomes

After `adapter.execute()` has been invoked, a thrown exception cannot prove that no remote dispatch or side effect occurred. The contract therefore converts an exception into an `indeterminate` result, uses a conservative dispatch/possible-effect indication, and requires reconciliation for every non-read-only side-effect class. Provider exception text is not copied into the result, avoiding accidental leakage of secrets or untrusted content.

This behavior is not a retry instruction. Callers MUST NOT automatically replay an indeterminate operation. They must reconcile authoritative provider state or require operator review first.

An adapter that can positively establish a pre-dispatch rejection should return a validated `failed` envelope with `dispatchOccurred: false` and `sideEffectPossible: false`. Adapters must return explicit envelopes for confirmed outcomes.

### D3 — Keep cancellation and deadlines cooperative

The contract rejects an already-aborted signal and an already-expired deadline before invocation. It passes the AbortSignal and deadline to the adapter. It does not forcibly terminate provider work, enforce a hard deadline during the call, or prove remote cancellation.

An adapter MUST enforce transport/process deadlines where possible. If cancellation, timeout or connection loss occurs after dispatch and completion cannot be established, it MUST return an indeterminate result. If the adapter returns an explicit, schema-valid completed response, that response is treated as confirmed completion even if the caller's local signal became aborted while awaiting it; cancellation is not retroactive proof that the provider did not complete.

### D4 — Treat idempotency metadata as a declaration, not a guarantee

For `provider-key`, the contract requires a non-empty idempotency key before invocation. It does not persist keys, deduplicate requests, guarantee provider retention windows, or make retries safe. `intrinsic` and `none` are also declarations whose correctness must be established per operation.

No automatic retry or replay is authorized by this contract. Durable deduplication and reconciliation require a separate runtime/persistence design and provider-specific evidence.

### D5 — Separate classification from authorization and budget enforcement

`sideEffect` and `costClass` are descriptive risk classifications. They do not enforce permissions, resource/data scope, approval expiry, budget reservation, billing reconciliation or revocation. A future policy layer must make deny-by-default decisions before dispatch. `unknown` cost must remain blocked for potentially chargeable operations until verified and approved.

### D6 — Keep schema-version labels and operational controls explicit

The descriptor carries input/output schema-version labels, but V1 does not compare those labels with independently versioned schema artifacts. Schema validation currently uses the trusted binding's supplied schemas. V1 also does not impose generic payload byte/depth/item limits, durable audit storage, provider discovery, secret management, sandbox isolation, or a durable idempotency store. These are not silently implied by the typed contract.

## Verified implementation evidence

- Provider identity/version/source-revision equality checks.
- Trusted skill ID/version and exact capability-set parity checks.
- Pre-dispatch cancellation and deadline checks.
- Required idempotency-key presence for `provider-key`.
- Host input-schema validation and completed-output schema validation.
- Strict result-envelope validation, including contradictory failure and indeterminate/reconciliation checks.
- Adapter exceptions are now converted to conservative indeterminate outcomes without exposing provider exception text.
- Focused tests cover the exception-to-indeterminate behavior.

Repository CI evidence must be attached to the commit that includes this decision and implementation. Earlier CI success on a prior commit is not evidence for later changes.

## Consequences and limitations

- The contract is suitable as a typed integration boundary for controlled host-supplied adapters, subject to provider-specific controls.
- It is not a general-purpose secure execution sandbox, authorization engine, cost governor, durable workflow store, exactly-once mechanism or production certification.
- Read-only classification is only as trustworthy as the host's verified provider/operation assessment.
- Non-read-only exceptions require reconciliation and must not be replayed automatically.
- The adapter can still run beyond Montry's local wait if it ignores cancellation or deadline signals.
- Source revision and schema-version labels are consistency metadata unless separately bound to verified artifacts.

## Phase gate decision

**Phase B contract definition: ACCEPTED WITH LIMITATIONS.**

**Phase B.2 security review: CONDITIONAL PASS for the narrow typed boundary only.** The exception ambiguity is mitigated by the conservative indeterminate mapping. Remaining limitations are documented and must be addressed by their owning phases.

**Phase C MCP foundation: NO-GO until its own design and controls are implemented and tested.** In particular, MCP must add configured server identity verification, explicit tool allowlisting, connection/request/overall deadlines, cancellation semantics, bounded payloads, secret isolation, audit events, policy checks and reconciliation behavior. This ADR does not authorize MCP implementation or provider activation.

## Follow-up decisions

- ADR-002: MCP client/session lifecycle and server identity.
- ADR-004: policy evaluation, approvals, data scope and delegated authority.
- ADR-005: cost classification, budget reservation and reconciliation.
- ADR-006: durable workflow state, idempotency and uncertain-side-effect recovery.
- ADR-007: audit event schema, retention and redaction.
- ADR-008: provider provenance, revocation and rollback.
