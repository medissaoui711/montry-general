import {
  SkillCapabilitySchema,
  SkillIdSchema,
  SkillVersionSchema,
  type SkillDefinition,
} from "./contracts";

export type SkillProviderStatus = "healthy" | "degraded" | "unavailable";
export type SkillProviderHealth = {
  skillId: string;
  status: SkillProviderStatus;
  reason?: string;
  updatedAt: number;
};

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition<any, any>>();
  private readonly capabilityProviders = new Map<string, Set<string>>();
  private readonly providerHealth = new Map<string, SkillProviderHealth>();

  register<I extends SkillDefinition["inputSchema"], O extends SkillDefinition["outputSchema"]>(
    definition: SkillDefinition<I, O>,
  ): this {
    const id = SkillIdSchema.parse(definition.id);
    SkillVersionSchema.parse(definition.version);
    if (this.skills.has(id)) throw new Error(`Skill "${id}" is already registered.`);

    const capabilities = (definition.capabilities ?? []).map((capability) => SkillCapabilitySchema.parse(capability));
    if (new Set(capabilities).size !== capabilities.length) {
      throw new Error(`Skill "${id}" declares a capability more than once.`);
    }

    this.skills.set(id, {...definition, capabilities});
    this.providerHealth.set(id, {skillId:id,status:"healthy",updatedAt:Date.now()});
    for (const capability of capabilities) {
      const providers = this.capabilityProviders.get(capability) ?? new Set<string>();
      providers.add(id);
      this.capabilityProviders.set(capability, providers);
    }
    return this;
  }

  get(id: string): SkillDefinition<any, any> {
    const definition = this.skills.get(id);
    if (!definition) throw new Error(`Skill "${id}" is not registered.`);
    return definition;
  }

  has(id: string): boolean { return this.skills.has(id); }

  list(): Array<{id: string; version: string; capabilities: string[]}> {
    return [...this.skills.values()]
      .map(({id, version, capabilities = []}) => ({id, version, capabilities: [...capabilities].sort()}))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  setProviderHealth(skillId: string, status: SkillProviderStatus, reason?: string): this {
    const id = SkillIdSchema.parse(skillId);
    if (!this.skills.has(id)) throw new Error(`Skill "${id}" is not registered.`);
    if (status !== "healthy" && status !== "degraded" && status !== "unavailable") {
      throw new Error(`Unsupported provider health status "${String(status)}".`);
    }
    const normalizedReason = reason?.trim();
    this.providerHealth.set(id, {
      skillId:id,
      status,
      ...(normalizedReason ? {reason:normalizedReason} : {}),
      updatedAt:Date.now(),
    });
    return this;
  }

  getProviderHealth(skillId: string): SkillProviderHealth {
    const id = SkillIdSchema.parse(skillId);
    const health = this.providerHealth.get(id);
    if (!health) throw new Error(`Skill "${id}" is not registered.`);
    return {...health};
  }

  listProviderHealth(): SkillProviderHealth[] {
    return [...this.providerHealth.values()]
      .map((health) => ({...health}))
      .sort((a, b) => a.skillId.localeCompare(b.skillId));
  }

  assertProviderAvailable(skillId: string): void {
    const health = this.getProviderHealth(skillId);
    if (health.status === "unavailable") {
      throw new Error(`Skill "${skillId}" is unavailable${health.reason ? `: ${health.reason}` : "."}`);
    }
  }

  listProviders(capability: string): string[] {
    const normalized = SkillCapabilitySchema.parse(capability);
    return [...(this.capabilityProviders.get(normalized) ?? [])].sort();
  }

  resolveCapability(capability: string, preferredProvider?: string): string {
    const providers = this.listProviders(capability);
    if (providers.length === 0) throw new Error(`No registered skill provides capability "${capability}".`);

    if (preferredProvider) {
      if (!providers.includes(preferredProvider)) {
        throw new Error(`Skill "${preferredProvider}" does not provide capability "${capability}".`);
      }
      this.assertProviderAvailable(preferredProvider);
      return preferredProvider;
    }

    const healthy = providers.filter((id) => this.getProviderHealth(id).status === "healthy");
    if (healthy.length === 1) return healthy[0]!;
    if (healthy.length > 1) {
      throw new Error(`Capability "${capability}" is ambiguous: multiple healthy providers are available; choose one: ${healthy.join(", ")}.`);
    }

    const degraded = providers.filter((id) => this.getProviderHealth(id).status === "degraded");
    if (degraded.length === 1) return degraded[0]!;
    if (degraded.length > 1) {
      throw new Error(`Capability "${capability}" is ambiguous: multiple degraded providers are available and no healthy provider exists; choose one: ${degraded.join(", ")}.`);
    }

    const statuses = providers.map((id) => {
      const health = this.getProviderHealth(id);
      return `${id} (unavailable${health.reason ? `: ${health.reason}` : ""})`;
    });
    throw new Error(`No available provider for capability "${capability}": ${statuses.join(", ")}.`);
  }
}
