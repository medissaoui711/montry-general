import {SkillIdSchema, SkillVersionSchema, type SkillDefinition} from "./contracts";

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition<any, any>>();

  register<I extends SkillDefinition["inputSchema"], O extends SkillDefinition["outputSchema"]>(
    definition: SkillDefinition<I, O>,
  ): this {
    const id = SkillIdSchema.parse(definition.id);
    SkillVersionSchema.parse(definition.version);
    if (this.skills.has(id)) throw new Error(`Skill "${id}" is already registered.`);
    this.skills.set(id, definition);
    return this;
  }

  get(id: string): SkillDefinition<any, any> {
    const definition = this.skills.get(id);
    if (!definition) throw new Error(`Skill "${id}" is not registered.`);
    return definition;
  }

  has(id: string): boolean { return this.skills.has(id); }

  list(): Array<{id: string; version: string}> {
    return [...this.skills.values()]
      .map(({id, version}) => ({id, version}))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
