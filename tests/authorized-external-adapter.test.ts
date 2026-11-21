import {describe,expect,it,vi} from "vitest";
import {z} from "zod";
import {executeAuthorizedExternalSkill,ExternalExecutionDeniedError} from "../src/orchestration/authorized-external-adapter";
import type {ExternalExecutionPolicy} from "../src/orchestration/policy";

const descriptor = {
  providerId:"provider.demo",providerVersion:"1.0.0",sourceRevision:"abc123",
  skillId:"skill.demo",skillVersion:"1.0.0",capabilities:["demo.read"],
  sideEffect:"read-only",costClass:"free",inputSchemaVersion:"1",outputSchemaVersion:"1",
  idempotency:"intrinsic",
};
const policy:ExternalExecutionPolicy = {
  allowedProviders:["provider.demo"],allowedSkills:["skill.demo"],allowedCapabilities:["demo.read"],
  allowedEnvironments:["test"],allowedSideEffects:["read-only"],
  allowFreeReadOnlyWithoutApproval:true,maxSpendByCurrency:{},
};
const skill = {
  id:"skill.demo",version:"1.0.0",capabilities:["demo.read"],
  inputSchema:z.unknown(),outputSchema:z.unknown(),
};
const context = {workflowId:"wf-1",runId:"run-1",taskId:"task-1",signal:new AbortController().signal};

describe("policy-enforced external adapter",() => {
  it("evaluates policy before invoking the provider",async() => {
    const execute=vi.fn(async()=>({status:"completed",output:{ok:true}}));
    const result=await executeAuthorizedExternalSkill({
      adapter:{providerId:"provider.demo",providerVersion:"1.0.0",sourceRevision:"abc123",execute},
      descriptor,skill,input:{},context,policy,principalId:"operator-1",environment:"test",
    });
    expect(result).toEqual({status:"completed",output:{ok:true}});
    expect(execute).toHaveBeenCalledOnce();
  });
  it("fails closed without invoking the provider when policy denies",async() => {
    const execute=vi.fn();
    await expect(executeAuthorizedExternalSkill({
      adapter:{providerId:"provider.demo",providerVersion:"1.0.0",sourceRevision:"abc123",execute},
      descriptor,skill,input:{},context,policy:{...policy,allowedProviders:[]},
      principalId:"operator-1",environment:"test",
    })).rejects.toBeInstanceOf(ExternalExecutionDeniedError);
    expect(execute).not.toHaveBeenCalled();
  });
});
