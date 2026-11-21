import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {
  executeExternalSkill,
  type ExternalSkillAdapter,
  type ExternalSkillDescriptor,
} from "../src/orchestration/external-adapter";
import type {SkillDefinition} from "../src/orchestration/contracts";

const descriptor: ExternalSkillDescriptor = {
  providerId: "provider.example",
  providerVersion: "2.1.0",
  sourceRevision: "a1b2c3d4",
  skillId: "external.lookup",
  skillVersion: "1.0.0",
  capabilities: ["records.read"],
  sideEffect: "read-only",
  costClass: "free",
  inputSchemaVersion: "1",
  outputSchemaVersion: "1",
  idempotency: "intrinsic",
};

const skill: SkillDefinition = {
  id: "external.lookup",
  version: "1.0.0",
  capabilities: ["records.read"],
  inputSchema: z.object({query: z.string().min(1)}).strict(),
  outputSchema: z.object({items: z.array(z.string())}).strict(),
  execute: () => ({items: []}),
};

const context = {
  workflowId: "workflow-1",
  runId: "run-1",
  taskId: "task-1",
  signal: new AbortController().signal,
};

const adapter = (execute: ExternalSkillAdapter["execute"]): ExternalSkillAdapter => ({
  providerId: descriptor.providerId,
  providerVersion: descriptor.providerVersion,
  sourceRevision: descriptor.sourceRevision,
  execute,
});

