import {describe, expect, it} from "vitest";
import {z} from "zod";
import {SkillImplementationRegistry, SkillRegistry, type SkillCatalog, type SkillManifest} from "../src/orchestration";

const manifest = (overrides: Partial<SkillManifest> = {}): SkillManifest => ({
  id: "audio-pack",
  version: "1.0.0",
  name: "Audio pack",
  description: "Optional audio providers",
  capabilities: ["audio.search", "audio.generate"],
  requires: [],
  execution: {kind: "in-process", status: "implemented", optional: true},
  ...overrides,
});
const catalog = (entry = manifest()): SkillCatalog => ({
  skills: [entry],
  byId: {[entry.id]: entry},
  providers: Object.fromEntries(entry.capabilities.map((capability) => [capability, [entry.id]])),
});
const definitions = () => [
  {id: "audio.search", version: "1.0.0", capabilities: ["audio.search"], inputSchema: z.object({}), outputSchema: z.object({ok: z.boolean()}), execute: () => ({ok: true})},
  {id: "audio.generate", version: "1.0.0", capabilities: ["audio.generate"], inputSchema: z.object({}), outputSchema: z.object({ok: z.boolean()}), execute: () => ({ok: true})},
];

describe("trusted manifest-to-runtime bindings", () => {
  it("registers trusted implementations only when the manifest contract matches", () => {
    const runtime = new SkillRegistry();
    const bindings = new SkillImplementationRegistry(catalog(), runtime);
    bindings.register("audio-pack", definitions(), "in-process");
    expect(runtime.list().map((item) => item.id)).toEqual(["audio.generate", "audio.search"]);
    expect(bindings.isBound("audio-pack")).toBe(true);
  });

  it("rejects a missing manifest and specification-only manifest", () => {
    const bindings = new SkillImplementationRegistry(catalog(), new SkillRegistry());
    expect(() => bindings.register("missing", definitions(), "in-process")).toThrow(/not found/i);
    const pending = manifest({execution: {kind: "in-process", status: "specification", optional: false}});
    expect(() => new SkillImplementationRegistry(catalog(pending), new SkillRegistry()).register("audio-pack", definitions(), "in-process")).toThrow(/not marked as implemented/i);
  });

  it("rejects version, capability, requirement and execution-kind mismatches", () => {
    const bindings = new SkillImplementationRegistry(catalog(), new SkillRegistry());
    expect(() => bindings.register("audio-pack", [{...definitions()[0], version: "2.0.0"}], "in-process")).toThrow(/version mismatch/i);
    expect(() => bindings.register("audio-pack", [definitions()[0]], "in-process")).toThrow(/capability mismatch/i);
    expect(() => bindings.register("audio-pack", definitions(), "cli")).toThrow(/execution kind mismatch/i);
    const requires = manifest({requires: ["media.decode"]});
    expect(() => new SkillImplementationRegistry(catalog(requires), new SkillRegistry()).register("audio-pack", definitions(), "in-process")).toThrow(/requirement mismatch/i);
  });

  it("rejects duplicate bindings and implementation IDs without partial registration", () => {
    const runtime = new SkillRegistry();
    const bindings = new SkillImplementationRegistry(catalog(), runtime);
    expect(() => bindings.register("audio-pack", [definitions()[0], definitions()[0]], "in-process")).toThrow(/duplicate implementation ID/i);
    expect(runtime.list()).toEqual([]);
    bindings.register("audio-pack", definitions(), "in-process");
    expect(() => bindings.register("audio-pack", definitions(), "in-process")).toThrow(/already bound/i);
  });

  it("does not register unavailable optional providers", async () => {
    const runtime = new SkillRegistry();
    const bindings = new SkillImplementationRegistry(catalog(), runtime);
    const available = await bindings.registerOptional("audio-pack", definitions(), "in-process", async () => false);
    expect(available).toBe(false);
    expect(runtime.list()).toEqual([]);
    expect(bindings.isBound("audio-pack")).toBe(false);
  });

  it("registers an available optional provider", async () => {
    const runtime = new SkillRegistry();
    const bindings = new SkillImplementationRegistry(catalog(), runtime);
    await expect(bindings.registerOptional("audio-pack", definitions(), "in-process", () => true)).resolves.toBe(true);
    expect(runtime.list()).toHaveLength(2);
  });
});
