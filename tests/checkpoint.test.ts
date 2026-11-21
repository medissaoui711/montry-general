import {describe,expect,it} from "vitest";
import {InMemoryWorkflowRunStore,WorkflowCheckpointSchema,fingerprintWorkflow} from "../src/orchestration/checkpoint";

const checkpoint = {
  schemaVersion:1 as const,runId:"run-1",workflowId:"demo",workflowFingerprint:"a".repeat(64),
  revision:1,tasks:[{taskId:"task-a",skillId:"demo.skill",skillVersion:"1.0.0",status:"completed" as const,output:{ok:true},updatedAt:10}],updatedAt:10,
};

describe("workflow checkpoints",()=>{
  it("validates versioned checkpoint records",()=>expect(WorkflowCheckpointSchema.parse(checkpoint)).toEqual(checkpoint));
  it("rejects completed tasks without output and failed tasks without error",()=>{
    const {output: _output, ...taskWithoutOutput}=checkpoint.tasks[0]!;
    expect(()=>WorkflowCheckpointSchema.parse({...checkpoint,tasks:[taskWithoutOutput]})).toThrow();
    expect(()=>WorkflowCheckpointSchema.parse({...checkpoint,tasks:[{...taskWithoutOutput,status:"failed"}]})).toThrow();
  });
  it("requires a reconciliation reason for indeterminate checkpoint tasks",()=>{
    const {output: _output, ...taskWithoutOutput}=checkpoint.tasks[0]!;
    expect(()=>WorkflowCheckpointSchema.parse({
      ...checkpoint,tasks:[{...taskWithoutOutput,status:"indeterminate"}],
    })).toThrow(/indeterminate checkpoint tasks/i);
    expect(()=>WorkflowCheckpointSchema.parse({
      ...checkpoint,tasks:[{...taskWithoutOutput,status:"indeterminate",error:"Remote outcome unknown."}],
    })).not.toThrow();
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
  it("fingerprints object keys independent of insertion order and changes with workflow inputs",()=>{
    const first: {id:string;tasks:{id:string;skill:string;input:Record<string,unknown>;dependsOn:string[]}[]}={id:"demo",tasks:[{id:"a",skill:"demo.skill",input:{b:2,a:1},dependsOn:[]}]};
    const reordered: typeof first={id:"demo",tasks:[{id:"a",skill:"demo.skill",input:{a:1,b:2},dependsOn:[]}]};
    expect(fingerprintWorkflow(first)).toBe(fingerprintWorkflow(reordered));
    expect(fingerprintWorkflow(first)).not.toBe(fingerprintWorkflow({...first,tasks:[{...first.tasks[0]!,input:{a:2,b:2}}]}));
  });
});
