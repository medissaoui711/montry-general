import {
  SkillCapabilitySchema,
  SkillIdSchema,
  SkillVersionSchema,
  type SkillDefinition,
} from "./contracts";

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition<any, any>>();
  private readonly capabilityProviders = new Map<string, Set<string>>();

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

  listProviders(capability: string): string[] {
    const normalized = SkillCapabilitySchema.parse(capability);
    return [...(this.capabilityProviders.get(normalized) ?? [])].sort();
  }

  resolveCapability(capability: string, preferredProvider?: string): string {
    const providers = this.listProviders(capability);
    if (preferredProvider) {
      if (!providers.includes(preferredProvider)) {
        throw new Error(`Skill "${preferredProvider}" does not provide capability "${capability}".`);
      }
      return preferredProvider;
    }
    if (providers.length === 0) throw new Error(`No registered skill provides capability "${capability}".`);
    if (providers.length > 1) {
      throw new Error(`Capability "${capability}" is ambiguous; choose a provider: ${providers.join(", ")}.`);
    }
    return providers[0]!;
  }
}
