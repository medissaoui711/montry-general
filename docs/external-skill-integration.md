# External Skill Integration Standard

**Document ID:** MONTRY-EXT-SKILL-INTEGRATION-001  
**Version:** 1.0.1  
**Status:** DRAFT — implementation and independent review pending  
**Applies to:** Montry General  
**Reference integration:** New-Term Radar (candidate; not yet verified or integrated)

## 1. Purpose and authority

This standard defines how Montry may describe, assess, bind, execute, monitor and revoke skills supplied by external projects or services.

It is an architecture and engineering standard, not evidence that every adapter or control described here already exists. The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** express normative requirements.

The Montry owner retains final authority over product scope, budgets, risk limits and activation of external capabilities. An integration proposal, manifest, automated assessment or simulated specialist review does not grant execution authority.

## 2. Verified repository baseline

The following statements were checked against the repository's `main` source during preparation of this document. They describe the inspected source, not a runtime certification.

| Area | Verified state | Boundary |
|---|---|---|
| Manifest | `src/orchestration/manifest.ts` accepts `instruction`, `in-process`, `cli` and `mcp` execution kinds | A schema enum is not an execution engine |
| Discovery | `loadSkillCatalog` reads local `skill.json` metadata and validates IDs, capabilities and requirements | It does not install or execute manifest-specified code |
| Implementation binding | `SkillImplementationRegistry` binds manifests to implementations supplied by trusted application code and checks version, execution-kind and capability parity | It does not create an MCP session or launch arbitrary commands from a manifest |
| Capability registry | `SkillRegistry` resolves registered capabilities and tracks host-supplied health states | It does not probe or supervise remote services |
| Planning | `previewWorkflow` validates workflow references and dependency ordering | Planning is not authorization to perform external side effects |
| Runtime | `executeWorkflow` validates inputs/outputs, schedules bounded work, supports cooperative cancellation, per-attempt timeout, opt-in retries and lifecycle events; timeout/cancel after invocation begins returns task/workflow `indeterminate` and emits `task.indeterminate` | A provider that ignores AbortSignal may continue after the runtime stops waiting; indeterminate is uncertainty, not proof of dispatch or remote completion |
| Checkpoints | Versioned checkpoints, runtime persistence/resume, revision compare-and-swap, no automatic replay of indeterminate tasks, and evidence-backed `reconcileWorkflowTask` API are implemented | In-memory store is not durable; no authenticated operator UI/API or production durable backend is included |
| CLI example | `src/providers/earshot.ts` is a specific allowlisted, shell-free process adapter with bounds and timeouts | It is not a generic external CLI adapter |
| Openverse | `src/providers/openverse.ts` performs validated sound-effect search and preserves licensing/attribution metadata | Search does not download, approve or publish an asset |
| External MCP | No general MCP client/adapter was verified in the inspected source | MCP is a declared manifest kind only; operational support remains unimplemented/unverified |
| New-Term Radar | No adapter or verified integration was found in the inspected source | Treat as a candidate integration only |

**Documentation reconciliation note:** `docs/workflow-checkpoints.md` describes checkpoint storage primitives and says automatic resume is not claimed, while `docs/workflow-checkpoint-resume.md` and `src/orchestration/runtime.ts` describe and implement resume behavior when a caller supplies a store. The accurate combined statement is: the runtime has checkpoint/resume integration against the pluggable store contract; the repository does not include a durable production store.

This baseline is based on source inspection. It does not claim that CI, unit tests, live providers, security tests or production operations were run as part of this document update.

## 3. Architectural principles

1. **Core independence:** external providers MUST remain optional. The planner and core registry MUST work without a specific vendor or external skill.
2. **Adapter boundary:** protocol-specific behavior belongs in an adapter, not in workflow planning or skill business logic.
3. **Trusted binding:** manifests are descriptive metadata. Executable implementations MUST be supplied by trusted host code or an explicitly approved adapter package.
4. **Least privilege:** each integration receives only the capabilities, data, network access and secrets required for its declared task.
5. **Explicit authorization:** discovery, installation, registration and execution are separate lifecycle actions. None silently implies the next.
6. **Fail closed:** unknown identity, version, permissions, cost, integrity or execution outcome MUST NOT be treated as success or safe to retry.
7. **Evidence before claims:** documentation MUST distinguish verified implementation, tested behavior, proposed design and unknowns.
8. **Provider replaceability:** workflows SHOULD depend on stable Montry capability contracts rather than provider-specific APIs wherever practical.
9. **Untrusted output:** external content is data, never authority or executable instruction.
10. **Cost transparency:** no metered or paid action may be dispatched without an explicit policy decision and sufficient budget authorization.

