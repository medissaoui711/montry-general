import {describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {executeWorkflow, planWorkflow, SkillRegistry, type WorkflowDefinition} from "../src/orchestration";

const makeRegistry = () => new SkillRegistry()
  .register({id:"creative.brief",version:"1.0.0",inputSchema:z.object({topic:z.string()}),outputSchema:z.object({summary:z.string()}),execute:({topic})=>({summary:`Brief: ${topic}`})})
  .register({id:"visual.storyboard",version:"1.0.0",inputSchema:z.object({style:z.string()}),outputSchema:z.object({frames:z.number()}),execute:(_input,ctx)=>({frames:(ctx.dependencies.brief as {summary:string}).summary.length})})
  .register({id:"production.render",version:"1.0.0",inputSchema:z.object({format:z.string()}),outputSchema:z.object({asset:z.string()}),execute:({format})=>({asset:`render.${format}`})});

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
});

describe("workflow planner",()=>{
  it("builds a stable topological order",()=>expect(planWorkflow(workflow,makeRegistry()).map(({task})=>task.id)).toEqual(["brief","storyboard","render"]));
  it("rejects unknown skills and dependencies",()=>{
    expect(()=>planWorkflow({id:"x",tasks:[{id:"a",skill:"missing",input:{},dependsOn:[]}]},makeRegistry())).toThrow(/unregistered skill/i);
    expect(()=>planWorkflow({id:"x",tasks:[{id:"a",skill:"creative.brief",input:{topic:"x"},dependsOn:["missing"]}]},makeRegistry())).toThrow(/unknown task/i);
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
});

describe("workflow runtime",()=>{
  it("passes declared dependency outputs and validates the result",async()=>{
    const result=await executeWorkflow(workflow,makeRegistry());
    expect(result.status).toBe("completed");
    expect(result.tasks.map((t)=>t.status)).toEqual(["completed","completed","completed"]);
    expect(result.outputs.render).toEqual({asset:"render.mp4"});
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
    const skills=new SkillRegistry().register({id:"strict.skill",version:"1.0.0",inputSchema:z.object({value:z.string()}),outputSchema:z.object({value:z.string()}),execute});
    const badInput=await executeWorkflow({id:"bad-input",tasks:[{id:"one",skill:"strict.skill",input:{value:4},dependsOn:[]}]},skills);
    expect(badInput.status).toBe("failed");
    expect(execute).not.toHaveBeenCalled();
    const badOutput=await executeWorkflow({id:"bad-output",tasks:[{id:"one",skill:"strict.skill",input:{value:"ok"},dependsOn:[]}]},skills);
    expect(badOutput.status).toBe("failed");
    expect(badOutput.tasks[0]?.status).toBe("failed");
  });
});
