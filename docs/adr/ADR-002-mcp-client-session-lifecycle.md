# ADR-002: MCP Client and Session Lifecycle

- **Status:** PROPOSED — NOT APPROVED; IMPLEMENTATION NO-GO
- **Date:** 2026-11-22
- **Scope:** Future MCP client/session adapter for Montry General
- **Depends on:** ADR-001 (accepted with limitations)
- **Authority:** Design proposal only. It does not enable MCP, approve any server, or authorize tool execution.

## Context and verified baseline

The repository currently recognizes `mcp` as a manifest execution-kind value, but no general MCP client/session adapter was found in the inspected source. Manifests are metadata-only and trusted host code supplies implementations. The existing external adapter contract is a typed boundary, not a transport implementation or policy engine.

The generic workflow runtime races task execution against cancellation and task timeout. When the race rejects, the provider promise may continue running. The checkpoint schema already includes an `indeterminate` status, but the public `TaskExecutionResult` union does not expose it and the timeout/cancellation race currently records failed/cancelled. The resume path also previously allowed an `indeterminate` checkpoint to be reset to pending when a skill was marked `retrySafe`.

The resume path has now been hardened on `main`: indeterminate checkpoints are always blocked pending reconciliation, regardless of `retrySafe`, and the checkpoint schema requires a reconciliation reason. Focused regression tests were added. This closes the unsafe replay path but does not yet provide first-class runtime indeterminate results or an operator reconciliation workflow.

**Blocking finding:** An MCP adapter must not be connected to the current runtime for mutating or otherwise non-replay-safe operations until timeout/cancellation outcomes can be persisted and surfaced as indeterminate, with a reconciliation path that can resolve them without replay.

## Proposed architecture

### 1. Trust and configuration

- MCP server definitions MUST be supplied by trusted host configuration, never discovered from workflow input, skill manifests, server tool descriptions or model-generated text.
- Each server configuration MUST pin a stable server identity, transport kind, endpoint or executable identity, protocol compatibility range, credential reference, allowed tools and environment.
- Remote HTTP(S) endpoints MUST use an explicit host/port allowlist and TLS validation. Redirects to unapproved origins MUST be rejected.
- Local stdio servers MUST use a fixed absolute executable path, fixed argument array, `shell: false`, minimal environment and approved working directory. No shell fragments or manifest-selected executables.
- Server identity and negotiated protocol version MUST be checked on every new session. A changed server identity or incompatible protocol MUST fail closed.
- A source revision string alone is not proof of artifact provenance; host configuration must bind the configured identity to a verified package, image digest, executable or deployment record.

### 2. Session lifecycle

1. Load only an owner-approved server configuration.
2. Resolve credentials from a managed secret provider; never accept literal secrets in manifests or workflow input.
3. Establish the configured transport with connection timeout and bounded handshake.
4. Verify server identity and protocol compatibility.
5. Discover tool metadata only after identity verification.
6. Intersect discovered tools with the host-configured explicit allowlist.
7. Bind each approved tool to a stable Montry skill ID/version, capability set, input/output schema and risk classification.
8. Evaluate policy and approval before every tool dispatch.
9. Close the session on completion, cancellation, configuration change or revocation; revoke scoped credentials where supported.

Tool discovery is metadata, not authorization. A tool absent from the allowlist MUST never be callable, even if the server advertises it later.

### 3. Tool contract and untrusted data

- Tool names, descriptions, annotations, server instructions, prompts, resource contents and results MUST be treated as untrusted data.
- No server-provided text may alter system instructions, Montry policy, allowlists, approvals or credential scope.
- Arguments MUST be generated from a host-owned strict schema; unknown fields MUST be rejected.
- Results MUST be bounded by bytes, item count, nesting depth and string length before parsing or downstream use.
- Output schemas MUST be host-owned and version-pinned. Server-provided schemas may be inspected as untrusted metadata but cannot become trusted contracts automatically.
- Tool errors MUST be normalized to stable error codes; raw provider messages must be sanitized before user display or logs.

### 4. Authorization and policy

The MCP transport layer MUST NOT decide authorization by itself. Before every tool dispatch, a separate policy boundary must evaluate:

- principal and environment;
- pinned server identity and exact tool;
- capability and resource/data scope;
- side-effect class and sensitivity of data sent;
- approval identity, scope, expiry and revocation;
- cost classification and available budget;
- current provider health and operational kill switch.

Default decision is deny. Discovery does not authorize invocation. A read-only label must be verified from implementation behavior, not inferred from tool name or description. Unknown cost blocks potentially chargeable operations.

### 5. Deadlines, cancellation and uncertain outcomes

- Enforce connection, handshake, per-request and overall workflow deadlines.
- Propagate cancellation to the transport and remote operation where supported, but never claim cancellation succeeded without confirmation.
- If a request may have been dispatched and the response is lost, timed out or cancelled, return indeterminate.
- Do not automatically replay indeterminate calls. Reconcile against authoritative provider state or require operator review.
- Provider idempotency keys are useful only when provider semantics, key scope and retention are verified. A local key field alone is not deduplication.
- The current runtime's timeout race can abandon a still-running provider promise and currently records failed/cancelled, not indeterminate. Runtime and checkpoint contracts must be extended before non-replay-safe MCP operations are enabled.

### 6. Observability and revocation

Every dispatch must emit a structured audit record containing run/task/correlation IDs, configured server identity, protocol version, tool name, Montry skill/version, capability, policy decision, approval reference, schema versions, dispatch state, timestamps, bounded usage/cost data and final/indeterminate outcome. Do not log secrets or unrestricted payloads.

A server kill switch must block new dispatches immediately. Revocation must prevent reconnection, close active sessions where possible, revoke credentials and preserve audit history. Rollback must restore a previously verified server configuration and adapter build.

## Required implementation work before GO

| Gate | Required work | Evidence required |
|---|---|---|
| Runtime outcomes | Add first-class indeterminate task result and checkpoint state for timeout/cancel after invocation | Unit tests proving persistence and no automatic replay |
| Reconciliation | Define operator/provider reconciliation contract and state transitions | Tests for resolved, unresolved and rejected reconciliation |
| MCP transport | Implement one explicitly selected transport first; no dynamic transport selection | Protocol conformance tests and identity verification |
| Tool allowlist | Host-owned exact tool allowlist and stable bindings | Unknown/new tool denied tests |
| Bounds | Enforce request/result bytes, depth, counts, string lengths and execution limits | Boundary and oversized payload tests |
| Secrets | Managed secret references, redaction and credential rotation | Secret leakage tests and revocation tests |
| Policy | Deny-by-default policy and approval/cost checks before dispatch | Negative authorization, expiry, scope and budget tests |
| Audit | Structured events with redaction and retention | Required-field and no-secret tests |
| Operations | Kill switch, session close, disable and rollback | Operational exercise evidence |

## Decision and gate

**Current decision: NO-GO for MCP implementation and provider activation.**

The next permitted work is design and tests for the runtime's indeterminate outcome/reconciliation model. After that work is reviewed and passes CI, select and implement one MCP transport behind the host-configured allowlist. Do not implement broad multi-transport discovery or dynamic server installation in the first increment.

## Open decisions

- Which transport is first: stdio or Streamable HTTP?
- Which MCP SDK and exact version will be pinned?
- What trusted configuration format and server identity source will be used?
- What operator interface will resolve indeterminate tool calls?
- What durable audit store and retention policy will be adopted?

These decisions must be resolved in a reviewed implementation plan before MCP code is enabled.