describe("external adapter contract", () => {
  it("dispatches validated input and accepts a schema-valid completed result", async () => {
    const execute = vi.fn(async ({input}: {input: unknown}) => ({
      status: "completed",
      output: {items: [(input as {query: string}).query]},
      providerRequestId: "request-1",
    }));
    const result = await executeExternalSkill(adapter(execute), descriptor, skill, {query: "montry"}, context);
    expect(result).toMatchObject({status: "completed", output: {items: ["montry"]}});
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects invalid input before dispatch", async () => {
    const execute = vi.fn(async () => ({status: "completed", output: {items: []}}));
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: 42}, context)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects an output that violates the trusted skill schema", async () => {
    const execute = vi.fn(async () => ({status: "completed", output: {unexpected: true}}));
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, context)).rejects.toThrow();
  });

  it("rejects provider identity, source revision and skill version mismatches", async () => {
    const execute = vi.fn(async () => ({status: "completed", output: {items: []}}));
    await expect(executeExternalSkill({...adapter(execute), sourceRevision: "different"}, descriptor, skill, {query: "x"}, context))
      .rejects.toThrow(/identity/i);
    await expect(executeExternalSkill(adapter(execute), {...descriptor, sourceRevision: "different"}, skill, {query: "x"}, context))
      .rejects.toThrow(/identity/i);
    await expect(executeExternalSkill(adapter(execute), descriptor, {...skill, version: "2.0.0"}, {query: "x"}, context))
      .rejects.toThrow(/identity or version/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects capability drift between the external descriptor and trusted binding", async () => {
    const execute = vi.fn(async () => ({status: "completed", output: {items: []}}));
    await expect(executeExternalSkill(adapter(execute), {...descriptor, capabilities: ["records.write"]}, skill, {query: "x"}, context))
      .rejects.toThrow(/capabilities/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("preserves indeterminate outcomes instead of translating them into safe failures", async () => {
    const execute = vi.fn(async () => ({
      status: "indeterminate",
      reason: "Connection lost after dispatch.",
      dispatchOccurred: true,
      sideEffectPossible: true,
      reconciliationRequired: true,
    }));
    const result = await executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, context);
    expect(result).toMatchObject({status: "indeterminate", reconciliationRequired: true});
  });

  it("does not dispatch when the execution context is already cancelled or expired", async () => {
    const execute = vi.fn(async () => ({status: "completed", output: {items: []}}));
    const controller = new AbortController();
    controller.abort();
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, {
      ...context, signal: controller.signal,
    })).rejects.toThrow(/cancelled before dispatch/i);
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, {
      ...context, deadlineAt: Date.now() - 1,
    })).rejects.toThrow(/deadline expired/i);
    expect(execute).not.toHaveBeenCalled();
  });
  
  it("requires a provider idempotency key before dispatch when declared", async () => {
    const execute = vi.fn(async () => ({status: "completed", output: {items: []}}));
    const requiresKey = {...descriptor, idempotency: "provider-key" as const};
    await expect(executeExternalSkill(adapter(execute), requiresKey, skill, {query: "x"}, context))
      .rejects.toThrow(/idempotency key/i);
    expect(execute).not.toHaveBeenCalled();
    await expect(executeExternalSkill(adapter(execute), requiresKey, skill, {query: "x"}, {
      ...context, idempotencyKey: "run-1:task-1",
    })).resolves.toMatchObject({status: "completed"});
    expect(execute).toHaveBeenCalledOnce();
  });

  it("converts adapter exceptions into conservative indeterminate outcomes", async () => {
    const execute = vi.fn(async () => { throw new Error("provider response may contain sensitive details"); });
    const result = await executeExternalSkill(adapter(execute), {
      ...descriptor, sideEffect: "remote-write",
    }, skill, {query: "x"}, context);
    expect(result).toEqual({
      status: "indeterminate",
      reason: "Adapter execution ended without a confirmed result.",
      dispatchOccurred: true,
      sideEffectPossible: true,
      reconciliationRequired: true,
    });
    expect(JSON.stringify(result)).not.toContain("sensitive details");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects malformed result envelopes", async () => {
    const execute = vi.fn(async () => ({status: "completed", output: {items: []}, unexpected: true}));
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, context)).rejects.toThrow();
  });

  it("accepts a confirmed failure with no dispatch and no possible side effect", async () => {
    const execute = vi.fn(async () => ({
      status: "failed", errorCode: "input_rejected",
      message: "Provider rejected the request before dispatch.",
      dispatchOccurred: false, sideEffectPossible: false,
    }));
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, context))
      .resolves.toMatchObject({status: "failed", dispatchOccurred: false, sideEffectPossible: false});
  });

  it("rejects a failed outcome that claims a side effect without dispatch", async () => {
    const execute = vi.fn(async () => ({
      status: "failed", errorCode: "transport_error",
      message: "Invalid contradictory outcome.",
      dispatchOccurred: false, sideEffectPossible: true,
    }));
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, context))
      .rejects.toThrow(/possible side effect/i);
  });

  it("accepts a dispatched failure while preserving side-effect uncertainty", async () => {
    const execute = vi.fn(async () => ({
      status: "failed", errorCode: "provider_error",
      message: "Provider returned an error after dispatch.",
      dispatchOccurred: true, sideEffectPossible: true,
    }));
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, context))
      .resolves.toMatchObject({status: "failed", dispatchOccurred: true, sideEffectPossible: true});
  });

  it("rejects an indeterminate outcome that omits required reconciliation", async () => {
    const execute = vi.fn(async () => ({
      status: "indeterminate", reason: "Connection lost after dispatch.",
      dispatchOccurred: true, sideEffectPossible: true, reconciliationRequired: false,
    }));
    await expect(executeExternalSkill(adapter(execute), descriptor, skill, {query: "x"}, context))
      .rejects.toThrow(/reconciliation/i);
  });

  it("rejects duplicate capabilities and provider identity drift before dispatch", async () => {
    const execute = vi.fn(async () => ({status: "completed", output: {items: []}}));
    await expect(executeExternalSkill(adapter(execute), {
      ...descriptor, capabilities: ["records.read", "records.read"],
    }, skill, {query: "x"}, context)).rejects.toThrow(/unique/i);
    await expect(executeExternalSkill({
      ...adapter(execute), providerVersion: "9.9.9",
    }, descriptor, skill, {query: "x"}, context)).rejects.toThrow(/identity/i);
    await expect(executeExternalSkill({
      ...adapter(execute), providerId: "provider.other",
    }, descriptor, skill, {query: "x"}, context)).rejects.toThrow(/identity/i);
    expect(execute).not.toHaveBeenCalled();
  });

});
