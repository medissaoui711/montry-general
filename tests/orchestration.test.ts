import {mkdtemp, mkdir, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {
  executeWorkflow,
  loadSkillCatalog,
  planWorkflow,
  previewWorkflow,
  SkillRegistry,
  type WorkflowDefinition,
} from "../src/orchestration";

const makeRegistry = () => new SkillRegistry()
  .register({id:"creative.brief",version:"1.0.0",capabilities:["creative.brief"],inputSchema:z.object({topic:z.string()}),outputSchema:z.object({summary:z.string()}),execute:({topic})=>({summary:`Brief: ${topic}`})})
  .register({id:"visual.storyboard",version:"1.0.0",capabilities:["visual.storyboard"],inputSchema:z.object({style:z.string()}),outputSchema:z.object({frames:z.number()}),execute:(_input,ctx)=>({frames:(ctx.dependencies.brief as {summary:string}).summary.length})})
  .register({id:"production.render",version:"1.0.0",capabilities:["video.render"],inputSchema:z.object({format:z.string()}),outputSchema:z.object({asset:z.string()}),execute:({format})=>({asset:`render.${format}`})});

const workflow: WorkflowDefinition = {id:"demo",tasks:[
  {id:"render",skill:"production.render",input:{format:"mp4"},dependsOn:["storyboard"]},
  {id:"storyboard",skill:"visual.storyboard",input:{style:"minimal"},dependsOn:["brief"]},
  {id:"brief",skill:"creative.brief",input:{topic:"orchestration"},dependsOn:[]},
]};

describe("skill registry",()=>{
  it("rejects duplicate registrations and exposes a stable catalog",()=>{
    const skills=makeRegistry();
    expect(skills.list().map((s)=>s.id)).toEqual(["creative.brief","production.render","visual.storyboard"]);
    expect(()=>skills.register({id:"creative.brief",version:"1.0.0",inputSchema:z.object({}),outputSchema:z.object({}),execute:()=>({})})).toThrow(/already registered/i);
  });
  it("resolves a unique capability and requires explicit selection when ambiguous",()=>{
    const skills=makeRegistry()
      .register({id:"audio.provider-a",version:"1.0.0",capabilities:["audio.sfx.search"],inputSchema:z.object({}),outputSchema:z.object({provider:z.string()}),execute:()=>({provider:"a"})})
      .register({id:"audio.provider-b",version:"1.0.0",capabilities:["audio.sfx.search"],inputSchema:z.object({}),outputSchema:z.object({provider:z.string()}),execute:()=>({provider:"b"})});
    expect(skills.listProviders("audio.sfx.search")).toEqual(["audio.provider-a","audio.provider-b"]);
    expect(()=>skills.resolveCapability("audio.sfx.search")).toThrow(/ambiguous/i);
    expect(skills.resolveCapability("audio.sfx.search","audio.provider-b")).toBe("audio.provider-b");
    expect(()=>skills.resolveCapability("audio.sfx.search","creative.brief")).toThrow(/does not provide/i);
    expect(()=>skills.resolveCapability("audio.missing")).toThrow(/no registered skill/i);
  });
});

describe("workflow planner",()=>{
  it("builds a stable topological order",()=>expect(planWorkflow(workflow,makeRegistry()).map(({task})=>task.id)).toEqual(["brief","storyboard","render"]));
  it("previews deterministic dependency layers and provider metadata without executing skills", () => {
    const executeBrief = vi.fn(({topic}: {topic:string}) => ({summary:`Brief: ${topic}`}));
    const skills = new SkillRegistry()
      .register({id:"brief",version:"1.2.0",capabilities:["creative.brief"],inputSchema:z.object({topic:z.string()}),outputSchema:z.object({summary:z.string()}),execute:executeBrief})
      .register({id:"story",version:"2.0.0",capabilities:["visual.storyboard"],requires:["creative.brief"],inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean()}),execute:()=>({ok:true})})
      .register({id:"audio.a",version:"1.0.0",capabilities:["audio.search"],inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean()}),execute:()=>({ok:true})})
      .register({id:"audio.b",version:"1.0.0",capabilities:["audio.search"],inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean()}),execute:()=>({ok:true})});
    const preview = previewWorkflow({id:"preview-only",tasks:[
      {id:"story",skill:"story",input:{},dependsOn:["brief"]},
      {id:"audio",capability:"audio.search",provider:"audio.b",input:{},dependsOn:[]},
      {id:"brief",skill:"brief",input:{topic:"orchestra"},dependsOn:[]},
    ]}, skills);
    expect(preview).toMatchObject({
      workflowId:"preview-only",taskCount:3,layerCount:2,
      layers:[["audio","brief"],["story"]],
    });
    expect(preview.tasks[0]).toMatchObject({taskId:"audio",skillId:"audio.b",requestedCapability:"audio.search",provider:"audio.b",layer:0});
    expect(preview.tasks[1]).toMatchObject({taskId:"brief",skillId:"brief",version:"1.2.0",layer:0});
    expect(preview.tasks[2]?.requirements).toEqual([{capability:"creative.brief",providers:["brief"]}]);
    expect(executeBrief).not.toHaveBeenCalled();
  });
  it("resolves tasks by capability and a selected provider",()=>{
    const skills=makeRegistry();
    const result=planWorkflow({id:"capability-flow",tasks:[
      {id:"make",capability:"video.render",input:{format:"mp4"},dependsOn:[]},
    ]},skills);
    expect(result[0]?.skillId).toBe("production.render");
  });
  it("rejects unknown skills, dependencies and ambiguous capability providers",()=>{
    expect(()=>planWorkflow({id:"x",tasks:[{id:"a",skill:"missing",input:{},dependsOn:[]}]},makeRegistry())).toThrow(/unregistered skill/i);
    expect(()=>planWorkflow({id:"x",tasks:[{id:"a",skill:"creative.brief",input:{topic:"x"},dependsOn:["missing"]}]},makeRegistry())).toThrow(/unknown task/i);
    const ambiguous=makeRegistry()
      .register({id:"audio.a",version:"1.0.0",capabilities:["audio.sfx"],inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean()}),execute:()=>({ok:true})})
      .register({id:"audio.b",version:"1.0.0",capabilities:["audio.sfx"],inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean()}),execute:()=>({ok:true})});
    expect(()=>planWorkflow({id:"x",tasks:[{id:"a",capability:"audio.sfx",input:{},dependsOn:[]}]},ambiguous)).toThrow(/ambiguous/i);
  });
  it("rejects duplicate IDs and cycles",()=>{
    expect(()=>planWorkflow({id:"x",tasks:[
      {id:"a",skill:"creative.brief",input:{topic:"x"},dependsOn:[]},
      {id:"a",skill:"creative.brief",input:{topic:"y"},dependsOn:[]},
    ]},makeRegistry())).toThrow(/unique/i);
    expect(()=>planWorkflow({id:"x",tasks:[
      {id:"a",skill:"creative.brief",input:{topic:"x"},dependsOn:["b"]},
      {id:"b",skill:"creative.brief",input:{topic:"y"},dependsOn:["a"]},
    ]},makeRegistry())).toThrow(/cycle/i);
  });
  it("requires exactly one skill or capability and restricts provider hints",()=>{
    expect(()=>planWorkflow({id:"x",tasks:[{id:"a",skill:"creative.brief",capability:"creative.brief",input:{},dependsOn:[]}]},makeRegistry())).toThrow();
    expect(()=>planWorkflow({id:"x",tasks:[{id:"a",provider:"creative.brief",input:{},dependsOn:[]}]},makeRegistry())).toThrow();
  });
});