## 4. Target architecture

The target integration path is:

```text
Workflow Definition
       |
       v
Planner / Capability Resolution
       |
       v
Policy & Approval Gate
       |
       v
Orchestration Runtime
       |
       v
Trusted Skill Implementation
       |
       v
External Adapter
       |
       +--> MCP Client / Gateway
       +--> CLI Process Bridge
       +--> HTTP/API Client
       |
       v
External Skill or Service
```

Cross-cutting controls apply to the adapter boundary: identity and version pinning, schema validation, secret handling, timeout/cancellation, output limits, audit events, cost accounting, revocation and health monitoring.

The Policy & Approval Gate and generic MCP Client/Gateway shown above are **target components**, not verified current components.

## 5. External skill lifecycle

An external skill MUST pass these distinct stages:

1. **Intake:** record source repository/service, owner, license, version or immutable revision, documentation and requested capabilities.
2. **Static assessment:** inspect source, dependencies, permissions, network behavior, file/process access, data handling and supply-chain posture.
3. **Contract mapping:** map provider functions to stable Montry skill IDs, capabilities, input/output schemas and side-effect classifications.
4. **Adapter implementation:** implement the relevant protocol bridge in trusted host code; never execute an untrusted manifest field as a command or module path.
5. **Policy configuration:** define data scope, allowed operations, approvals, cost limits, timeouts, quotas, retention and revocation.
6. **Testing:** run deterministic contract tests, negative/security tests, adapter integration tests and provider-independent core tests.
7. **Controlled activation:** enable only the approved capability set and environment.
8. **Monitoring and review:** inspect health, errors, latency, usage, cost, provider changes and security advisories.
9. **Update or revocation:** pin versions and re-assess changes; disable credentials and routing when trust or authorization is withdrawn.

A skill MUST NOT be promoted to `implemented` merely because its manifest exists. The status MUST reflect a real, tested implementation binding.

## 6. Manifest and implementation contract

The current manifest schema contains:

- stable `id` and semantic `version`;
- name and description;
- provided `capabilities` and required `requires`;
- `execution.kind` (`instruction`, `in-process`, `cli`, `mcp`);
- `execution.status` (`specification`, `implemented`);
- optional-provider metadata.

The existing implementation registry verifies that trusted implementation IDs, versions, capabilities and requirements match the manifest. It does not interpret arbitrary module paths, shell strings or MCP endpoint details from the manifest.

For an external integration, the adapter contract SHOULD expose the following conceptual information:

| Contract field | Requirement |
|---|---|
| Provider identity | Stable provider ID, owner/source and pinned version or revision |
| Skill identity | Stable Montry skill ID and semantic version |
| Capabilities | Exact allowlisted capability set |
| Input/output | Strict runtime schemas, bounded sizes and documented semantics |
| Side effects | Read-only, local-write, remote-write, publication, financial or destructive classification |
| Data scope | Explicit fields/resources that may be read or transmitted |
| Authorization | Required approval mode and policy identifiers |
| Cost | Free, metered, paid, unknown, or provider-billed with evidence and limits |
| Execution controls | Timeout, cancellation behavior, concurrency and output bounds |
| Reliability | Idempotency semantics, retry classification and error taxonomy |
| Audit | Correlation/run/task/provider/tool identifiers and outcome |
| Lifecycle | Health, version, revocation and credential rotation behavior |

The following is a **design sketch only**; it is not a current exported TypeScript interface:

```ts
type ExternalSkillDescriptor = {
  providerId: string;
  providerVersion: string;
  sourceRevision: string;
  skillId: string;
  skillVersion: string;
  capabilities: string[];
  sideEffect: "read-only" | "local-write" | "remote-write" | "publication" | "financial" | "destructive";
  costClass: "free" | "metered" | "paid" | "unknown";
  inputSchemaVersion: string;
  outputSchemaVersion: string;
};

type ExternalExecutionContext = {
  runId: string;
  taskId: string;
  approvalId?: string;
  signal: AbortSignal;
  deadlineAt?: number;
  idempotencyKey?: string;
};
```

