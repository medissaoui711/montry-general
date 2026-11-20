import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {FileWorkflowRunStore,InMemoryWorkflowRunStore,WorkflowCheckpointSchema,fingerprintWorkflow} from "../src/orchestration/checkpoint";

const checkpoint = {
  schemaVersion:1 as const,runId:"run-1",workflowId:"demo",workflowFingerprint:"a".repeat(64),
  revision:1,tasks:[{taskId:"task-a",skillId:"demo.skill",skillVersion:"1.0.0",status:"completed" as const,output:{ok:true},updatedAt:10}],updatedAt:10,
};

describe("workflow checkpoints",()=>{
  it("validates versioned checkpoint records",()=>expect(WorkflowCheckpointSchema.parse(checkpoint)).toEqual(checkpoint));
  it("rejects completed tasks without output and failed tasks without error",()=>{
    const {output: _output, ...taskWithoutOutput}=checkpoint.tasks[0]!;
    expect(()=>WorkflowCheckpointSchema.parse({...checkpoint,tasks:[taskWithoutOutput]})).toThrow();
    expect(()=>WorkflowCheckpointSchema.parse({...checkpoint,tasks:[{...checkpoint.tasks[0]!,output:undefined}]})).toThrow();
    expect(()=>WorkflowCheckpointSchema.parse({...checkpoint,tasks:[{...taskWithoutOutput,status:"failed"}]})).toThrow();
  });
  it("stores defensive copies and requires increasing revisions",async()=>{
    const store=new InMemoryWorkflowRunStore();
    await store.save(checkpoint);
    const loaded=await store.load("run-1");
    loaded!.tasks[0]!.output={mutated:true};
    expect((await store.load("run-1"))!.tasks[0]!.output).toEqual({ok:true});
    await expect(store.save(checkpoint)).rejects.toThrow(/revision must increase/);
    await store.save({...checkpoint,revision:2});
    expect((await store.load("run-1"))!.revision).toBe(2);
  });

  it("persists checkpoints atomically across store instances and enforces revisions",async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),"montry-checkpoints-"));
    try {
      const firstStore=new FileWorkflowRunStore(directory);
      await firstStore.save(checkpoint);
      const secondStore=new FileWorkflowRunStore(directory);
      expect(await secondStore.load("run-1")).toEqual(checkpoint);
      await expect(secondStore.save(checkpoint)).rejects.toThrow(/revision must increase/i);
      await secondStore.save({...checkpoint,revision:2});
      expect((await firstStore.load("run-1"))?.revision).toBe(2);
    } finally {
      await rm(directory,{recursive:true,force:true});
    }
  });

  it("hashes run IDs before using them as filesystem names",async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),"montry-checkpoints-"));
    try {
      const store=new FileWorkflowRunStore(directory);
      expect(await store.load("../outside")).toBeNull();
    } finally {
      await rm(directory,{recursive:true,force:true});
    }
  });

  it("fingerprints object keys independent of insertion order and changes with workflow inputs",()=>{
    const first: {id:string;tasks:{id:string;skill:string;input:Record<string,unknown>;dependsOn:string[]}[]}={id:"demo",tasks:[{id:"a",skill:"demo.skill",input:{b:2,a:1},dependsOn:[]}]};
    const reordered: typeof first={id:"demo",tasks:[{id:"a",skill:"demo.skill",input:{a:1,b:2},dependsOn:[]}]};
    expect(fingerprintWorkflow(first)).toBe(fingerprintWorkflow(reordered));
    expect(fingerprintWorkflow(first)).not.toBe(fingerprintWorkflow({...first,tasks:[{...first.tasks[0]!,input:{a:2,b:2}}]}));
    expect(()=>fingerprintWorkflow({...first,tasks:[{...first.tasks[0]!,input:{missing:undefined}}]})).toThrow(/non-json value/i);
    expect(()=>fingerprintWorkflow({...first,tasks:[{...first.tasks[0]!,input:{notFinite:Number.NaN}}]})).toThrow(/non-json value/i);
  });
});