describe("workflow runtime",()=>{
  it("passes declared dependency outputs and validates the result",async()=>{
    const result=await executeWorkflow(workflow,makeRegistry());
    expect(result.status).toBe("completed");
    expect(result.tasks.map((t)=>t.status)).toEqual(["completed","completed","completed"]);
    expect(result.outputs.render).toEqual({asset:"render.mp4"});
  });
  it("runs independent tasks with the requested concurrency bound", async () => {
    let active = 0;
    let maximumActive = 0;
    const execute = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return {ok:true};
    };
    const skills = new SkillRegistry().register({
      id:"parallel.skill",version:"1.0.0",inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean()}),execute,
    });
    const result = await executeWorkflow({id:"parallel",tasks:[
      {id:"a",skill:"parallel.skill",input:{},dependsOn:[]},
      {id:"b",skill:"parallel.skill",input:{},dependsOn:[]},
      {id:"c",skill:"parallel.skill",input:{},dependsOn:[]},
      {id:"d",skill:"parallel.skill",input:{},dependsOn:[]},
    ]}, skills, {maxConcurrency:2});
    expect(result.status).toBe("completed");
    expect(maximumActive).toBe(2);
    expect(result.tasks.map((task) => task.status)).toEqual(["completed","completed","completed","completed"]);
  });
  it("rejects invalid concurrency settings", async () => {
    await expect(executeWorkflow({id:"x",tasks:[{id:"a",skill:"creative.brief",input:{topic:"x"},dependsOn:[]}]},makeRegistry(),{maxConcurrency:0})).rejects.toThrow(/between 1 and 16/i);
  });
  it("executes a capability-selected provider",async()=>{
    const result=await executeWorkflow({id:"provider-flow",tasks:[
      {id:"render",capability:"video.render",input:{format:"mp4"},dependsOn:[]},
    ]},makeRegistry());
    expect(result.tasks[0]).toMatchObject({skillId:"production.render",status:"completed"});
  });
  it("stops after failure and marks remaining tasks skipped",async()=>{
    const second=vi.fn(()=>({ok:true}));
    const skills=new SkillRegistry()
      .register({id:"first",version:"1.0.0",inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean()}),execute:()=>{throw new Error("provider unavailable");}})
      .register({id:"second",version:"1.0.0",inputSchema:z.object({}),outputSchema:z.object({ok:z.boolean()}),execute:second});
    const result=await executeWorkflow({id:"failure",tasks:[
      {id:"a",skill:"first",input:{},dependsOn:[]},{id:"b",skill:"second",input:{},dependsOn:[]},
    ]},skills);
    expect(result.status).toBe("failed");
    expect(result.tasks.map((t)=>t.status)).toEqual(["failed","skipped"]);
    expect(second).not.toHaveBeenCalled();
  });
  it("blocks invalid inputs and outputs",async()=>{
    const execute=vi.fn(()=>({wrong:true}));
    const skills=new SkillRegistry().register({id:"strict.skill",version:"1.0.0",inputSchema:z.object({value:z.string()}),outputSchema:z.object({value:z.string()}),execute:execute as never});
    const badInput=await executeWorkflow({id:"bad-input",tasks:[{id:"one",skill:"strict.skill",input:{value:4},dependsOn:[]}]},skills);
    expect(badInput.status).toBe("failed");
    expect(execute).not.toHaveBeenCalled();
    const badOutput=await executeWorkflow({id:"bad-output",tasks:[{id:"one",skill:"strict.skill",input:{value:"ok"},dependsOn:[]}]},skills);
    expect(badOutput.status).toBe("failed");
    expect(badOutput.tasks[0]?.status).toBe("failed");
  });
});