An adapter MUST validate all external inputs and outputs. It MUST reject undeclared tools, capabilities, fields and operations. It MUST NOT silently coerce an unknown response into a successful result.

### 6.1 Initial typed contract implementation

The repository now contains an initial provider-neutral contract in
`src/orchestration/external-adapter.ts`, exported from the orchestration package.
It pins provider version and source revision, binds the external skill ID/version
and exact capability set to a trusted host definition, validates input before
dispatch and validates the result envelope and completed output after dispatch.
The result contract distinguishes completed, failed and indeterminate outcomes.
A provider-key idempotency declaration requires a caller-supplied key; an already
cancelled or expired execution context is rejected before dispatch.

This is a contract boundary only. Adapter invocation exceptions are conservatively
returned as indeterminate outcomes; non-read-only possible side effects require
reconciliation and MUST NOT be automatically replayed. Cancellation and deadlines
are cooperative after dispatch: the contract performs pre-dispatch checks and passes
the signal/deadline to the adapter, but cannot forcibly stop a provider or guarantee
remote cancellation. An explicit completed provider response remains a completed
outcome even if local cancellation occurred while awaiting it.

The descriptor's schema-version labels are not yet bound to independently versioned
schema artifacts. The contract does not provide generic payload bounds, provider
discovery, transport, authorization, approval enforcement, cost reservation, durable
idempotency/deduplication, durable audit storage, or a concrete MCP/CLI/HTTP adapter.
A required idempotency key is a provider request input, not proof of deduplication.
`sideEffect` and `costClass` are descriptive classifications, not enforcement.

