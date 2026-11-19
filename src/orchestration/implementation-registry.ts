import type {SkillCatalog, SkillManifest} from "./manifest";
import type {SkillDefinition} from "./contracts";
import {SkillRegistry} from "./registry";

export type SkillExecutionKind = SkillManifest["execution"]["kind"];

/**
 * Binds metadata-only manifests to implementations supplied by trusted application code.
 * No module path, command, or executable payload is ever read from a manifest.
 */
export class SkillImplementationRegistry {
  private readonly bound = new Set<string>();

  constructor(
    private readonly catalog: SkillCatalog,
    private readonly runtime: SkillRegistry,
  ) {}

  register(
    manifestId: string,
    implementations: readonly SkillDefinition[],
    executionKind: SkillExecutionKind,
  ): this {
    const manifest = this.catalog.byId[manifestId];
    if (!manifest) throw new Error(`Skill manifest "${manifestId}" was not found in the catalog.`);
    if (this.bound.has(manifestId)) throw new Error(`Manifest "${manifestId}" is already bound.`);
    if (manifest.execution.status !== "implemented") {
      throw new Error(`Manifest "${manifestId}" is not marked as implemented.`);
    }
    if (manifest.execution.kind !== executionKind) {
      throw new Error(`Execution kind mismatch for "${manifestId}": expected "${manifest.execution.kind}", received "${executionKind}".`);
    }
    if (implementations.length === 0) throw new Error(`Manifest "${manifestId}" requires at least one trusted implementation.`);

    const ids = new Set<string>();
    const capabilities = new Set<string>();
    const requirements = new Set<string>();
    for (const implementation of implementations) {
      if (ids.has(implementation.id) || this.runtime.has(implementation.id)) {
        throw new Error(`Duplicate implementation ID "${implementation.id}".`);
      }
      ids.add(implementation.id);
      if (implementation.version !== manifest.version) {
        throw new Error(`Version mismatch for "${implementation.id}": manifest is ${manifest.version}, implementation is ${implementation.version}.`);
      }
      for (const capability of implementation.capabilities ?? []) {
        if (capabilities.has(capability)) throw new Error(`Duplicate implementation capability "${capability}".`);
        capabilities.add(capability);
      }
      for (const requirement of implementation.requires ?? []) requirements.add(requirement);
    }

    const expectedCapabilities = [...manifest.capabilities].sort();
    const actualCapabilities = [...capabilities].sort();
    if (JSON.stringify(actualCapabilities) !== JSON.stringify(expectedCapabilities)) {
      throw new Error(`Capability mismatch for "${manifestId}": manifest and implementation capabilities must match exactly.`);
    }
    const expectedRequirements = [...manifest.requires].sort();
    const actualRequirements = [...requirements].sort();
    if (JSON.stringify(actualRequirements) !== JSON.stringify(expectedRequirements)) {
      throw new Error(`Requirement mismatch for "${manifestId}": manifest and implementation requirements must match exactly.`);
    }

    // Validate every definition before mutating the shared runtime registry.
    for (const implementation of implementations) new SkillRegistry().register(implementation);
    for (const implementation of implementations) this.runtime.register(implementation);
    this.bound.add(manifestId);
    return this;
  }

  async registerOptional(
    manifestId: string,
    implementations: readonly SkillDefinition[],
    executionKind: SkillExecutionKind,
    isAvailable: () => boolean | Promise<boolean>,
  ): Promise<boolean> {
    const manifest = this.catalog.byId[manifestId];
    if (!manifest) throw new Error(`Skill manifest "${manifestId}" was not found in the catalog.`);
    if (!manifest.execution.optional) {
      throw new Error(`Manifest "${manifestId}" is required and cannot use optional registration.`);
    }
    if (!(await isAvailable())) return false;
    this.register(manifestId, implementations, executionKind);
    return true;
  }

  isBound(manifestId: string): boolean {
    return this.bound.has(manifestId);
  }
}
