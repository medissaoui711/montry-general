# Skill catalog and capability discovery

Montry distinguishes **discovering a skill** from **executing a skill**.

## Manifest format

Each skill directory may contain a `skill.json` manifest:

- `id`: stable identifier matching the directory name.
- `version`: semantic version.
- `name` and `description`: human-readable metadata.
- `capabilities`: capabilities offered by the skill.
- `requires`: capabilities needed by the skill.
- `execution.kind`: `instruction`, `in-process`, `cli` or `mcp`.
- `execution.status`: `specification` or `implemented`.
- `execution.optional`: whether availability is optional for a workflow.

The catalog loader reads only direct child directories and regular manifest files under the configured skills root. It does not follow symlinks, execute code, import entrypoints, install packages, or access the network.

## Discovery

```ts
import {loadSkillCatalog} from "./src/orchestration";

const catalog = await loadSkillCatalog("./skills");
const renderProviders = catalog.providers["video.render"] ?? [];
console.log(renderProviders);
```

Discovery validates manifest shape, ID/directory identity, duplicate IDs and required capability availability. Multiple providers may advertise the same capability; selection remains an explicit workflow/runtime decision rather than an implicit arbitrary choice.

## Execution boundary

A manifest is metadata, not proof that a skill is executable. `execution.status` makes that distinction explicit. The in-process `SkillRegistry` still requires a trusted implementation registered by application code. The catalog never turns a Markdown instruction file, CLI label or MCP declaration into executable code automatically.

## Security

- No shell execution or dynamic imports occur during discovery.
- Symlinked skill directories are not traversed.
- Manifest files must be regular files contained within their own skill directory.
- Unknown required capabilities fail catalog loading.
- External CLI/MCP adapters must be implemented separately with argument validation, timeouts, bounded output and explicit trust configuration.
