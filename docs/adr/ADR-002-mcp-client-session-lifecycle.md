# ADR-002: MCP Client and Session Lifecycle

- **Status:** PROPOSED — NOT APPROVED; IMPLEMENTATION NO-GO
- **Date:** 2026-11-22
- **Scope:** Future MCP client/session adapter for Montry General
- **Depends on:** ADR-001 (accepted with limitations)
- **Authority:** Design proposal only. It does not enable MCP, approve any server, or authorize tool execution.

## Context and verified baseline

The repository currently recognizes `mcp` as a manifest execution-kind value, but no general MCP client/session adapter was found in the inspected source. Manifests are metadata-only and trusted host code supplies implementations. The existing external adapter contract is a typed boundary, not a transport implementation or policy engine.

The workflow runtime now exposes `indeterminate` at task and workflow level when timeout or cancellation wins after skill invocation begins. It persists that state when a checkpoint store is configured and emits `task.indeterminate`. Cancellation before invocation begins remains `cancelled`. The provider promise may continue in the background if it ignores AbortSignal; the runtime reports uncertainty rather than claiming remote cancellation.

Indeterminate checkpoints cannot be resumed automatically, even when `retrySafe` is true. The new `reconcileWorkflowTask` operation supports evidence-backed resolutions to completed (output schema validated), failed, or retry-authorized (operator asserts authoritative evidence confirms no effect). Each reconciliation records actor, evidence, resolution and timestamp, requires a host-supplied authorization callback, and uses checkpoint revision compare-and-swap to reject stale concurrent decisions. The library does not authenticate users; the embedding application must supply that boundary. Runtime writes also use compare-and-swap.

The repository now includes `FileWorkflowRunStore`, a durable single-host backend using atomic replacement and per-run compare-and-swap locks, alongside the process-local in-memory store. It is not a distributed/multi-host database. The runtime marks interrupted calls indeterminate but cannot prove whether a remote operation was dispatched or stopped. The library requires a host authorization callback for reconciliation, but the repository does not ship an authenticated operator UI/API or identity provider integration. A pure deny-by-default policy evaluator is available in `src/orchestration/policy.ts`; it is not yet enforced as a mandatory dispatch gate and relies on the host to authenticate principals, verify approval provenance, and create durable budget reservations.

**Remaining blocking findings:** MCP remains NO-GO until a multi-host deployment selects an appropriate transactional store (if needed) and the embedding application provides an authenticated operator boundary. The MCP transport, identity pinning, tool allowlist, policy, payload bounds, secret controls and audit lifecycle also remain unimplemented and untested.

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
- The runtime and checkpoint contracts now record indeterminate outcomes when timeout or cancellation wins after invocation begins, and refuse automatic replay of uncertain tasks. This does not prove remote cancellation or prevent a provider promise from continuing in the background.

### 6. Observability and revocation

Every dispatch must emit a structured audit record containing run/task/correlation IDs, configured server identity, protocol version, tool name, Montry skill/version, capability, policy decision, approval reference, schema versions, dispatch state, timestamps, bounded usage/cost data and final/indeterminate outcome. Do not log secrets or unrestricted payloads.

A server kill switch must block new dispatches immediately. Revocation must prevent reconnection, close active sessions where possible, revoke credentials and preserve audit history. Rollback must restore a previously verified server configuration and adapter build.

## Required implementation work before GO

| Gate | Required work | Evidence required |
|---|---|---|
| Runtime outcomes | <strike>Add first-class indeterminate task result and checkpoint state for timeout/cancel after invocation</strike> Implemented in the in-process runtime; in-memory and single-host file stores are included | CI tests proving result status, event emission, checkpoint persistence and no automatic replay |
| Reconciliation | <strike>Define evidence-backed reconciliation states and revision-checked transitions</strike> Implemented as a library API with required host authorization callback; authenticated operator workflow and durable audit remain external | CI tests for completed/failed/retry-authorized transitions, output validation and stale revision rejection |
| MCP transport | Implement one explicitly selected transport first; no dynamic transport selection | Protocol conformance tests and identity verification |
| Tool allowlist | Host-owned exact tool allowlist and stable bindings | Unknown/new tool denied tests |
| Bounds | Enforce request/result bytes, depth, counts, string lengths and execution limits | Boundary and oversized payload tests |
| Secrets | Managed secret references, redaction and credential rotation | Secret leakage tests and revocation tests |
| Policy | Deny-by-default policy and approval/cost checks before dispatch | Negative authorization, expiry, scope and budget tests |
| Audit | Structured events with redaction and retention | Required-field and no-secret tests |
| Operations | Kill switch, session close, disable and rollback | Operational exercise evidence |

## Decision and gate

**Current decision: NO-GO for MCP implementation and provider activation.**

The next permitted work is to complete and review the policy-to-dispatch enforcement boundary, authenticated operator integration, budget reservation/reconciliation and audit lifecycle. After those gates are reviewed and pass CI, select and implement one MCP transport behind the host-configured allowlist. Do not implement broad multi-transport discovery or dynamic server installation in the first increment.

## Open decisions

- Which transport is first: stdio or Streamable HTTP?
- Which MCP SDK and exact version will be pinned?
- What trusted configuration format and server identity source will be used?
- What operator interface will resolve indeterminate tool calls?
- What durable audit store and retention policy will be adopted?

These decisions must be resolved in a reviewed implementation plan before MCP code is enabled.