The contract decision and limitations are recorded in
[`docs/adr/ADR-001-external-adapter-contract.md`](adr/ADR-001-external-adapter-contract.md).
The focused contract tests are in `tests/external-adapter.test.ts`. Earlier CI run
[44955783932](https://github.com/medissaoui711/montry-general/actions/runs/44955783932)
on commit `66ce8c34a37894d27c32634a81b12be44d8b032e` passed TypeScript validation,
all 7 test files (84 tests), and the configured Remotion smoke-render and artifact
checks. That run predates the exception-handling change and ADR; it is historical
evidence only. The latest commit must pass CI independently. CI is not an
independent security review, provider conformance test, or production certification.

## 7. MCP adapter requirements

MCP support is a future implementation target. A conforming MCP adapter MUST:

- connect only to explicitly configured and approved server identities;
- pin or verify server identity and expected protocol compatibility;
- discover tools as metadata, then apply an explicit allowlist before exposing them to workflows;
- map each exposed tool to a stable Montry skill contract;
- validate tool arguments and results against strict schemas;
- enforce per-tool authorization, data scope, cost and side-effect policy before dispatch;
- apply connection, request and total execution deadlines;
- propagate cancellation where supported and report when remote cancellation cannot be confirmed;
- bound response bytes, item counts, nesting and execution time;
- isolate credentials and never expose secrets in logs, prompts, manifests or tool outputs;
- treat tool descriptions and results as untrusted data;
- record server identity, tool name, version, approval, dispatch and outcome;
- close sessions and revoke credentials when disabled or replaced.

Tool discovery MUST NOT automatically grant permission to call a discovered tool. Tool names or descriptions supplied by a server MUST NOT override Montry policy.

A timeout or lost connection after dispatch may mean the remote action completed. The adapter MUST report an **unknown/indeterminate outcome** when completion cannot be established; it MUST NOT convert that condition into a confirmed failure followed by an automatic replay.

## 8. CLI adapter requirements

A generic CLI adapter MUST be implemented in trusted host code. It MUST:

- use argument arrays and shell-free process creation (`shell: false`);
- use a fixed executable identity or verified absolute path;
- allowlist subcommands and argument shapes;
- reject arbitrary shell fragments, command substitution and untrusted executable paths;
- use a minimal environment and explicit working directory;
- bound stdout, stderr, runtime, process count and generated file sizes;
- validate output paths and prevent path traversal or writes outside approved roots;
- terminate the process tree on timeout/cancellation where the platform permits;
- classify non-zero exit, signal termination, timeout and uncertain termination separately;
- never infer success solely from partial stdout.

The Earshot adapter is a provider-specific example; it is not proof that a reusable CLI adapter satisfying all requirements exists.

## 9. Security and data governance

### 9.1 Trust boundaries

All external tool descriptions, files, metadata, search results, generated text, logs and returned payloads MUST be treated as untrusted input. They MUST NOT be interpreted as system instructions, policy changes or approval.

### 9.2 Least privilege and data minimization

Each skill MUST declare the minimum data it needs. The adapter MUST send only those fields. Sensitive data MUST NOT be transmitted to an external provider unless the owner-approved use case and applicable policy explicitly allow it.

### 9.3 Secrets

Secrets MUST be supplied through a managed secret mechanism at runtime, scoped to the provider and environment, excluded from source control and logs, and rotated/revoked when access changes. A skill manifest MUST never contain secret values.

### 9.4 Isolation and supply chain

Before enabling a new provider, assess package provenance, maintainer trust, license, transitive dependencies, install scripts, executable behavior, network destinations and update process. Untrusted code SHOULD run in an isolated environment with restricted filesystem and network access. The current repository does not claim a general sandbox.

### 9.5 Output safety

External output MUST be schema-validated, size-limited and sanitized before downstream use. Content from an external skill MUST NOT be executed as code, shell input, SQL, HTML or instructions without a separate, context-appropriate validation and authorization step.

## 10. Approval and policy enforcement

Approval is evaluated per operation, not merely per provider. At minimum, policy MUST distinguish:

- **Discovery:** listing metadata or available tools.
- **Read-only access:** reading approved public or owner-authorized data.
- **Local mutation:** creating or modifying local files or state.
- **Remote mutation:** changing external records or configuration.
- **Publication:** sending, posting or distributing content.
- **Financial action:** incurring charges, purchasing credits or making payments.
- **Destructive action:** deletion, irreversible changes or revocation.

The policy engine MUST evaluate principal, environment, provider, capability, resource/data scope, side-effect class, cost, budget, approval scope and expiry before dispatch.

An approval record SHOULD contain: approver identity, action summary, provider/tool, exact scope, maximum spend (including currency), environment, issued-at time, expiry, one-time or reusable scope, and policy version. A reusable approval MUST be narrowly scoped, time-limited and revocable. High-impact actions SHOULD require per-operation approval.

No approval may be inferred from a manifest flag, tool description, prior successful call, or an integration being marked optional/implemented.

## 11. Cost governance

Cost classification and authorization are separate decisions.

| Cost class | Meaning | Dispatch rule |
|---|---|---|
| `free` | Verified no-charge operation under the selected plan/terms | Still subject to data and side-effect policy |
| `metered` | Usage may incur variable charges | Require an explicit per-run or bounded standing budget |
| `paid` | Known charge, subscription consumption or credit purchase | Require explicit owner authorization and a maximum spend |
| `unknown` | Pricing or billing behavior is not established | Block dispatch until clarified and approved |

Before dispatch, the policy layer MUST reserve or otherwise enforce a budget ceiling. After execution it MUST reconcile reported usage with actual billing evidence where available. It MUST record currency, estimated cost, actual cost, source of pricing evidence and whether reconciliation is pending.

If actual cost cannot be determined, report it as unknown; do not report zero. If the provider cannot enforce a hard limit and the possible overrun is material, the action MUST remain disabled until a safe limit is available.

No New-Term Radar capability is classified as paid by this document. Pricing and billing behavior MUST be independently verified from authoritative provider terms before assigning `metered` or `paid`.

## 12. Timeouts, cancellation, retries and uncertain outcomes

- Every external call MUST have a bounded deadline and response-size limit.
- Cancellation MUST be propagated to the adapter and provider where supported.
- The runtime's AbortSignal is cooperative. If a provider ignores it, work may continue after Montry stops waiting; adapters MUST document and mitigate this behavior.
- Retries MUST be disabled by default for external side effects.
- A retry is allowed only when the operation is explicitly proven safe to repeat or protected by a durable idempotency key/deduplication mechanism.
- Timeouts, connection loss and process termination after dispatch MUST be classified as potentially indeterminate if the side effect may have happened.
- An indeterminate operation MUST be reconciled by querying authoritative provider state or operator review before any replay.
- A checkpoint is not proof that an external side effect did or did not occur. Exactly-once effects MUST NOT be promised without provider-level transactional guarantees.

## 13. Persistence and recovery

The current `WorkflowRunStore` is a pluggable contract. The included `InMemoryWorkflowRunStore` is process-local and non-durable. Runtime checkpoint/resume support exists when a caller supplies a store.

A production store MUST provide durable, atomic per-run writes and monotonic revisions. Multi-worker deployments MUST use transactional or compare-and-swap semantics; a process-local queue is insufficient. Recovery MUST validate workflow fingerprints, task identity, skill versions and saved output schemas.

Tasks restored in `running`, `failed`, `cancelled` or `indeterminate` states MUST NOT be replayed automatically unless safe replay is explicitly guaranteed. An operator reconciliation path is required for uncertain external effects.

## 14. Provider health, versioning and revocation

The current registry supports host-supplied `healthy`, `degraded` and `unavailable` states; it does not perform health probes. A production adapter SHOULD publish health signals with timestamps, reason codes and stale-state handling.

Provider versions and source revisions MUST be pinned. Updates MUST be assessed as new integration candidates, with compatibility tests and security review. A mutable branch name or floating package range is not sufficient provenance for a production integration.

Revocation MUST be possible without deleting workflow history. It SHOULD disable capability resolution, stop new dispatches, cancel active sessions where possible, revoke credentials and preserve audit records. Rollback MUST restore a previously verified adapter version and policy configuration, not merely change a manifest version string.

## 15. Audit and observability

For each external operation, record where applicable:

- workflow ID, run ID, task ID and correlation ID;
- Montry skill ID/version and provider ID/version/source revision;
- protocol server identity and tool/command;
- capability, resource scope and side-effect classification;
- policy decision and approval ID/scope/expiry;
- dispatch and completion timestamps, duration and attempt number;
- timeout/cancellation status and whether remote completion is known;
- input/output schema versions and bounded payload metadata (not secrets or unnecessary personal data);
- cost class, budget reservation, currency, estimated/actual usage and reconciliation state;
- result status, sanitized error code and provider health.

Logs MUST be structured and access-controlled. Secrets and sensitive payloads MUST be redacted. Audit retention MUST follow an explicit retention policy.

## 16. Error taxonomy

Adapters SHOULD normalize errors into stable categories:

- `configuration_error`
- `authentication_error`
- `authorization_denied`
- `provider_unavailable`
- `rate_limited`
- `input_rejected`
- `output_contract_violation`
- `timeout`
- `cancelled`
- `transport_error`
- `provider_error`
- `cost_limit_exceeded`
- `indeterminate_outcome`

Each error MUST state whether dispatch occurred, whether a side effect is possible, whether retry is safe, and what reconciliation is required. Error text from providers MUST be treated as untrusted and sanitized before display or logging.

## 17. New-Term Radar candidate integration

New-Term Radar is a candidate external skill source, not a verified Montry provider. Before implementation, inspect its exact repository revision, license, dependency tree, network behavior, data access, tool schemas and authoritative pricing/billing documentation.

The following stages are proposed:

### Stage 1 — read-only candidate

A proposed `recent_leads` operation may be considered for a read-only pilot only after its actual implementation is inspected and confirmed to perform no writes, publication, paid dispatch or hidden side effect. The operation name alone is not evidence of read-only behavior.

Required controls: bounded query/input, approved data scope, output schema, source attribution, rate limits, timeout, audit logging and explicit activation approval.

### Stage 2 — controlled mutation or metered operations

Any proposed `run_radar`, `keyword_table` or other operation MUST be classified individually from source and provider terms. This document does not assert that these operations are paid, free, read-only or mutating.

Activation requires verified behavior, cost classification, budget ceiling, owner approval, explicit tool allowlist, idempotency/reconciliation plan and negative tests. Until then these capabilities MUST remain disabled.

### Failure isolation

A New-Term Radar failure MUST NOT disable unrelated Montry skills or core planning. Provider-specific data and errors MUST remain behind the adapter contract. The workflow MUST expose a clear unavailable/failed/indeterminate result without fabricating leads, keywords or successful outputs.

## 18. Test and acceptance requirements

An integration is not accepted until evidence is attached for all applicable gates.

| Gate | Minimum evidence |
|---|---|
| Architecture | Core remains usable with provider disabled; adapter boundary and capability mapping reviewed |
| Manifest | Valid/invalid manifests; exact version/capability parity; specification cannot execute |
| Contract | Input/output validation, unknown-field rejection, bounded payloads |
| Security | Secret redaction, least privilege, path/process/network controls, malicious output and prompt-injection tests |
| Authorization | Denied-by-default tests; approval expiry/scope/revocation; cost ceiling enforcement |
| Runtime | Timeout, cancellation, provider ignores cancellation, concurrency and failure isolation |
| Reliability | Retry disabled by default; idempotency; timeout-after-dispatch indeterminate handling |
| Persistence | Durable adapter atomicity, revision conflicts, restart recovery and reconciliation |
| Observability | Required audit fields, sanitized errors, no secret leakage |
| Compatibility | Pinned provider version, protocol compatibility and regression suite |
| Operations | Disable/revoke/rollback procedure exercised and documented |

A passing unit test suite does not prove provider behavior, production security, billing correctness or durable recovery. Evidence MUST identify the test environment, revision, commands, results and limitations.

## 19. Delivery roadmap and gates

| Phase | Scope | Exit gate | Status |
|---|---|---|---|
| A — Standard correction | Publish this standard as a draft; reconcile current documentation claims | Independent review accepts document and baseline evidence | Documentation published; independent review pending |
| B — Adapter contract | Define concrete typed contracts and adapter test harness | Contract tests pass; no provider-specific code in core | ADR-001 accepted with limitations; focused exception handling added. Latest CI for the resulting commits pending; no production certification |
| C — MCP foundation | Design and implement an allowlisted MCP client/session adapter | Durable checkpoint/reconciliation, protocol identity, bounds, policy and security tests pass | ADR-002 proposed; implementation NO-GO. Runtime indeterminate outcomes and evidence-backed in-process reconciliation API implemented; production persistence/operator controls remain absent |
| D — Policy and governance | Implement approval, data scope, cost reservation, audit and revocation controls | Deny-by-default and budget tests pass | Not started |
| E — New-Term Radar pilot | Integrate only verified, approved capabilities | Source/license/security/cost evidence and pilot acceptance complete | Not started; candidate only |

Each phase is gated. Completion of one phase does not automatically authorize the next. Paid or high-impact operations require separate owner approval.

## 20. No-go conditions

Do not activate an external skill if any of the following applies:

- source, owner, license or version cannot be established;
- executable code or endpoints are dynamically selected from untrusted metadata;
- required permissions exceed the approved scope;
- tool behavior or side effects are unknown;
- cost is unknown for an operation that may incur charges;
- no enforceable budget or approval path exists for a metered/paid operation;
- timeout/cancellation can leave material side effects with no reconciliation path;
- output cannot be validated or bounded;
- secrets may leak into logs or untrusted outputs;
- critical security, compatibility or rollback tests are missing;
- the provider requires weakening core safety controls.

## 21. Governance and status

The owner is the final authority for strategic and operational approval, risk limits, budgets and activation of external capabilities. Montry orchestration and specialist assessments may recommend actions but do not independently authorize high-impact or paid execution.

**Current document status:** DRAFT — PENDING INDEPENDENT REVIEW.  
**External adapter decision:** ADR-001 accepted with limitations for the narrow typed boundary; not a production certification.\n**Current MCP status:** no general MCP adapter verified. ADR-002 records a proposed design; implementation and provider activation remain NO-GO. Runtime-level indeterminate outcomes, checkpoint persistence hooks, compare-and-swap writes and evidence-backed reconciliation are now implemented. Remaining blockers include a durable production store, authenticated operator boundary, and all MCP transport/trust/policy/audit controls.  
**Current New-Term Radar status:** candidate only; no integration or pricing claim established.  
**Current durable persistence status:** pluggable store and runtime resume support exist; no durable production backend is included.

## 22. Proposed architecture decision records

The following ADRs SHOULD be created and decided as implementation proceeds:

- **ADR-001:** external adapter and capability contract;
- **ADR-002:** MCP client/session lifecycle and server identity — proposed, not approved; implementation NO-GO;
- **ADR-003:** CLI process isolation and executable trust;
- **ADR-004:** policy evaluation, approvals and delegated authority;
- **ADR-005:** cost classification, budget reservation and reconciliation;
- **ADR-006:** durable workflow store and uncertain-side-effect recovery;
- **ADR-007:** audit event schema, retention and redaction;
- **ADR-008:** provider version pinning, revocation and rollback.

No ADR is approved merely by being listed here.
