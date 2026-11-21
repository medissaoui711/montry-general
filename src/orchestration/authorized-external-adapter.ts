import {
  executeExternalSkill,
  type ExternalAdapterExecutionContext,
  type ExternalSkillAdapter,
  type ExternalSkillBinding,
  type ExternalAdapterResult,
} from "./external-adapter";
import {
  evaluateExternalExecutionPolicy,
  type ExternalExecutionPolicy,
  type ExternalOperationApproval,
  type ExternalCostReservation,
} from "./policy";

export type AuthorizedExternalExecutionRequest = {
  adapter:ExternalSkillAdapter;
  descriptor:unknown;
  skill:ExternalSkillBinding;
  input:unknown;
  context:ExternalAdapterExecutionContext;
  policy:ExternalExecutionPolicy;
  principalId:string;
  environment:string;
  approval?:ExternalOperationApproval;
  costReservation?:ExternalCostReservation;
  now?:number;
};

export class ExternalExecutionDeniedError extends Error {
  constructor(readonly reason:string) {
    super(`External execution denied: ${reason}`);
    this.name="ExternalExecutionDeniedError";
  }
}

/**
 * Policy-enforced entry point for external adapter dispatch.
 * The host must authenticate principalId, verify approval provenance and reserve
 * metered/paid budget durably before calling this function.
 */
export async function executeAuthorizedExternalSkill(
  request:AuthorizedExternalExecutionRequest,
):Promise<ExternalAdapterResult> {
  const decision=evaluateExternalExecutionPolicy({
    policy:request.policy,
    descriptor:request.descriptor,
    principalId:request.principalId,
    environment:request.environment,
    approval:request.approval,
    costReservation:request.costReservation,
    now:request.now,
  });
  if (!decision.allowed) throw new ExternalExecutionDeniedError(decision.reason);
  return executeExternalSkill(
    request.adapter,
    request.descriptor,
    request.skill,
    request.input,
    {...request.context,...(decision.approvalId ? {approvalId:decision.approvalId} : {})},
  );
}
