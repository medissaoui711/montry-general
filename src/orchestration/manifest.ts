import {readdir, readFile, lstat, realpath} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import {SkillIdSchema, SkillVersionSchema} from "./contracts";

const CapabilitySchema = z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9._/-]*$/i);

export const SkillManifestSchema = z.object({
  id: SkillIdSchema,
  version: SkillVersionSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  capabilities: z.array(CapabilitySchema).min(1),
  requires: z.array(CapabilitySchema).default([]),
  execution: z.object({
    kind: z.enum(["instruction", "in-process", "cli", "mcp"]),
    status: z.enum(["specification", "implemented"]),
    optional: z.boolean().default(false),
  }).strict(),
}).strict();

export type SkillManifest = z.infer<typeof SkillManifestSchema>;
export type SkillCatalog = {
  skills: SkillManifest[];
  byId: Readonly<Record<string, SkillManifest>>;
  providers: Readonly<Record<string, string[]>>;
};

/**
 * Reads only direct child skill directories and regular skill.json files.
 * Symlinked directories/manifests are ignored or rejected to keep discovery
 * within the configured skills root.
 */
export async function loadSkillCatalog(rootDirectory: string): Promise<SkillCatalog> {
  const root = await realpath(rootDirectory);
  const entries = await readdir(root, {withFileTypes: true});
  const manifests: SkillManifest[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory = path.join(root, entry.name);
    const manifestPath = path.join(directory, "skill.json");

    let manifestStat;
    try {
      manifestStat = await lstat(manifestPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      throw new Error(\`Skill manifest must be a regular file: \${manifestPath}\`);
    }

    const resolvedManifest = await realpath(manifestPath);
    if (path.dirname(resolvedManifest) !== await realpath(directory)) {
      throw new Error(\`Skill manifest resolves outside its skill directory: \${manifestPath}\`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(resolvedManifest, "utf8"));
    } catch (error) {
      throw new Error(\`Unable to read skill manifest "\${manifestPath}": \${error instanceof Error ? error.message : String(error)}\`);
    }
    const parsed = SkillManifestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(\`Invalid skill manifest "\${manifestPath}": \${parsed.error.message}\`);
    }
    if (parsed.data.id !== entry.name) {
      throw new Error(\`Skill manifest ID "\${parsed.data.id}" must match directory "\${entry.name}".\`);
    }
    manifests.push(parsed.data);
  }

  const byId: Record<string, SkillManifest> = {};
  const providers: Record<string, string[]> = {};
  for (const manifest of manifests) {
    if (byId[manifest.id]) throw new Error(\`Duplicate skill manifest ID "\${manifest.id}".\`);
    byId[manifest.id] = manifest;
    for (const capability of manifest.capabilities) {
      providers[capability] ??= [];
      providers[capability].push(manifest.id);
    }
  }

  for (const manifest of manifests) {
    const duplicateRequirements = manifest.requires.filter((item, index) => manifest.requires.indexOf(item) !== index);
    if (duplicateRequirements.length) {
      throw new Error(\`Skill "\${manifest.id}" repeats required capability "\${duplicateRequirements[0]}".\`);
    }
    for (const requirement of manifest.requires) {
      if (!providers[requirement]?.length) {
        throw new Error(\`Skill "\${manifest.id}" requires unavailable capability "\${requirement}".\`);
      }
    }
  }

  for (const capabilityProviders of Object.values(providers)) capabilityProviders.sort();
  return {
    skills: manifests.sort((a, b) => a.id.localeCompare(b.id)),
    byId,
    providers,
  };
}
