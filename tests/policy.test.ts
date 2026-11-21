import {describe,expect,it} from "vitest";
import {evaluateExternalExecutionPolicy,type ExternalExecutionPolicy} from "../src/orchestration/policy";

const descriptor = {
  providerId:"provider.demo",providerVersion:"1.0.0",sourceRevision:"abc123",
  skillId:"skill.demo",skillVersion:"1.0.0",capabilities:["demo.read"],
  sideEffect:"read-only",costClass:"free",inputSchemaVersion:"1",outputSchemaVersion:"1",
  idempotency:"intrinsic",
};
const policy:ExternalExecutionPolicy = {
  allowedProviders:["provider.demo"],allowedSkills:["skill.demo"],allowedCapabilities:["demo.read"],
  allowedEnvironments:["test"],allowedSideEffects:["read-only","remote-write"],
  allowFreeReadOnlyWithoutApproval:true,maxSpendByCurrency:{USD:5},
};
const approval = {
  id:"approval-1",principalId:"operator-1",providerId:"provider.demo",skillId:"skill.demo",
  capabilities:["demo.read"],sideEffect:"read-only",environment:"test",expiresAt:2000,
};

describe("external execution policy",() => {
  it("allows explicitly configured free read-only work without approval",() => {
    expect(evaluateExternalExecutionPolicy({policy,descriptor,principalId:"operator-1",environment:"test",now:1000}))
      .toEqual({allowed:true,reason:"free-read-only"});
  });
  it("denies unknown provider costs",() => {
    expect(evaluateExternalExecutionPolicy({policy,descriptor:{...descriptor,costClass:"unknown"},principalId:"operator-1",environment:"test",now:1000}))
      .toEqual({allowed:false,reason:"Unknown provider cost blocks dispatch."});
  });
  it("denies capabilities outside the host allowlist",() => {
    expect(evaluateExternalExecutionPolicy({policy,descriptor:{...descriptor,capabilities:["demo.read","demo.write"]},principalId:"operator-1",environment:"test",now:1000}))
      .toEqual({allowed:false,reason:"One or more requested capabilities are not allowlisted."});
  });
  it("requires exact approval for remote writes",() => {
    const remote = {...descriptor,sideEffect:"remote-write" as const};
    expect(evaluateExternalExecutionPolicy({policy,descriptor:remote,principalId:"operator-1",environment:"test",now:1000}))
      .toEqual({allowed:false,reason:"A matching operation approval is required."});
    const approved = {...approval,sideEffect:"remote-write" as const};
    expect(evaluateExternalExecutionPolicy({policy,descriptor:remote,principalId:"operator-1",environment:"test",approval:approved,now:1000}))
      .toEqual({allowed:true,reason:"approved-operation",approvalId:"approval-1"});
  });
  it("denies expired or cross-principal approvals",() => {
    expect(evaluateExternalExecutionPolicy({policy,descriptor:{...descriptor,sideEffect:"remote-write"},principalId:"operator-1",environment:"test",approval:{...approval,sideEffect:"remote-write",expiresAt:1000},now:1000}))
      .toEqual({allowed:false,reason:"Approval has expired."});
    expect(evaluateExternalExecutionPolicy({policy,descriptor:{...descriptor,sideEffect:"remote-write"},principalId:"operator-2",environment:"test",approval:{...approval,sideEffect:"remote-write"},now:1000}))
      .toEqual({allowed:false,reason:"Approval scope does not match this operation."});
  });
  it("requires an approved reservation for metered work",() => {
    const metered = {...descriptor,costClass:"metered" as const};
    const meteredApproval = {...approval,maxCost:2,currency:"USD"};
    expect(evaluateExternalExecutionPolicy({policy,descriptor:metered,principalId:"operator-1",environment:"test",approval:meteredApproval,now:1000}))
      .toEqual({allowed:false,reason:"A durable cost reservation is required before paid or metered dispatch."});
    expect(evaluateExternalExecutionPolicy({policy,descriptor:metered,principalId:"operator-1",environment:"test",approval:meteredApproval,costReservation:{id:"reserve-1",status:"reserved",amount:2,currency:"USD"},now:1000}))
      .toEqual({allowed:true,reason:"approved-operation",approvalId:"approval-1",reservationId:"reserve-1"});
  });
  it("denies reservations above either the host budget or approval ceiling",() => {
    const metered = {...descriptor,costClass:"paid" as const};
    const meteredApproval = {...approval,maxCost:1,currency:"USD"};
    expect(evaluateExternalExecutionPolicy({policy,descriptor:metered,principalId:"operator-1",environment:"test",approval:meteredApproval,costReservation:{id:"reserve-1",status:"reserved",amount:2,currency:"USD"},now:1000}))
      .toEqual({allowed:false,reason:"Cost reservation exceeds the operation approval."});
  });
});
