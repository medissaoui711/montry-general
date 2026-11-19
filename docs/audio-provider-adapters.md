# Optional audio provider adapters

Audio providers are specialist skills behind the orchestration registry. Neither provider is required by the Montry core.

## Openverse

`OpenverseProvider` searches `https://api.openverse.org/v1/audio/` with `category=sound_effect`. It returns candidate metadata only and never downloads or approves assets.

The default allowlist is `cc0,pdm,by`. Creator, license/version/URL, source page, attribution statement and duration in milliseconds are preserved. The adapter exposes commercial-use, adaptation and share-alike flags so downstream policy can reject unsuitable terms. CC BY candidates require attribution. Other licenses must be explicitly enabled and their restrictions retained.

HTTP 429 responses include `Retry-After`; the adapter surfaces this value without retrying in a tight loop.

## Earshot

`EarshotAdapter` is a shell-free bridge to the local `earshot` executable. It exposes only `sfx list`, `sfx render` and `sfx check`.

It validates identifiers, numeric bounds, absolute paths and WAV output. It uses argument arrays, disables shell execution, applies a timeout, bounds combined stdout/stderr and passes a minimal subprocess environment. It refuses credential-like environment variables and does not overwrite existing output unless `overwrite: true` is explicit. It verifies that a non-empty WAV was produced.

The adapter does not install Earshot, download model weights or execute arbitrary CLI commands. Its bank render/check path is model-free; model-based Earshot features remain outside this adapter.

## Registering the skills

```ts
import {SkillRegistry} from "./src/orchestration";
import {OpenverseProvider,EarshotAdapter,createOpenverseSearchSkill,createEarshotSfxSkills} from "./src/providers";

const registry = new SkillRegistry();
registry.register(createOpenverseSearchSkill(new OpenverseProvider()));
const earshot = new EarshotAdapter({executable:"earshot",timeoutMs:120000});
for (const skill of createEarshotSfxSkills(earshot)) registry.register(skill);
```

A workflow can request `audio.sfx.search`, `audio.sfx.generate` or `audio.sfx.audit`. If several implementations provide a capability, it must name the provider.

## Approval and safety boundary

Provider output is untrusted candidate data. Search results are not proof of rights clearance. A human or explicit policy gate must approve the exact asset and retain its attribution before download or use. Generated audio must pass technical checks and listening review. Neither provider silently changes the final timeline or render.
