import {describe, expect, it} from "vitest";
import {z} from "zod";
import {SkillRegistry} from "../src/orchestration/registry";

const provider = (id: string) => ({
  id,
  version:"1.0.0",
  capabilities:["audio.sfx.search"],
  inputSchema:z.object({}),
  outputSchema:z.object({provider:z.string()}),
  execute:() => ({provider:id}),
});

describe("provider health and capability resolution", () => {
  it("defaults registered providers to healthy and returns defensive health snapshots", () => {
    const registry = new SkillRegistry().register(provider("audio.primary"));
    const health = registry.getProviderHealth("audio.primary");
    expect(health).toMatchObject({skillId:"audio.primary",status:"healthy"});
    expect(registry.listProviderHealth()).toEqual([health]);
    expect(() => { (health as {status:string}).status = "unavailable"; }).not.toThrow();
    expect(registry.getProviderHealth("audio.primary").status).toBe("healthy");
  });

  it("prefers the sole healthy provider and ignores degraded or unavailable alternatives", () => {
    const registry = new SkillRegistry()
      .register(provider("audio.healthy"))
      .register(provider("audio.degraded"))
      .register(provider("audio.offline"));
    registry.setProviderHealth("audio.degraded","degraded","High latency");
    registry.setProviderHealth("audio.offline","unavailable","Provider endpoint is down");
    expect(registry.listProviders("audio.sfx.search")).toEqual(["audio.degraded","audio.healthy","audio.offline"]);
    expect(registry.resolveCapability("audio.sfx.search")).toBe("audio.healthy");
    expect(registry.resolveCapability("audio.sfx.search","audio.degraded")).toBe("audio.degraded");
    expect(() => registry.resolveCapability("audio.sfx.search","audio.offline")).toThrow(/unavailable.*Provider endpoint is down/i);
  });

  it("uses a sole degraded provider only when no healthy provider exists", () => {
    const registry = new SkillRegistry().register(provider("audio.fallback"));
    registry.setProviderHealth("audio.fallback","degraded","Reduced quality");
    expect(registry.resolveCapability("audio.sfx.search")).toBe("audio.fallback");
  });

  it("never chooses implicitly between multiple healthy or multiple degraded providers", () => {
    const registry = new SkillRegistry()
      .register(provider("audio.a"))
      .register(provider("audio.b"));
    expect(() => registry.resolveCapability("audio.sfx.search")).toThrow(/multiple healthy providers/i);
    registry.setProviderHealth("audio.a","degraded");
    registry.setProviderHealth("audio.b","degraded");
    expect(() => registry.resolveCapability("audio.sfx.search")).toThrow(/multiple degraded providers/i);
    expect(registry.resolveCapability("audio.sfx.search","audio.b")).toBe("audio.b");
  });

  it("fails clearly when all providers are unavailable and validates status updates", () => {
    const registry = new SkillRegistry().register(provider("audio.offline"));
    registry.setProviderHealth("audio.offline","unavailable","Maintenance");
    expect(() => registry.resolveCapability("audio.sfx.search")).toThrow(/no available provider.*Maintenance/i);
    expect(() => registry.setProviderHealth("missing.skill","healthy")).toThrow(/not registered/i);
    expect(() => registry.setProviderHealth("audio.offline","unknown" as never)).toThrow(/unsupported provider health/i);
  });

  it("restores a provider to healthy and updates its diagnostic reason", () => {
    const registry = new SkillRegistry().register(provider("audio.recovered"));
    registry.setProviderHealth("audio.recovered","unavailable","Probe failed");
    registry.setProviderHealth("audio.recovered","healthy","Recovered");
    expect(registry.getProviderHealth("audio.recovered")).toMatchObject({status:"healthy",reason:"Recovered"});
    expect(registry.resolveCapability("audio.sfx.search")).toBe("audio.recovered");
  });
});
