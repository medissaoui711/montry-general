# Skill catalog and capability discovery

Montry distinguishes discovering a skill from executing a skill.

## Manifest format

Each skill directory may contain a \`skill.json\` manifest with:
- \`id\`: stable identifier matching the directory name.
- \`version\`: semantic version.
- \`name\` and \`description\`: human-readable metadata.
- \`capabilities\`: capabilities offered by the skill.
- \`requires\`: capabilities needed by the skill.
- \`execution.kind\`: \`instruction\`, \`in-process\`, \`cli\` or \`mcp\`.
- \`execution.status\`: \`specification\` or \`implemented\`.
- \`execution.optional\`: whether the provider is optional.

## Discovery

\`\`\`ts
import {loadSkillCatalog} from "./src/orchestration";

const catalog = await loadSkillCatalog("./skills");
const renderProviders = catalog.providers["video.render"] ?? [];
console.log(renderProviders);
\`\`\`

The loader reads only direct child directories and regular manifest files under the configured skills root. It does not follow symlinks, execute code, import entrypoints, install packages or access the network.

Discovery validates manifest shape, ID/directory identity, duplicate IDs and required capability availability. Multiple providers may advertise the same capability.

## Capability resolution

Executable skill implementations register their capabilities with \`SkillRegistry\`. A workflow task can reference either a stable skill ID or a capability:

\`\`\`ts
{
  id: "render",
  capability: "video.render",
  input: { format: "mp4" },
  dependsOn: []
}
\`\`\`

If exactly one registered skill provides the capability, it is selected. If several skills provide it, the workflow must name a \`provider\` explicitly. The runtime never picks an ambiguous provider by arbitrary registration order.

## Execution boundary

A manifest is metadata, not proof that a skill is executable. \`execution.status\` makes this distinction explicit. The in-process \`SkillRegistry\` still requires a trusted implementation registered by application code. Markdown instructions, CLI labels and MCP declarations are never executed automatically.

## Security

- No shell execution or dynamic imports occur during discovery.
- Symlinked skill directories are not traversed.
- Manifest files must be regular files contained within their own skill directory.
- Unknown required capabilities fail catalog loading.
- External CLI/MCP adapters require separate argument validation, timeouts, bounded output and explicit trust configuration.
