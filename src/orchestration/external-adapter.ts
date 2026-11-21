import {z} from "zod";
import {SkillIdSchema, SkillVersionSchema, type SkillDefinition} from "./contracts";

export const ExternalSkillDescriptorSchema = z.object({
  providerId: SkillIdSchema,
  providerVersion: z.string().trim().min(1),
  sourceRevision: z.string().trim().min(1),
  skillId: SkillIdSchema,
  skillVersion: SkillVersionSchema,
  capabilities: z.array(z.string().trim().min(1)).min(1),
  sideEffect: z.enum(["read-only", "local-write", "remote-write", "publication", "financial", "destructive"]),
  costClass: z.enum(["free", "metered", "paid", "unknown"]),
  inputSchemaVersion: z.string().trim().min(1),
  outputSchemaVersion: z.string().trim().min(1),
  idempotency: z.enum(["intrinsic", "provider-key", "none"]),
}).strict().superRefine((descriptor, context) => {
  if (new Set(descriptor.capabilities).size !== descriptor.capabilities.length) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["capabilities"], message: "Capabilities must be unique."});
  }
});

export type ExternalSkillDescriptor = z.infer<typeof ExternalSkillDescriptorSchema>;

export type ExternalAdapterExecutionContext = {
  workflowId: string;
  runId: string;
  taskId: string;
  signal: AbortSignal;
  deadlineAt?: number;
  approvalId?: string;
  idempotencyKey?: string;
};

export type ExternalAdapterRequest = {
  descriptor: ExternalSkillDescriptor;
  input: unknown;
  context: ExternalAdapterExecutionContext;
};

export const ExternalAdapterResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("completed"),
    output: z.unknown(),
    providerRequestId: z.string().trim().min(1).optional(),
    usage: z.object({
      amount: z.number().nonnegative().optional(),
      unit: z.string().trim().min(1).optional(),
      currency: z.string().trim().min(1).optional(),
      cost: z.number().nonnegative().optional(),
    }).strict().optional(),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    errorCode: z.string().trim().min(1),
    message: z.string().trim().min(1),
    dispatchOccurred: z.boolean(),
    sideEffectPossible: z.boolean(),
  }).strict(),
  z.object({
    status: z.literal("indeterminate"),
    reason: z.string().trim().min(1),
    dispatchOccurred: z.literal(true),
    sideEffectPossible: z.boolean(),
    reconciliationRequired: z.boolean(),
  }).strict().superRefine((result, context) => {
    if (result.sideEffectPossible && !result.reconciliationRequired) {
      context.addIssue({code: z.ZodIssueCode.custom, path: ["reconciliationRequired"], message: "Possible side effects require reconciliation."});
    }
  }),
]);

export type ExternalAdapterResult = z.infer<typeof ExternalAdapterResultSchema>;

export interface ExternalSkillAdapter {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly sourceRevision: string;
  execute(request: ExternalAdapterRequest): Promise<unknown>;
}

export type ExternalSkillBinding = Pick<SkillDefinition, "id" | "version" | "capabilities" | "inputSchema" | "outputSchema">;

/**
 * Validates the provider identity, descriptor, input and result around one adapter
 * dispatch. This is a contract boundary, not an authorization or policy engine.
 */
export async function executeExternalSkill(
  adapter: ExternalSkillAdapter,
  descriptorInput: unknown,
  skill: ExternalSkillBinding,
  input: unknown,
  context: ExternalAdapterExecutionContext,
): Promise<ExternalAdapterResult> {
  const descriptor = ExternalSkillDescriptorSchema.parse(descriptorInput);

  if (context.signal.aborted) throw new Error("External skill execution was cancelled before dispatch.");
  if (context.deadlineAt !== undefined && context.deadlineAt <= Date.now()) {
    throw new Error("External skill execution deadline expired before dispatch.");
  }

  if (adapter.providerId !== descriptor.providerId
    || adapter.providerVersion !== descriptor.providerVersion
    || adapter.sourceRevision !== descriptor.sourceRevision) {
    throw new Error("External adapter identity does not match the pinned descriptor.");
  }
  if (skill.id !== descriptor.skillId || skill.version !== descriptor.skillVersion) {
    throw new Error("External skill identity or version does not match the trusted binding.");
  }

  const expectedCapabilities = [...(skill.capabilities ?? [])].sort();
  const actualCapabilities = [...descriptor.capabilities].sort();
  if (JSON.stringify(expectedCapabilities) !== JSON.stringify(actualCapabilities)) {
    throw new Error("External skill capabilities do not match the trusted binding.");
  }

  if (descriptor.idempotency === "provider-key" && !context.idempotencyKey) {
    throw new Error("This provider requires an idempotency key before dispatch.");
  }

  const parsedInput = skill.inputSchema.parse(input);
  const rawResult = await adapter.execute({descriptor, input: parsedInput, context});
  const result = ExternalAdapterResultSchema.parse(rawResult);

  if (result.status === "completed") {
    return {...result, output: skill.outputSchema.parse(result.output)};
  }
  return result;
}
