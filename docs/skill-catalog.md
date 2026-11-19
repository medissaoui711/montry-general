# Skill catalog and trusted runtime bindings

Skill manifests are metadata, not executable packages. A `skill.json` may describe an ID, version, capabilities, requirements, execution kind and whether a provider is optional. It must never contain a module path, dynamic import target, shell command or executable code that the runtime evaluates.

## Discovery and execution are separate

1. `loadSkillCatalog` validates manifests and builds a metadata catalog.
2. Application code explicitly constructs trusted skill implementations using reviewed factories.
3. `SkillImplementationRegistry` binds those implementations to a manifest.
4. Binding succeeds only when the manifest is implemented and its version, complete capability set, requirements and execution kind match the trusted implementations.
5. Only then are definitions registered with the workflow runtime.

A manifest discovered from disk cannot execute itself. Unknown manifests, specification-only entries, mismatched contracts and duplicate bindings are rejected. No dynamic import or arbitrary command execution is derived from manifest content.

## Optional providers

Optional providers should be probed by their adapter and registered only when available. A missing optional provider remains absent from the runtime; it does not invalidate the core catalog or other providers. The core must not install external tools or dependencies automatically.

The binding registry accepts an availability callback for this gate. The callback should perform a bounded, side-effect-free probe and return `false` for a missing optional executable. For Earshot, use `await bindings.registerOptional("earshot", createEarshotSfxSkills(earshot), "cli", () => earshot.isAvailable())`. Its probe invokes only `earshot --help` with a short timeout and bounded output; it never installs the tool.
