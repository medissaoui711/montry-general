import {z} from "zod";
import {ExternalSkillDescriptorSchema} from "./external-adapter";

const SideEffectSchema = z.enum(["read-only","local-write","remote-write","publication","financial","destructive"]);
const CostClassSchema = z.enum(["free","metered","paid","unknown"]);

export const ExternalOperationApprovalSchema = z.object({
  id:z.string().trim().min(1),
  principalId:z.string().trim().min(1),
  providerId:z.string().trim().min(1),
  skillId:z.string().trim().min(1),
  capabilities:z.array(z.string().trim().min(1)).min(1),
  sideEffect:SideEffectSchema,
  environment:z.string().trim().min(1),
  expiresAt:z.number().int().positive(),
  maxCost:z.number().nonnegative().optional(),
  currency:z.string().trim().min(1).optional(),
}).strict();
export type ExternalOperationApproval = z.infer<typeof ExternalOperationApprovalSchema>;

export const ExternalCostReservationSchema = z.object({
  id:z.string().trim().min(1),
  status:z.literal("reserved"),
  amount:z.number().nonnegative(),
  currency:z.string().trim().min(1),
}).strict();
export type ExternalCostReservation = z.infer<typeof ExternalCostReservationSchema>;

export const ExternalExecutionPolicySchema = z.object({
  allowedProviders:z.array(z.string().trim().min(1)).min(1),
  allowedSkills:z.array(z.string().trim().min(1)).min(1),
  allowedCapabilities:z.array(z.string().trim().min(1)).min(1),
  allowedEnvironments:z.array(z.string().trim().min(1)).min(1),
  allowedSideEffects:z.array(SideEffectSchema).min(1),
  allowFreeReadOnlyWithoutApproval:z.boolean().default(false),
  maxSpendByCurrency:z.record(z.string().trim().min(1),z.number().nonnegative()).default({}),
}).strict();
export type ExternalExecutionPolicy = z.input<typeof ExternalExecutionPolicySchema>;

export type ExternalPolicyEvaluationInput = {
  policy:ExternalExecutionPolicy;
  descriptor:unknown;
  principalId:string;
  environment:string;
  approval?:unknown;
  costReservation?:unknown;
  now?:number;
};

export type ExternalPolicyDecision =
  | {allowed:true;reason:"free-read-only"|"approved-operation";approvalId?:string;reservationId?:string}
  | {allowed:false;reason:string};

const sameSet = (left:string[],right:string[]) =>
  left.length === right.length && [...left].sort().every((value,index) => value === [...right].sort()[index]);

/**
 * Pure deny-by-default policy evaluation. The host must authenticate principalId,
 * verify approval provenance, reserve budget durably, and call this before dispatch.
 */
export function evaluateExternalExecutionPolicy(input:ExternalPolicyEvaluationInput):ExternalPolicyDecision {
  const policy = ExternalExecutionPolicySchema.parse(input.policy);
  const descriptor = ExternalSkillDescriptorSchema.parse(input.descriptor);
  const principalId = z.string().trim().min(1).parse(input.principalId);
  const environment = z.string().trim().min(1).parse(input.environment);
  const now = input.now ?? Date.now();

  if (!policy.allowedProviders.includes(descriptor.providerId)) return {allowed:false,reason:"Provider is not allowlisted."};
  if (!policy.allowedSkills.includes(descriptor.skillId)) return {allowed:false,reason:"Skill is not allowlisted."};
  if (!descriptor.capabilities.every((capability) => policy.allowedCapabilities.includes(capability))) {
    return {allowed:false,reason:"One or more requested capabilities are not allowlisted."};
  }
  if (!policy.allowedEnvironments.includes(environment)) return {allowed:false,reason:"Environment is not allowlisted."};
  if (!policy.allowedSideEffects.includes(descriptor.sideEffect)) return {allowed:false,reason:"Side-effect class is not allowlisted."};
  if (descriptor.costClass === "unknown") return {allowed:false,reason:"Unknown provider cost blocks dispatch."};

  const approvalRequired = !(descriptor.costClass === "free"
    && descriptor.sideEffect === "read-only"
    && policy.allowFreeReadOnlyWithoutApproval);
  if (!approvalRequired) return {allowed:true,reason:"free-read-only"};

  if (!input.approval) return {allowed:false,reason:"A matching operation approval is required."};
  const approval = ExternalOperationApprovalSchema.safeParse(input.approval);
  if (!approval.success) return {allowed:false,reason:"Approval record is invalid."};
  const a = approval.data;
  if (a.expiresAt <= now) return {allowed:false,reason:"Approval has expired."};
  if (a.principalId !== principalId || a.providerId !== descriptor.providerId
    || a.skillId !== descriptor.skillId || a.sideEffect !== descriptor.sideEffect
    || a.environment !== environment || !sameSet(a.capabilities,descriptor.capabilities)) {
    return {allowed:false,reason:"Approval scope does not match this operation."};
  }

  if (descriptor.costClass === "metered" || descriptor.costClass === "paid") {
    const reservation = ExternalCostReservationSchema.safeParse(input.costReservation);
    if (!reservation.success) return {allowed:false,reason:"A durable cost reservation is required before paid or metered dispatch."};
    const limit = policy.maxSpendByCurrency[reservation.data.currency];
    if (limit === undefined || reservation.data.amount > limit) {
      return {allowed:false,reason:"Cost reservation exceeds or lacks an approved currency budget."};
    }
    if (a.maxCost === undefined || a.currency !== reservation.data.currency || reservation.data.amount > a.maxCost) {
      return {allowed:false,reason:"Cost reservation exceeds the operation approval."};
    }
    return {allowed:true,reason:"approved-operation",approvalId:a.id,reservationId:reservation.data.id};
  }
  return {allowed:true,reason:"approved-operation",approvalId:a.id};
}