describe("skill manifest catalog",()=>{
  it("discovers manifests, indexes capabilities and validates requirements",async()=>{
    const root=await mkdtemp(path.join(tmpdir(),"montry-catalog-"));
    try {
      await mkdir(path.join(root,"creative.writer"));
      await mkdir(path.join(root,"production.renderer"));
      await writeFile(path.join(root,"creative.writer","skill.json"),JSON.stringify({
        id:"creative.writer",version:"1.0.0",name:"Writer",description:"Creates a creative brief.",
        capabilities:["creative.brief"],requires:[],
        execution:{kind:"instruction",status:"specification",optional:false},
      }));
      await writeFile(path.join(root,"production.renderer","skill.json"),JSON.stringify({
        id:"production.renderer",version:"1.2.0",name:"Renderer",description:"Renders validated scenes.",
        capabilities:["video.render"],requires:["creative.brief"],
        execution:{kind:"in-process",status:"implemented",optional:false},
      }));
      const catalog=await loadSkillCatalog(root);
      expect(catalog.skills.map((skill)=>skill.id)).toEqual(["creative.writer","production.renderer"]);
      expect(catalog.providers["creative.brief"]).toEqual(["creative.writer"]);
      expect(catalog.byId["production.renderer"]?.requires).toEqual(["creative.brief"]);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
  it("rejects unavailable capabilities and manifest/directory identity mismatches",async()=>{
    const root=await mkdtemp(path.join(tmpdir(),"montry-catalog-"));
    try {
      await mkdir(path.join(root,"visual.editor"));
      const manifest={id:"visual.editor",version:"1.0.0",name:"Editor",description:"Edits visuals.",capabilities:["visual.edit"],requires:["missing.capability"],execution:{kind:"instruction",status:"specification",optional:true}};
      await writeFile(path.join(root,"visual.editor","skill.json"),JSON.stringify(manifest));
      await expect(loadSkillCatalog(root)).rejects.toThrow(/unavailable capability/i);
      await writeFile(path.join(root,"visual.editor","skill.json"),JSON.stringify({...manifest,id:"wrong.id",requires:[]}));
      await expect(loadSkillCatalog(root)).rejects.toThrow(/must match directory/i);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
  it("ignores directories without manifests and rejects malformed manifests",async()=>{
    const root=await mkdtemp(path.join(tmpdir(),"montry-catalog-"));
    try {
      await mkdir(path.join(root,"unmanifested"));
      expect((await loadSkillCatalog(root)).skills).toEqual([]);
      await mkdir(path.join(root,"bad.skill"));
      await writeFile(path.join(root,"bad.skill","skill.json"),"{not-json");
      await expect(loadSkillCatalog(root)).rejects.toThrow(/unable to read skill manifest/i);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
});
